-- =============================================================================
-- 20260710180000_tender_applications_rates_and_sealed_rls.sql
-- Tendering chunk 4: tender_applications, tender_application_references,
-- tender_rates_cards, the sealed-bid RLS mechanic, prequal snapshotting, and
-- the amended contractor_can_view_tender ruling from the chunk-3 review.
-- Source of truth: TENDERING-SCHEMA.md CHUNK 4.
--
-- Design choices flagged for review, none silently decided:
--
-- 1. contractor_can_view_tender amended per the confirmed ruling: the
--    tender_invitations EXISTS now excludes status = 'withdrawn_by_business'.
--    'declined' still passes (contractor may un-decline before deadline).
--
-- 2. tender_applications creation goes through create_tender_application_draft()
--    (SECURITY DEFINER), not a client INSERT + BEFORE INSERT trigger — per
--    your explicit instruction. Flagging the tradeoff either way: every
--    other numbered document in this codebase (tenders, quotes, jobs,
--    invoices) uses the simpler client-INSERT + trigger-fills-the-number
--    pattern, and nothing about application_number allocation itself
--    requires the heavier function. The function does buy one real thing
--    the trigger couldn't: idempotent handling of a second "start a draft"
--    call against the UNIQUE(tender_id, contractor_id) constraint (returns
--    the existing draft id instead of erroring). Implemented as instructed.
--
-- 3. Bug caught while wiring up chunk 3's addenda trigger (item 6 below):
--    apply_addendum_effects() (20260710160000) performs a
--    submitted -> reconfirm_requested UPDATE on tender_applications. That
--    UPDATE fires enforce_tender_application_immutability_trigger below
--    regardless of the calling function's SECURITY DEFINER status (triggers
--    are never bypassed by SECURITY DEFINER, only RLS is). The first draft
--    of this migration's trigger only allowlisted contractor-initiated
--    transitions and would have rejected this one outright, breaking the
--    chunk-3 addendum flip the moment this table existed. Fixed: the
--    submitted -> reconfirm_requested arc is explicitly allowlisted.
--
-- 4. prequal_snapshot is scoped to the raw panel_prequalification checklist
--    + prequalification_documents for (company_id, contractor_id) — per the
--    Phase 1 finding, there is no schema-defined mapping from
--    tender_prequal_requirements.kind (free text) to panel_prequalification's
--    fixed columns, so this migration does NOT compute a RAG verdict or
--    block submission on unmet mandatory prequal items. That gate is
--    unimplemented and stays a UI-layer / future-chunk concern — flagged
--    here rather than silently built wrong or silently skipped.
--
-- 5. tender_applications has no INSERT or DELETE policy for anyone: creation
--    is exclusively via create_tender_application_draft(); applications are
--    never deleted (withdraw is a status, not a delete). Same pattern
--    extends to tender_application_references / tender_rates_cards writes,
--    gated to "while the parent application is still draft" via
--    application_is_draft() rather than a per-column trigger, since these
--    are child rows (whole-row INSERT/UPDATE/DELETE), not partial-column
--    mutations of one shared row.
-- =============================================================================


-- =============================================================================
-- 1. AMENDED contractor_can_view_tender
-- =============================================================================

CREATE OR REPLACE FUNCTION public.contractor_can_view_tender(p_tender_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenders t
    WHERE t.id = p_tender_id
      AND t.status <> 'draft'
      AND (
        t.distribution = 'open'
        OR EXISTS (
          SELECT 1 FROM public.tender_invitations ti
          WHERE ti.tender_id = t.id
            AND ti.contractor_id = auth.uid()
            AND ti.status <> 'withdrawn_by_business'
        )
      )
  );
$$;


-- =============================================================================
-- 2. TENDER_APPLICATIONS
-- =============================================================================

CREATE TABLE public.tender_applications (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  application_number     text        NOT NULL,
  tender_id              uuid        NOT NULL REFERENCES public.tenders(id)  ON DELETE CASCADE,
  contractor_id          uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status                 text        NOT NULL DEFAULT 'draft'
                                      CHECK (status IN ('draft', 'submitted', 'withdrawn', 'reconfirm_requested', 'shortlisted', 'awarded', 'unsuccessful')),
  cover_note             text        NULL,
  lump_sum_total         numeric     NULL,
  methodology            text        NULL,
  programme_detail       text        NULL,
  subcontracting         jsonb       NULL,
  declarations           jsonb       NULL,
  prequal_snapshot       jsonb       NULL,
  addendum_ack_sequence  int         NULL,
  submitted_at           timestamptz NULL,
  withdrawn_at           timestamptz NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tender_applications_number_key UNIQUE (application_number),
  CONSTRAINT tender_applications_tender_contractor_key UNIQUE (tender_id, contractor_id)
);

