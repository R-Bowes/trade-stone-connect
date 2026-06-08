-- Migration: companies — panel contractor SELECT policy
-- Adds the "Companies readable by panel contractors" RLS SELECT policy that was
-- missing from the live DB. Guarded with IF NOT EXISTS so applying twice is safe.

DO $outer$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'companies'
      AND policyname = 'Companies readable by panel contractors'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "Companies readable by panel contractors"
      ON public.companies FOR SELECT TO authenticated
      USING (
        id IN (
          SELECT cp.company_id
          FROM public.contractor_panel cp
          JOIN public.profiles p ON p.id = cp.contractor_id
          WHERE p.user_id = auth.uid()
        )
      )
    $p$;
  END IF;
END $outer$;
