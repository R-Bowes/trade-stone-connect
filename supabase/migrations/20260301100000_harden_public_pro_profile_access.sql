-- Remove any legacy public profile read policies that expose sensitive fields
DROP POLICY IF EXISTS "Public can view pro contractor profiles" ON public.profiles;
DROP POLICY IF EXISTS "Anyone can view pro contractor profiles" ON public.profiles;

-- Recreate the public contractor directory view with only non-sensitive fields
DROP VIEW IF EXISTS public.public_pro_profiles;

CREATE VIEW public.public_pro_profiles AS
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
