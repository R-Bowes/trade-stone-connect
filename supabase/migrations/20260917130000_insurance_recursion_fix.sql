-- Fixes 20260917120000_insurance_current_row_tiebreak.sql (pushed and live):
--
--   set role authenticated;
--   select id from contractor_credentials where credential_type = 'insurance';
--   → ERROR 42P17: infinite recursion detected in policy for relation
--     "contractor_credentials"
--
-- The "Customers can read their contractor's current insurance" policy's
-- USING clause contains `id = (SELECT cc2.id FROM contractor_credentials
-- cc2 ... ORDER BY ... LIMIT 1)` — a subquery against the SAME table the
-- policy governs. Postgres has to re-apply that table's RLS policies to
-- resolve the subquery's own rows, which re-enters this same USING clause,
-- which subqueries the table again — infinite recursion, caught by
-- Postgres's own recursion guard (42P17) rather than actually looping
-- forever.
--
-- The prior MAX(expires_at) version had an identical self-referential
-- shape (`expires_at = (SELECT MAX(expires_at) FROM contractor_credentials
-- ...)`) and was NOT observed to recurse — it was latent, not absent. The
-- tiebreak change (section 2.1 of the previous fix) didn't introduce the
-- self-reference; it's the same structural shape that just happened not to
-- trip Postgres's recursion detection with an aggregate subquery the way it
-- does with an ORDER BY/LIMIT one. Reverting to MAX() would silently bring
-- the recursion risk back along with the tie bug it was written to fix —
-- not done here, per instruction.
--
-- Fix: move the "which row is current" lookup into a SECURITY DEFINER
-- function. A SECURITY DEFINER function runs with its owner's privileges,
-- and this table has no FORCE ROW LEVEL SECURITY set (checked: no migration
-- for contractor_credentials sets it) — so as the table owner, the
-- function's internal SELECT bypasses RLS entirely instead of re-entering
-- it. The policy no longer subqueries itself; it calls out to a function
-- that reads the table with row security switched off for that one lookup.
-- This is the same pattern already used throughout this codebase
-- (is_company_member, is_company_owner, compliance_doc_contractor_id,
-- admin_update_verification) specifically to break this class of cycle.
--
-- ── STABLE-blind-to-same-statement-inserts trap (CLAUDE.md) — does it apply here? ──
-- CLAUDE.md's job_conversations incident: a STABLE self-referential helper
-- in a SELECT policy took a snapshot and didn't see a row INSERTED earlier
-- in the SAME statement, because the statement's own insert (by the same
-- caller, in the same transaction/statement) needed that helper to
-- recognise the just-created row to grant it visibility.
--
-- That doesn't apply here, explicitly reasoned rather than assumed:
-- this function is only ever called from a policy gating OTHER people's
-- reads (a customer reading their contractor's row; the storage policy
-- resolving a document) — customers have no INSERT policy on
-- contractor_credentials at all, so no customer-side statement ever
-- inserts a row this function would need to see in the same breath. The
-- CONTRACTOR inserting their own insurance row doesn't rely on this
-- function either: their own visibility (including for a
-- .insert().select() RETURNING, if ever used) comes from the pre-existing,
-- unconditional "Contractors select own credentials" policy, which matches
-- on contractor_id alone and doesn't call this function. There is no path
-- where the same statement that inserts a row also depends on this
-- function resolving that same row. STABLE is safe here and kept for
-- consistency with this codebase's other RLS helper functions.

CREATE OR REPLACE FUNCTION public.current_insurance_credential_id(p_contractor_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cc.id
  FROM public.contractor_credentials cc
  WHERE cc.contractor_id = p_contractor_id
    AND cc.credential_type = 'insurance'
  ORDER BY cc.expires_at DESC, cc.created_at DESC
  LIMIT 1;
$$;

DROP POLICY IF EXISTS "Customers can read their contractor's current insurance"
  ON public.contractor_credentials;

CREATE POLICY "Customers can read their contractor's current insurance"
  ON public.contractor_credentials FOR SELECT
  TO authenticated
  USING (
    credential_type = 'insurance'
    AND id = public.current_insurance_credential_id(contractor_id)
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

-- Storage policy — same subquery, same problem (storage.objects is a
-- different table, but its USING clause queries contractor_credentials
-- directly, so it hits the identical self-referential recursion the moment
-- Postgres tries to resolve contractor_credentials' own RLS for the `cc2`
-- lookup inside it). Fixed the same way, for the same reason. Everything
-- else about this policy — the exact-path match, the job-window condition
-- — is unchanged from 20260917120000.

DROP POLICY IF EXISTS "contractor_compliance_docs_customer_insurance_read"
  ON storage.objects;

CREATE POLICY "contractor_compliance_docs_customer_insurance_read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'contractor-compliance-documents'
  AND EXISTS (
    SELECT 1
    FROM public.contractor_credentials cc
    WHERE cc.document_path = storage.objects.name
      AND cc.credential_type = 'insurance'
      AND cc.id = public.current_insurance_credential_id(cc.contractor_id)
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
