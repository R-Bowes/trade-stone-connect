-- generated-documents bucket for server-generated quote PDFs and job
-- completion certificates (Edge Functions generate-quote-pdf /
-- generate-completion-pdf, both use pdf-lib — see
-- supabase/functions/_shared/pdfBranding.ts).
--
-- Path conventions:
--   quotes/{contractor_id}/{quote_id}.pdf   (contractor_id = profiles.id = auth.uid())
--   completions/{job_id}.pdf
--
-- Bucket is private. Edge functions write via the service-role client,
-- which bypasses RLS entirely — no INSERT policy is needed for that path.
-- The policies below cover client-side reads only (contractors reading
-- their own quote PDFs; contractor + customer reading a job's completion
-- certificate), matching the owner-prefix / jobs-join pattern established
-- in 20260719140000_job_photos_storage_read_policies.sql.

INSERT INTO storage.buckets (id, name, public)
VALUES ('generated-documents', 'generated-documents', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Contractors can view own quote PDFs"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'generated-documents'
  AND (storage.foldername(name))[1] = 'quotes'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

CREATE POLICY "Job parties can view completion certificates"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'generated-documents'
  AND (storage.foldername(name))[1] = 'completions'
  AND EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE storage.objects.name = 'completions/' || j.id::text || '.pdf'
      AND (j.contractor_id = auth.uid() OR j.customer_id = auth.uid())
  )
);
