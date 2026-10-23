-- Tendering slice 1: lifecycle lock. DRAFT ONLY -- not applied, not pushed.
-- Written to scratchpad/pending per Richard's instruction; move to
-- supabase/migrations/ and `npx supabase db push` only after Step 2's
-- proof passes and Richard reviews.
--
-- ROLLBACK (run in this order if this migration is ever applied and must be
-- undone), with the live body of every replaced object pasted verbatim
-- below, read live on 2026-10-22 via pg_get_functiondef / pg_policies /
-- information_schema.column_privileges:
--
--   drop trigger tenders_content_lock_guard_trigger on public.tenders;
--   drop function public.tenders_content_lock_guard();
--   drop function public.withdraw_tender_application(uuid);
--   drop function public.unseal_tender(uuid);
--   drop function public.cancel_tender(uuid, text);
--   drop function public.close_due_tenders();
--   drop function public.tender_is_draft(uuid);
--   select cron.unschedule('tender-deadline-runner');
--
--   drop policy tender_sites_business_write on public.tender_sites;
--   drop policy tender_response_requirements_business_write on public.tender_response_requirements;
--   drop policy tender_prequal_requirements_business_write on public.tender_prequal_requirements;
--   drop policy tender_evaluation_criteria_business_write on public.tender_evaluation_criteria;
--   drop policy tender_documents_business_write on public.tender_documents;
--   drop policy tender_invitations_business_write on public.tender_invitations;
--   -- restore the six original ALL policies (live bodies, all identical in
--   -- shape -- qual/with_check both `is_company_member(tender_company_id(tender_id))`):
--   create policy tender_sites_business_all on public.tender_sites for all to authenticated
--     using (is_company_member(tender_company_id(tender_id))) with check (is_company_member(tender_company_id(tender_id)));
--   create policy tender_response_requirements_business_all on public.tender_response_requirements for all to authenticated
--     using (is_company_member(tender_company_id(tender_id))) with check (is_company_member(tender_company_id(tender_id)));
--   create policy tender_prequal_requirements_business_all on public.tender_prequal_requirements for all to authenticated
--     using (is_company_member(tender_company_id(tender_id))) with check (is_company_member(tender_company_id(tender_id)));
--   create policy tender_evaluation_criteria_business_all on public.tender_evaluation_criteria for all to authenticated
--     using (is_company_member(tender_company_id(tender_id))) with check (is_company_member(tender_company_id(tender_id)));
--   create policy tender_documents_business_all on public.tender_documents for all to authenticated
--     using (is_company_member(tender_company_id(tender_id))) with check (is_company_member(tender_company_id(tender_id)));
--   create policy tender_invitations_business_all on public.tender_invitations for all to authenticated
--     using (is_company_member(tender_company_id(tender_id))) with check (is_company_member(tender_company_id(tender_id)));
--
--   grant insert, update (status, published_at, closed_at, awarded_at, cancelled_reason) on public.tenders to authenticated;
--   alter table public.tenders drop column unsealed_at;
--   alter table public.tenders drop column unsealed_by;
--   alter table public.tenders drop column cancelled_at;
--   alter table public.tenders drop column cancelled_by;
--
--   grant insert, update (status, submitted_at, withdrawn_at, prequal_snapshot, addendum_ack_sequence) on public.tender_applications to authenticated;
--
--   -- restore the three replaced functions verbatim:
--   CREATE OR REPLACE FUNCTION public.award_tender_agreement(p_application_id uuid, p_standstill_ends_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
--    RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
--   AS $function$
--   DECLARE
--     v_application  public.tender_applications%ROWTYPE;
--     v_tender       public.tenders%ROWTYPE;
--     v_agreement_id uuid;
--     v_terms        jsonb;
--   BEGIN
--     SELECT * INTO v_application FROM public.tender_applications WHERE id = p_application_id FOR UPDATE;
--     IF NOT FOUND THEN RAISE EXCEPTION 'Application not found'; END IF;
--     SELECT * INTO v_tender FROM public.tenders WHERE id = v_application.tender_id FOR UPDATE;
--     IF NOT is_company_member(v_tender.company_id) THEN RAISE EXCEPTION 'Not authorised to award this tender'; END IF;
--     IF v_tender.status <> 'unsealed' THEN RAISE EXCEPTION 'Tender must be unsealed to award (current status: %)', v_tender.status; END IF;
--     IF v_application.status NOT IN ('submitted', 'shortlisted') THEN RAISE EXCEPTION 'Application must be submitted or shortlisted to award (current status: %)', v_application.status; END IF;
--     IF v_application.submitted_at IS NOT NULL AND v_application.submitted_at + (v_tender.bid_validity_days || ' days')::interval < now() THEN
--       RAISE EXCEPTION 'Bid validity has expired; request reconfirmation from the bidder before awarding';
--     END IF;
--     IF v_tender.formal_procurement AND p_standstill_ends_at IS NULL THEN RAISE EXCEPTION 'standstill_ends_at is required under formal procurement mode'; END IF;
--     v_terms := build_agreement_terms_snapshot(v_tender.id, p_application_id);
--     INSERT INTO public.tender_agreements (tender_id, application_id, terms_snapshot, business_accepted_by, business_accepted_at, status, standstill_ends_at)
--     VALUES (v_tender.id, p_application_id, v_terms, auth.uid(), now(), 'offered', p_standstill_ends_at) RETURNING id INTO v_agreement_id;
--     UPDATE public.tenders SET status = 'awarded', awarded_at = now() WHERE id = v_tender.id;
--     UPDATE public.tender_applications SET status = 'awarded' WHERE id = p_application_id;
--     UPDATE public.tender_applications SET status = 'unsuccessful' WHERE tender_id = v_tender.id AND id <> p_application_id AND status IN ('submitted', 'shortlisted');
--     INSERT INTO public.tender_debriefs (application_id, own_scores_snapshot, winning_scores_snapshot)
--     SELECT a.id,
--       CASE WHEN v_tender.formal_procurement THEN build_scores_summary(a.id, false) ELSE NULL END,
--       CASE WHEN v_tender.formal_procurement THEN build_scores_summary(p_application_id, true) ELSE NULL END
--     FROM public.tender_applications a
--     WHERE a.tender_id = v_tender.id AND a.id <> p_application_id AND EXISTS (SELECT 1 FROM public.tender_scores s WHERE s.application_id = a.id)
--     ON CONFLICT (application_id) DO NOTHING;
--     RETURN v_agreement_id;
--   END;
--   $function$;
--
--   CREATE OR REPLACE FUNCTION public.submit_tender_application(p_application_id uuid)
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
--
--   CREATE OR REPLACE FUNCTION public.create_tender_application_draft(p_tender_id uuid)
--    RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
--   AS $function$
--   DECLARE
--     v_contractor_id uuid := auth.uid();
--     v_existing_id uuid; v_existing_status text; v_contractor_code text; v_seq integer; v_application_number text; v_new_id uuid;
--   BEGIN
--     IF NOT contractor_can_view_tender(p_tender_id) THEN RAISE EXCEPTION 'Tender not visible to this contractor'; END IF;
--     IF EXISTS (SELECT 1 FROM public.tenders WHERE id = p_tender_id AND response_deadline IS NOT NULL AND now() > response_deadline) THEN
--       RAISE EXCEPTION 'Tender response deadline has passed';
--     END IF;
--     SELECT id, status INTO v_existing_id, v_existing_status FROM public.tender_applications WHERE tender_id = p_tender_id AND contractor_id = v_contractor_id;
--     IF v_existing_id IS NOT NULL THEN
--       IF v_existing_status = 'draft' THEN RETURN v_existing_id; END IF;
--       RAISE EXCEPTION 'An application already exists for this tender (status: %)', v_existing_status;
--     END IF;
--     SELECT REGEXP_REPLACE(ts_profile_code, '^.*-', '') INTO v_contractor_code FROM public.profiles WHERE id = v_contractor_id;
--     v_seq := next_document_number(v_contractor_id, 'application');
--     v_application_number := 'TA-' || v_contractor_code || '-' || LPAD(v_seq::text, 4, '0');
--     INSERT INTO public.tender_applications (tender_id, contractor_id, application_number, status)
--     VALUES (p_tender_id, v_contractor_id, v_application_number, 'draft') RETURNING id INTO v_new_id;
--     RETURN v_new_id;
--   END;
--   $function$;
--
-- What this migration does: see the locked decisions in the Slice 1 brief
-- (22 Oct 2026). Short version: tenders/tender_applications' server-stamped
-- columns become unwritable by clients (column-grant revoke, invoices'
-- house pattern); a content-lock trigger freezes tender essentials once
-- non-draft; the six satellite tables' ALL policies split into
-- unconditional SELECT + draft-only write; four new functions
-- (withdraw_tender_application, unseal_tender, cancel_tender,
-- close_due_tenders) plus an owner-only check added to award_tender_agreement
-- and a published+deadline check added to submit_tender_application /
-- create_tender_application_draft; a new */15 cron job for
-- close_due_tenders(), separate from the daily tendering-scheduled-runner.

-- ── 0. Pre-flight ────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_tenders_expected text[] := ARRAY[
    'id','tender_number','company_id','created_by','project_id','tender_type','title',
    'trade_categories','scope_description','status','response_deadline','bid_visibility',
    'distribution','bid_validity_days','site_visit_required','budget_min','budget_max',
    'budget_visible','contract_start_date','contract_term_months','tupe_applies',
    'formal_procurement','cancelled_reason','published_at','closed_at','awarded_at',
    'created_at','updated_at','sla_rule_set_id'
  ];
  v_apps_expected text[] := ARRAY[
    'id','application_number','tender_id','contractor_id','status','cover_note',
    'lump_sum_total','methodology','programme_detail','subcontracting','declarations',
    'prequal_snapshot','addendum_ack_sequence','submitted_at','withdrawn_at','created_at','updated_at'
  ];
  v_unlisted text;
  v_missing  text;
BEGIN
  SELECT string_agg(column_name, ', ' ORDER BY column_name) INTO v_unlisted
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='tenders' AND column_name <> ALL (v_tenders_expected);
  SELECT string_agg(c, ', ' ORDER BY c) INTO v_missing
  FROM unnest(v_tenders_expected) c
  WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tenders' AND column_name=c);
  IF v_unlisted IS NOT NULL OR v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'tenders column list out of date. Not listed: [%]. Listed but missing: [%].', coalesce(v_unlisted,''), coalesce(v_missing,'');
  END IF;

  SELECT string_agg(column_name, ', ' ORDER BY column_name) INTO v_unlisted
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='tender_applications' AND column_name <> ALL (v_apps_expected);
  SELECT string_agg(c, ', ' ORDER BY c) INTO v_missing
  FROM unnest(v_apps_expected) c
  WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tender_applications' AND column_name=c);
  IF v_unlisted IS NOT NULL OR v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'tender_applications column list out of date. Not listed: [%]. Listed but missing: [%].', coalesce(v_unlisted,''), coalesce(v_missing,'');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tenders' AND column_name IN ('unsealed_at','unsealed_by','cancelled_at','cancelled_by')) THEN
    RAISE EXCEPTION 'tenders already has one of unsealed_at/unsealed_by/cancelled_at/cancelled_by -- this migration appears to already be applied.';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('withdraw_tender_application','unseal_tender','cancel_tender','close_due_tenders','tender_is_draft')) THEN
    RAISE EXCEPTION 'One of the new slice-1 functions already exists -- this migration appears to already be applied.';
  END IF;
