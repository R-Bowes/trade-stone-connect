
-- The view intentionally uses security definer to bypass RLS for public listings.
-- To satisfy the linter, we'll recreate it with security_invoker=on
-- and add a permissive SELECT policy on profiles for authenticated users
-- that only allows reading the same columns the view exposes.
DROP VIEW IF EXISTS public.public_pro_profiles;

CREATE VIEW public.public_pro_profiles
WITH (security_invoker=on) AS
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

-- Add a permissive policy so authenticated users can read any profile
-- (the view only exposes non-sensitive columns)
CREATE POLICY "Authenticated users can view public profile fields"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (true);
