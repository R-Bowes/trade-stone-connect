-- =============================================================================
-- 20260711130000_term_engagements_and_watchers.sql
-- Tendering chunk 6: term engagements, versioned rates, call-outs, PPM
-- generation, compliance watching, and the pg_cron infrastructure all three
-- rely on. Source of truth: TENDERING-SCHEMA.md CHUNK 6, plus the rulings
-- and cron findings restated verbatim in this task.
--
-- CRON FINDINGS (verified live, per this task):
-- pg_cron and pg_net were never actually installed before today (dashboard-
-- enabled 2026-07-11: pg_cron in pg_catalog per Supabase's mandated
-- location, pg_net in extensions). cron.job was confirmed EMPTY — the
-- March 20260328193000_invoice_payment_flow.sql migration's
-- `CREATE EXTENSION IF NOT EXISTS pg_cron` recorded as applied but the
-- extension DDL silently failed/no-op'd against a project that didn't have
-- the extension available yet, so invoice-overdue-check never registered.
-- Consequence: invoice overdue marking and SLA breach checking have never
-- run live. This migration re-creates all three cron entries fresh via the
-- established unschedule-if-exists-then-schedule idiom: invoice-overdue-check
-- (re-asserted verbatim from the March body), sla-clock-check (claimed by
-- that edge function's own header comment but never actually wired to any
-- cron.schedule call in migration history — added here for the first time),
-- and the new tendering-scheduled-runner dispatcher.
--
-- Design choices flagged for review:
--
-- 1. raise_callout's SLA-clock invocation (via the internal
--    create_callout_job helper) is fire-and-forget with a guard: missing
--    app.settings.supabase_url/service_role_key, or any error from the
--    net.http_post call itself, is caught and RAISE WARNING'd — never an
--    exception that rolls back the job creation. A DO block at the top of
--    this migration checks those settings and RAISE NOTICEs the manual
--    fix step if either is absent (see the read-only check given
--    separately for you to run first).
--
-- 2. Compliance watcher and PPM generator are SECURITY DEFINER SQL
--    functions called DIRECTLY by the dispatcher (no HTTP hop) — per your
--    ruling and the Phase 1 finding that their entire logic (expiry
--    checks, status flips, notifications.insert) is expressible in SQL,
--    with notifications being plain table rows (no external email/SMS
--    service involved anywhere in this codebase's notification path).
--
-- 3. sla_rule_set_id: engagement copies the reference at conversion FROM
--    THE AGREEMENT'S terms_snapshot (terms_snapshot->'tender'->>
--    'sla_rule_set_id'), not a live tenders read. Not explicitly called
--    out in your ruling, but follows the same principle stated for the
--    rates card: contractual terms agreed at award time come from the
--    frozen snapshot; only genuinely operational facts (which physical
--    sites are covered) are read live.
--
-- 4. engagement_rates "INSERT-only" is reconciled with the both-party
--    propose/accept flow this way: a version row is inserted ONCE by the
--    proposing party (their own agreed_by_X/At set, the counterparty's
--    left NULL); accept_engagement_rate_version() performs the one
--    sanctioned UPDATE — setting only the counterparty's assent columns,
--    never the rate figures — entirely inside a SECURITY DEFINER function.
--    There is no client-facing UPDATE policy on this table at all, so
--    "INSERT-only" holds at the RLS/policy level exactly as stated; the
--    function-gated assent UPDATE is the same category of sanctioned
--    exception as every other transition function in this build
--    ("state transitions with consequences run through SECURITY DEFINER
--    functions, not raw UPDATEs" — this is that convention applied here,
--    not a violation of it).
--
--    REVISED DOCTRINE (this pass): immutability binds FULLY-AGREED versions
--    only (both agreed_by_X_at set) — those can never be updated or
--    deleted by anyone, function-gated or otherwise. A PENDING proposal
--    (one assent only) is not yet a real term and is deletable by either
--    the proposer or the counterparty via
--    withdraw_or_decline_engagement_rate_version() (below), which raises
--    if the row is already fully agreed. Version numbers are not a
--    permanent audit sequence like document numbers — reuse after a
--    withdrawn proposal's deletion is expected and fine.
--
--    Pricing must NEVER read engagement_rates directly: the sole sanctioned
--    resolver is effective_engagement_rates() (below), which excludes any
--    row that isn't fully agreed. Anything computing a call-out's price —
--    none of that exists yet, invoicing is deferred — must call it, not
--    query the table.
--
-- 5. engagement_ppm_schedules.frequency: the doc doesn't enumerate legal
--    values, but the generator must be able to advance next_due
--    algorithmically, which free text can't support. Inferred CHECK list:
--    weekly/fortnightly/monthly/quarterly/biannual/annual. Flagged as an
--    inference, not a doc-specified domain.
--
-- 6. engagement_ppm_schedules.site_id NULL ("all covered sites") is
--    interpreted as: spawn one call-out per site currently in
--    engagement_sites, not one ambiguous sitewide job. Also an inference.
--
-- 7. Compliance watcher scope: tracks only the three EXPIRY-bearing
--    checklist items (public_liability/employers_liability/trade_cert) —
--    site_induction/nda/terms are one-time booleans with no expiry column
--    and don't decay, so there's nothing for an EXPIRY watcher to nudge
--    about. An engagement whose contractor has no panel_prequalification
--    row, or no verified dated item at all, is skipped by this watcher
--    (nothing to track) rather than treated as an immediate lapse — that
--    initial-gate concern is the chunk-4 RED-block's job, already built,
--    not this watcher's. Nudges are NOT deduped against previous runs (no
--    "last nudged" tracking exists) — this will resend the same nudge
--    daily for the whole threshold window. Flagged as a known rough edge,
--    not silently avoided, and not fixed here (would need a new tracking
--    column, out of scope for what was asked).
--
-- 8. No "resume" transition function: only suspend/notice/end were asked
--    for. A suspended engagement has no built-in path back to active in
--    this migration — flagged, not implemented.
-- =============================================================================


