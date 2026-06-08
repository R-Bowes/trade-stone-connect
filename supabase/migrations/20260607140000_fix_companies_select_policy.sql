-- Fix infinite-recursion error (42P17) on the companies table.
--
-- The "Companies readable" policy called auth_user_company_ids(), which itself
-- queries public.companies. With RLS enabled on companies, Postgres detects the
-- cycle and raises 42P17. The function is retired from this policy; ownership
-- is checked directly with owner_id = auth.uid() instead.
--
-- The secondary arm (panel contractors via service_visits) is preserved using
-- direct subqueries that do not re-enter the companies table.
--
-- "Companies readable by panel contractors" is unchanged — it already uses
-- direct comparisons and is not affected.

DROP POLICY IF EXISTS "Companies readable" ON public.companies;

CREATE POLICY "Companies readable"
  ON public.companies
  FOR SELECT
  TO authenticated
  USING (
    owner_id = auth.uid()
    OR id IN (
      SELECT sv.company_id
      FROM service_visits sv
      WHERE sv.contractor_id IN (
        SELECT p.id FROM profiles p WHERE p.user_id = auth.uid()
      )
    )
  );
