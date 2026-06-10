-- Fix 42P17 mutual recursion: companies SELECT ↔ service_visits SELECT.
--
-- Migration 20260607140000 replaced auth_user_company_ids() but introduced a
-- new recursion: the service_visits subquery in "Companies readable" triggers
-- service_visits RLS, whose "Service visits accessible by company owner" policy
-- queries companies again → infinite loop.
--
-- Fix: strip the service_visits arm. Owners are covered by owner_id = auth.uid().
-- Panel contractors are covered by "Companies readable by panel contractors".

DROP POLICY IF EXISTS "Companies readable" ON public.companies;

CREATE POLICY "Companies readable"
  ON public.companies
  FOR SELECT
  TO authenticated
  USING (owner_id = auth.uid());
