-- Security audit fixes — critical + high items.
--
-- Every policy body below was derived from the LIVE schema and actual
-- upload-path conventions used in src/ (grepped per file), not from the
-- audit brief's assumed shapes — several of the brief's proposed policies
-- would have broken working features (documents bucket carries at least
-- three unrelated path conventions: certificates/{uid}/{job}, variations/
-- {uid}/{job}, service-documents/{visit}, plus bare {uid}/... for
-- site-portal photos and public-profile contractor_documents). See
-- CLAUDE.md's "Schema/policy claims must come from the live DB" rule.

-- ═══════════════════════════════════════════════════════════════════════
-- FIX 1 — documents bucket: replace blanket authenticated-read with
-- path-scoped policies for certificates, variations, and general/service
-- documents.
-- ═══════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Authenticated users can view documents" ON storage.objects;
DROP POLICY IF EXISTS "Documents readable by authorised users" ON storage.objects;

-- certificates/{contractor_id}/{job_id}/... — uploader, or job parties.
CREATE POLICY "certificates_scoped_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = 'certificates'
    AND (
      (storage.foldername(name))[2] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM jobs j
        WHERE j.id::text = (storage.foldername(name))[3]
        AND (j.customer_id = auth.uid() OR j.contractor_id = auth.uid()
             OR (j.company_id IS NOT NULL AND is_company_member(j.company_id)))
      )
    )
  );

-- variations/{contractor_id}/{job_id}/... — uploader, or job parties.
CREATE POLICY "variations_scoped_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = 'variations'
    AND (
      (storage.foldername(name))[2] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM jobs j
        WHERE j.id::text = (storage.foldername(name))[3]
        AND (j.customer_id = auth.uid() OR j.contractor_id = auth.uid()
             OR (j.company_id IS NOT NULL AND is_company_member(j.company_id)))
      )
    )
  );

-- Everything else in the bucket: {uid}/... (site-portal photos, public
-- profile contractor_documents PDFs) and service-documents/{visit_id}/...
-- (FM compliance docs, path has no uid segment at all).
CREATE POLICY "documents_general_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] NOT IN ('certificates', 'variations')
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR is_platform_admin()
      OR EXISTS (
        SELECT 1 FROM service_requests sr
        WHERE is_company_member(sr.company_id)
        AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(sr.photos) p WHERE p = name)
      )
      OR EXISTS (
        SELECT 1 FROM service_documents sd
        WHERE sd.document_url LIKE '%' || name || '%'
        AND (
          sd.uploaded_by IN (SELECT id FROM profiles WHERE user_id = auth.uid())
          OR EXISTS (
            SELECT 1 FROM service_visits sv
            WHERE sv.id = sd.visit_id AND is_company_member(sv.company_id)
          )
        )
      )
    )
  );

-- Drop the broad duplicate INSERT policy on documents (path-unscoped;
-- "Users can upload their own documents" already covers the {uid}/...
-- case, certificates_path_insert/variations_path_insert cover those).
DROP POLICY IF EXISTS "Contractors can upload documents" ON storage.objects;

-- service-documents/{visit_id}/... has no uid segment, so it needs its
-- own INSERT policy (previously only reachable via the broad policy just
-- dropped — restore equivalent access, scoped to the visit's contractor
-- or company members).
CREATE POLICY "service_documents_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = 'service-documents'
    AND EXISTS (
      SELECT 1 FROM service_visits sv
      WHERE sv.id::text = (storage.foldername(name))[2]
      AND (sv.contractor_id = auth.uid() OR is_company_member(sv.company_id))
    )
  );

-- ═══════════════════════════════════════════════════════════════════════
-- FIX 2 — broken crons: insurance-expiry-check and recalculate-scores
-- still use the dead current_setting('app.settings...') pattern (confirmed
-- via cron.job — every other cron entry uses public.supabase_project_url()
-- / public.get_secret()). Re-register with the working pattern.
-- ═══════════════════════════════════════════════════════════════════════