CREATE INDEX idx_tender_applications_tender_id     ON public.tender_applications(tender_id);
CREATE INDEX idx_tender_applications_contractor_id ON public.tender_applications(contractor_id);
CREATE INDEX idx_tender_applications_status        ON public.tender_applications(status);

ALTER TABLE public.tender_applications ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_tender_applications_updated_at
  BEFORE UPDATE ON public.tender_applications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- -----------------------------------------------------------------------
-- Immutability enforcement. RLS below grants row ownership only
-- (contractor_id = auth.uid()); this trigger enforces exactly which
-- status transitions are legal and which columns must not move, because
-- RLS's USING/WITH CHECK each see only one row version (old or new, never
-- both) and cannot diff OLD.content against NEW.content. Same idiom as
-- prevent_edit_on_approved_timesheet() (20260328170000_job_timesheet_flow.sql).
--
-- Scope note: only the arcs needed through chunk 4 are allowlisted below
-- (draft edit, submission, withdraw, addendum-ack, and the addenda-trigger's
-- submitted -> reconfirm_requested flip). Chunk 5 (scoring/award) adds
-- business-side transitions (submitted/shortlisted -> shortlisted/awarded/
-- unsuccessful) via its own SECURITY DEFINER functions and MUST extend this
-- IF chain with those arcs — they are deliberately not included here as out
-- of this chunk's scope, and without that extension chunk 5's transitions
-- will be rejected by the catch-all at the bottom.
-- -----------------------------------------------------------------------

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

  -- draft: full edit. Server-managed columns can't be smuggled in via a
  -- naive client payload that echoes the whole row back.
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

  -- submission: draft -> submitted. In practice reached only via
  -- submit_tender_application(), which sets submitted_at/prequal_snapshot
  -- itself before this trigger runs; content is whatever drafting left it
  -- at (freeze applies to subsequent updates, not to this transition).
  IF OLD.status = 'draft' AND NEW.status = 'submitted' THEN
    IF v_deadline IS NOT NULL AND now() > v_deadline THEN
      RAISE EXCEPTION 'Tender response deadline has passed';
    END IF;
    RETURN NEW;
  END IF;

  -- withdraw: submitted or reconfirm_requested -> withdrawn. Content frozen;
  -- withdrawn_at is server-stamped regardless of client input.
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

  -- addendum acknowledgement: reconfirm_requested -> submitted. Content
  -- frozen; addendum_ack_sequence is server-computed from the tender's
  -- current highest addendum, not client-supplied.
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
  -- submitted -> reconfirm_requested. System-initiated, not a contractor
  -- client write; content never changes here so no freeze check needed,
  -- and no deadline check (an addendum can legitimately arrive close to
  -- or past the original deadline if it also extends it).
  IF OLD.status = 'submitted' AND NEW.status = 'reconfirm_requested' THEN
    IF v_content_changed THEN
      RAISE EXCEPTION 'Application content is frozen once submitted';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Illegal tender_applications transition: % -> % (or content changed outside draft)', OLD.status, NEW.status;
END;
$$;

CREATE TRIGGER enforce_tender_application_immutability_trigger
  BEFORE UPDATE ON public.tender_applications
  FOR EACH ROW EXECUTE FUNCTION public.enforce_tender_application_immutability();

