-- Tendering slice 2a (database half): the contractor way in. DRAFT ONLY --
-- not applied, not pushed.
--
-- ROLLBACK (verbatim live bodies/grants/policies as they stood immediately
-- before this migration, read live on 2026-10-23):
--
--   DROP FUNCTION public.decline_tender_invitation(uuid, text);
--   CREATE POLICY tender_invitations_contractor_decline ON public.tender_invitations
--     FOR UPDATE TO authenticated
--     USING (contractor_id = auth.uid())
--     WITH CHECK (contractor_id = auth.uid() AND status = 'declined');
--   GRANT INSERT, UPDATE ON public.tender_invitations TO authenticated;
--   ALTER POLICY tender_invitations_business_write ON public.tender_invitations
--     USING (is_company_member(tender_company_id(tender_id)) AND tender_is_draft(tender_id))
--     WITH CHECK (is_company_member(tender_company_id(tender_id)) AND tender_is_draft(tender_id));
--
--   DROP POLICY "Business manages own prequal records" ON public.panel_prequalification;
--   CREATE POLICY "Business manages own prequal records" ON public.panel_prequalification
--     FOR ALL TO authenticated
--     USING (company_id IN (SELECT c.id FROM companies c JOIN profiles p ON p.id = c.owner_id WHERE p.user_id = auth.uid()));
--   GRANT INSERT, UPDATE ON public.panel_prequalification TO authenticated;
--
--   ALTER TABLE public.tender_applications DROP COLUMN declared_at;
--
--   DROP FUNCTION public.submit_tender_application(uuid, boolean);
--   CREATE FUNCTION public.submit_tender_application(p_application_id uuid)
--    RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
--   AS $function$
--   DECLARE
--     v_application  public.tender_applications%ROWTYPE;
--     v_tender       public.tenders%ROWTYPE;
--     v_unmet_kinds  text[];
--   BEGIN
--     SELECT * INTO v_application FROM public.tender_applications WHERE id = p_application_id FOR UPDATE;
--     IF NOT FOUND THEN RAISE EXCEPTION 'Application not found'; END IF;
--     IF v_application.contractor_id <> auth.uid() THEN RAISE EXCEPTION 'Not your application'; END IF;
--     IF v_application.status <> 'draft' THEN RAISE EXCEPTION 'Application is not in draft (status: %)', v_application.status; END IF;
--     SELECT * INTO v_tender FROM public.tenders WHERE id = v_application.tender_id;
--     IF v_tender.status <> 'published' THEN RAISE EXCEPTION 'This tender is % and is not accepting submissions', v_tender.status; END IF;
--     IF v_tender.response_deadline IS NOT NULL AND now() > v_tender.response_deadline THEN RAISE EXCEPTION 'Tender response deadline has passed'; END IF;
--     WITH panel AS (SELECT * FROM public.panel_prequalification WHERE company_id = v_tender.company_id AND contractor_id = v_application.contractor_id),
--     mandatory_mappable AS (
--       SELECT DISTINCT kind FROM public.tender_prequal_requirements
--       WHERE tender_id = v_application.tender_id AND mandatory = true
--         AND kind IN ('public_liability', 'employers_liability', 'trade_cert', 'induction', 'nda', 'terms')
--     ),
--     unmet AS (
--       SELECT mm.kind FROM mandatory_mappable mm
--       WHERE NOT EXISTS (SELECT 1 FROM panel p WHERE CASE mm.kind
--         WHEN 'public_liability' THEN (p.public_liability_verified IS TRUE) AND (p.public_liability_expiry IS NULL OR p.public_liability_expiry > now())
--         WHEN 'employers_liability' THEN (p.employers_liability_verified IS TRUE) AND (p.employers_liability_expiry IS NULL OR p.employers_liability_expiry > now())
--         WHEN 'trade_cert' THEN (p.trade_cert_verified IS TRUE) AND (p.trade_cert_expiry IS NULL OR p.trade_cert_expiry > now())
--         WHEN 'induction' THEN (p.site_induction_complete IS TRUE)
--         WHEN 'nda' THEN (p.nda_signed IS TRUE)
--         WHEN 'terms' THEN (p.terms_accepted IS TRUE)
--         ELSE false END)
--     )
--     SELECT array_agg(kind ORDER BY kind) INTO v_unmet_kinds FROM unmet;
--     IF v_unmet_kinds IS NOT NULL AND array_length(v_unmet_kinds, 1) > 0 THEN
--       RAISE EXCEPTION 'Prequalification requirements not met: %', array_to_string(v_unmet_kinds, ', ');
--     END IF;
--     UPDATE public.tender_applications SET status = 'submitted', submitted_at = now(), prequal_snapshot = build_prequal_snapshot(v_tender.company_id, v_application.contractor_id) WHERE id = p_application_id;
--   END;
--   $function$;