END $$;

-- ── 1. New columns on tenders ────────────────────────────────────────────────
ALTER TABLE public.tenders
  ADD COLUMN unsealed_at  timestamptz,
  ADD COLUMN unsealed_by  uuid REFERENCES public.profiles(id),
  ADD COLUMN cancelled_at timestamptz,
  ADD COLUMN cancelled_by uuid REFERENCES public.profiles(id);
-- cancelled_reason already exists (added pre-slice-1) -- not duplicated as
-- cancel_reason per the ruling.

-- ── 2. Server-only columns: REVOKE client INSERT/UPDATE ──────────────────────
-- Column grants, not RLS -- mirrors invoices.status/paid_date/issued_date
-- (SELECT-only for authenticated) and work_orders (SELECT-only on every
-- column). A column grant alone cannot distinguish WHICH new value is being
-- written (e.g. 'withdrawn' vs 'awarded'), so this is paired with the
-- content-lock trigger below for the columns that still need some
-- client-write capability while draft, and with withdraw_tender_application
-- being the only app-facing path left for a status move at all.
REVOKE INSERT, UPDATE ON public.tenders FROM authenticated;
GRANT INSERT, UPDATE (
  tender_type, title, trade_categories, scope_description, response_deadline,
  bid_visibility, distribution, bid_validity_days, site_visit_required,
  budget_min, budget_max, budget_visible, contract_start_date, contract_term_months,
  tupe_applies, formal_procurement, sla_rule_set_id, project_id, company_id, created_by
) ON public.tenders TO authenticated;
-- Deliberately NOT re-granted: status, tender_number, published_at, closed_at,
-- unsealed_at, unsealed_by, awarded_at, cancelled_at, cancelled_by,
-- cancelled_reason, created_at, updated_at.

