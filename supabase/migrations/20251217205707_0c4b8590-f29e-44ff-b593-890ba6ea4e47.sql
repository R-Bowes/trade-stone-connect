-- Drop overly permissive public policies on rate_limits table
-- Service role bypasses RLS, so no explicit policies needed
DROP POLICY IF EXISTS "Allow rate limit inserts" ON public.rate_limits;
DROP POLICY IF EXISTS "Allow rate limit reads" ON public.rate_limits;