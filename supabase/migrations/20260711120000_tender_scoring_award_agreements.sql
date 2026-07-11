-- =============================================================================
-- 20260711120000_tender_scoring_award_agreements.sql
-- Tendering chunk 5: scoring, award ceremony, agreements.
-- Source of truth: TENDERING-SCHEMA.md CHUNK 5, plus the rulings restated
-- verbatim in this task and the Phase 1 findings from this same session.
--
-- Design choices flagged for review, none silently decided:
--
-- 1. is_company_member(company_id) is used throughout (member-wide, no role
--    gating), consistent with "this chunk doesn't role-gate" and matching
--    the ACTUAL live signature (1-arg, no p_roles) confirmed this session —
--    see the CLAUDE.md correction landing alongside this migration.
--
-- 2. Conversion (works -> job, term -> term_engagement) fires from
--    accept_tender_agreement(), NOT award_tender_agreement() — the doc says
--    "Acceptance fires conversion," not award. A job/engagement must not
--    exist before the contractor has actually agreed to terms.
--
-- 3. jobs.customer_id is NOT NULL but a tender-derived job has no individual
--    customer; set to companies.owner_id (always resolvable, NOT NULL).
--    New column jobs.tender_agreement_id (nullable, FK) added for
--    traceability, symmetric with the already-planned chunk-6
--    jobs.engagement_id. Site selection: only inferred when tender_sites
--    has exactly one row for the tender; multi-site tenders (lots) are
--    explicitly deferred per the doc's own DEFERRED list, so no job-
--    splitting logic exists here.
--
-- 4. terms_snapshot: tenders had no sla_rule_id/sla_rule_set_id column from
--    any earlier chunk, so there was no FK to select "the" applicable SLA
--    rule from. Resolved in this pass: ADD COLUMN tenders.sla_rule_set_id,
--    named to match chunk 6's already-documented term_engagements.
--    sla_rule_set_id (not jobs.sla_rule_id's naming) since it's the same
--    concept one chunk early — tenders needs it before award,
--    term_engagements will presumably inherit it at chunk-6 conversion the
--    same way rates cards get copied. Nullable, no matching heuristic
--    invented (e.g. trade-category overlap) — business sets it explicitly
--    or it stays NULL and terms_snapshot.sla_rules is null.
--
-- 4b. terms_snapshot also now resolves reference-shaped content by value
--    instead of leaving it as bare IDs inside the whole-row to_jsonb dumps:
--    'sla_rules' (full row, null if unset), 'sites' (tender_sites ⨝ sites,
--    id/name/address), 'parties' (company id/name/company_code, contractor
--    id/display_name/ts_profile_code). The five original whole-row
--    to_jsonb() dumps (tender, addenda, application, application_references,
--    rates_card) are unchanged — these are additive top-level keys.
--
-- 5. tender_debriefs.score_band and .feedback are left NULL at the atomic
--    award-time release — no banding thresholds are invented here (that is
--    a product decision this schema pass has no basis for), and there is no
--    business-authored feedback input anywhere in chunks 1-5 to source
--    initial text from. A business_update RLS policy lets the business fill
--    these in afterward; own_scores_snapshot/winning_scores_snapshot ARE
--    computed mechanically in formal_procurement mode (fully doc-specified,
--    "generated from tender_scores") and are then frozen by a trigger.
--    Debriefs are released to every SCORED (EXISTS tender_scores row)
--    non-winning application — the winner gets the agreement instead of a
--    debrief.
--
-- 6. Added decline_tender_agreement() beyond the literal "award function,
--    acceptance function" ask: status CHECK already includes 'declined' and
--    without a write path that value is unreachable. 'expired' remains
--    unreachable — no scheduled runner exists yet for tendering (the doc
--    ties that to chunk 6's shared SLA/compliance/expiry runner) — flagged,
--    not implemented here.
--
-- 7. enforce_tender_application_immutability() (20260710180000) is extended
--    with exactly the 5 arcs from the Phase 1 report: submitted->shortlisted,
--    submitted/shortlisted->awarded, submitted/shortlisted->unsuccessful.
--    reconfirm_requested is deliberately NOT a source state for any of these
--    — an application mid-reconfirmation must resolve back to submitted
--    first via the existing arc.
-- =============================================================================


-- =============================================================================
-- 1. TENDER_SCORES
-- =============================================================================

CREATE TABLE public.tender_scores (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid        NOT NULL REFERENCES public.tender_applications(id)      ON DELETE CASCADE,
  criterion_id   uuid        NOT NULL REFERENCES public.tender_evaluation_criteria(id) ON DELETE CASCADE,
  score          numeric     NOT NULL CHECK (score >= 0 AND score <= 10),
  note           text        NULL,
  scored_by      uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tender_scores_application_criterion_scorer_key UNIQUE (application_id, criterion_id, scored_by)
);

CREATE INDEX idx_tender_scores_application_id ON public.tender_scores(application_id);
CREATE INDEX idx_tender_scores_criterion_id   ON public.tender_scores(criterion_id);
CREATE INDEX idx_tender_scores_scored_by      ON public.tender_scores(scored_by);

ALTER TABLE public.tender_scores ENABLE ROW LEVEL SECURITY;

-- score.note REQUIRED when tender.formal_procurement — enforced in the
-- write path (trigger), not a CHECK, since it's conditional on a column of
-- a DIFFERENT table (tenders, via tender_applications).
CREATE OR REPLACE FUNCTION public.enforce_score_note_when_formal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_formal boolean;
BEGIN
  SELECT t.formal_procurement INTO v_formal
  FROM public.tender_applications a
  JOIN public.tenders t ON t.id = a.tender_id
  WHERE a.id = NEW.application_id;

  IF v_formal AND (NEW.note IS NULL OR btrim(NEW.note) = '') THEN
    RAISE EXCEPTION 'A note is required when scoring under formal procurement mode';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_score_note_when_formal_trigger
  BEFORE INSERT ON public.tender_scores
  FOR EACH ROW EXECUTE FUNCTION public.enforce_score_note_when_formal();

-- tender_status_for_application: used by the tender_scores INSERT gate
-- below (award-time cutoff) and reusable wherever a policy needs a
-- tender's status resolved from an application_id. Allowlist:
-- tender_applications, tenders.
CREATE OR REPLACE FUNCTION public.tender_status_for_application(p_application_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.status
  FROM public.tender_applications a
  JOIN public.tenders t ON t.id = a.tender_id
  WHERE a.id = p_application_id;
$$;

REVOKE ALL     ON FUNCTION public.tender_status_for_application(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.tender_status_for_application(uuid) TO authenticated;

-- RLS: business members of the tender's company only. Contractors NEVER
-- read score rows (no contractor policy at all — they get debriefs).
-- No UPDATE, no DELETE policy for anyone at any time: true append-only,
-- which satisfies BOTH "append-only before award" and "immutable after
-- award" simultaneously. The INSERT gate additionally blocks new rows once
-- the tender has been awarded.
CREATE POLICY "tender_scores_business_select"
ON public.tender_scores FOR SELECT TO authenticated
USING (business_can_view_application(application_id));

CREATE POLICY "tender_scores_business_insert"
ON public.tender_scores FOR INSERT TO authenticated
WITH CHECK (
  business_can_view_application(application_id)
  AND scored_by = auth.uid()
  AND tender_status_for_application(application_id) <> 'awarded'
);


-- =============================================================================
-- 2. TENDER_DEBRIEFS
-- =============================================================================

CREATE TABLE public.tender_debriefs (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id         uuid        NOT NULL UNIQUE REFERENCES public.tender_applications(id) ON DELETE CASCADE,
  feedback               text        NULL,
  score_band             text        NULL,
  own_scores_snapshot    jsonb       NULL,
  winning_scores_snapshot jsonb      NULL,
  created_at             timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tender_debriefs ENABLE ROW LEVEL SECURITY;

-- Snapshots are frozen at creation (award time); only feedback/score_band
-- may be authored afterward via the business_update policy below.
CREATE OR REPLACE FUNCTION public.enforce_debrief_snapshot_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.application_id IS DISTINCT FROM OLD.application_id
     OR NEW.own_scores_snapshot IS DISTINCT FROM OLD.own_scores_snapshot
     OR NEW.winning_scores_snapshot IS DISTINCT FROM OLD.winning_scores_snapshot THEN
    RAISE EXCEPTION 'application_id and the scores snapshots on a debrief are immutable; only feedback and score_band may be updated';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_debrief_snapshot_immutability_trigger
  BEFORE UPDATE ON public.tender_debriefs
  FOR EACH ROW EXECUTE FUNCTION public.enforce_debrief_snapshot_immutability();

-- No INSERT/DELETE policy for anyone: creation exclusively via
-- award_tender_agreement()'s atomic release (SECURITY DEFINER, bypasses RLS).
CREATE POLICY "tender_debriefs_contractor_select"
ON public.tender_debriefs FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.tender_applications a
    WHERE a.id = tender_debriefs.application_id AND a.contractor_id = auth.uid()
  )
);

CREATE POLICY "tender_debriefs_business_select"
ON public.tender_debriefs FOR SELECT TO authenticated
USING (business_can_view_application(application_id));

CREATE POLICY "tender_debriefs_business_update"
ON public.tender_debriefs FOR UPDATE TO authenticated
USING       (business_can_view_application(application_id))
WITH CHECK  (business_can_view_application(application_id));


-- =============================================================================
-- 3. TENDER_AGREEMENTS
-- =============================================================================

CREATE TABLE public.tender_agreements (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id              uuid        NOT NULL UNIQUE REFERENCES public.tenders(id) ON DELETE CASCADE,
  application_id         uuid        NOT NULL REFERENCES public.tender_applications(id) ON DELETE CASCADE,
  terms_snapshot         jsonb       NOT NULL,
  business_accepted_by   uuid        NOT NULL REFERENCES public.profiles(id),
  business_accepted_at   timestamptz NOT NULL,
  contractor_accepted_by uuid        NULL REFERENCES public.profiles(id),
  contractor_accepted_at timestamptz NULL,
  status                 text        NOT NULL DEFAULT 'offered'
                                      CHECK (status IN ('offered', 'accepted', 'declined', 'expired')),
  declined_reason        text        NULL,
  standstill_ends_at     timestamptz NULL,
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tender_agreements_application_id ON public.tender_agreements(application_id);

ALTER TABLE public.tender_agreements ENABLE ROW LEVEL SECURITY;

-- No write policy for anyone: every transition (offer, accept, decline)
-- goes through award_tender_agreement() / accept_tender_agreement() /
-- decline_tender_agreement() (all SECURITY DEFINER). Each of those functions
-- checks status = 'offered' before acting, which is what actually enforces
-- "immutable from contractor acceptance" — there is no other write path
-- into this table for a trigger to have to police.
CREATE POLICY "tender_agreements_business_select"
ON public.tender_agreements FOR SELECT TO authenticated
USING (is_company_member(tender_company_id(tender_id)));

CREATE POLICY "tender_agreements_contractor_select"
ON public.tender_agreements FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.tender_applications a
    WHERE a.id = tender_agreements.application_id AND a.contractor_id = auth.uid()
  )
);


-- =============================================================================
-- 4. jobs.tender_agreement_id — traceability for the works conversion.
-- =============================================================================

ALTER TABLE public.jobs
  ADD COLUMN tender_agreement_id uuid NULL REFERENCES public.tender_agreements(id);

CREATE INDEX idx_jobs_tender_agreement_id
  ON public.jobs(tender_agreement_id) WHERE tender_agreement_id IS NOT NULL;


-- =============================================================================
-- 5. enforce_tender_application_immutability() — extended allowlist.
-- CREATE OR REPLACE of the function from 20260710180000, adding exactly the
-- 5 chunk-5 arcs. All other arcs are unchanged from that migration.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.enforce_tender_application_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deadline         timestamptz;
  v_content_changed  boolean;
BEGIN
  IF NEW.tender_id IS DISTINCT FROM OLD.tender_id
     OR NEW.contractor_id IS DISTINCT FROM OLD.contractor_id
     OR NEW.application_number IS DISTINCT FROM OLD.application_number THEN
    RAISE EXCEPTION 'tender_id, contractor_id, and application_number are immutable';
  END IF;

  v_content_changed := (
    NEW.cover_note       IS DISTINCT FROM OLD.cover_note OR
    NEW.lump_sum_total    IS DISTINCT FROM OLD.lump_sum_total OR
    NEW.methodology       IS DISTINCT FROM OLD.methodology OR
    NEW.programme_detail  IS DISTINCT FROM OLD.programme_detail OR
    NEW.subcontracting    IS DISTINCT FROM OLD.subcontracting OR
    NEW.declarations      IS DISTINCT FROM OLD.declarations
  );

  SELECT response_deadline INTO v_deadline
  FROM public.tenders WHERE id = OLD.tender_id;

  -- draft: full edit.
  IF OLD.status = 'draft' AND NEW.status = 'draft' THEN
    IF v_deadline IS NOT NULL AND now() > v_deadline THEN
      RAISE EXCEPTION 'Tender response deadline has passed';
    END IF;
    NEW.submitted_at          := OLD.submitted_at;
    NEW.withdrawn_at          := OLD.withdrawn_at;
    NEW.prequal_snapshot      := OLD.prequal_snapshot;
    NEW.addendum_ack_sequence := OLD.addendum_ack_sequence;
    RETURN NEW;
  END IF;

  -- submission: draft -> submitted.
  IF OLD.status = 'draft' AND NEW.status = 'submitted' THEN
    IF v_deadline IS NOT NULL AND now() > v_deadline THEN
      RAISE EXCEPTION 'Tender response deadline has passed';
    END IF;
    RETURN NEW;
  END IF;

  -- withdraw: submitted or reconfirm_requested -> withdrawn.
  IF OLD.status IN ('submitted', 'reconfirm_requested') AND NEW.status = 'withdrawn' THEN
    IF v_content_changed THEN
      RAISE EXCEPTION 'Application content is frozen once submitted; withdraw and resubmit instead';
    END IF;
    IF v_deadline IS NOT NULL AND now() > v_deadline THEN
      RAISE EXCEPTION 'Tender response deadline has passed';
    END IF;
    NEW.withdrawn_at := now();
    RETURN NEW;
  END IF;

  -- addendum acknowledgement: reconfirm_requested -> submitted.
  IF OLD.status = 'reconfirm_requested' AND NEW.status = 'submitted' THEN
    IF v_content_changed THEN
      RAISE EXCEPTION 'Application content is frozen once submitted; withdraw and resubmit instead';
    END IF;
    IF v_deadline IS NOT NULL AND now() > v_deadline THEN
      RAISE EXCEPTION 'Tender response deadline has passed';
    END IF;
    SELECT MAX(sequence) INTO NEW.addendum_ack_sequence
    FROM public.tender_addenda WHERE tender_id = OLD.tender_id;
    RETURN NEW;
  END IF;

  -- Addenda-trigger flip (apply_addendum_effects(), 20260710160000):
  -- submitted -> reconfirm_requested.
  IF OLD.status = 'submitted' AND NEW.status = 'reconfirm_requested' THEN
    IF v_content_changed THEN
      RAISE EXCEPTION 'Application content is frozen once submitted';
    END IF;
    RETURN NEW;
  END IF;

  -- Chunk 5: shortlist_tender_application() — submitted -> shortlisted.
  -- No deadline check: business action, legitimately happens after the
  -- response deadline.
  IF OLD.status = 'submitted' AND NEW.status = 'shortlisted' THEN
    IF v_content_changed THEN
      RAISE EXCEPTION 'Application content is frozen once submitted';
    END IF;
    RETURN NEW;
  END IF;

  -- Chunk 5: award_tender_agreement() — the winner.
  IF OLD.status IN ('submitted', 'shortlisted') AND NEW.status = 'awarded' THEN
    IF v_content_changed THEN
      RAISE EXCEPTION 'Application content is frozen once submitted';
    END IF;
    RETURN NEW;
  END IF;

  -- Chunk 5: award_tender_agreement() — every other bidder on the same tender.
  IF OLD.status IN ('submitted', 'shortlisted') AND NEW.status = 'unsuccessful' THEN
    IF v_content_changed THEN
      RAISE EXCEPTION 'Application content is frozen once submitted';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Illegal tender_applications transition: % -> % (or content changed outside draft)', OLD.status, NEW.status;
END;
$$;


-- =============================================================================
-- 6. build_agreement_terms_snapshot — server-assembled, SECURITY DEFINER.
-- "COMPLETE self-contained copy" per the doc: to_jsonb(row) is used
-- deliberately for tender/addenda/application/application_references/
-- rates_card (unlike build_prequal_snapshot's curated field list) —
-- completeness is the explicit requirement, not curation. sla_rules/sites/
-- parties are additive, reference-resolved-by-value keys — see header
-- notes #4/#4b.
-- =============================================================================

ALTER TABLE public.tenders
  ADD COLUMN sla_rule_set_id uuid NULL REFERENCES public.sla_rules(id);

CREATE OR REPLACE FUNCTION public.build_agreement_terms_snapshot(p_tender_id uuid, p_application_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH t AS (
    SELECT * FROM public.tenders WHERE id = p_tender_id
  )
  SELECT jsonb_build_object(
    'snapshotted_at', now(),
    'tender', (SELECT to_jsonb(t) FROM t),
    'addenda', COALESCE((
      SELECT jsonb_agg(to_jsonb(a) ORDER BY a.sequence)
      FROM public.tender_addenda a WHERE a.tender_id = p_tender_id
    ), '[]'::jsonb),
    'application', (
      SELECT to_jsonb(ap) FROM public.tender_applications ap WHERE ap.id = p_application_id
    ),
    'application_references', COALESCE((
      SELECT jsonb_agg(to_jsonb(r))
      FROM public.tender_application_references r WHERE r.application_id = p_application_id
    ), '[]'::jsonb),
    'rates_card', (
      SELECT to_jsonb(rc) FROM public.tender_rates_cards rc WHERE rc.application_id = p_application_id
    ),
    -- Full sla_rules row when tenders.sla_rule_set_id is set; a scalar
    -- subquery over zero rows returns NULL on its own, no CASE needed.
    'sla_rules', (
      SELECT to_jsonb(sr) FROM public.sla_rules sr
      WHERE sr.id = (SELECT sla_rule_set_id FROM t)
    ),
    'sites', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', s.id,
        'name', s.name,
        'address_line1', s.address_line1,
        'address_line2', s.address_line2,
        'city', s.city,
        'postcode', s.postcode
      ))
      FROM public.tender_sites ts
      JOIN public.sites s ON s.id = ts.site_id
      WHERE ts.tender_id = p_tender_id
    ), '[]'::jsonb),
    'parties', jsonb_build_object(
      'company', (
        SELECT jsonb_build_object('id', c.id, 'name', c.name, 'company_code', c.company_code)
        FROM public.companies c WHERE c.id = (SELECT company_id FROM t)
      ),
      'contractor', (
        SELECT jsonb_build_object(
          'id', p.id,
          'display_name', COALESCE(p.company_name, p.full_name),
          'ts_profile_code', p.ts_profile_code
        )
        FROM public.tender_applications ap2
        JOIN public.profiles p ON p.id = ap2.contractor_id
        WHERE ap2.id = p_application_id
      )
    )
  );
