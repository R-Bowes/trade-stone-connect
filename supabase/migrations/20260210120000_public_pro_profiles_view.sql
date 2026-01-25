-- Replace public profiles policy with a restricted public view
DROP POLICY IF EXISTS "Public can view pro contractor profiles" ON public.profiles;

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
WHERE user_type = 'pro';

GRANT SELECT ON public.public_pro_profiles TO anon, authenticated;
