
-- Add logo_url column to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS logo_url text;

-- Create storage bucket for contractor logos
INSERT INTO storage.buckets (id, name, public)
VALUES ('logos', 'logos', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload their own logo
CREATE POLICY "Users can upload their own logo"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'logos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to update their own logo
CREATE POLICY "Users can update their own logo"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'logos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to delete their own logo
CREATE POLICY "Users can delete their own logo"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'logos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow public read access to logos
CREATE POLICY "Anyone can view logos"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'logos');

-- Recreate view with logo_url
DROP VIEW IF EXISTS public.public_pro_profiles;

CREATE VIEW public.public_pro_profiles
WITH (security_invoker = on) AS
SELECT
  id, user_id, full_name, company_name, ts_profile_code, user_type,
  created_at, updated_at, trade, location, working_radius, bio, trades, logo_url
FROM public.profiles
WHERE user_type IN ('contractor', 'business');
