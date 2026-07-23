-- enquiry-photos bucket does not exist live despite 20260328150000 claiming to
-- create it (confirmed via `supabase storage ls --experimental` and dashboard
-- check). That migration's RLS was also broken independent of the missing
-- bucket: it gated on enquiries.homeowner_id, a column that does not exist on
-- the live enquiries table (it's customer_id — a documented drift, see
-- CLAUDE.md), and it expected an {enquiry_id}/{file} path structure rather
-- than the {userId}/{enquiryId}/{file} structure the upload code actually
-- uses. Recreating the bucket and replacing the policies with an owner-prefix
-- pattern (matching the job-photos convention) plus a table-joined contractor
-- read policy.

INSERT INTO storage.buckets (id, name, public)
VALUES ('enquiry-photos', 'enquiry-photos', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Enquiry photos owner upload" ON storage.objects;
DROP POLICY IF EXISTS "Enquiry photos owner update" ON storage.objects;
DROP POLICY IF EXISTS "Enquiry photos owner delete" ON storage.objects;
DROP POLICY IF EXISTS "Enquiry photos authenticated read" ON storage.objects;
DROP POLICY IF EXISTS "Enquiry photos owner read" ON storage.objects;
DROP POLICY IF EXISTS "Contractors can view their enquiries photos" ON storage.objects;

CREATE POLICY "Enquiry photos owner upload"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'enquiry-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Enquiry photos owner update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'enquiry-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'enquiry-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Enquiry photos owner delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'enquiry-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Enquiry photos owner read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'enquiry-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Path structure is {submittingUserId}/{enquiryId}/{file} — the second
-- segment is the enquiry id, used here to scope read access to the
-- contractor the enquiry was sent to.
CREATE POLICY "Contractors can view their enquiries photos"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'enquiry-photos'
  AND EXISTS (
    SELECT 1 FROM public.enquiries e
    WHERE e.id::text = (storage.foldername(name))[2]
      AND e.contractor_id = auth.uid()
  )
);
