-- Self-declared contractor insurance, shared with the customers of jobs the
-- contractor is on (not public — the public SELECT policy on
-- contractor_credentials, USING (verified = true), is untouched and this
-- feature does not go through it: a self-declared row is never verified).
--
-- Storage lives in contractor_credentials as credential_type = 'insurance'.
-- Does NOT touch contractor_verification, recalculate_contractor_tier, or
-- insurance-expiry-check — self-declared data never flows into the
-- system-verified tier-gating columns.

-- =============================================================================
-- 1. credential_type: dropdown-backed values, CHECK constraint.
--    Column is free text today and NULL on every existing row (confirmed via
--    types.ts + every INSERT call site — useContractorCredentials.ts,
--    VerificationManagement.tsx — neither sets it). NULL stays valid so no
--    existing row or existing non-insurance upload path is affected.
--    Includes the three aspirational values already named in
--    20260730110000's column comment ('nvq', 'city_guilds',
--    'manufacturer_accreditation') even though nothing sets them yet, so a
--    future dropdown addition for those doesn't need a second migration to
--    just widen this constraint — plus 'other' as an escape hatch.
-- =============================================================================

ALTER TABLE public.contractor_credentials
  ADD CONSTRAINT contractor_credentials_credential_type_check
  CHECK (
    credential_type IS NULL
    OR credential_type IN ('insurance', 'nvq', 'city_guilds', 'manufacturer_accreditation', 'other')
  );

-- =============================================================================
-- 2. Retention: at most two insurance rows per contractor (current +
--    previous). Uploading a third drops the oldest BY UPLOAD ORDER
--    (created_at) — "current" for DISPLAY purposes (section 3 below) is
--    decided separately, by expires_at, not by this rotation. A trigger
--    rather than app-side logic so the invariant holds regardless of which
--    UI writes the row.
--
--    SECURITY DEFINER is not strictly required here — the row being deleted
--    always shares NEW.contractor_id, which the INSERT's own WITH CHECK
--    already tied to auth.uid(), so the existing "Contractors delete own
--    credentials" policy would allow it anyway — but it's used for
--    consistency with this codebase's other housekeeping trigger functions
--    (e.g. set_job_timestamps) and to keep the trigger working unmodified
--    if this table's DELETE policy ever changes shape.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.trim_insurance_credentials()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.contractor_credentials
  WHERE id IN (
    SELECT id FROM public.contractor_credentials
    WHERE contractor_id = NEW.contractor_id
      AND credential_type = 'insurance'
    ORDER BY created_at ASC
    OFFSET 2
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trim_insurance_credentials_trigger ON public.contractor_credentials;
CREATE TRIGGER trim_insurance_credentials_trigger
  AFTER INSERT ON public.contractor_credentials
  FOR EACH ROW
  WHEN (NEW.credential_type = 'insurance')
  EXECUTE FUNCTION public.trim_insurance_credentials();

-- =============================================================================
-- 3. Customer read of the CURRENT insurance row only.
--
--    "Current" = the row with the latest expires_at among this contractor's
--    insurance-type rows (not the most recently uploaded one — a contractor
--    could in principle upload out of order). Computed inline via a
--    correlated MAX(), not a stored is_current flag: with at most two rows
--    per contractor this costs nothing, and it can never drift out of sync
--    with the data the way a flag maintained by application code could.
--    The "previous" row (the other one, if it exists) never matches this
--    policy — a customer only ever sees zero or one insurance row. The
--    contractor's own "Contractors select own credentials" policy and the
--    admin "admin_select_contractor_credentials" policy already grant
--    unrestricted access to both rows — unchanged by this migration.
--
--    Job scope: visible while the job is in an active status, plus 90 days
--    after completion. Named as an allow-list of the statuses that grant
--    access rather than a deny-list of the one that doesn't — jobs.status
--    has a live CHECK constraint (jobs_status_check,
--    20260328170000_job_timesheet_flow.sql) permitting exactly
--    'scheduled', 'in_progress', 'snagging', 'complete', 'cancelled',
--    'not_started', 'completed'. A deny-list keyed on != 'complete' has two
--    holes: 'cancelled' isn't 'complete' either, so it fell into the
--    permissive arm and granted access permanently; and
--    AdminDashboard.tsx:519 writes status = 'completed' (not 'complete')
--    without ever setting completed_at, so that row matched neither arm's
--    actual intent and also fell through to permanent access.
--
--    ACTIVE = ('scheduled', 'in_progress', 'snagging') — the live,
--    ongoing statuses actually written by FieldStatusStepper.tsx /
--    ThreadJobSection.tsx's stepper and by job creation
--    (mint_job_from_quote, term-engagement call-outs both insert
--    'scheduled'). Deliberately excludes 'not_started': constraint-legal
--    but no live code path writes it — backfilled to 'scheduled' once by
--    20260328170000 and kept in the CHECK only for backward compatibility.
--    If it ever appears on a new row it's stale/unexpected data, and the
--    safe default is to deny, not grant.
--
--    TERMINAL = ('complete', 'completed') — both spellings exist in the
--    wild ('complete' is the canonical stepper/trigger value; 'completed'
--    is AdminDashboard.tsx's force-complete action, which is a real, live
--    write path even though it diverges from the canonical spelling).
--    Terminal only grants access when completed_at is both set and within
--    90 days. completed_at is populated by the existing
--    set_job_timestamps() trigger on the status -> 'complete' transition
--    (20260730150000_fix_job_completed_at.sql) — but NOT on the 'completed'
--    (AdminDashboard) transition, since that trigger only checks for the
--    canonical spelling. The explicit "IS NOT NULL" isn't redundant dressing
--    over SQL's NULL-is-not-true default: it makes unmissable, for any
--    future reader, that an admin-completed job with no completed_at must
--    grant NO access — it can never satisfy the 90-day window, on purpose.
--
--    'cancelled' and 'not_started' (and any other/future/unrecognised
--    status) match neither ACTIVE nor TERMINAL, so they grant no access —
--    this is the deny-by-default this policy is built around, not an
--    oversight.
--
--    Existing "Public can read verified credentials" policy (verified =
--    true) is untouched — this is a second, additive SELECT policy. Postgres
--    RLS policies are OR'd together, so a row is visible if either matches.
-- =============================================================================

CREATE POLICY "Customers can read their contractor's current insurance"
  ON public.contractor_credentials FOR SELECT
  TO authenticated
  USING (
    credential_type = 'insurance'
    AND expires_at = (
      SELECT MAX(cc2.expires_at)
      FROM public.contractor_credentials cc2
      WHERE cc2.contractor_id = contractor_credentials.contractor_id
        AND cc2.credential_type = 'insurance'
    )
    AND EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.contractor_id = contractor_credentials.contractor_id
        AND j.customer_id = auth.uid()
        AND (
          j.status IN ('scheduled', 'in_progress', 'snagging')
          OR (
            j.status IN ('complete', 'completed')
            AND j.completed_at IS NOT NULL
            AND j.completed_at >= now() - interval '90 days'
          )
        )
    )
  );