-- ── 0. Pre-flight ────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tender_applications' AND column_name='declared_at') THEN
    RAISE EXCEPTION 'tender_applications.declared_at already exists -- this migration appears to already be applied.';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='decline_tender_invitation') THEN
    RAISE EXCEPTION 'decline_tender_invitation already exists -- this migration appears to already be applied.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='tender_invitations' AND policyname='tender_invitations_contractor_decline') THEN
    RAISE EXCEPTION 'tender_invitations_contractor_decline policy not found -- cannot confirm pre-migration state.';
  END IF;
END $$;

-- ── 1. tender_invitations lockdown ───────────────────────────────────────────
-- UPDATE: no client writer left at all (decline/view both become RPC-only,
-- business never updates an invitation row -- it only inserts/deletes them).
DROP POLICY tender_invitations_contractor_decline ON public.tender_invitations;
REVOKE UPDATE ON public.tender_invitations FROM authenticated;

-- INSERT: only the three columns BusinessTenderForm.tsx's real payload
-- sends (tender_id, contractor_id, invited_by -- confirmed live, lines
-- ~786-791). status/viewed_at/responded_at/declined_reason were never in
-- that payload and are never client-writable from here on.
REVOKE INSERT ON public.tender_invitations FROM authenticated;
GRANT INSERT (tender_id) ON public.tender_invitations TO authenticated;
GRANT INSERT (contractor_id) ON public.tender_invitations TO authenticated;
GRANT INSERT (invited_by) ON public.tender_invitations TO authenticated;

-- invited_by is client-sent (the creating business user's own profileId,
-- not server-stamped) -- checked here against auth.uid() rather than
-- adding a wrapping RPC for this slice. USING (the draft/member gate) is
-- untouched; only WITH CHECK gains the identity check.
ALTER POLICY tender_invitations_business_write ON public.tender_invitations
  WITH CHECK (is_company_member(tender_company_id(tender_id)) AND tender_is_draft(tender_id) AND invited_by = auth.uid());

-- DELETE stays exactly as slice 1 left it (tender_invitations_business_write,
-- business, draft tender only -- no change).

-- mark_tender_invitation_viewed already exists (pre-dates this migration)
-- and already has authenticated EXECUTE, no anon -- confirmed live,
-- untouched here. decline_tender_invitation (below) is its sibling.