REVOKE INSERT, UPDATE ON public.tender_applications FROM authenticated;
GRANT INSERT, UPDATE (
  tender_id, contractor_id, application_number, cover_note, lump_sum_total,
  methodology, programme_detail, subcontracting, declarations
) ON public.tender_applications TO authenticated;
-- Deliberately NOT re-granted: status, submitted_at, withdrawn_at,
-- prequal_snapshot, addendum_ack_sequence, created_at, updated_at.
-- tender_id/contractor_id/application_number stay grantable because the
-- content-lock trigger (enforce_tender_application_immutability, unchanged)
-- already freezes them unconditionally regardless of role -- no raw client
-- INSERT ever happens in practice (create_tender_application_draft is the
-- only writer), but revoking INSERT entirely here isn't in the brief's list
-- and isn't needed for the lock to hold.

-- ── 3. Tenders content-lock trigger (mirrors invoices_issue_lock_guard) ──────
CREATE FUNCTION public.tenders_content_lock_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'A published tender cannot be deleted. Cancel it instead.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN OLD;
  END IF;

  -- UPDATE
  IF OLD.status <> 'draft' THEN
    IF NEW.company_id          IS DISTINCT FROM OLD.company_id
    OR NEW.created_by          IS DISTINCT FROM OLD.created_by
    OR NEW.project_id          IS DISTINCT FROM OLD.project_id
    OR NEW.tender_type         IS DISTINCT FROM OLD.tender_type
    OR NEW.title               IS DISTINCT FROM OLD.title
    OR NEW.trade_categories    IS DISTINCT FROM OLD.trade_categories
    OR NEW.scope_description   IS DISTINCT FROM OLD.scope_description
    OR NEW.response_deadline   IS DISTINCT FROM OLD.response_deadline
    OR NEW.bid_visibility      IS DISTINCT FROM OLD.bid_visibility
    OR NEW.distribution        IS DISTINCT FROM OLD.distribution
    OR NEW.bid_validity_days   IS DISTINCT FROM OLD.bid_validity_days
    OR NEW.site_visit_required IS DISTINCT FROM OLD.site_visit_required
    OR NEW.budget_min          IS DISTINCT FROM OLD.budget_min
    OR NEW.budget_max          IS DISTINCT FROM OLD.budget_max
    OR NEW.budget_visible      IS DISTINCT FROM OLD.budget_visible
    OR NEW.contract_start_date IS DISTINCT FROM OLD.contract_start_date
    OR NEW.contract_term_months IS DISTINCT FROM OLD.contract_term_months
    OR NEW.tupe_applies        IS DISTINCT FROM OLD.tupe_applies
    OR NEW.formal_procurement  IS DISTINCT FROM OLD.formal_procurement
    OR NEW.sla_rule_set_id     IS DISTINCT FROM OLD.sla_rule_set_id
    OR NEW.tender_number       IS DISTINCT FROM OLD.tender_number
    THEN
      RAISE EXCEPTION 'A published tender''s essentials cannot be changed. Use an addendum instead.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF current_user IN ('authenticated', 'anon') THEN
      RAISE EXCEPTION 'Only a draft tender can be changed from the app. A published tender is corrected by addendum.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER tenders_content_lock_guard_trigger
  BEFORE UPDATE OR DELETE ON public.tenders
  FOR EACH ROW EXECUTE FUNCTION public.tenders_content_lock_guard();

