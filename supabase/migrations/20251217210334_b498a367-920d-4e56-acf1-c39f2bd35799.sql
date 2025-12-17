-- Drop overly permissive public INSERT policy on quotes table
-- Quote submissions will only work through the Edge Function which uses service role
-- This prevents direct database spam attacks that bypass rate limiting
DROP POLICY IF EXISTS "Anyone can create quotes" ON public.quotes;