$$;

REVOKE ALL ON FUNCTION public.build_agreement_terms_snapshot(uuid, uuid) FROM PUBLIC, anon, authenticated;


-- =============================================================================
-- 7. build_scores_summary — per-criterion average + notes, for formal-mode
-- debrief snapshots. p_redact=true drops notes (used for the winning
-- application's snapshot shown to other bidders).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.build_scores_summary(p_application_id uuid, p_redact boolean DEFAULT false)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(
    CASE WHEN p_redact THEN
      jsonb_build_object(
        'criterion_id',    c.id,
        'criterion_label', c.label,
        'average_score',   sub.avg_score
      )
    ELSE
      jsonb_build_object(
        'criterion_id',    c.id,
        'criterion_label', c.label,
        'average_score',   sub.avg_score,
        'notes',           sub.notes
      )
    END
    ORDER BY c.label
  ), '[]'::jsonb)
  FROM public.tender_evaluation_criteria c
  JOIN (
    SELECT criterion_id, AVG(score) AS avg_score,
           jsonb_agg(note) FILTER (WHERE note IS NOT NULL) AS notes
    FROM public.tender_scores
    WHERE application_id = p_application_id
    GROUP BY criterion_id
  ) sub ON sub.criterion_id = c.id;
$$;

REVOKE ALL ON FUNCTION public.build_scores_summary(uuid, boolean) FROM PUBLIC, anon, authenticated;