-- ── 4. tender_is_draft(): small STABLE helper for the satellite write split ──
-- Not a same-statement-blind STABLE helper in the CLAUDE.md sense: that
-- failure mode is about a SELF-referential helper missing a row INSERTED
-- earlier in the SAME statement on the SAME table a SELECT policy guards.
-- This helper reads a DIFFERENT table (tenders) than the one its policies
-- guard (the six satellites), and a tender's own row is never inserted in
-- the same statement as a satellite write (the tender is always created,
-- committed, and read back in an earlier statement/request before any
-- satellite row exists) -- so there is no reachable case where this
-- function would miss a tenders row relevant to the write it's gating.
CREATE FUNCTION public.tender_is_draft(p_tender_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (SELECT 1 FROM public.tenders WHERE id = p_tender_id AND status = 'draft');
$$;
REVOKE ALL ON FUNCTION public.tender_is_draft(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tender_is_draft(uuid) TO authenticated, service_role;

-- ── 5. Satellite tables: split *_business_all into SELECT (unchanged) +
-- draft-only write. Invitations included -- "invite another contractor
-- mid-tender" is explicitly out of scope here (comes with addenda).
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY tender_sites_business_all ON public.tender_sites;
CREATE POLICY tender_sites_business_select ON public.tender_sites
  FOR SELECT TO authenticated
  USING (is_company_member(tender_company_id(tender_id)));
CREATE POLICY tender_sites_business_write ON public.tender_sites
  FOR ALL TO authenticated
  USING (is_company_member(tender_company_id(tender_id)) AND tender_is_draft(tender_id))
  WITH CHECK (is_company_member(tender_company_id(tender_id)) AND tender_is_draft(tender_id));

DROP POLICY tender_response_requirements_business_all ON public.tender_response_requirements;
CREATE POLICY tender_response_requirements_business_select ON public.tender_response_requirements
  FOR SELECT TO authenticated
  USING (is_company_member(tender_company_id(tender_id)));
CREATE POLICY tender_response_requirements_business_write ON public.tender_response_requirements
  FOR ALL TO authenticated
  USING (is_company_member(tender_company_id(tender_id)) AND tender_is_draft(tender_id))
  WITH CHECK (is_company_member(tender_company_id(tender_id)) AND tender_is_draft(tender_id));

DROP POLICY tender_prequal_requirements_business_all ON public.tender_prequal_requirements;
CREATE POLICY tender_prequal_requirements_business_select ON public.tender_prequal_requirements
  FOR SELECT TO authenticated
  USING (is_company_member(tender_company_id(tender_id)));
CREATE POLICY tender_prequal_requirements_business_write ON public.tender_prequal_requirements
  FOR ALL TO authenticated
  USING (is_company_member(tender_company_id(tender_id)) AND tender_is_draft(tender_id))
  WITH CHECK (is_company_member(tender_company_id(tender_id)) AND tender_is_draft(tender_id));

DROP POLICY tender_evaluation_criteria_business_all ON public.tender_evaluation_criteria;
CREATE POLICY tender_evaluation_criteria_business_select ON public.tender_evaluation_criteria
  FOR SELECT TO authenticated
  USING (is_company_member(tender_company_id(tender_id)));
CREATE POLICY tender_evaluation_criteria_business_write ON public.tender_evaluation_criteria
  FOR ALL TO authenticated
  USING (is_company_member(tender_company_id(tender_id)) AND tender_is_draft(tender_id))
  WITH CHECK (is_company_member(tender_company_id(tender_id)) AND tender_is_draft(tender_id));

DROP POLICY tender_documents_business_all ON public.tender_documents;
CREATE POLICY tender_documents_business_select ON public.tender_documents
  FOR SELECT TO authenticated
  USING (is_company_member(tender_company_id(tender_id)));
CREATE POLICY tender_documents_business_write ON public.tender_documents
  FOR ALL TO authenticated
  USING (is_company_member(tender_company_id(tender_id)) AND tender_is_draft(tender_id))
  WITH CHECK (is_company_member(tender_company_id(tender_id)) AND tender_is_draft(tender_id));

-- tender_invitations_contractor_decline (contractor's own decline) is a
-- separate policy, untouched.
DROP POLICY tender_invitations_business_all ON public.tender_invitations;
CREATE POLICY tender_invitations_business_select ON public.tender_invitations
  FOR SELECT TO authenticated
  USING (is_company_member(tender_company_id(tender_id)));
CREATE POLICY tender_invitations_business_write ON public.tender_invitations
  FOR ALL TO authenticated
  USING (is_company_member(tender_company_id(tender_id)) AND tender_is_draft(tender_id))
  WITH CHECK (is_company_member(tender_company_id(tender_id)) AND tender_is_draft(tender_id));

-- ── 6. withdraw_tender_application ───────────────────────────────────────────
-- Own application only; submitted -> withdrawn only (not reconfirm_requested
-- -- that path has no screen and becomes RPC-only in the addenda slice, per
-- the ruling; TENDERING-UI.md records this in Step 3). The existing
-- enforce_tender_application_immutability trigger arm stamps withdrawn_at;
-- this function only re-checks who/when/tender-status before attempting the
-- UPDATE, which the trigger then allows through regardless of current_user
-- because this function runs SECURITY DEFINER.
CREATE FUNCTION public.withdraw_tender_application(p_application_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_application public.tender_applications%ROWTYPE;
  v_tender      public.tenders%ROWTYPE;
BEGIN
  SELECT * INTO v_application FROM public.tender_applications WHERE id = p_application_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found.' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_application.contractor_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not your application.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_application.status <> 'submitted' THEN
    RAISE EXCEPTION 'Only a submitted application can be withdrawn (current status: %).', v_application.status
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_tender FROM public.tenders WHERE id = v_application.tender_id;

  IF v_tender.status <> 'published' THEN
    RAISE EXCEPTION 'This tender is % and no longer accepting withdrawals.', v_tender.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_tender.response_deadline IS NOT NULL AND now() > v_tender.response_deadline THEN
    RAISE EXCEPTION 'Tender response deadline has passed.' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.tender_applications SET status = 'withdrawn' WHERE id = p_application_id;
END;
$$;
REVOKE ALL ON FUNCTION public.withdraw_tender_application(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.withdraw_tender_application(uuid) TO authenticated, service_role;

-- ── 7. unseal_tender ──────────────────────────────────────────────────────────
-- Owner only. No notifications (per the ruling -- the owner is the one who
-- just chose to open the bids).
CREATE FUNCTION public.unseal_tender(p_tender_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tender public.tenders%ROWTYPE;
BEGIN
  SELECT * INTO v_tender FROM public.tenders WHERE id = p_tender_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tender not found.' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT is_company_owner(v_tender.company_id) THEN
    RAISE EXCEPTION 'Only the company owner can open bids.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_tender.status <> 'closed' THEN
    RAISE EXCEPTION 'Only a closed tender can be unsealed (current status: %).', v_tender.status
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.tenders
  SET status = 'unsealed', unsealed_at = now(), unsealed_by = auth.uid()
  WHERE id = p_tender_id;
END;
$$;
REVOKE ALL ON FUNCTION public.unseal_tender(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unseal_tender(uuid) TO authenticated, service_role;

-- ── 8. cancel_tender ──────────────────────────────────────────────────────────
-- Owner only, any status before 'awarded'. Notifies every invited
-- contractor plus every contractor holding an application (any status),
-- deduplicated, with the reason in the message. Applications are left
-- untouched -- screens read the tender's own status.
CREATE FUNCTION public.cancel_tender(p_tender_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tender  public.tenders%ROWTYPE;
  v_reason  text;
BEGIN
  v_reason := btrim(coalesce(p_reason, ''));
  IF v_reason = '' THEN
    RAISE EXCEPTION 'A reason is required to cancel a tender.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_tender FROM public.tenders WHERE id = p_tender_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tender not found.' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT is_company_owner(v_tender.company_id) THEN
    RAISE EXCEPTION 'Only the company owner can cancel a tender.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_tender.status NOT IN ('draft', 'published', 'closed', 'unsealed') THEN
    RAISE EXCEPTION 'A tender in status % cannot be cancelled.', v_tender.status
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.tenders
  SET status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancelled_reason = v_reason
  WHERE id = p_tender_id;

  INSERT INTO public.notifications (user_id, title, message, type, reference_type, reference_id, is_read)
  SELECT DISTINCT p.user_id,
    'Tender cancelled',
    '"' || v_tender.title || '" (' || v_tender.tender_number || ') has been cancelled: ' || v_reason,
    'tender_cancelled', 'tender', p_tender_id, false
  FROM public.profiles p
  WHERE p.id IN (
    SELECT contractor_id FROM public.tender_invitations WHERE tender_id = p_tender_id
    UNION
    SELECT contractor_id FROM public.tender_applications WHERE tender_id = p_tender_id
  );
END;
$$;
REVOKE ALL ON FUNCTION public.cancel_tender(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_tender(uuid, text) TO authenticated, service_role;

-- ── 9. close_due_tenders ──────────────────────────────────────────────────────
-- Cron/service only. "Live bids" = applications in submitted,
-- reconfirm_requested, or shortlisted. Notifies the company OWNER only
-- (companies.owner_id -> profiles.user_id), matching publish_tender's own
-- JOIN profiles pattern.
CREATE FUNCTION public.close_due_tenders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tender    record;
  v_live_bids integer;
BEGIN
  FOR v_tender IN
    SELECT * FROM public.tenders
    WHERE status = 'published'
      AND response_deadline IS NOT NULL
      AND response_deadline < now()
    FOR UPDATE SKIP LOCKED
  LOOP
    SELECT count(*) INTO v_live_bids
    FROM public.tender_applications
    WHERE tender_id = v_tender.id AND status IN ('submitted', 'reconfirm_requested', 'shortlisted');

    IF v_live_bids = 0 THEN
      UPDATE public.tenders SET status = 'lapsed', closed_at = now() WHERE id = v_tender.id;

      INSERT INTO public.notifications (user_id, title, message, type, reference_type, reference_id, is_read)
      SELECT p.user_id, 'No bids received',
        '"' || v_tender.title || '" (' || v_tender.tender_number || ') closed with no bids and has lapsed.',
        'tender_lapsed', 'tender', v_tender.id, false
      FROM public.companies c
      JOIN public.profiles p ON p.id = c.owner_id
      WHERE c.id = v_tender.company_id;

    ELSIF v_tender.bid_visibility = 'sealed' THEN
      UPDATE public.tenders SET status = 'closed', closed_at = now() WHERE id = v_tender.id;

      INSERT INTO public.notifications (user_id, title, message, type, reference_type, reference_id, is_read)
      SELECT p.user_id, 'Bids ready to open',
        '"' || v_tender.title || '" (' || v_tender.tender_number || ') has closed with ' || v_live_bids || ' bid' ||
          (CASE WHEN v_live_bids = 1 THEN '' ELSE 's' END) || ' ready to open.',
        'tender_closed', 'tender', v_tender.id, false
      FROM public.companies c
      JOIN public.profiles p ON p.id = c.owner_id
      WHERE c.id = v_tender.company_id;

    ELSE
      -- open visibility: no seal to lift, go straight to unsealed. closed_at
      -- is still stamped (the window closed), unsealed_by stays NULL (system).
      UPDATE public.tenders SET status = 'unsealed', closed_at = now(), unsealed_at = now() WHERE id = v_tender.id;

      INSERT INTO public.notifications (user_id, title, message, type, reference_type, reference_id, is_read)
      SELECT p.user_id, 'Bids ready to open',
        '"' || v_tender.title || '" (' || v_tender.tender_number || ') has closed with ' || v_live_bids || ' bid' ||
          (CASE WHEN v_live_bids = 1 THEN '' ELSE 's' END) || ' ready to open.',
        'tender_closed', 'tender', v_tender.id, false
      FROM public.companies c
      JOIN public.profiles p ON p.id = c.owner_id
      WHERE c.id = v_tender.company_id;
    END IF;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.close_due_tenders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.close_due_tenders() TO service_role;

-- ── 10. award_tender_agreement: add the owner-only check, nothing else ───────
CREATE OR REPLACE FUNCTION public.award_tender_agreement(p_application_id uuid, p_standstill_ends_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_application  public.tender_applications%ROWTYPE;
  v_tender       public.tenders%ROWTYPE;
  v_agreement_id uuid;
  v_terms        jsonb;
BEGIN
  SELECT * INTO v_application
  FROM public.tender_applications
  WHERE id = p_application_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found';
  END IF;

  SELECT * INTO v_tender FROM public.tenders WHERE id = v_application.tender_id FOR UPDATE;

  IF NOT is_company_member(v_tender.company_id) THEN
    RAISE EXCEPTION 'Not authorised to award this tender';
  END IF;

  -- Slice 1: award is owner-only, narrower than plain membership above.
  IF NOT is_company_owner(v_tender.company_id) THEN
    RAISE EXCEPTION 'Only the company owner can award this tender';
  END IF;

  IF v_tender.status <> 'unsealed' THEN
    RAISE EXCEPTION 'Tender must be unsealed to award (current status: %)', v_tender.status;
  END IF;

  IF v_application.status NOT IN ('submitted', 'shortlisted') THEN
    RAISE EXCEPTION 'Application must be submitted or shortlisted to award (current status: %)', v_application.status;
  END IF;

  IF v_application.submitted_at IS NOT NULL
     AND v_application.submitted_at + (v_tender.bid_validity_days || ' days')::interval < now() THEN
    RAISE EXCEPTION 'Bid validity has expired; request reconfirmation from the bidder before awarding';
  END IF;

  IF v_tender.formal_procurement AND p_standstill_ends_at IS NULL THEN
    RAISE EXCEPTION 'standstill_ends_at is required under formal procurement mode';
  END IF;

  v_terms := build_agreement_terms_snapshot(v_tender.id, p_application_id);

  INSERT INTO public.tender_agreements (
    tender_id, application_id, terms_snapshot,
    business_accepted_by, business_accepted_at,
    status, standstill_ends_at
  ) VALUES (
    v_tender.id, p_application_id, v_terms,
    auth.uid(), now(),
    'offered', p_standstill_ends_at
  )
  RETURNING id INTO v_agreement_id;

  UPDATE public.tenders SET status = 'awarded', awarded_at = now() WHERE id = v_tender.id;

  UPDATE public.tender_applications SET status = 'awarded' WHERE id = p_application_id;

  UPDATE public.tender_applications
  SET status = 'unsuccessful'
  WHERE tender_id = v_tender.id
    AND id <> p_application_id
    AND status IN ('submitted', 'shortlisted');

  INSERT INTO public.tender_debriefs (application_id, own_scores_snapshot, winning_scores_snapshot)
  SELECT
    a.id,
    CASE WHEN v_tender.formal_procurement THEN build_scores_summary(a.id, false) ELSE NULL END,
    CASE WHEN v_tender.formal_procurement THEN build_scores_summary(p_application_id, true) ELSE NULL END
  FROM public.tender_applications a
  WHERE a.tender_id = v_tender.id
    AND a.id <> p_application_id
    AND EXISTS (SELECT 1 FROM public.tender_scores s WHERE s.application_id = a.id)
  ON CONFLICT (application_id) DO NOTHING;

  RETURN v_agreement_id;
END;
$$;

-- ── 11. submit_tender_application: add the published-status check ───────────
CREATE OR REPLACE FUNCTION public.submit_tender_application(p_application_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_application  public.tender_applications%ROWTYPE;
  v_tender       public.tenders%ROWTYPE;
  v_unmet_kinds  text[];
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

  -- Slice 1: the tender itself must still be open, not just the deadline.
  IF v_tender.status <> 'published' THEN
    RAISE EXCEPTION 'This tender is % and is not accepting submissions', v_tender.status;
  END IF;

  IF v_tender.response_deadline IS NOT NULL AND now() > v_tender.response_deadline THEN
    RAISE EXCEPTION 'Tender response deadline has passed';
  END IF;

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

  UPDATE public.tender_applications
  SET
    status            = 'submitted',
    submitted_at      = now(),
    prequal_snapshot  = build_prequal_snapshot(v_tender.company_id, v_application.contractor_id)
  WHERE id = p_application_id;
END;
$$;

-- ── 12. create_tender_application_draft: add the published-status check ─────
CREATE OR REPLACE FUNCTION public.create_tender_application_draft(p_tender_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_contractor_id      uuid := auth.uid();
  v_tender             public.tenders%ROWTYPE;
  v_existing_id        uuid;
  v_existing_status    text;
  v_contractor_code    text;
  v_seq                integer;
  v_application_number text;
  v_new_id             uuid;
BEGIN
  IF NOT contractor_can_view_tender(p_tender_id) THEN
    RAISE EXCEPTION 'Tender not visible to this contractor';
  END IF;

  SELECT * INTO v_tender FROM public.tenders WHERE id = p_tender_id;

  -- Slice 1: the tender itself must be published, not merely visible
  -- (contractor_can_view_tender only excludes 'draft', which would let a
  -- contractor open a draft application against an awarded/cancelled tender).
  IF v_tender.status <> 'published' THEN
    RAISE EXCEPTION 'This tender is % and is not accepting applications', v_tender.status;
  END IF;

  IF v_tender.response_deadline IS NOT NULL AND now() > v_tender.response_deadline THEN
    RAISE EXCEPTION 'Tender response deadline has passed';
  END IF;

  SELECT id, status INTO v_existing_id, v_existing_status
  FROM public.tender_applications
  WHERE tender_id = p_tender_id AND contractor_id = v_contractor_id;

  IF v_existing_id IS NOT NULL THEN
    IF v_existing_status = 'draft' THEN
      RETURN v_existing_id; -- idempotent resume
    END IF;
    RAISE EXCEPTION 'An application already exists for this tender (status: %)', v_existing_status;
  END IF;

  SELECT REGEXP_REPLACE(ts_profile_code, '^.*-', '') INTO v_contractor_code
  FROM public.profiles
  WHERE id = v_contractor_id;

  v_seq := next_document_number(v_contractor_id, 'application');
  v_application_number := 'TA-' || v_contractor_code || '-' || LPAD(v_seq::text, 4, '0');

  INSERT INTO public.tender_applications (tender_id, contractor_id, application_number, status)
  VALUES (p_tender_id, v_contractor_id, v_application_number, 'draft')
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

-- ── 13. EXECUTE grants -- confirm the client-facing surface, cron stays locked ─
REVOKE ALL ON FUNCTION public.submit_tender_application(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_tender_application(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_tender_application_draft(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_tender_application_draft(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.award_tender_agreement(uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.award_tender_agreement(uuid, timestamptz) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.shortlist_tender_application(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shortlist_tender_application(uuid) TO authenticated, service_role;
-- withdraw_tender_application, unseal_tender, cancel_tender already granted
-- to authenticated+service_role above (sections 6-8); close_due_tenders
-- already revoked from authenticated above (section 9).

-- ── 14. Cron: separate */15 job, not folded into the daily runner ───────────
SELECT cron.unschedule('tender-deadline-runner')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'tender-deadline-runner');

SELECT cron.schedule(
  'tender-deadline-runner',
  '*/15 * * * *',
  $$ SELECT public.close_due_tenders(); $$
);
-- tendering-scheduled-runner (0 6 * * *, run_tendering_scheduled_tasks)
-- is untouched -- still just compliance watcher + PPM generator + expiry
-- radar, per the ruling.
