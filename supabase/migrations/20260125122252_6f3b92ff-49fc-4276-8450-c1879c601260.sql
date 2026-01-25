-- Drop the overly permissive RLS policies on rate_limits table
-- Service role bypasses RLS automatically, so no policies are needed
DROP POLICY IF EXISTS "Service role can insert rate limits" ON public.rate_limits;
DROP POLICY IF EXISTS "Service role can select rate limits" ON public.rate_limits;
DROP POLICY IF EXISTS "Service role can delete rate limits" ON public.rate_limits;