-- =============================================================================
-- 4. Storage — customer read of the insurance document specifically.
--
--    Resolves the path by joining back to contractor_credentials on an
--    EXACT match (document_path = storage.objects.name), not by parsing the
--    contractor_id prefix the way the existing owner policy's
--    compliance_doc_contractor_id() does. That's the point: matching on
--    contractor_id alone would let this policy's EXISTS clause pass for
--    every file in the contractor's folder — their DBS check, their NVQ,
--    anything — because the path convention ({contractor_id}/{filename})
--    doesn't encode document type. Requiring the row this exact path
--    belongs to have credential_type = 'insurance' means a customer's
--    signed-URL request for any other document in that folder finds no
--    matching row and is denied, regardless of contractor_id matching.
--
--    Mirrors policy 3's "current row" and job-window conditions exactly —
--    otherwise a customer whose job falls outside the window, or who's
--    looking at a lapsed "previous" row's leftover path, could still
--    fetch the file via signed URL even though the row itself is hidden
--    from them. The row and the file must be gated the same way. The
--    job-scope condition (active statuses, or terminal + completed_at
--    within 90 days) is IDENTICAL to policy 3, deliberately duplicated
--    rather than factored into a shared function — see the note at the
--    end of this file on keeping the two in sync.
-- =============================================================================

CREATE POLICY "contractor_compliance_docs_customer_insurance_read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'contractor-compliance-documents'
  AND EXISTS (
    SELECT 1
    FROM public.contractor_credentials cc
    WHERE cc.document_path = storage.objects.name
      AND cc.credential_type = 'insurance'
      AND cc.expires_at = (
        SELECT MAX(cc2.expires_at)
        FROM public.contractor_credentials cc2
        WHERE cc2.contractor_id = cc.contractor_id
          AND cc2.credential_type = 'insurance'
      )
      AND EXISTS (
        SELECT 1 FROM public.jobs j
        WHERE j.contractor_id = cc.contractor_id
          AND j.customer_id = auth.uid()
          AND (
            j.status IN ('scheduled', 'in_progress', 'snagging')
            OR (
              j.status IN ('complete', 'completed')
              AND j.completed_at IS NOT NULL
              AND j.completed_at >= now() - interval '90 days'
            )
          )
      )
  )
);

-- =============================================================================
-- NOTE: the job-scope condition above appears in exactly two places —
-- policy 3 (contractor_credentials) and this storage policy. The app-side
-- query in CustomerJobDocuments.tsx does NOT duplicate it: it queries
-- contractor_credentials filtered only by contractor_id and
-- credential_type = 'insurance', with no status/date filtering of its own,
-- and relies entirely on RLS to decide whether a row comes back. So there
-- are two copies of this condition to keep in sync, not three. If this
-- condition needs to change again, both CREATE POLICY statements above
-- must change together — there is no shared function it's factored into.
-- =============================================================================