CREATE FUNCTION public.decline_tender_invitation(p_invitation_id uuid, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_invitation public.tender_invitations%ROWTYPE;
  v_tender     public.tenders%ROWTYPE;
BEGIN
  SELECT * INTO v_invitation FROM public.tender_invitations WHERE id = p_invitation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found.' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_invitation.contractor_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not your invitation.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_invitation.status NOT IN ('invited', 'viewed') THEN
    RAISE EXCEPTION 'This invitation is % and cannot be declined.', v_invitation.status
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_tender FROM public.tenders WHERE id = v_invitation.tender_id;

  IF v_tender.status <> 'published' THEN
    RAISE EXCEPTION 'This tender is % and no longer accepting responses.', v_tender.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_tender.response_deadline IS NOT NULL AND now() > v_tender.response_deadline THEN
    RAISE EXCEPTION 'Tender response deadline has passed.' USING ERRCODE = 'check_violation';
  END IF;

  -- A contractor who has already committed to bidding (anything beyond a
  -- draft they could still abandon, or a withdrawal they've already made)
  -- declines nothing -- withdraw_tender_application is the right tool once
  -- a bid exists.
  IF EXISTS (
    SELECT 1 FROM public.tender_applications
    WHERE tender_id = v_invitation.tender_id
      AND contractor_id = auth.uid()
      AND status NOT IN ('draft', 'withdrawn')
  ) THEN
    RAISE EXCEPTION 'You already have an application on this tender; withdraw it instead of declining.'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.tender_invitations
  SET status = 'declined', declined_reason = NULLIF(btrim(COALESCE(p_reason, '')), ''), responded_at = now()
  WHERE id = p_invitation_id;
END;
$$;
REVOKE ALL ON FUNCTION public.decline_tender_invitation(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decline_tender_invitation(uuid, text) TO authenticated, service_role;

-- ── 2. panel_prequalification: contractor read-only, OWNER-ONLY write ───────
-- Confirmed live before drafting: RLS already blocked a plain contractor
-- (the only write policy, "Business manages own prequal records", scoped
-- to the company OWNER via a companies.owner_id join -- a contractor can
-- never satisfy that join against someone else's company). The column
-- grants were still a blanket INSERT/UPDATE for authenticated regardless,
-- same dormant-but-not-exploitable shape as tender_applications before its
-- own fix. Kept owner-only on reflection -- NOT widened to any company
-- member -- plus a same-identity check on reviewed_by (confirmed live:
-- BusinessPrequalView.tsx only ever sets it to the calling user's own
-- profileId, in handleApprove, or forwards it unchanged, in persistRecord
-- -- never to someone else's id). The grant tightening to the columns
-- BusinessPrequalView.tsx's real upsert sends (confirmed live, lines
-- ~198-220) stands as before.
DROP POLICY "Business manages own prequal records" ON public.panel_prequalification;
CREATE POLICY "Business manages own prequal records" ON public.panel_prequalification
  FOR ALL TO authenticated
  USING (is_company_owner(company_id))
  WITH CHECK (is_company_owner(company_id) AND (reviewed_by IS NULL OR reviewed_by = auth.uid()));
-- "Contractor reads own prequal records" (SELECT, own rows) and "Panel
-- prequalification visible to company members" (SELECT) are untouched --
-- the contractor side was already read-only by RLS; this just makes the
-- grants match that reality instead of overclaiming.

REVOKE INSERT, UPDATE ON public.panel_prequalification FROM authenticated;
GRANT INSERT (id) ON public.panel_prequalification TO authenticated;
GRANT INSERT (company_id) ON public.panel_prequalification TO authenticated;
GRANT INSERT (contractor_id) ON public.panel_prequalification TO authenticated;
GRANT INSERT (public_liability_verified) ON public.panel_prequalification TO authenticated;
GRANT INSERT (public_liability_expiry) ON public.panel_prequalification TO authenticated;
GRANT INSERT (employers_liability_verified) ON public.panel_prequalification TO authenticated;
GRANT INSERT (employers_liability_expiry) ON public.panel_prequalification TO authenticated;
GRANT INSERT (trade_cert_verified) ON public.panel_prequalification TO authenticated;
GRANT INSERT (trade_cert_expiry) ON public.panel_prequalification TO authenticated;
GRANT INSERT (site_induction_complete) ON public.panel_prequalification TO authenticated;
GRANT INSERT (nda_signed) ON public.panel_prequalification TO authenticated;
GRANT INSERT (terms_accepted) ON public.panel_prequalification TO authenticated;
GRANT INSERT (overall_status) ON public.panel_prequalification TO authenticated;
GRANT INSERT (reviewed_by) ON public.panel_prequalification TO authenticated;
GRANT INSERT (reviewed_at) ON public.panel_prequalification TO authenticated;
GRANT UPDATE (company_id) ON public.panel_prequalification TO authenticated;
GRANT UPDATE (contractor_id) ON public.panel_prequalification TO authenticated;
GRANT UPDATE (public_liability_verified) ON public.panel_prequalification TO authenticated;
GRANT UPDATE (public_liability_expiry) ON public.panel_prequalification TO authenticated;
GRANT UPDATE (employers_liability_verified) ON public.panel_prequalification TO authenticated;
GRANT UPDATE (employers_liability_expiry) ON public.panel_prequalification TO authenticated;
GRANT UPDATE (trade_cert_verified) ON public.panel_prequalification TO authenticated;
GRANT UPDATE (trade_cert_expiry) ON public.panel_prequalification TO authenticated;
GRANT UPDATE (site_induction_complete) ON public.panel_prequalification TO authenticated;
GRANT UPDATE (nda_signed) ON public.panel_prequalification TO authenticated;
GRANT UPDATE (terms_accepted) ON public.panel_prequalification TO authenticated;
GRANT UPDATE (overall_status) ON public.panel_prequalification TO authenticated;
GRANT UPDATE (reviewed_by) ON public.panel_prequalification TO authenticated;
GRANT UPDATE (reviewed_at) ON public.panel_prequalification TO authenticated;
-- Deliberately NOT granted: next_review_date, notes, created_at,
-- updated_at -- never sent by the real UI.

-- ── 3. tender_applications: declared_at ──────────────────────────────────────
ALTER TABLE public.tender_applications ADD COLUMN declared_at timestamptz;
-- No grant added -- tender_applications' INSERT is fully revoked and its
-- UPDATE grant is already an explicit allow-list (20261022140000) that
-- doesn't include this column, so it's server-only by construction.

-- ── 4. submit_tender_application: declaration + completeness ────────────────
-- A trailing DEFAULT-bearing parameter does NOT make this a CREATE OR
-- REPLACE of the 1-arg function -- Postgres matches by exact parameter
-- type list for REPLACE, so (uuid) and (uuid, boolean) are different
-- signatures and the old 1-arg function would otherwise be left behind
-- as a second overload, making every existing 1-arg call site ambiguous
-- ("is not unique"). Drop it explicitly first, per the ruling's
-- "drop/recreate as needed".
DROP FUNCTION IF EXISTS public.submit_tender_application(uuid);

CREATE FUNCTION public.submit_tender_application(p_application_id uuid, p_declared boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_application     public.tender_applications%ROWTYPE;
  v_tender          public.tenders%ROWTYPE;
  v_unmet_kinds     text[];
  v_missing         text[] := '{}';
  v_required_refs   integer;
  v_ref_count       integer;
  v_pricing_config  jsonb;
  v_row_ids         text[];
  v_unpriced        integer;
BEGIN
  SELECT * INTO v_application
  FROM public.tender_applications
  WHERE id = p_application_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found';
  END IF;

  IF v_application.contractor_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not your application';
  END IF;

  IF v_application.status <> 'draft' THEN
    RAISE EXCEPTION 'Application is not in draft (status: %)', v_application.status;
  END IF;

  SELECT * INTO v_tender FROM public.tenders WHERE id = v_application.tender_id;

  IF v_tender.status <> 'published' THEN
    RAISE EXCEPTION 'This tender is % and is not accepting submissions', v_tender.status;
  END IF;

  IF v_tender.response_deadline IS NOT NULL AND now() > v_tender.response_deadline THEN
    RAISE EXCEPTION 'Tender response deadline has passed';
  END IF;

  -- RED-block: mandatory + unmet mappable prequal requirements stop
  -- submission outright. Unchanged from before this migration.
  WITH panel AS (
    SELECT *
    FROM public.panel_prequalification
    WHERE company_id = v_tender.company_id
      AND contractor_id = v_application.contractor_id
  ),
  mandatory_mappable AS (
    SELECT DISTINCT kind
    FROM public.tender_prequal_requirements
    WHERE tender_id = v_application.tender_id
      AND mandatory = true
      AND kind IN ('public_liability', 'employers_liability', 'trade_cert', 'induction', 'nda', 'terms')
  ),
  unmet AS (
    SELECT mm.kind
    FROM mandatory_mappable mm
    WHERE NOT EXISTS (
      SELECT 1 FROM panel p
      WHERE CASE mm.kind
        WHEN 'public_liability'    THEN (p.public_liability_verified    IS TRUE) AND (p.public_liability_expiry    IS NULL OR p.public_liability_expiry    > now())
        WHEN 'employers_liability' THEN (p.employers_liability_verified IS TRUE) AND (p.employers_liability_expiry IS NULL OR p.employers_liability_expiry > now())
        WHEN 'trade_cert'          THEN (p.trade_cert_verified          IS TRUE) AND (p.trade_cert_expiry          IS NULL OR p.trade_cert_expiry          > now())
        WHEN 'induction'           THEN (p.site_induction_complete      IS TRUE)
        WHEN 'nda'                 THEN (p.nda_signed                   IS TRUE)
        WHEN 'terms'               THEN (p.terms_accepted               IS TRUE)
        ELSE false
      END
    )
  )
  SELECT array_agg(kind ORDER BY kind) INTO v_unmet_kinds FROM unmet;

  IF v_unmet_kinds IS NOT NULL AND array_length(v_unmet_kinds, 1) > 0 THEN
    RAISE EXCEPTION 'Prequalification requirements not met: %', array_to_string(v_unmet_kinds, ', ');
  END IF;

  -- Completeness: cover note is always required (no requirement-row kind
  -- for it, matching the stepper's own trackedSections, which tracks it
  -- unconditionally); references/methodology/pricing_schedule only when
  -- the business actually asked for that kind on this tender.
  IF btrim(COALESCE(v_application.cover_note, '')) = '' THEN
    v_missing := array_append(v_missing, 'a cover note');
  END IF;

  IF EXISTS (SELECT 1 FROM public.tender_response_requirements WHERE tender_id = v_tender.id AND kind = 'references') THEN
    SELECT COALESCE((config->>'count')::int, 1) INTO v_required_refs
    FROM public.tender_response_requirements WHERE tender_id = v_tender.id AND kind = 'references';

    SELECT count(*) INTO v_ref_count
    FROM public.tender_application_references
    WHERE application_id = p_application_id AND btrim(COALESCE(client_name, '')) <> '';

    IF v_ref_count < v_required_refs THEN
      v_missing := array_append(v_missing, format('at least %s reference(s) with a client name (%s so far)', v_required_refs, v_ref_count));
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM public.tender_response_requirements WHERE tender_id = v_tender.id AND kind = 'methodology')
     AND btrim(COALESCE(v_application.methodology, '')) = ''
  THEN
    v_missing := array_append(v_missing, 'a methodology statement');
  END IF;

  SELECT config INTO v_pricing_config
  FROM public.tender_response_requirements WHERE tender_id = v_tender.id AND kind = 'pricing_schedule';

  IF v_pricing_config IS NOT NULL THEN
    SELECT array_agg(elem->>'id') INTO v_row_ids
    FROM jsonb_array_elements(COALESCE(v_pricing_config->'rows', '[]'::jsonb)) elem;

    IF v_row_ids IS NOT NULL AND array_length(v_row_ids, 1) > 0 THEN
      -- Pricing rule: a row counts as priced when it has a rate that is
      -- NOT NULL and >= 0. Zero is "included", allowed; blank is not.
      SELECT count(*) INTO v_unpriced
      FROM unnest(v_row_ids) rid
      WHERE NOT EXISTS (
        SELECT 1 FROM public.tender_application_price_lines pl
        WHERE pl.application_id = p_application_id AND pl.row_id = rid AND pl.rate IS NOT NULL AND pl.rate >= 0
      );

      IF v_unpriced > 0 THEN
        v_missing := array_append(v_missing, format('a price for every pricing-schedule row (%s row(s) still blank)', v_unpriced));
      END IF;
    END IF;
  END IF;

  IF array_length(v_missing, 1) > 0 THEN
    RAISE EXCEPTION 'Before you can submit: %.', array_to_string(v_missing, '; ');
  END IF;

  IF NOT p_declared THEN
    RAISE EXCEPTION 'You must confirm the declaration before submitting.';
  END IF;

  UPDATE public.tender_applications
  SET
    status            = 'submitted',
    submitted_at      = now(),
    declared_at       = now(),
    prequal_snapshot  = build_prequal_snapshot(v_tender.company_id, v_application.contractor_id)
  WHERE id = p_application_id;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_tender_application(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_tender_application(uuid, boolean) TO authenticated, service_role;
