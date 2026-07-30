-- SCORING.md Phase 1: extend the EXISTING contractor_credentials table
-- (id, contractor_id, name, issuer, reference_number, verified, display_order,
-- created_at, updated_at — created in 20260709140000) to also carry the
-- Tier 4 credential-verification fields from SCORING.md Section 10, rather
-- than creating a second colliding table. New columns map onto the existing
-- ones: name~credential_name, issuer~awarding_body, reference_number~registration_number.
--
-- Confirmed via grep of every INSERT caller (CanvasEditor.tsx:802,
-- ProfileEditor.tsx:217) that `verified` is always submitted as `false` by
-- the client today — safe to lock verified/verified_at down to system-only
-- without breaking either existing credential-panel UI.

ALTER TABLE public.contractor_credentials
  ADD COLUMN IF NOT EXISTS credential_type text, -- 'nvq', 'city_guilds', 'manufacturer_accreditation'
  ADD COLUMN IF NOT EXISTS verified_at     timestamptz,
  ADD COLUMN IF NOT EXISTS expires_at      date,
  ADD COLUMN IF NOT EXISTS document_path   text; -- storage path in the contractor-compliance-documents bucket

-- ── RLS: replace the blanket "Anyone can read credentials" (USING true) ──────
-- Was intentionally broad per CLAUDE.md (badge display). Now that this table
-- also carries pending/unverified Tier 4 submissions with proof documents,
-- public/anon reads are scoped to verified=true rows only; contractors keep
-- full visibility into their own pending rows via a separate policy.

DROP POLICY IF EXISTS "Anyone can read credentials" ON public.contractor_credentials;
DROP POLICY IF EXISTS "Contractors manage own credentials" ON public.contractor_credentials;

CREATE POLICY "Public can read verified credentials"
  ON public.contractor_credentials FOR SELECT
  USING (verified = true);

CREATE POLICY "Contractors select own credentials"
  ON public.contractor_credentials FOR SELECT
  TO authenticated
  USING (contractor_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

-- Contractors upload their own credentials for review — verified must be
-- submitted false and verified_at null; a contractor cannot self-verify at
-- insert time either.
CREATE POLICY "Contractors insert own credentials"
  ON public.contractor_credentials FOR INSERT
  TO authenticated
  WITH CHECK (
    contractor_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    AND verified = false
    AND verified_at IS NULL
  );

CREATE POLICY "Contractors update own credentials"
  ON public.contractor_credentials FOR UPDATE
  TO authenticated
  USING (contractor_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()))
  WITH CHECK (contractor_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Contractors delete own credentials"
  ON public.contractor_credentials FOR DELETE
  TO authenticated
  USING (contractor_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Service role full access to credentials"
  ON public.contractor_credentials FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- RLS's WITH CHECK cannot express "these columns are unchanged" on UPDATE —
-- lock verified/verified_at out of the authenticated role's column grants
-- entirely so the update policy above can never touch them.
REVOKE UPDATE ON public.contractor_credentials FROM authenticated;
GRANT UPDATE (name, issuer, reference_number, display_order, credential_type, expires_at, document_path)
  ON public.contractor_credentials TO authenticated;

-- =============================================================================
-- Storage: contractor-compliance-documents (private) — insurance certs,
-- credential proof documents. Bucket creation is dashboard-only in this repo
-- (see 20260710150000_tender_object_and_satellites.sql's tender-documents
-- precedent — INSERT INTO storage.buckets is not reliably migratable here).
--
-- ACTION REQUIRED before this policy takes effect: create a PRIVATE bucket
-- named 'contractor-compliance-documents' via the Supabase dashboard
-- (Storage → New bucket → Public: off) before contractors can upload.
--
-- Path convention: {contractor_id}/{filename} — contractor_id is the first
-- path segment, parsed below so policies can resolve ownership without a
-- second lookup table.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.compliance_doc_contractor_id(p_name text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_name ~ '^[0-9a-fA-F-]{36}/'
      THEN substring(p_name from '^([0-9a-fA-F-]{36})/')::uuid
    ELSE NULL
  END;
$$;

CREATE POLICY "contractor_compliance_docs_owner_all"
ON storage.objects FOR ALL TO authenticated
USING (
  bucket_id = 'contractor-compliance-documents'
  AND compliance_doc_contractor_id(name) IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
)
WITH CHECK (
  bucket_id = 'contractor-compliance-documents'
  AND compliance_doc_contractor_id(name) IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);

CREATE POLICY "contractor_compliance_docs_service_role_all"
ON storage.objects FOR ALL TO service_role
USING (bucket_id = 'contractor-compliance-documents')
WITH CHECK (bucket_id = 'contractor-compliance-documents');