SELECT cron.unschedule('insurance-expiry-check');
SELECT cron.schedule(
  'insurance-expiry-check',
  '15 8 * * *',
  $$
  SELECT net.http_post(
    url := public.supabase_project_url() || '/functions/v1/insurance-expiry-check',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || public.get_secret('service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);

SELECT cron.unschedule('recalculate-scores');
SELECT cron.schedule(
  'recalculate-scores',
  '0 4 * * *',
  $$
  SELECT net.http_post(
    url := public.supabase_project_url() || '/functions/v1/recalculate-scores',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || public.get_secret('service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- ═══════════════════════════════════════════════════════════════════════
-- FIX 3 — contractor_verification_public: filter suspended contractors
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW contractor_verification_public AS
SELECT contractor_id, current_tier
FROM contractor_verification
WHERE suspended = false;

-- ═══════════════════════════════════════════════════════════════════════
-- FIX 4 / 7 — storage INSERT policies missing path-ownership WITH CHECK,
-- and the proposal-attachments DELETE with no ownership check.
--
-- Only touching buckets/policies confirmed broad+unscoped against the live
-- pg_policies dump: job-photos (has a redundant unscoped duplicate),
-- prequal-documents (INSERT unscoped; its existing SELECT policy also
-- checks the wrong path segment — actual path is {prequal_id}/{type}/
-- {filename}, not {uid}/..., so it never matched anything and is replaced
-- too), and proposal-attachments (path is {proposal_id}/..., not {uid}/...,
-- so it needs a project_proposals-based check, not a uid path check).
-- receipts/logos/contractor-photos/team-certs/tool-documents/enquiry-photos
-- were checked and are already correctly path-scoped — left untouched.
-- ═══════════════════════════════════════════════════════════════════════

-- job-photos: drop the redundant unscoped duplicate; "Contractors can
-- upload job photos" (path[1] = auth.uid()) already gates this correctly.
DROP POLICY IF EXISTS "Authenticated users can upload job photos" ON storage.objects;

-- prequal-documents: path is {prequal_id}/{document_type}/{filename}.
DROP POLICY IF EXISTS "Authenticated users upload prequal docs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users read own prequal docs" ON storage.objects;

CREATE POLICY "prequal_docs_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'prequal-documents'
    AND EXISTS (
      SELECT 1 FROM panel_prequalification pp
      WHERE pp.id::text = (storage.foldername(name))[1]
      AND (pp.contractor_id = auth.uid() OR is_company_member(pp.company_id))
    )
  );

CREATE POLICY "prequal_docs_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'prequal-documents'
    AND EXISTS (
      SELECT 1 FROM panel_prequalification pp
      WHERE pp.id::text = (storage.foldername(name))[1]
      AND pp.contractor_id = auth.uid()
    )
  );

-- proposal-attachments: path is {proposal_id}/{timestamp}-{filename}.
-- Submitting contractor and the project's poster are the two parties.
DROP POLICY IF EXISTS "Contractors can upload proposal attachments" ON storage.objects;
DROP POLICY IF EXISTS "Contractors can delete own proposal attachments" ON storage.objects;
DROP POLICY IF EXISTS "Public read proposal attachments" ON storage.objects;

CREATE POLICY "proposal_attachments_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'proposal-attachments'
    AND EXISTS (
      SELECT 1 FROM project_proposals pp
      JOIN projects pr ON pr.id = pp.project_id
      WHERE pp.id::text = (storage.foldername(name))[1]
      AND (pp.contractor_id = auth.uid() OR pr.posted_by = auth.uid())
    )
  );

CREATE POLICY "proposal_attachments_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'proposal-attachments'
    AND EXISTS (
      SELECT 1 FROM project_proposals pp
      WHERE pp.id::text = (storage.foldername(name))[1]
      AND pp.contractor_id = auth.uid()
    )
  );

CREATE POLICY "proposal_attachments_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'proposal-attachments'
    AND EXISTS (
      SELECT 1 FROM project_proposals pp
      WHERE pp.id::text = (storage.foldername(name))[1]
      AND pp.contractor_id = auth.uid()
    )
  );

-- ═══════════════════════════════════════════════════════════════════════
-- FIX 6 — rate_limits: enable RLS. No client code reads/writes this table
-- (grepped src/ — zero references); it's edge-function/service-role only,
-- so RLS-enabled-with-no-policies (default deny for non-service-role) is
-- the correct end state.
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════════════════
-- FIX 8 — platform_settings admin policies: NOT actually broken. Live
-- pg_policies shows "Admin read platform_settings" / "Admin write
-- platform_settings" already on platform_settings (not storage.objects)
-- and already check admin_users.id = auth.uid()::uuid correctly, matching
-- admin_users' actual PK convention (id IS the user id, confirmed via
-- is_platform_admin() and this policy both resolving against auth.uid()).
-- No migration action needed — left out.
-- ═══════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════
-- FIX 9 — make project-contracts and proposal-attachments private, with
-- proper party-scoped read (stronger than "any authenticated user" —
-- these are signed contracts / bid attachments, not general content).
-- project-updates is intentionally left public: it backs public project
-- progress updates, a different feature not covered by this audit item.
-- ═══════════════════════════════════════════════════════════════════════

UPDATE storage.buckets SET public = false WHERE id IN ('project-contracts', 'proposal-attachments');

DROP POLICY IF EXISTS "Public read project contracts" ON storage.objects;
CREATE POLICY "project_contracts_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'project-contracts'
    AND EXISTS (
      SELECT 1 FROM projects pr
      WHERE pr.id::text = (storage.foldername(name))[1]
      AND (pr.posted_by = auth.uid() OR pr.lead_contractor_id = auth.uid())
    )
  );