-- -----------------------------------------------------------------------
-- Creation: SECURITY DEFINER function only, per your instruction — no
-- client INSERT policy exists on this table (see header note #2).
-- -----------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_tender_application_draft(p_tender_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contractor_id      uuid := auth.uid();
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

  IF EXISTS (
    SELECT 1 FROM public.tenders
    WHERE id = p_tender_id AND response_deadline IS NOT NULL AND now() > response_deadline
  ) THEN
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

REVOKE ALL     ON FUNCTION public.create_tender_application_draft(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.create_tender_application_draft(uuid) TO authenticated;

-- -----------------------------------------------------------------------
-- business_can_view_application: the sealed mechanic. Allowlist:
-- tender_applications, tenders (+ is_company_member -> business_members).
-- Self-reference safety: SECURITY DEFINER bypasses RLS entirely for this
-- function's internal query, so using it inside a tender_applications
-- policy cannot recurse into that same policy.
-- -----------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.business_can_view_application(p_application_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tender_applications a
    JOIN public.tenders t ON t.id = a.tender_id
    WHERE a.id = p_application_id
      AND a.status <> 'draft'
      AND is_company_member(t.company_id)
      AND (t.status IN ('unsealed', 'awarded') OR t.bid_visibility = 'open')
  );
$$;

REVOKE ALL     ON FUNCTION public.business_can_view_application(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.business_can_view_application(uuid) TO authenticated;

-- Restructured from the doc's literal "(tender unsealed) OR (bid_visibility
-- ='open' AND status != 'draft')": the separate doc bullet "Drafts invisible
-- to business in every mode, always" reads as a universal rule, not scoped
-- only to the open arm, so status <> 'draft' is hoisted out as an
-- unconditional AND covering both arms. 'awarded' is included alongside
-- 'unsealed' because the locked status model (draft -> published -> closed
-- -> unsealed -> awarded) only reaches awarded via unsealed — this is
-- "unsealed or later," not a new sealed state.

-- -----------------------------------------------------------------------
-- RLS — tender_applications. No INSERT, no DELETE policy for anyone.
-- -----------------------------------------------------------------------

CREATE POLICY "tender_applications_contractor_select"
ON public.tender_applications FOR SELECT TO authenticated
USING (contractor_id = auth.uid());

CREATE POLICY "tender_applications_contractor_update"
ON public.tender_applications FOR UPDATE TO authenticated
USING       (contractor_id = auth.uid())
WITH CHECK  (contractor_id = auth.uid());

CREATE POLICY "tender_applications_business_select"
ON public.tender_applications FOR SELECT TO authenticated
USING (business_can_view_application(id));


-- =============================================================================
-- 3. TENDER_APPLICATION_REFERENCES
-- =============================================================================

CREATE TABLE public.tender_application_references (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id   uuid NOT NULL REFERENCES public.tender_applications(id) ON DELETE CASCADE,
  client_name      text NOT NULL,
  contact          jsonb NULL,
  project_summary  text NULL
);

CREATE INDEX idx_tender_application_references_application_id
  ON public.tender_application_references(application_id);

ALTER TABLE public.tender_application_references ENABLE ROW LEVEL SECURITY;

-- application_is_draft: gates contractor writes on the two child tables to
-- "while the parent application is still draft" — the same freeze rule as
-- tender_applications' own content columns, applied at the row level since
-- these are child rows rather than columns on one shared row.
CREATE OR REPLACE FUNCTION public.application_is_draft(p_application_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tender_applications
    WHERE id = p_application_id AND contractor_id = auth.uid() AND status = 'draft'
  );
$$;

REVOKE ALL     ON FUNCTION public.application_is_draft(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.application_is_draft(uuid) TO authenticated;

CREATE POLICY "tender_application_references_contractor_select"
ON public.tender_application_references FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.tender_applications a
    WHERE a.id = tender_application_references.application_id
      AND a.contractor_id = auth.uid()
  )
);

CREATE POLICY "tender_application_references_contractor_insert"
ON public.tender_application_references FOR INSERT TO authenticated
WITH CHECK (application_is_draft(application_id));

CREATE POLICY "tender_application_references_contractor_update"
ON public.tender_application_references FOR UPDATE TO authenticated
USING       (application_is_draft(application_id))
WITH CHECK  (application_is_draft(application_id));

CREATE POLICY "tender_application_references_contractor_delete"
ON public.tender_application_references FOR DELETE TO authenticated
USING (application_is_draft(application_id));

CREATE POLICY "tender_application_references_business_select"
ON public.tender_application_references FOR SELECT TO authenticated
USING (business_can_view_application(application_id));


-- =============================================================================
-- 4. TENDER_RATES_CARDS (term tenders)
-- One card per application (UNIQUE(application_id)) — inferred from the
-- doc's "award copies it" framing (singular), not stated as a constraint
-- in the doc's column list explicitly.
-- =============================================================================

CREATE TABLE public.tender_rates_cards (
  id                    uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id        uuid    NOT NULL REFERENCES public.tender_applications(id) ON DELETE CASCADE,
  callout_standard      numeric NOT NULL,
  callout_out_of_hours  numeric NOT NULL,
  hourly_rate           numeric NOT NULL,
  materials_markup_pct  numeric NOT NULL,
  minimum_charge        numeric NULL,
  extra_lines           jsonb   NULL,
  CONSTRAINT tender_rates_cards_application_id_key UNIQUE (application_id)
);

ALTER TABLE public.tender_rates_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tender_rates_cards_contractor_select"
ON public.tender_rates_cards FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.tender_applications a
    WHERE a.id = tender_rates_cards.application_id
      AND a.contractor_id = auth.uid()
  )
);

