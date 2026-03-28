-- Enquiry submission flow completion:
-- 1) persist uploaded storage paths on enquiries
-- 2) lock down storage bucket access for enquiry photos
-- 3) allow contractors to read the homeowner name only when tied to visible enquiries

ALTER TABLE public.enquiries
  ADD COLUMN IF NOT EXISTS enquiry_photo_paths text[];

UPDATE public.enquiries
SET enquiry_photo_paths = COALESCE(enquiry_photo_paths, '{}'::text[])
WHERE enquiry_photo_paths IS NULL;

ALTER TABLE public.enquiries
  ALTER COLUMN enquiry_photo_paths SET DEFAULT '{}'::text[];

INSERT INTO storage.buckets (id, name, public)
VALUES ('enquiry-photos', 'enquiry-photos', false)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enquiry photos owner upload" ON storage.objects;
DROP POLICY IF EXISTS "Enquiry photos owner update" ON storage.objects;
DROP POLICY IF EXISTS "Enquiry photos owner delete" ON storage.objects;
DROP POLICY IF EXISTS "Enquiry photos authenticated read" ON storage.objects;
DROP POLICY IF EXISTS "Contractors can read homeowner names for visible enquiries" ON public.profiles;

CREATE POLICY "Enquiry photos owner upload"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'enquiry-photos'
  AND EXISTS (
    SELECT 1
    FROM public.enquiries e
    WHERE e.id = split_part(name, '/', 1)::uuid
      AND e.homeowner_id = auth.uid()
  )
);

CREATE POLICY "Enquiry photos owner update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'enquiry-photos'
  AND EXISTS (
    SELECT 1
    FROM public.enquiries e
    WHERE e.id = split_part(name, '/', 1)::uuid
      AND e.homeowner_id = auth.uid()
  )
)
WITH CHECK (
  bucket_id = 'enquiry-photos'
  AND EXISTS (
    SELECT 1
    FROM public.enquiries e
    WHERE e.id = split_part(name, '/', 1)::uuid
      AND e.homeowner_id = auth.uid()
  )
);

CREATE POLICY "Enquiry photos owner delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'enquiry-photos'
  AND EXISTS (
    SELECT 1
    FROM public.enquiries e
    WHERE e.id = split_part(name, '/', 1)::uuid
      AND e.homeowner_id = auth.uid()
  )
);

CREATE POLICY "Enquiry photos authenticated read"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'enquiry-photos');

CREATE POLICY "Contractors can read homeowner names for visible enquiries"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1
    FROM public.enquiries e
    WHERE e.homeowner_id = profiles.id
      AND (
        e.contractor_id = auth.uid()
        OR (e.status = 'new' AND e.contractor_id IS NULL)
      )
  )
);