-- =============================================================================
-- 0. EXTENSIONS + settings check
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  IF current_setting('app.settings.supabase_url', true) IS NULL
     OR current_setting('app.settings.service_role_key', true) IS NULL THEN
    RAISE NOTICE 'app.settings.supabase_url / app.settings.service_role_key are NOT set. The invoice-overdue-check and sla-clock-check cron jobs, and raise_callout''s SLA-clock invocation, will fail gracefully (logged warning/failed cron run, never an exception) until these are set. Fix: run in the Supabase SQL editor with sufficient privilege — ALTER DATABASE postgres SET app.settings.supabase_url = ''https://<project-ref>.supabase.co''; ALTER DATABASE postgres SET app.settings.service_role_key = ''<service-role-key>''; then reconnect.';
  END IF;
END $$;


-- =============================================================================
-- 1. TERM_ENGAGEMENTS
-- =============================================================================

CREATE TABLE public.term_engagements (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_number      text        NOT NULL,
  agreement_id           uuid        NOT NULL UNIQUE REFERENCES public.tender_agreements(id) ON DELETE CASCADE,
  tender_id              uuid        NOT NULL REFERENCES public.tenders(id) ON DELETE CASCADE,
  company_id             uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  contractor_id          uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status                 text        NOT NULL DEFAULT 'active'
                                      CHECK (status IN ('active', 'suspended', 'notice_given', 'ended', 'expired')),
  start_date             date        NOT NULL,
  expiry_date            date        NOT NULL,
  retender_notice_months int         NOT NULL DEFAULT 6,
  notice_period_days     int         NOT NULL DEFAULT 30,
  notice_effective_date  date        NULL,
  sla_rule_set_id        uuid        NULL REFERENCES public.sla_rules(id),
  auto_suspend_on_lapse  boolean     NOT NULL DEFAULT true,
  suspended_reason       text        NULL,
  ended_at               timestamptz NULL,
  ended_reason           text        NULL,
  retendered_as          uuid        NULL REFERENCES public.tenders(id),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT term_engagements_engagement_number_key UNIQUE (engagement_number)
);

CREATE INDEX idx_term_engagements_company_id     ON public.term_engagements(company_id);
CREATE INDEX idx_term_engagements_contractor_id  ON public.term_engagements(contractor_id);
CREATE INDEX idx_term_engagements_tender_id      ON public.term_engagements(tender_id);
CREATE INDEX idx_term_engagements_status         ON public.term_engagements(status);

ALTER TABLE public.term_engagements ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_term_engagements_updated_at
  BEFORE UPDATE ON public.term_engagements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Number allocation: TE-{company_code}-NNNN, same trigger idiom as
-- assign_tender_number (20260710150000).
CREATE OR REPLACE FUNCTION public.assign_engagement_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_code text;
  v_seq          integer;
