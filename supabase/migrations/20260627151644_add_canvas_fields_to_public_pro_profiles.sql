CREATE OR REPLACE VIEW public_pro_profiles AS
SELECT
  id,
  user_id,
  full_name,
  company_name,
  ts_profile_code,
  user_type,
  location,
  working_radius,
  bio,
  trades,
  avatar_url,
  logo_url,
  is_verified,
  is_available,
  hourly_rate,
  years_experience,
  rating,
  review_count,
  completed_jobs,
  is_active,
  created_at,
  updated_at,
  profile_is_published,
  cover_url,
  cta_label
FROM profiles p
WHERE is_active = true;