-- =============================================================================
-- 8. convert_awarded_agreement_to_job — works path. Mirrors
-- src/lib/createJobFromQuote.ts's INSERT shape where a tender-derived job
-- has an equivalent (contractor_id, title, contract_value, company_id,
-- site_id, status), diverges where it doesn't (no issued_quote_id;
-- customer_id = companies.owner_id per header note #3). job_type is left
-- NULL, not 'tender': jobs.job_type has a CHECK constraint (20260628150000)
-- limited to service_visit/repair/installation/inspection/emergency/other —
-- 'tender' is not a legal value and adding it would conflate job_type's
-- existing "nature of the work" domain with "where did this job come from,"
-- which tender_agreement_id (below) already answers precisely.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.convert_awarded_agreement_to_job(p_agreement_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agreement    public.tender_agreements%ROWTYPE;
  v_tender       public.tenders%ROWTYPE;
  v_application  public.tender_applications%ROWTYPE;
  v_owner_id     uuid;
  v_site_id      uuid;
  v_site_count   int;
  v_job_id       uuid;
BEGIN
  SELECT * INTO v_agreement FROM public.tender_agreements WHERE id = p_agreement_id;
  SELECT * INTO v_tender FROM public.tenders WHERE id = v_agreement.tender_id;
  SELECT * INTO v_application FROM public.tender_applications WHERE id = v_agreement.application_id;

  SELECT owner_id INTO v_owner_id FROM public.companies WHERE id = v_tender.company_id;

  -- Single-site inference only; multi-site tenders (lots) are deferred, see
  -- header note #3 -- no job-splitting logic here.
  SELECT COUNT(*) INTO v_site_count FROM public.tender_sites WHERE tender_id = v_tender.id;
  IF v_site_count = 1 THEN
    SELECT site_id INTO v_site_id FROM public.tender_sites WHERE tender_id = v_tender.id;
  ELSE
    v_site_id := NULL;
  END IF;

  INSERT INTO public.jobs (
    contractor_id, customer_id, title, status,
    contract_value, company_id, site_id,
    tender_agreement_id
  ) VALUES (
    v_application.contractor_id, v_owner_id, v_tender.title, 'scheduled',
    v_application.lump_sum_total, v_tender.company_id, v_site_id,
    p_agreement_id
  )
  RETURNING id INTO v_job_id;

  RETURN v_job_id;
END;
$$;

REVOKE ALL ON FUNCTION public.convert_awarded_agreement_to_job(uuid) FROM PUBLIC, anon, authenticated;


-- =============================================================================
-- 9. award_tender_agreement — the award ceremony.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.award_tender_agreement(
  p_application_id uuid,
  p_standstill_ends_at timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  -- Award preconditions (doc, chunk 5).
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

  -- Debriefs released atomically, before announcement, to every scored
  -- non-winning application. See header note #5 for scope (band/feedback
  -- left for business to author afterward; snapshots computed now, formal
  -- mode only, per doc).
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

REVOKE ALL     ON FUNCTION public.award_tender_agreement(uuid, timestamptz) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.award_tender_agreement(uuid, timestamptz) TO authenticated;


-- =============================================================================
-- 10. shortlist_tender_application
-- =============================================================================

CREATE OR REPLACE FUNCTION public.shortlist_tender_application(p_application_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_application public.tender_applications%ROWTYPE;
  v_tender      public.tenders%ROWTYPE;
BEGIN
  SELECT * INTO v_application FROM public.tender_applications WHERE id = p_application_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found';
  END IF;

  SELECT * INTO v_tender FROM public.tenders WHERE id = v_application.tender_id;
  IF NOT is_company_member(v_tender.company_id) THEN
    RAISE EXCEPTION 'Not authorised to shortlist this application';
  END IF;

  IF v_application.status <> 'submitted' THEN
    RAISE EXCEPTION 'Application must be submitted to shortlist (current status: %)', v_application.status;
  END IF;

  UPDATE public.tender_applications SET status = 'shortlisted' WHERE id = p_application_id;
END;
$$;

REVOKE ALL     ON FUNCTION public.shortlist_tender_application(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.shortlist_tender_application(uuid) TO authenticated;


-- =============================================================================
-- 11. accept_tender_agreement — fires conversion. Term path is stubbed
-- behind a to_regclass guard exactly as apply_addendum_effects() (chunk 3)
-- guarded its tender_applications UPDATE: chunk 6 activates it simply by
-- creating term_engagements and convert_awarded_agreement_to_term_engagement()
-- — no further change needed here. Until then, a term agreement can be
-- accepted but sits with no engagement row.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.accept_tender_agreement(p_agreement_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agreement public.tender_agreements%ROWTYPE;
  v_app       public.tender_applications%ROWTYPE;
  v_tender    public.tenders%ROWTYPE;
BEGIN
  SELECT * INTO v_agreement FROM public.tender_agreements WHERE id = p_agreement_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agreement not found';
  END IF;

  SELECT * INTO v_app FROM public.tender_applications WHERE id = v_agreement.application_id;
  IF v_app.contractor_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not your agreement';
  END IF;

  IF v_agreement.status <> 'offered' THEN
    RAISE EXCEPTION 'Agreement is not open for acceptance (status: %)', v_agreement.status;
  END IF;

  -- Formal mode: acceptance blocked until standstill passes.
  IF v_agreement.standstill_ends_at IS NOT NULL AND now() < v_agreement.standstill_ends_at THEN
    RAISE EXCEPTION 'Standstill period has not yet ended (ends %)', v_agreement.standstill_ends_at;
  END IF;

  SELECT * INTO v_tender FROM public.tenders WHERE id = v_agreement.tender_id;

  UPDATE public.tender_agreements
  SET status = 'accepted', contractor_accepted_by = auth.uid(), contractor_accepted_at = now()
  WHERE id = p_agreement_id;

  IF v_tender.tender_type = 'works' THEN
    PERFORM convert_awarded_agreement_to_job(p_agreement_id);
  ELSIF v_tender.tender_type = 'term' THEN
    IF to_regclass('public.term_engagements') IS NOT NULL THEN
      EXECUTE 'SELECT convert_awarded_agreement_to_term_engagement($1)' USING p_agreement_id;
    END IF;
  END IF;
END;
$$;

REVOKE ALL     ON FUNCTION public.accept_tender_agreement(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.accept_tender_agreement(uuid) TO authenticated;


-- =============================================================================
-- 12. decline_tender_agreement — beyond the literal ask, see header note #6.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.decline_tender_agreement(p_agreement_id uuid, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agreement public.tender_agreements%ROWTYPE;
  v_app       public.tender_applications%ROWTYPE;
BEGIN
  SELECT * INTO v_agreement FROM public.tender_agreements WHERE id = p_agreement_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agreement not found';
  END IF;

  SELECT * INTO v_app FROM public.tender_applications WHERE id = v_agreement.application_id;
  IF v_app.contractor_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not your agreement';
  END IF;

  IF v_agreement.status <> 'offered' THEN
    RAISE EXCEPTION 'Agreement is not open for a response (status: %)', v_agreement.status;
  END IF;

  UPDATE public.tender_agreements
  SET status = 'declined', declined_reason = p_reason
  WHERE id = p_agreement_id;
END;
$$;

REVOKE ALL     ON FUNCTION public.decline_tender_agreement(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.decline_tender_agreement(uuid, text) TO authenticated;
