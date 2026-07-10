-- =============================================================================
-- 20260710150000_tender_object_and_satellites.sql
-- Tendering chunk 2: tenders + satellites + sealed-visibility RLS.
-- Source of truth: TENDERING-SCHEMA.md CHUNK 2 (as amended this pass).
--
-- Deliberate pull-forward: tender_invitations (spec'd in chunk 3) is created
-- here because the contractor SELECT policy on tenders and every satellite
-- table needs it to exist ("invited via tender_invitations OR
-- distribution = 'open'"). Only the table + its own RLS are pulled forward;
-- tender_clarifications and tender_addenda stay in chunk 3.
--
-- tender_documents.addendum_id is created as a plain nullable uuid column,
-- WITHOUT its FK to tender_addenda (that table doesn't exist yet). Chunk 3
-- must add:
--   ALTER TABLE public.tender_documents
--     ADD CONSTRAINT tender_documents_addendum_id_fkey
--     FOREIGN KEY (addendum_id) REFERENCES public.tender_addenda(id);
--
-- FK ON DELETE conventions used below (doc doesn't specify per-column):
--   -> companies(id)      : CASCADE (matches sites/assets/business_counters)
--   -> tenders(id)         : CASCADE (satellite rows are meaningless orphaned)
--   -> profiles(id), actor columns (created_by/uploaded_by/contractor_id/
--      invited_by) : CASCADE, matching prequalification_documents (the
--      closest existing precedent in the business tier)
--   -> projects(id) (project_id, "the seam") : SET NULL (nullable, loose
--      link by design per the doc, must not cascade-destroy a tender)
--
-- Column nullability calls where the doc's inline notation was ambiguous:
-- actor-identity columns without an explicit NULL/NOT NULL in the doc
-- (uploaded_by, invited_by) are made NOT NULL, matching the uploaded_by/
-- contractor_id convention in prequalification_documents/panel_prequalification.
-- =============================================================================


-- =============================================================================
-- 1. TENDERS
-- =============================================================================

CREATE TABLE public.tenders (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_number         text        NOT NULL,
  company_id            uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_by            uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  project_id            uuid        NULL     REFERENCES public.projects(id) ON DELETE SET NULL,
  tender_type           text        NOT NULL CHECK (tender_type IN ('works', 'term')),
  title                 text        NOT NULL,
  trade_categories      text[]      NOT NULL,
  scope_description     text        NULL,
  status                text        NOT NULL DEFAULT 'draft'
                                     CHECK (status IN ('draft', 'published', 'closed', 'unsealed', 'awarded', 'cancelled', 'lapsed')),
  response_deadline     timestamptz NULL,
  bid_visibility        text        NOT NULL DEFAULT 'sealed' CHECK (bid_visibility IN ('sealed', 'open')),
  distribution          text        NOT NULL DEFAULT 'invite' CHECK (distribution IN ('invite', 'open')),
  bid_validity_days     int         NOT NULL DEFAULT 30,
  site_visit_required   boolean     NOT NULL DEFAULT false,
  budget_min            numeric     NULL,
  budget_max            numeric     NULL,
  budget_visible        boolean     NOT NULL DEFAULT false,
  contract_start_date   date        NULL,
  contract_term_months  int         NULL,
  tupe_applies          boolean     NULL,
  formal_procurement    boolean     NOT NULL DEFAULT false,
  cancelled_reason      text        NULL,
  published_at          timestamptz NULL,
  closed_at             timestamptz NULL,
  awarded_at            timestamptz NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenders_tender_number_key UNIQUE (tender_number)
);

CREATE INDEX idx_tenders_company_id  ON public.tenders(company_id);
CREATE INDEX idx_tenders_created_by  ON public.tenders(created_by);
CREATE INDEX idx_tenders_project_id  ON public.tenders(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX idx_tenders_status_distribution ON public.tenders(status, distribution);

ALTER TABLE public.tenders ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_tenders_updated_at
  BEFORE UPDATE ON public.tenders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Number allocation: T-{company_code}-NNNN, zero-padded to 4.
CREATE OR REPLACE FUNCTION public.assign_tender_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_code text;
  v_seq          integer;
BEGIN
  IF NEW.tender_number IS NULL THEN
    SELECT company_code INTO v_company_code
    FROM public.companies
    WHERE id = NEW.company_id;

    v_seq := next_business_document_number(NEW.company_id, 'tender');
    NEW.tender_number := 'T-' || v_company_code || '-' || LPAD(v_seq::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER assign_tender_number_trigger
  BEFORE INSERT ON public.tenders
  FOR EACH ROW EXECUTE FUNCTION public.assign_tender_number();


-- =============================================================================
-- 2. TENDER_INVITATIONS (pulled forward from chunk 3 — see header note)
-- =============================================================================

CREATE TABLE public.tender_invitations (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id      uuid        NOT NULL REFERENCES public.tenders(id) ON DELETE CASCADE,
  contractor_id  uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status         text        NOT NULL DEFAULT 'invited'
                              CHECK (status IN ('invited', 'viewed', 'declined', 'withdrawn_by_business')),
  declined_reason text       NULL,
  is_incumbent   boolean     NOT NULL DEFAULT false,
  invited_by     uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at     timestamptz NOT NULL DEFAULT now(),
  viewed_at      timestamptz NULL,
  responded_at   timestamptz NULL,
  CONSTRAINT tender_invitations_tender_contractor_key UNIQUE (tender_id, contractor_id)
);

CREATE INDEX idx_tender_invitations_tender_id     ON public.tender_invitations(tender_id);
CREATE INDEX idx_tender_invitations_contractor_id ON public.tender_invitations(contractor_id);
CREATE INDEX idx_tender_invitations_invited_by    ON public.tender_invitations(invited_by);

ALTER TABLE public.tender_invitations ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- 3. SATELLITES
-- =============================================================================

CREATE TABLE public.tender_sites (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id  uuid NOT NULL REFERENCES public.tenders(id) ON DELETE CASCADE,
  site_id    uuid NOT NULL REFERENCES public.sites(id)   ON DELETE CASCADE,
  CONSTRAINT tender_sites_tender_site_key UNIQUE (tender_id, site_id)
);
CREATE INDEX idx_tender_sites_tender_id ON public.tender_sites(tender_id);
CREATE INDEX idx_tender_sites_site_id   ON public.tender_sites(site_id);
ALTER TABLE public.tender_sites ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.tender_response_requirements (
  id         uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id  uuid  NOT NULL REFERENCES public.tenders(id) ON DELETE CASCADE,
  kind       text  NOT NULL
                    CHECK (kind IN ('pricing', 'references', 'methodology', 'programme', 'subcontracting', 'declarations', 'rams')),
  config     jsonb NULL
);
CREATE INDEX idx_tender_response_requirements_tender_id ON public.tender_response_requirements(tender_id);
ALTER TABLE public.tender_response_requirements ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.tender_prequal_requirements (
  id         uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id  uuid    NOT NULL REFERENCES public.tenders(id) ON DELETE CASCADE,
  kind       text    NOT NULL,
  detail     jsonb   NULL,
  mandatory  boolean NOT NULL
);
CREATE INDEX idx_tender_prequal_requirements_tender_id ON public.tender_prequal_requirements(tender_id);
ALTER TABLE public.tender_prequal_requirements ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.tender_evaluation_criteria (
  id         uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id  uuid    NOT NULL REFERENCES public.tenders(id) ON DELETE CASCADE,
  label      text    NOT NULL,
  weight     numeric NULL
);
CREATE INDEX idx_tender_evaluation_criteria_tender_id ON public.tender_evaluation_criteria(tender_id);
ALTER TABLE public.tender_evaluation_criteria ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.tender_documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id     uuid NOT NULL REFERENCES public.tenders(id)  ON DELETE CASCADE,
  uploaded_by   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  file_path     text NOT NULL,
  label         text NULL,
  addendum_id   uuid NULL, -- FK to tender_addenda added in chunk 3, see header note
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tender_documents_tender_id   ON public.tender_documents(tender_id);
CREATE INDEX idx_tender_documents_uploaded_by ON public.tender_documents(uploaded_by);
ALTER TABLE public.tender_documents ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- 4. RLS HELPERS
-- Both SECURITY DEFINER, both with a fixed table allowlist, same convention
-- as is_company_member / is_site_member (20260612120000).
-- =============================================================================

-- tender_company_id: resolves a tender to its owning company_id. Allowlist:
-- tenders only. Lets satellite policies call is_company_member(tender_company_id(...))
-- without re-deriving company_id per table, and without depending on the
-- caller already being able to SELECT the tenders row under its own policy.
CREATE OR REPLACE FUNCTION public.tender_company_id(p_tender_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM public.tenders WHERE id = p_tender_id;
$$;

REVOKE ALL     ON FUNCTION public.tender_company_id(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.tender_company_id(uuid) TO authenticated;

-- contractor_can_view_tender: status != 'draft' AND (invited OR distribution
-- = 'open'). Allowlist: tenders, tender_invitations only. LOCKED DECISION
-- (Option B, TENDERING-SCHEMA.md chunk 2): trade matching is a query-layer
-- relevance filter, never RLS — this function does not touch trades.
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
          WHERE ti.tender_id = t.id AND ti.contractor_id = auth.uid()
        )
      )
  );
$$;

REVOKE ALL     ON FUNCTION public.contractor_can_view_tender(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.contractor_can_view_tender(uuid) TO authenticated;


-- =============================================================================
-- 5. RLS POLICIES — tenders
-- =============================================================================

CREATE POLICY "tenders_business_all"
ON public.tenders FOR ALL TO authenticated
USING       (is_company_member(company_id))
WITH CHECK  (is_company_member(company_id));

CREATE POLICY "tenders_contractor_select"
ON public.tenders FOR SELECT TO authenticated
USING (contractor_can_view_tender(id));


-- =============================================================================
-- 6. RLS POLICIES — satellites (business ALL, contractor SELECT mirrors
--    tender visibility, no contractor write policies anywhere)
-- =============================================================================

CREATE POLICY "tender_sites_business_all"
ON public.tender_sites FOR ALL TO authenticated
USING       (is_company_member(tender_company_id(tender_id)))
WITH CHECK  (is_company_member(tender_company_id(tender_id)));

CREATE POLICY "tender_sites_contractor_select"
ON public.tender_sites FOR SELECT TO authenticated
USING (contractor_can_view_tender(tender_id));

CREATE POLICY "tender_response_requirements_business_all"
ON public.tender_response_requirements FOR ALL TO authenticated
USING       (is_company_member(tender_company_id(tender_id)))
WITH CHECK  (is_company_member(tender_company_id(tender_id)));

CREATE POLICY "tender_response_requirements_contractor_select"
ON public.tender_response_requirements FOR SELECT TO authenticated
USING (contractor_can_view_tender(tender_id));

CREATE POLICY "tender_prequal_requirements_business_all"
ON public.tender_prequal_requirements FOR ALL TO authenticated
USING       (is_company_member(tender_company_id(tender_id)))
WITH CHECK  (is_company_member(tender_company_id(tender_id)));

CREATE POLICY "tender_prequal_requirements_contractor_select"
ON public.tender_prequal_requirements FOR SELECT TO authenticated
USING (contractor_can_view_tender(tender_id));

CREATE POLICY "tender_evaluation_criteria_business_all"
ON public.tender_evaluation_criteria FOR ALL TO authenticated
USING       (is_company_member(tender_company_id(tender_id)))
WITH CHECK  (is_company_member(tender_company_id(tender_id)));

CREATE POLICY "tender_evaluation_criteria_contractor_select"
ON public.tender_evaluation_criteria FOR SELECT TO authenticated
USING (contractor_can_view_tender(tender_id));

CREATE POLICY "tender_documents_business_all"
ON public.tender_documents FOR ALL TO authenticated
USING       (is_company_member(tender_company_id(tender_id)))
WITH CHECK  (is_company_member(tender_company_id(tender_id)));

CREATE POLICY "tender_documents_contractor_select"
ON public.tender_documents FOR SELECT TO authenticated
USING (contractor_can_view_tender(tender_id));


-- =============================================================================
-- 7. RLS POLICIES — tender_invitations
-- Business: full control on their tenders' invitations. Contractor: SELECT
-- own row; UPDATE own row constrained to the decline transition only (DB
-- enforces the resulting status value, not which columns changed alongside
-- it — same idiom as the tender_applications withdraw-only UPDATE in chunk 4).
-- =============================================================================

CREATE POLICY "tender_invitations_business_all"
ON public.tender_invitations FOR ALL TO authenticated
USING       (is_company_member(tender_company_id(tender_id)))
WITH CHECK  (is_company_member(tender_company_id(tender_id)));

CREATE POLICY "tender_invitations_contractor_select"
ON public.tender_invitations FOR SELECT TO authenticated
USING (contractor_id = auth.uid());

CREATE POLICY "tender_invitations_contractor_decline"
ON public.tender_invitations FOR UPDATE TO authenticated
USING       (contractor_id = auth.uid())
WITH CHECK  (contractor_id = auth.uid() AND status = 'declined');


-- =============================================================================
-- 8. STORAGE — tender-documents bucket
-- Private bucket created via the Supabase dashboard (not migratable — see
-- Phase 1 note: the one prior attempt at `INSERT INTO storage.buckets` in
-- 20260629120000 was left commented out). This migration only adds the
-- storage.objects RLS policies for it.
--
-- Path convention: {tender_id}/{filename} — tender_id is the first path
-- segment, parsed below so policies can resolve back to the owning tender.
-- =============================================================================

-- Parses the leading {tender_id}/ segment of a storage object name. Returns
-- NULL (not an error) for any name that doesn't start with a UUID followed
-- by '/', so a malformed object can never make every policy check fail with
-- a cast error.
CREATE OR REPLACE FUNCTION public.tender_id_from_storage_path(p_name text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_name ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/'
    THEN split_part(p_name, '/', 1)::uuid
    ELSE NULL
  END;
$$;

REVOKE ALL     ON FUNCTION public.tender_id_from_storage_path(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.tender_id_from_storage_path(text) TO authenticated;

CREATE POLICY "tender_documents_bucket_business_all"
ON storage.objects FOR ALL TO authenticated
USING (
  bucket_id = 'tender-documents'
  AND is_company_member(tender_company_id(tender_id_from_storage_path(name)))
)
WITH CHECK (
  bucket_id = 'tender-documents'
  AND is_company_member(tender_company_id(tender_id_from_storage_path(name)))
);

CREATE POLICY "tender_documents_bucket_contractor_select"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'tender-documents'
  AND contractor_can_view_tender(tender_id_from_storage_path(name))
);
