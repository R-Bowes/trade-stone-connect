
DROP VIEW IF EXISTS public.public_pro_profiles;

CREATE VIEW public.public_pro_profiles AS
SELECT
  id,
  user_id,
  full_name,
  company_name,
  ts_profile_code,
  user_type,
  created_at,
  updated_at,
  trade,
  location,
  working_radius,
  bio
FROM public.profiles
WHERE user_type IN ('contractor', 'business');
