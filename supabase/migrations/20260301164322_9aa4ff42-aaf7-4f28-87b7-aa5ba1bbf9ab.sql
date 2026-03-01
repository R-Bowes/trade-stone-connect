
-- Create a public view of profiles that excludes sensitive PII (email, phone)
-- This view runs as the view owner (security_invoker defaults to off),
-- bypassing RLS so it can serve public contractor listings.
CREATE VIEW public.public_pro_profiles AS
  SELECT
    id,
    user_id,
    user_type,
    full_name,
    company_name,
    ts_profile_code,
    created_at,
    updated_at
  FROM public.profiles;

-- Grant select on the view to anon and authenticated roles
GRANT SELECT ON public.public_pro_profiles TO anon, authenticated;
