
-- Remove the overly permissive policy that exposes email/phone
DROP POLICY IF EXISTS "Authenticated users can view public profile fields" ON public.profiles;

-- Recreate view WITHOUT security_invoker (defaults to security definer)
-- This intentionally bypasses RLS since the view excludes sensitive columns
DROP VIEW IF EXISTS public.public_pro_profiles;

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

GRANT SELECT ON public.public_pro_profiles TO anon, authenticated;
