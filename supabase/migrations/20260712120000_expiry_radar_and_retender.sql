-- =============================================================================
-- 20260712120000_expiry_radar_and_retender.sql
-- Tendering chunk 7 (final): logged_contracts, the contract expiry radar
-- view + watcher, and clone_tender_for_retender(). Source of truth:
-- TENDERING-SCHEMA.md CHUNK 7 (as amended alongside this migration).
--
-- Verified before writing: term_engagements.retendered_as already shipped
-- in chunk 6 (20260711130000, line ~149) — not re-added here.
--
-- Design choices flagged for review:
--
-- 1. logged_contracts RLS is a single FOR ALL is_company_member() policy —
--    no SECURITY DEFINER transition functions, matching the doc's explicit
--    "no status machine," "deliberately thin" framing. This includes
--    retendered_as being freely writable by any business member under that
--    same ALL policy (not restricted to only being set by
--    clone_tender_for_retender()) — consistent with "thin," this is
--    low-stakes internal tracking data, not a legal record.
--
-- 2. contract_expiry_radar is built WITH (security_invoker = true), not
--    the public_pro_profiles owner-bypass pattern: that pattern is for
--    genuinely PUBLIC data where the view itself must supply the entire
--    access filter. This view is company-scoped operational data — the
--    underlying tables (term_engagements, logged_contracts, tenders) all
--    already have correct is_company_member/contractor-scoped SELECT
--    policies, and security_invoker lets the view inherit those directly
--    per querying user instead of duplicating the filter logic.
--
-- 3. run_expiry_radar() queries term_engagements/logged_contracts directly,
--    NOT through the view — the view is a UI-facing artifact (needs
--    security_invoker filtering per dashboard user); the watcher is an
--    internal SECURITY DEFINER function that needs the raw start_date
--    column for the midpoint clamp, which the view doesn't expose (the
--    view is for display, not for feeding the watcher's own timing math).
--
-- 4. Nudge notification type strings (retender_nudge_business,
--    retender_nudge_incumbent) are new values in the notifications.type
--    free-text column — no CHECK constraint exists on that column to
--    extend.
--
-- 5. clone_tender_for_retender()'s copy list, extended per review: also
--    carries bid_visibility, distribution, bid_validity_days,
--    site_visit_required, tupe_applies, contract_term_months —
--    procurement preferences the business set on the original tender, not
--    lifecycle state from the last cycle, so they belong on the clone.
--    contract_start_date and the budget fields (budget_min/budget_max/
--    budget_visible) are deliberately still NOT copied — a new cycle needs
--    a fresh start date and a fresh budget-disclosure decision.
-- =============================================================================


-- =============================================================================
-- 1. LOGGED_CONTRACTS
-- =============================================================================