BEGIN
  IF NEW.engagement_number IS NULL THEN
    SELECT company_code INTO v_company_code FROM public.companies WHERE id = NEW.company_id;
    v_seq := next_business_document_number(NEW.company_id, 'engagement');
    NEW.engagement_number := 'TE-' || v_company_code || '-' || LPAD(v_seq::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER assign_engagement_number_trigger
  BEFORE INSERT ON public.term_engagements
  FOR EACH ROW EXECUTE FUNCTION public.assign_engagement_number();

-- engagement_company_id: same allowlist idiom as tender_company_id.
CREATE OR REPLACE FUNCTION public.engagement_company_id(p_engagement_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM public.term_engagements WHERE id = p_engagement_id;
$$;

REVOKE ALL     ON FUNCTION public.engagement_company_id(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.engagement_company_id(uuid) TO authenticated;

-- No INSERT/UPDATE/DELETE policy for anyone: creation is exclusively via
-- convert_awarded_agreement_to_term_engagement(); every consequential
-- transition (suspend/notice/end, below) goes through its own SECURITY
-- DEFINER function. There is no raw UPDATE path in policy, per the ruling.
CREATE POLICY "term_engagements_business_select"
ON public.term_engagements FOR SELECT TO authenticated
USING (is_company_member(company_id));

CREATE POLICY "term_engagements_contractor_select"
ON public.term_engagements FOR SELECT TO authenticated
USING (contractor_id = auth.uid());


-- =============================================================================
-- 2. ENGAGEMENT_SITES — independently editable after conversion.
-- =============================================================================

CREATE TABLE public.engagement_sites (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id uuid NOT NULL REFERENCES public.term_engagements(id) ON DELETE CASCADE,
  site_id       uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  CONSTRAINT engagement_sites_engagement_site_key UNIQUE (engagement_id, site_id)
);

CREATE INDEX idx_engagement_sites_engagement_id ON public.engagement_sites(engagement_id);
CREATE INDEX idx_engagement_sites_site_id       ON public.engagement_sites(site_id);

ALTER TABLE public.engagement_sites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "engagement_sites_business_all"
ON public.engagement_sites FOR ALL TO authenticated
USING       (is_company_member(engagement_company_id(engagement_id)))
WITH CHECK  (is_company_member(engagement_company_id(engagement_id)));

CREATE POLICY "engagement_sites_contractor_select"
ON public.engagement_sites FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.term_engagements e
    WHERE e.id = engagement_sites.engagement_id AND e.contractor_id = auth.uid()
  )
);


-- =============================================================================
-- 3. ENGAGEMENT_RATES — versioned, INSERT-only from the client/policy
-- perspective (see header note #4 for the accept-function exception).
-- =============================================================================

CREATE TABLE public.engagement_rates (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id          uuid        NOT NULL REFERENCES public.term_engagements(id) ON DELETE CASCADE,
  version                int         NOT NULL,
  -- callout_ooh, not callout_out_of_hours: the doc's own chunk-6 column
  -- list uses this shorter name, diverging from tender_rates_cards'
  -- callout_out_of_hours (chunk 4) -- not a typo introduced here.
  callout_standard       numeric     NOT NULL,
  callout_ooh            numeric     NOT NULL,
  hourly_rate            numeric     NOT NULL,
  materials_markup_pct   numeric     NOT NULL,
  minimum_charge         numeric     NULL,
  extra_lines            jsonb       NULL,
  effective_from         date        NOT NULL,
  agreed_by_business     uuid        NULL REFERENCES public.profiles(id),
  agreed_by_business_at  timestamptz NULL,
  agreed_by_contractor   uuid        NULL REFERENCES public.profiles(id),
  agreed_by_contractor_at timestamptz NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT engagement_rates_engagement_version_key UNIQUE (engagement_id, version)
);

CREATE INDEX idx_engagement_rates_engagement_id ON public.engagement_rates(engagement_id);

ALTER TABLE public.engagement_rates ENABLE ROW LEVEL SECURITY;

-- No INSERT/UPDATE/DELETE policy for anyone: creation via
-- propose_engagement_rate_version(), the one sanctioned assent-only UPDATE
-- via accept_engagement_rate_version() (both SECURITY DEFINER, below).
CREATE POLICY "engagement_rates_business_select"
ON public.engagement_rates FOR SELECT TO authenticated
USING (is_company_member(engagement_company_id(engagement_id)));

CREATE POLICY "engagement_rates_contractor_select"
ON public.engagement_rates FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.term_engagements e
    WHERE e.id = engagement_rates.engagement_id AND e.contractor_id = auth.uid()
  )
);


-- =============================================================================
-- 4. ENGAGEMENT_PPM_SCHEDULES
-- =============================================================================

CREATE TABLE public.engagement_ppm_schedules (
  id             uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id  uuid    NOT NULL REFERENCES public.term_engagements(id) ON DELETE CASCADE,
  site_id        uuid    NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  title          text    NOT NULL,
  -- Inferred domain, not doc-specified -- see header note #5.
  frequency      text    NOT NULL
                          CHECK (frequency IN ('weekly', 'fortnightly', 'monthly', 'quarterly', 'biannual', 'annual')),
  next_due       date    NOT NULL,
  assigned_trade text    NULL,
  active         boolean NOT NULL DEFAULT true
);

CREATE INDEX idx_engagement_ppm_schedules_engagement_id ON public.engagement_ppm_schedules(engagement_id);
CREATE INDEX idx_engagement_ppm_schedules_next_due       ON public.engagement_ppm_schedules(next_due) WHERE active = true;

ALTER TABLE public.engagement_ppm_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "engagement_ppm_schedules_business_all"
ON public.engagement_ppm_schedules FOR ALL TO authenticated
USING       (is_company_member(engagement_company_id(engagement_id)))
WITH CHECK  (is_company_member(engagement_company_id(engagement_id)));

CREATE POLICY "engagement_ppm_schedules_contractor_select"
ON public.engagement_ppm_schedules FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.term_engagements e
    WHERE e.id = engagement_ppm_schedules.engagement_id AND e.contractor_id = auth.uid()
  )
);


-- =============================================================================
-- 5. jobs.engagement_id — THE call-out mechanic. No parallel pipeline.
-- =============================================================================

ALTER TABLE public.jobs
  ADD COLUMN engagement_id uuid NULL REFERENCES public.term_engagements(id) ON DELETE SET NULL;

