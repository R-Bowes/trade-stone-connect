-- Lock down public access to sensitive contractor contact data.
-- Public directory access should happen exclusively through the sanitized view.

-- Remove any legacy public SELECT policies on profiles that could expose email/phone.
DROP POLICY IF EXISTS "Public can view pro contractor profiles" ON public.profiles;
DROP POLICY IF EXISTS "Anyone can view pro contractor profiles" ON public.profiles;
DROP POLICY IF EXISTS "Public can view contractor profiles" ON public.profiles;

-- Ensure anonymous users cannot directly query the profiles table,
-- even if a permissive SELECT policy is accidentally introduced.
REVOKE ALL ON TABLE public.profiles FROM anon;

-- Recreate the public directory view with only non-sensitive fields.
CREATE OR REPLACE VIEW public.public_pro_profiles AS
SELECT
  user_id,
  full_name,
  company_name,
  ts_profile_code,
  user_type,
  created_at,
  updated_at
FROM public.profiles
WHERE user_type = 'contractor';

GRANT SELECT ON public.public_pro_profiles TO anon, authenticated;