CREATE TABLE public.logged_contracts (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id             uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  supplier_name          text        NOT NULL,
  trade_category         text        NULL,
  site_ids               uuid[]      NULL,
  expiry_date            date        NOT NULL,
  retender_notice_months int         NOT NULL DEFAULT 6,
  notes                  text        NULL,
  retendered_as          uuid        NULL REFERENCES public.tenders(id),
  created_by             uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_logged_contracts_company_id ON public.logged_contracts(company_id);

ALTER TABLE public.logged_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "logged_contracts_business_all"
ON public.logged_contracts FOR ALL TO authenticated
USING       (is_company_member(company_id))
WITH CHECK  (is_company_member(company_id));


-- =============================================================================
-- 2. CONTRACT_EXPIRY_RADAR — the view. See header note #2 for the
-- security_invoker choice.
-- =============================================================================

CREATE VIEW public.contract_expiry_radar WITH (security_invoker = true) AS
SELECT
  e.id,
  'engagement'::text                            AS source,
  e.company_id,
  e.engagement_number                           AS label,
  e.contractor_id,
  t.trade_categories,
  COALESCE(
    (SELECT array_agg(es.site_id) FROM public.engagement_sites es WHERE es.engagement_id = e.id),
    ARRAY[]::uuid[]
  )                                              AS site_ids,
  e.expiry_date,
  e.retender_notice_months,
  e.notice_effective_date,
  e.retendered_as
FROM public.term_engagements e
JOIN public.tenders t ON t.id = e.tender_id
WHERE e.status IN ('active', 'suspended', 'notice_given')

UNION ALL

SELECT
  lc.id,
  'logged_contract'::text                       AS source,
  lc.company_id,
  lc.supplier_name                              AS label,
  NULL::uuid                                    AS contractor_id,
  CASE WHEN lc.trade_category IS NOT NULL THEN ARRAY[lc.trade_category] ELSE NULL END AS trade_categories,
  lc.site_ids,
  lc.expiry_date,
  lc.retender_notice_months,
  NULL::date                                    AS notice_effective_date,
  lc.retendered_as
FROM public.logged_contracts lc;

GRANT SELECT ON public.contract_expiry_radar TO authenticated;


-- =============================================================================
-- 3. run_expiry_radar() — the watcher. See header note #3.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.run_expiry_radar()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_engagement          RECORD;
  v_logged              RECORD;
  v_midpoint            date;
  v_nudge_from          date;
  v_owner_profile_id    uuid;
  v_owner_user_id       uuid;
  v_contractor_user_id  uuid;
BEGIN
  -- Engagements: active/suspended/notice_given, not yet retendered.
  FOR v_engagement IN
    SELECT * FROM public.term_engagements
    WHERE status IN ('active', 'suspended', 'notice_given')
      AND retendered_as IS NULL
  LOOP
    IF v_engagement.status = 'notice_given' THEN
      v_nudge_from := CURRENT_DATE; -- early trigger: always due once notice is given
    ELSE
      v_midpoint := v_engagement.start_date
        + ((v_engagement.expiry_date - v_engagement.start_date) / 2);
      v_nudge_from := GREATEST(
        (v_engagement.expiry_date - (v_engagement.retender_notice_months || ' months')::interval)::date,
        v_midpoint
      );
    END IF;

    IF CURRENT_DATE >= v_nudge_from THEN
      SELECT owner_id INTO v_owner_profile_id FROM public.companies WHERE id = v_engagement.company_id;
      SELECT user_id INTO v_owner_user_id FROM public.profiles WHERE id = v_owner_profile_id;

      INSERT INTO public.notifications (user_id, title, message, type, reference_type, reference_id)
      VALUES (
        v_owner_user_id,
        'Contract expiring — start your retender?',
        v_engagement.engagement_number || ' expires ' || v_engagement.expiry_date || '. Start your retender?',
        'retender_nudge_business', 'term_engagement', v_engagement.id
      );

      -- Incumbent soft notification: engagement-sourced only.
      SELECT user_id INTO v_contractor_user_id FROM public.profiles WHERE id = v_engagement.contractor_id;
      IF v_contractor_user_id IS NOT NULL THEN
        INSERT INTO public.notifications (user_id, title, message, type, reference_type, reference_id)
        VALUES (
          v_contractor_user_id,
          'Your engagement is expiring soon',
          v_engagement.engagement_number || ' expires ' || v_engagement.expiry_date || '.',
          'retender_nudge_incumbent', 'term_engagement', v_engagement.id
        );
      END IF;
    END IF;
  END LOOP;

  -- Logged contracts: no status machine, no start_date -- no midpoint to
  -- clamp against, so the nudge is driven by retender_notice_months alone.
  -- Business only: no on-platform contractor to soft-notify.
  FOR v_logged IN
    SELECT * FROM public.logged_contracts WHERE retendered_as IS NULL
  LOOP
    v_nudge_from := (v_logged.expiry_date - (v_logged.retender_notice_months || ' months')::interval)::date;

    IF CURRENT_DATE >= v_nudge_from THEN
      INSERT INTO public.notifications (user_id, title, message, type, reference_type, reference_id)
      SELECT
        p.user_id,
        'Off-platform contract expiring — start your retender?',
        v_logged.supplier_name || ' expires ' || v_logged.expiry_date || '. Start your retender?',
        'retender_nudge_business', 'logged_contract', v_logged.id
      FROM public.profiles p
      WHERE p.id = (SELECT owner_id FROM public.companies WHERE id = v_logged.company_id);
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.run_expiry_radar() FROM PUBLIC, anon, authenticated;

-- Attach into the shared dispatcher (20260711130000) -- no new cron entry.
CREATE OR REPLACE FUNCTION public.run_tendering_scheduled_tasks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    PERFORM run_compliance_watcher();
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'run_tendering_scheduled_tasks: compliance watcher failed: %', SQLERRM;
  END;

  BEGIN
    PERFORM run_ppm_generator();
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'run_tendering_scheduled_tasks: PPM generator failed: %', SQLERRM;
  END;

  BEGIN
    PERFORM run_expiry_radar();
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'run_tendering_scheduled_tasks: expiry radar failed: %', SQLERRM;
  END;
END;
$$;


-- =============================================================================
-- 4. clone_tender_for_retender() — copies EXACTLY the ruled list. Nothing
-- else. Over-copying leaks last cycle's context into a fresh procurement.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.clone_tender_for_retender(p_engagement_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_engagement    public.term_engagements%ROWTYPE;
  v_original      public.tenders%ROWTYPE;
  v_new_tender_id uuid;
BEGIN
  SELECT * INTO v_engagement FROM public.term_engagements WHERE id = p_engagement_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Engagement not found';
  END IF;

  IF NOT is_company_member(v_engagement.company_id) THEN
    RAISE EXCEPTION 'Not authorised to retender this engagement';
  END IF;

  IF v_engagement.retendered_as IS NOT NULL THEN
    RAISE EXCEPTION 'Engagement % has already been retendered (tender %)', v_engagement.id, v_engagement.retendered_as;
  END IF;

  SELECT * INTO v_original FROM public.tenders WHERE id = v_engagement.tender_id;

  -- Ruled list, exactly: title, type, trades, scope, formal_procurement,
  -- sla_rule_set_id BY REFERENCE (the FK, not a value copy -- the rule
  -- belongs to the company and evolves; the agreement snapshot already
  -- preserves what-was-agreed for the expiring engagement), plus the
  -- procurement-preference columns bid_visibility, distribution,
  -- bid_validity_days, site_visit_required, tupe_applies,
  -- contract_term_months -- these describe HOW the business wants to run
  -- the procurement, not lifecycle state from the last cycle, so they
  -- carry forward. contract_start_date and the budget fields (budget_min/
  -- budget_max/budget_visible) are DELIBERATELY NOT copied -- a new cycle
  -- needs a new start date and the business re-decides budget disclosure
  -- fresh each time. company_id/created_by are identity/ownership on the
  -- new row, not "content" being carried forward. status is 'draft';
  -- tender_number is left NULL so assign_tender_number_trigger
  -- (20260710150000_tender_object_and_satellites.sql) allocates a fresh
  -- T-number -- same numbering idiom as every other document family in
  -- this build, already trigger-automatic since chunk 2.
  INSERT INTO public.tenders (
    company_id, created_by, tender_type, title, trade_categories,
    scope_description, formal_procurement, sla_rule_set_id, status,
    bid_visibility, distribution, bid_validity_days, site_visit_required,
    tupe_applies, contract_term_months
  ) VALUES (
    v_engagement.company_id, auth.uid(), v_original.tender_type, v_original.title, v_original.trade_categories,
    v_original.scope_description, v_original.formal_procurement, v_original.sla_rule_set_id, 'draft',
    v_original.bid_visibility, v_original.distribution, v_original.bid_validity_days, v_original.site_visit_required,
    v_original.tupe_applies, v_original.contract_term_months
  )
  RETURNING id INTO v_new_tender_id;

  INSERT INTO public.tender_response_requirements (tender_id, kind, config)
  SELECT v_new_tender_id, kind, config
  FROM public.tender_response_requirements
  WHERE tender_id = v_original.id;

  INSERT INTO public.tender_prequal_requirements (tender_id, kind, detail, mandatory)
  SELECT v_new_tender_id, kind, detail, mandatory
  FROM public.tender_prequal_requirements
  WHERE tender_id = v_original.id;

  INSERT INTO public.tender_evaluation_criteria (tender_id, label, weight)
  SELECT v_new_tender_id, label, weight
  FROM public.tender_evaluation_criteria
  WHERE tender_id = v_original.id;

  -- Sites from engagement_sites (CURRENT portfolio), not the original
  -- tender's tender_sites -- picks up any mid-term portfolio changes.
  INSERT INTO public.tender_sites (tender_id, site_id)
  SELECT v_new_tender_id, site_id FROM public.engagement_sites WHERE engagement_id = p_engagement_id;

  -- Explicitly NOT copied, per the ruling: tender_invitations (fresh
  -- distribution each cycle -- the invite picker flags incumbent via
  -- is_incumbent), tender_addenda, tender_clarifications,
  -- response_deadline and every other lifecycle/timing stamp
  -- (published_at/closed_at/awarded_at all stay NULL on the new draft).

  UPDATE public.term_engagements SET retendered_as = v_new_tender_id WHERE id = p_engagement_id;

  RETURN v_new_tender_id;
END;
$$;

REVOKE ALL     ON FUNCTION public.clone_tender_for_retender(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.clone_tender_for_retender(uuid) TO authenticated;
