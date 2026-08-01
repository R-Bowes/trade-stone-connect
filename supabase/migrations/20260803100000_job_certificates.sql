-- Job certificates & warranties. Purely additive: one new table, storage
-- policies for the certificates/ path in the existing `documents` bucket.

CREATE TABLE public.job_certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id),
  contractor_id uuid NOT NULL REFERENCES public.profiles(id),

  -- Certificate details
  certificate_type text NOT NULL
    CHECK (certificate_type IN (
      'gas_safety', 'electrical_eic', 'electrical_minor_works',
      'fgas', 'building_regs', 'fire_alarm', 'pat_testing',
      'pressure_test', 'commissioning', 'manufacturer_warranty',
      'workmanship_warranty', 'other'
    )),
  certificate_name text NOT NULL,
  certificate_number text,
  issuer text,

  -- Dates
  issued_date date NOT NULL DEFAULT CURRENT_DATE,
  expiry_date date,

  -- Warranty specifics
  warranty_duration_months integer,
  warranty_terms text,

  -- Document
  document_path text,

  -- Linked asset (for B2B/FM — certificate against a specific asset)
  asset_id uuid REFERENCES public.assets(id),

  -- Status
  verified boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  verified_by uuid,

  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.job_certificates ENABLE ROW LEVEL SECURITY;

-- Both parties on the job can view: the contractor, the job's homeowner
-- customer, or any member of the job's company (B2B/FM) — same
-- is_company_member() pattern used for job_rams (20260802100000_rams.sql).
CREATE POLICY "job_certificates_select"
  ON public.job_certificates FOR SELECT
  TO authenticated
  USING (
    contractor_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_certificates.job_id
        AND (
          j.customer_id = auth.uid()
          OR (j.company_id IS NOT NULL AND public.is_company_member(j.company_id))
        )
    )
  );

CREATE POLICY "job_certificates_insert"
  ON public.job_certificates FOR INSERT
  TO authenticated
  WITH CHECK (contractor_id = auth.uid());

-- Can't edit after verification.
CREATE POLICY "job_certificates_update"
  ON public.job_certificates FOR UPDATE
  TO authenticated
  USING (contractor_id = auth.uid() AND verified = false)
  WITH CHECK (contractor_id = auth.uid());

-- No DELETE policy — certificates are audit records (RLS enabled with no
-- DELETE policy denies delete outright for the authenticated role).

CREATE TRIGGER job_certificates_updated_at
  BEFORE UPDATE ON public.job_certificates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX idx_job_certificates_job ON public.job_certificates(job_id);
CREATE INDEX idx_job_certificates_contractor ON public.job_certificates(contractor_id);

-- =============================================================================
-- Storage — existing `documents` bucket (20260308191337), path
-- certificates/{contractor_id}/{job_id}/{filename}. The bucket's existing
-- INSERT policy requires foldername[1] = auth.uid()::text, which this path
-- doesn't match (foldername[1] = 'certificates'), so a dedicated policy is
-- needed. NOTE: this bucket is `public = true` with a pre-existing
-- "Anyone can view uploaded documents" policy (USING bucket_id='documents',
-- no path restriction) — that predates this migration and already makes
-- every object in the bucket fetchable via its public URL regardless of any
-- path-scoped policy added here. Certificates (CP12s etc. carry a client's
-- address) therefore rely on the UUID path segments being unguessable
-- rather than true access control. Flagged, not fixed here — the brief
-- named this bucket explicitly; using a private bucket instead was not
-- requested and would be a bigger deviation than this migration should make
-- unilaterally.
-- =============================================================================

CREATE POLICY "certificates_path_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] = 'certificates'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

CREATE POLICY "certificates_path_select"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] = 'certificates'
  AND (storage.foldername(name))[2] = auth.uid()::text
);