CREATE POLICY "tender_rates_cards_contractor_insert"
ON public.tender_rates_cards FOR INSERT TO authenticated
WITH CHECK (application_is_draft(application_id));

CREATE POLICY "tender_rates_cards_contractor_update"
ON public.tender_rates_cards FOR UPDATE TO authenticated
USING       (application_is_draft(application_id))
WITH CHECK  (application_is_draft(application_id));

CREATE POLICY "tender_rates_cards_contractor_delete"
ON public.tender_rates_cards FOR DELETE TO authenticated
USING (application_is_draft(application_id));

CREATE POLICY "tender_rates_cards_business_select"
ON public.tender_rates_cards FOR SELECT TO authenticated
USING (business_can_view_application(application_id));


-- =============================================================================
-- 5. "N of M received" COUNTER — returns a number, never rows. Non-members
-- get NULL, not an error (a dashboard stat failing softly beats a thrown
-- exception).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.tender_application_received_count(p_tender_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN is_company_member(tender_company_id(p_tender_id))
    THEN (
      SELECT COUNT(*)::integer
      FROM public.tender_applications
      WHERE tender_id = p_tender_id AND status <> 'draft'
    )
    ELSE NULL
  END;
$$;

REVOKE ALL     ON FUNCTION public.tender_application_received_count(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.tender_application_received_count(uuid) TO authenticated;


-- =============================================================================
-- 6. PREQUAL SNAPSHOT + SUBMISSION
-- build_prequal_snapshot is intentionally not GRANTed to authenticated —
-- server-side only, called exclusively from submit_tender_application().
-- Scope: raw panel_prequalification checklist + prequalification_documents
-- metadata for (company_id, contractor_id). Does NOT compute a RAG verdict
-- against tender_prequal_requirements — see header note #4.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.build_prequal_snapshot(p_company_id uuid, p_contractor_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'snapshotted_at', now(),
    'checklist', (
      SELECT jsonb_build_object(
        'overall_status',               pp.overall_status,
        'public_liability_verified',    pp.public_liability_verified,
        'public_liability_expiry',      pp.public_liability_expiry,
        'employers_liability_verified', pp.employers_liability_verified,
        'employers_liability_expiry',   pp.employers_liability_expiry,
        'trade_cert_verified',          pp.trade_cert_verified,
        'trade_cert_expiry',            pp.trade_cert_expiry,
        'site_induction_complete',      pp.site_induction_complete,
        'nda_signed',                   pp.nda_signed,
        'terms_accepted',               pp.terms_accepted,
        'next_review_date',             pp.next_review_date
      )
      FROM public.panel_prequalification pp
      WHERE pp.company_id = p_company_id AND pp.contractor_id = p_contractor_id
    ),
    'documents', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'document_type', d.document_type,
        'file_name',     d.file_name,
        'expiry_date',   d.expiry_date,
        'verified_at',   d.verified_at
      ) ORDER BY d.document_type)
      FROM public.prequalification_documents d
      JOIN public.panel_prequalification pp2 ON pp2.id = d.prequal_id
      WHERE pp2.company_id = p_company_id AND pp2.contractor_id = p_contractor_id
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.build_prequal_snapshot(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.submit_tender_application(p_application_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_application public.tender_applications%ROWTYPE;
  v_tender      public.tenders%ROWTYPE;
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

  IF v_tender.response_deadline IS NOT NULL AND now() > v_tender.response_deadline THEN
    RAISE EXCEPTION 'Tender response deadline has passed';
  END IF;

  UPDATE public.tender_applications
  SET
    status            = 'submitted',
    submitted_at      = now(),
    prequal_snapshot  = build_prequal_snapshot(v_tender.company_id, v_application.contractor_id)
  WHERE id = p_application_id;
END;
$$;

REVOKE ALL     ON FUNCTION public.submit_tender_application(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.submit_tender_application(uuid) TO authenticated;


-- =============================================================================
-- 7. CHUNK 3 TRIGGER ACTIVATION — verification only, no code change
-- apply_addendum_effects() (20260710160000) guards its reconfirm_requested
-- flip with `to_regclass('public.tender_applications') IS NOT NULL`. That
-- table now exists as of this migration, so the guard evaluates true from
-- here on — the arm activates automatically. Verified the UPDATE it issues
-- (`SET status = 'reconfirm_requested' WHERE tender_id = $2 AND status =
-- 'submitted'`) matches this table's real column names and CHECK values,
-- and — see header note #3 — added the matching allowlist arc to
-- enforce_tender_application_immutability() so that UPDATE isn't rejected
-- by this migration's own trigger. No further change needed in
-- 20260710160000 itself.
-- =============================================================================