CREATE INDEX idx_jobs_engagement_id ON public.jobs(engagement_id) WHERE engagement_id IS NOT NULL;


-- =============================================================================
-- 6. CONVERSION — activates the guard in accept_tender_agreement()
-- (20260711120000). Not directly callable by any client (REVOKE ALL incl.
-- authenticated): reached only via that function's dynamic EXECUTE, which
-- runs under its SECURITY DEFINER context regardless of this function's
-- own grants -- same pattern already relied on for build_prequal_snapshot
-- etc.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.convert_awarded_agreement_to_term_engagement(p_agreement_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agreement       public.tender_agreements%ROWTYPE;
  v_tender          public.tenders%ROWTYPE;
  v_application     public.tender_applications%ROWTYPE;
  v_engagement_id   uuid;
  v_start_date      date;
  v_expiry_date     date;
  v_sla_rule_set_id uuid;
  v_rates_card      jsonb;
BEGIN
  SELECT * INTO v_agreement   FROM public.tender_agreements WHERE id = p_agreement_id;
  SELECT * INTO v_tender      FROM public.tenders WHERE id = v_agreement.tender_id;
  SELECT * INTO v_application FROM public.tender_applications WHERE id = v_agreement.application_id;

  v_start_date := v_tender.contract_start_date;
  IF v_start_date IS NULL THEN
    RAISE EXCEPTION 'Cannot convert to a term engagement: tender % has no contract_start_date', v_tender.id;
  END IF;
  IF v_tender.contract_term_months IS NULL THEN
    RAISE EXCEPTION 'Cannot convert to a term engagement: tender % has no contract_term_months', v_tender.id;
  END IF;
  v_expiry_date := v_start_date + (v_tender.contract_term_months || ' months')::interval;

  -- Snapshot-sourced, not a live tenders read -- see header note #3.
  v_sla_rule_set_id := (v_agreement.terms_snapshot -> 'tender' ->> 'sla_rule_set_id')::uuid;

  INSERT INTO public.term_engagements (
    agreement_id, tender_id, company_id, contractor_id,
    start_date, expiry_date, sla_rule_set_id
  ) VALUES (
    p_agreement_id, v_tender.id, v_tender.company_id, v_application.contractor_id,
    v_start_date, v_expiry_date, v_sla_rule_set_id
  )
  RETURNING id INTO v_engagement_id;

  -- Sites: live copy from tender_sites -- operational, not contractual,
  -- per your ruling.
  INSERT INTO public.engagement_sites (engagement_id, site_id)
  SELECT v_engagement_id, site_id FROM public.tender_sites WHERE tender_id = v_tender.id;

  -- Rates v1: by value from the snapshot's rates_card, not a live
  -- tender_rates_cards read, per your ruling. Both assents copied from the
  -- tender_agreements acceptance itself -- v1 was already mutually agreed
  -- via the award/accept flow, not a fresh negotiation.
  v_rates_card := v_agreement.terms_snapshot -> 'rates_card';
  IF v_rates_card IS NOT NULL AND v_rates_card <> 'null'::jsonb THEN
    INSERT INTO public.engagement_rates (
      engagement_id, version,
      callout_standard, callout_ooh, hourly_rate, materials_markup_pct,
      minimum_charge, extra_lines, effective_from,
      agreed_by_business, agreed_by_business_at,
      agreed_by_contractor, agreed_by_contractor_at
    ) VALUES (
      v_engagement_id, 1,
      (v_rates_card->>'callout_standard')::numeric,
      (v_rates_card->>'callout_out_of_hours')::numeric,
      (v_rates_card->>'hourly_rate')::numeric,
      (v_rates_card->>'materials_markup_pct')::numeric,
      (v_rates_card->>'minimum_charge')::numeric,
      v_rates_card->'extra_lines',
      v_start_date,
      v_agreement.business_accepted_by, v_agreement.business_accepted_at,
      v_agreement.contractor_accepted_by, v_agreement.contractor_accepted_at
    );
  ELSE
    RAISE WARNING 'convert_awarded_agreement_to_term_engagement: agreement % has no rates_card in terms_snapshot; engagement % created with no v1 rates', p_agreement_id, v_engagement_id;
  END IF;

  RETURN v_engagement_id;
END;
$$;

REVOKE ALL ON FUNCTION public.convert_awarded_agreement_to_term_engagement(uuid) FROM PUBLIC, anon, authenticated;


-- =============================================================================
-- 7. RATE VERSIONING — propose/accept. See header note #4.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.propose_engagement_rate_version(
  p_engagement_id uuid,
  p_callout_standard numeric,
  p_callout_ooh numeric,
  p_hourly_rate numeric,
  p_materials_markup_pct numeric,
  p_minimum_charge numeric DEFAULT NULL,
  p_extra_lines jsonb DEFAULT NULL,
  p_effective_from date DEFAULT CURRENT_DATE
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_engagement    public.term_engagements%ROWTYPE;
  v_next_version  int;
  v_rate_id       uuid;
  v_is_business   boolean;
  v_is_contractor boolean;
BEGIN
  SELECT * INTO v_engagement FROM public.term_engagements WHERE id = p_engagement_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Engagement not found';
  END IF;

  v_is_business   := is_company_member(v_engagement.company_id);
  v_is_contractor := (auth.uid() = v_engagement.contractor_id);

  IF NOT v_is_business AND NOT v_is_contractor THEN
    RAISE EXCEPTION 'Not authorised to propose rates on this engagement';
  END IF;

  IF p_effective_from < CURRENT_DATE THEN
    RAISE EXCEPTION 'effective_from cannot be in the past (got %)', p_effective_from;
  END IF;

  SELECT COALESCE(MAX(version), 0) + 1 INTO v_next_version
  FROM public.engagement_rates WHERE engagement_id = p_engagement_id;

  INSERT INTO public.engagement_rates (
    engagement_id, version,
    callout_standard, callout_ooh, hourly_rate, materials_markup_pct,
    minimum_charge, extra_lines, effective_from,
    agreed_by_business, agreed_by_business_at,
    agreed_by_contractor, agreed_by_contractor_at
  ) VALUES (
    p_engagement_id, v_next_version,
    p_callout_standard, p_callout_ooh, p_hourly_rate, p_materials_markup_pct,
    p_minimum_charge, p_extra_lines, p_effective_from,
    CASE WHEN v_is_business THEN auth.uid() ELSE NULL END,
    CASE WHEN v_is_business THEN now()      ELSE NULL END,
    CASE WHEN v_is_business THEN NULL ELSE auth.uid() END,
    CASE WHEN v_is_business THEN NULL ELSE now()      END
  )
  RETURNING id INTO v_rate_id;

  RETURN v_rate_id;
END;
$$;

REVOKE ALL     ON FUNCTION public.propose_engagement_rate_version(uuid, numeric, numeric, numeric, numeric, numeric, jsonb, date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.propose_engagement_rate_version(uuid, numeric, numeric, numeric, numeric, numeric, jsonb, date) TO authenticated;

-- The acceptor MUST be the counterparty of the proposer, per your ruling.
-- Self-acceptance is structurally impossible: whichever side proposed
-- (identified by which agreed_by_X_at is already non-NULL), only the
-- OTHER side's identity check can pass -- a business member can never
-- satisfy "auth.uid() = engagement.contractor_id", and the contractor is
-- never a business member of their own client's company.
CREATE OR REPLACE FUNCTION public.accept_engagement_rate_version(p_rate_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rate       public.engagement_rates%ROWTYPE;
  v_engagement public.term_engagements%ROWTYPE;
BEGIN
  SELECT * INTO v_rate FROM public.engagement_rates WHERE id = p_rate_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rate version not found';
  END IF;

  SELECT * INTO v_engagement FROM public.term_engagements WHERE id = v_rate.engagement_id;

  IF v_rate.agreed_by_business_at IS NOT NULL AND v_rate.agreed_by_contractor_at IS NULL THEN
    IF auth.uid() <> v_engagement.contractor_id THEN
      RAISE EXCEPTION 'Only the engaged contractor may accept a business-proposed rate version';
    END IF;
    UPDATE public.engagement_rates
    SET agreed_by_contractor = auth.uid(), agreed_by_contractor_at = now()
    WHERE id = p_rate_id;

  ELSIF v_rate.agreed_by_contractor_at IS NOT NULL AND v_rate.agreed_by_business_at IS NULL THEN
    IF NOT is_company_member(v_engagement.company_id) THEN
      RAISE EXCEPTION 'Only a business member may accept a contractor-proposed rate version';
    END IF;
    UPDATE public.engagement_rates
    SET agreed_by_business = auth.uid(), agreed_by_business_at = now()
    WHERE id = p_rate_id;

  ELSE
    RAISE EXCEPTION 'Rate version is already fully agreed or is not awaiting acceptance';
  END IF;
END;
$$;

REVOKE ALL     ON FUNCTION public.accept_engagement_rate_version(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.accept_engagement_rate_version(uuid) TO authenticated;

-- Pending (not fully agreed) proposals are deletable by either the
-- proposer's side or the counterparty's side -- either can call this off.
-- Fully agreed versions are immutable and raise. See the revised doctrine
-- in header note #4.
CREATE OR REPLACE FUNCTION public.withdraw_or_decline_engagement_rate_version(p_rate_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rate          public.engagement_rates%ROWTYPE;
  v_engagement    public.term_engagements%ROWTYPE;
  v_is_business   boolean;
  v_is_contractor boolean;
BEGIN
  SELECT * INTO v_rate FROM public.engagement_rates WHERE id = p_rate_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rate version not found';
  END IF;

  IF v_rate.agreed_by_business_at IS NOT NULL AND v_rate.agreed_by_contractor_at IS NOT NULL THEN
    RAISE EXCEPTION 'Rate version % is fully agreed and immutable; it cannot be withdrawn or declined', v_rate.version;
  END IF;

  SELECT * INTO v_engagement FROM public.term_engagements WHERE id = v_rate.engagement_id;

  v_is_business   := is_company_member(v_engagement.company_id);
  v_is_contractor := (auth.uid() = v_engagement.contractor_id);

  IF NOT v_is_business AND NOT v_is_contractor THEN
    RAISE EXCEPTION 'Not authorised to withdraw or decline this rate version';
  END IF;

  DELETE FROM public.engagement_rates WHERE id = p_rate_id;
END;
$$;

REVOKE ALL     ON FUNCTION public.withdraw_or_decline_engagement_rate_version(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.withdraw_or_decline_engagement_rate_version(uuid) TO authenticated;

-- The SOLE sanctioned pricing resolver. Any code that needs "the" rate for
-- an engagement on a given date (currently: nothing — invoicing is
-- deferred, per the doc) MUST call this, never query engagement_rates
-- directly: it's the only place that correctly excludes not-yet-accepted
-- proposals and picks the highest version among fully agreed rows whose
-- effective_from has passed.
CREATE OR REPLACE FUNCTION public.effective_engagement_rates(
  p_engagement_id uuid,
  p_on_date date DEFAULT CURRENT_DATE
)
RETURNS public.engagement_rates
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.engagement_rates
  WHERE engagement_id = p_engagement_id
    AND agreed_by_business_at IS NOT NULL
    AND agreed_by_contractor_at IS NOT NULL
    AND effective_from <= p_on_date
  ORDER BY version DESC
  LIMIT 1;
$$;

REVOKE ALL     ON FUNCTION public.effective_engagement_rates(uuid, date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.effective_engagement_rates(uuid, date) TO authenticated;


-- =============================================================================
-- 8. CALL-OUTS — create_callout_job (internal, no auth check, shared by
-- raise_callout and the PPM generator) + raise_callout (public RPC, does
-- the authorisation check then delegates).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_callout_job(
  p_engagement_id uuid,
  p_title text,
  p_description text,
  p_site_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_engagement    public.term_engagements%ROWTYPE;
  v_owner_id      uuid;
  v_job_id        uuid;
  v_supabase_url  text;
  v_service_key   text;
BEGIN
  SELECT * INTO v_engagement FROM public.term_engagements WHERE id = p_engagement_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Engagement not found';
  END IF;

  -- Suspension blocks NEW call-outs; in-flight jobs continue (this check is
  -- the entire enforcement of that rule -- existing jobs are untouched).
  IF v_engagement.status <> 'active' THEN
    RAISE EXCEPTION 'Engagement is not active (status: %); new call-outs are blocked', v_engagement.status;
  END IF;

  SELECT owner_id INTO v_owner_id FROM public.companies WHERE id = v_engagement.company_id;

  -- Mirrors createJobFromQuote.ts's INSERT shape (Phase 1, chunk 5):
  -- customer_id = companies.owner_id since a call-out has no individual
  -- customer. No issued_quote_id (quote phase is skipped for call-outs,
  -- per the doc). Pricing from the effective rates version is a query-time
  -- concern for the deferred invoicing chunk, not stamped on the job here.
  INSERT INTO public.jobs (
    contractor_id, customer_id, title, description, status,
    company_id, site_id, engagement_id, sla_rule_id
  ) VALUES (
    v_engagement.contractor_id, v_owner_id, p_title, p_description, 'scheduled',
    v_engagement.company_id, p_site_id, p_engagement_id, v_engagement.sla_rule_set_id
  )
  RETURNING id INTO v_job_id;

  -- Fire-and-forget SLA-clock start (mirrors createJobFromQuote.ts's
  -- supabase.functions.invoke('sla-clock', {action:'start', job_id})) --
  -- per your ruling, this NEVER raises past this point.
  v_supabase_url := current_setting('app.settings.supabase_url', true);
  v_service_key  := current_setting('app.settings.service_role_key', true);

  IF v_supabase_url IS NULL OR v_service_key IS NULL THEN
    RAISE WARNING 'create_callout_job: app.settings.supabase_url/service_role_key not configured; SLA clock not started for job %', v_job_id;
  ELSE
    BEGIN
      PERFORM net.http_post(
        url := v_supabase_url || '/functions/v1/sla-clock',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_service_key),
        body := jsonb_build_object('action', 'start', 'job_id', v_job_id)
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'create_callout_job: sla-clock invocation failed for job % : %', v_job_id, SQLERRM;
    END;
  END IF;

  INSERT INTO public.notifications (user_id, title, message, type, reference_type, reference_id)
  SELECT p.user_id, 'New call-out', p_title, 'callout_raised', 'job', v_job_id
  FROM public.profiles p WHERE p.id = v_engagement.contractor_id;

  RETURN v_job_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_callout_job(uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.raise_callout(
  p_engagement_id uuid,
  p_title text,
  p_description text DEFAULT NULL,
  p_site_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_engagement public.term_engagements%ROWTYPE;
BEGIN
  SELECT * INTO v_engagement FROM public.term_engagements WHERE id = p_engagement_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Engagement not found';
  END IF;

  IF NOT is_company_member(v_engagement.company_id) AND auth.uid() <> v_engagement.contractor_id THEN
    RAISE EXCEPTION 'Not authorised to raise a call-out on this engagement';
  END IF;

  RETURN create_callout_job(p_engagement_id, p_title, p_description, p_site_id);
END;
$$;

REVOKE ALL     ON FUNCTION public.raise_callout(uuid, text, text, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.raise_callout(uuid, text, text, uuid) TO authenticated;


-- =============================================================================
-- 9. SUSPEND / NOTICE / END — all consequential transitions, function-only.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.suspend_term_engagement(p_engagement_id uuid, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_engagement public.term_engagements%ROWTYPE;
BEGIN
  SELECT * INTO v_engagement FROM public.term_engagements WHERE id = p_engagement_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Engagement not found';
  END IF;

  IF NOT is_company_member(v_engagement.company_id) THEN
    RAISE EXCEPTION 'Not authorised to suspend this engagement';
  END IF;

  IF v_engagement.status <> 'active' THEN
    RAISE EXCEPTION 'Engagement must be active to suspend (current status: %)', v_engagement.status;
  END IF;

  UPDATE public.term_engagements
  SET status = 'suspended', suspended_reason = p_reason
  WHERE id = p_engagement_id;
END;
$$;

REVOKE ALL     ON FUNCTION public.suspend_term_engagement(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.suspend_term_engagement(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.give_notice_on_term_engagement(p_engagement_id uuid, p_notice_effective_date date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_engagement public.term_engagements%ROWTYPE;
BEGIN
  SELECT * INTO v_engagement FROM public.term_engagements WHERE id = p_engagement_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Engagement not found';
  END IF;

  IF NOT is_company_member(v_engagement.company_id) AND auth.uid() <> v_engagement.contractor_id THEN
    RAISE EXCEPTION 'Not authorised to give notice on this engagement';
  END IF;

  IF v_engagement.status NOT IN ('active', 'suspended') THEN
    RAISE EXCEPTION 'Engagement must be active or suspended to give notice (current status: %)', v_engagement.status;
  END IF;

  UPDATE public.term_engagements
  SET status = 'notice_given', notice_effective_date = p_notice_effective_date
  WHERE id = p_engagement_id;
END;
$$;

REVOKE ALL     ON FUNCTION public.give_notice_on_term_engagement(uuid, date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.give_notice_on_term_engagement(uuid, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.end_term_engagement(p_engagement_id uuid, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_engagement public.term_engagements%ROWTYPE;
BEGIN
  SELECT * INTO v_engagement FROM public.term_engagements WHERE id = p_engagement_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Engagement not found';
  END IF;

  IF NOT is_company_member(v_engagement.company_id) AND auth.uid() <> v_engagement.contractor_id THEN
    RAISE EXCEPTION 'Not authorised to end this engagement';
  END IF;

  IF v_engagement.status = 'ended' THEN
    RAISE EXCEPTION 'Engagement has already ended';
  END IF;

  UPDATE public.term_engagements
  SET status = 'ended', ended_at = now(), ended_reason = p_reason
  WHERE id = p_engagement_id;
END;
$$;

REVOKE ALL     ON FUNCTION public.end_term_engagement(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.end_term_engagement(uuid, text) TO authenticated;


-- =============================================================================
-- 10. PPM GENERATOR — see header notes #5, #6.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.run_ppm_generator()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_schedule RECORD;
  v_site_id  uuid;
  v_interval interval;
BEGIN
  FOR v_schedule IN
    SELECT s.*
    FROM public.engagement_ppm_schedules s
    JOIN public.term_engagements e ON e.id = s.engagement_id
    WHERE s.active = true
      AND s.next_due <= CURRENT_DATE
      AND e.status = 'active'
    FOR UPDATE OF s
  LOOP
    IF v_schedule.site_id IS NOT NULL THEN
      PERFORM create_callout_job(
        v_schedule.engagement_id, v_schedule.title,
        'PPM: ' || v_schedule.title, v_schedule.site_id
      );
    ELSE
      FOR v_site_id IN
        SELECT site_id FROM public.engagement_sites WHERE engagement_id = v_schedule.engagement_id
      LOOP
        PERFORM create_callout_job(
          v_schedule.engagement_id, v_schedule.title,
          'PPM: ' || v_schedule.title, v_site_id
        );
      END LOOP;
    END IF;

    v_interval := CASE v_schedule.frequency
      WHEN 'weekly'      THEN interval '1 week'
      WHEN 'fortnightly' THEN interval '2 weeks'
      WHEN 'monthly'     THEN interval '1 month'
      WHEN 'quarterly'   THEN interval '3 months'
      WHEN 'biannual'    THEN interval '6 months'
      WHEN 'annual'      THEN interval '1 year'
    END;

    UPDATE public.engagement_ppm_schedules
    SET next_due = next_due + v_interval
    WHERE id = v_schedule.id;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.run_ppm_generator() FROM PUBLIC, anon, authenticated;


-- =============================================================================
-- 11. COMPLIANCE WATCHER — see header note #7.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.run_compliance_watcher()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_engagement      RECORD;
  v_panel           RECORD;
  v_earliest        date;
  v_days_until      int;
  v_owner_profile_id uuid;
  v_owner_user_id   uuid;
BEGIN
  FOR v_engagement IN
    SELECT * FROM public.term_engagements WHERE status IN ('active', 'suspended')
  LOOP
    SELECT * INTO v_panel
    FROM public.panel_prequalification
    WHERE company_id = v_engagement.company_id AND contractor_id = v_engagement.contractor_id;

    IF NOT FOUND THEN
      CONTINUE; -- nothing to track; not this watcher's concern (see header note #7)
    END IF;

    SELECT LEAST(
      CASE WHEN v_panel.public_liability_verified    IS TRUE THEN v_panel.public_liability_expiry    END,
      CASE WHEN v_panel.employers_liability_verified  IS TRUE THEN v_panel.employers_liability_expiry END,
      CASE WHEN v_panel.trade_cert_verified           IS TRUE THEN v_panel.trade_cert_expiry          END
    ) INTO v_earliest;

    IF v_earliest IS NULL THEN
      CONTINUE; -- no verified dated item to track
    END IF;

    v_days_until := v_earliest - CURRENT_DATE;

    SELECT owner_id INTO v_owner_profile_id FROM public.companies WHERE id = v_engagement.company_id;
    -- companies.owner_id is a profiles.id; resolve to the auth user_id for notifications.user_id.
    SELECT user_id INTO v_owner_user_id FROM public.profiles WHERE id = v_owner_profile_id;

    IF v_days_until < 0 THEN
      IF v_engagement.auto_suspend_on_lapse AND v_engagement.status = 'active' THEN
        UPDATE public.term_engagements
        SET status = 'suspended', suspended_reason = 'Compliance lapsed (auto-suspend)'
        WHERE id = v_engagement.id;

        INSERT INTO public.notifications (user_id, title, message, type, reference_type, reference_id)
        VALUES (v_owner_user_id, 'Engagement suspended', 'Compliance lapsed for ' || v_engagement.engagement_number || '; new call-outs are blocked.', 'engagement_suspended', 'term_engagement', v_engagement.id);
      ELSIF NOT v_engagement.auto_suspend_on_lapse THEN
        INSERT INTO public.notifications (user_id, title, message, type, reference_type, reference_id)
        VALUES (v_owner_user_id, 'Compliance lapsed', v_engagement.engagement_number || ': contractor compliance has lapsed (auto-suspend is off).', 'compliance_lapsed', 'term_engagement', v_engagement.id);
      END IF;
    ELSIF v_days_until <= 14 THEN
      INSERT INTO public.notifications (user_id, title, message, type, reference_type, reference_id)
      SELECT p.user_id, 'Compliance expiring soon', 'Your compliance documents for ' || v_engagement.engagement_number || ' expire in ' || v_days_until || ' day(s).', 'compliance_nudge_14d', 'term_engagement', v_engagement.id
      FROM public.profiles p WHERE p.id = v_engagement.contractor_id;

      INSERT INTO public.notifications (user_id, title, message, type, reference_type, reference_id)
      VALUES (v_owner_user_id, 'Compliance expiring soon', v_engagement.engagement_number || ': contractor compliance expires in ' || v_days_until || ' day(s).', 'compliance_amber_flag', 'term_engagement', v_engagement.id);
    ELSIF v_days_until <= 30 THEN
      INSERT INTO public.notifications (user_id, title, message, type, reference_type, reference_id)
      SELECT p.user_id, 'Compliance expiring soon', 'Your compliance documents for ' || v_engagement.engagement_number || ' expire in ' || v_days_until || ' day(s).', 'compliance_nudge_30d', 'term_engagement', v_engagement.id
      FROM public.profiles p WHERE p.id = v_engagement.contractor_id;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.run_compliance_watcher() FROM PUBLIC, anon, authenticated;


-- =============================================================================
-- 12. SHARED DISPATCHER — one cron entry calls this; chunk 7's radar
-- attaches by adding one more PERFORM inside here, no new cron entry.
-- =============================================================================

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
END;
$$;

REVOKE ALL ON FUNCTION public.run_tendering_scheduled_tasks() FROM PUBLIC, anon, authenticated;


-- =============================================================================
-- 13. CRON ENTRIES — unschedule-if-exists-then-schedule, matching the
-- established idiom exactly (20260328193000). All three created fresh
-- here per the verified-empty cron.job finding.
-- =============================================================================

SELECT cron.unschedule('invoice-overdue-check')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'invoice-overdue-check');

SELECT cron.schedule(
  'invoice-overdue-check',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url', true) || '/functions/v1/mark-overdue-invoices',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb
  );
  $$
);

SELECT cron.unschedule('sla-clock-check')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sla-clock-check');

SELECT cron.schedule(
  'sla-clock-check',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url', true) || '/functions/v1/sla-clock',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := jsonb_build_object('action', 'check')
  );
  $$
);

SELECT cron.unschedule('tendering-scheduled-runner')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'tendering-scheduled-runner');

SELECT cron.schedule(
  'tendering-scheduled-runner',
  '0 6 * * *',
  $$ SELECT public.run_tendering_scheduled_tasks(); $$
);
