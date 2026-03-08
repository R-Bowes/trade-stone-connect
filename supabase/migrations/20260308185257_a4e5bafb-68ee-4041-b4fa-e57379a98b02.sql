
-- Add trades array column alongside existing trade column
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS trades text[] DEFAULT '{}';

-- Migrate existing trade data to trades array
UPDATE public.profiles
SET trades = ARRAY[trade]
WHERE trade IS NOT NULL AND trade != '' AND (trades IS NULL OR trades = '{}');

-- Recreate the view to include trades
DROP VIEW IF EXISTS public.public_pro_profiles;

CREATE VIEW public.public_pro_profiles 
WITH (security_invoker = on) AS
SELECT
  id, user_id, full_name, company_name, ts_profile_code, user_type,
  created_at, updated_at, trade, location, working_radius, bio, trades
FROM public.profiles
WHERE user_type IN ('contractor', 'business');
