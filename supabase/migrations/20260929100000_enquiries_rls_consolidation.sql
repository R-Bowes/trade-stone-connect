-- Consolidate `enquiries` RLS: 13 policies across three generations (old
-- direct-equality, newer two-step/is_platform_admin, and a previously-
-- undocumented company-scoped cluster) plus two independently-implemented
-- admin mechanisms, down to one canonical policy per (command, party).
--
-- Behaviour-preserving by design — verified live via pg_policies and the
-- function definitions of is_platform_admin()/is_company_member() before
-- this was written (see conversation). Net grants are UNCHANGED:
--
--   * The two admin mechanisms (is_platform_admin() and the bare
--     admin_users EXISTS check duplicated in "Admins can read all
--     enquiries") resolve to the IDENTICAL query
--     (`EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())`) —
--     is_platform_admin() is kept, the inline duplicate is dropped. Same
--     people, before and after.
--   * Two-step subquery policies (`x_id IN (SELECT id FROM profiles WHERE
--     profiles.user_id = auth.uid())`) are replaced by direct
--     `auth.uid() = x_id` comparisons, per CLAUDE.md's house rule: the two
--     forms are equivalent under the `profiles.id = profiles.user_id`
--     CHECK constraint, and direct comparison is the canonical form, not
--     the subquery.
--   * enquiries_customer_select's `OR contractor_id IN (...)` arm is
--     dropped as a duplicate of the contractor's own SELECT policy living
--     inside a policy named for customers — the exact nullable/shared-
--     scope-column trap CLAUDE.md's RLS-failure-modes section warns
--     against. Both parties keep identical access through their own
--     policy (enquiries_select_customer / enquiries_select_contractor).
--   * enquiries_insert_company_member is kept, with the SAME predicate
--     shape as "Company members can create company enquiries" (company_id
--     set + is_company_member(company_id) + customer_id = the inserting
--     user's own profile), just written in the canonical direct form.
--     This policy is currently subsumed by enquiries_insert_customer in
--     practice — BusinessRequestsView.tsx always inserts customer_id as
--     the COMPANY OWNER's profile id, so a non-owner member's insert still
--     fails RLS today, before and after this migration (see LATER.md:
--     "Only the company owner can create a business enquiry"). Kept
--     verbatim per explicit instruction: removing an inert policy is
--     still a change, and it documents intent for the upcoming
--     multi-recipient work.
--   * No admin INSERT policy existed and none is added. No DELETE policy
--     existed on either side and none is added — nobody can delete an
--     enquiries row via RLS, unchanged.
--   * No company-member UPDATE policy existed and none is added (tracked
--     in LATER.md — enquiry_recipients will need its own).
--
-- Incidental fix, not drift — flagged so it's visible in the diff rather
-- than looking like an unexplained behaviour change: the old "Admins can
-- read all enquiries" policy's inline `EXISTS (SELECT 1 FROM admin_users
-- WHERE admin_users.user_id = auth.uid())` is a plain SQL expression, not
-- SECURITY DEFINER — it runs with the QUERYING role's own table grants,
-- not the policy author's. `anon` was never granted SELECT on
-- `admin_users` (`authenticated` was) — confirmed via
-- information_schema.role_table_grants — so an anonymous SELECT against
-- `enquiries` today hits a hard `42501: permission denied for table
-- admin_users` instead of returning an empty result (reproduced live: see
-- verification proof #7, pre-migration run, 2026-09-29). is_platform_admin()
-- IS SECURITY DEFINER, so the canonical enquiries_select_admin below fixes
-- this as a side effect. Anon's effective row-visibility does not change —
-- it is zero before and after — only the failure mode does: a hard error
-- becomes a clean empty set.
--
-- UNDO PATH: pg_dump does not give a one-command rollback for RLS policy
-- bodies. If any post-migration proof fails, recovery is a NEW migration
-- (never edit this one — migrations are immutable) that re-creates the
-- exact 13 policies below verbatim, then re-drops the 9 canonical ones.
-- This is the only durable copy of the pre-consolidation policy text
-- outside a chat transcript. Recorded verbatim from live `pg_policies`
-- (schemaname='public', tablename='enquiries'), 2026-09-29, before this
-- migration was written:
--
-- CREATE POLICY "Admins can read all enquiries" ON public.enquiries
--   FOR SELECT
--   USING (EXISTS ( SELECT 1
--      FROM admin_users
--     WHERE (admin_users.user_id = auth.uid())));
--
-- CREATE POLICY "Company members can create company enquiries" ON public.enquiries
--   FOR INSERT TO authenticated
--   WITH CHECK (((company_id IS NOT NULL) AND is_company_member(company_id) AND (customer_id IN ( SELECT profiles.id
--      FROM profiles
--     WHERE (profiles.user_id = auth.uid())))));
--
-- CREATE POLICY "Company members can read company enquiries" ON public.enquiries
--   FOR SELECT TO authenticated
--   USING (((company_id IS NOT NULL) AND is_company_member(company_id)));
--
-- CREATE POLICY "Contractors can update enquiry status" ON public.enquiries
--   FOR UPDATE
--   USING ((contractor_id IN ( SELECT profiles.id
--      FROM profiles
--     WHERE (profiles.user_id = auth.uid()))));
--
-- CREATE POLICY "Contractors can view their enquiries" ON public.enquiries
--   FOR SELECT
--   USING ((contractor_id IN ( SELECT profiles.id
--      FROM profiles
--     WHERE (profiles.user_id = auth.uid()))));
--
-- CREATE POLICY "Customers can create enquiries" ON public.enquiries
--   FOR INSERT
--   WITH CHECK ((auth.uid() = customer_id));
--
-- CREATE POLICY "Customers can view own enquiries" ON public.enquiries
--   FOR SELECT
--   USING ((auth.uid() = customer_id));
--
-- CREATE POLICY admin_select_enquiries ON public.enquiries
--   FOR SELECT
--   USING (is_platform_admin());
--
-- CREATE POLICY admin_update_enquiries ON public.enquiries
--   FOR UPDATE
--   USING (is_platform_admin())
--   WITH CHECK (is_platform_admin());
--
-- CREATE POLICY enquiries_contractor_select ON public.enquiries
--   FOR SELECT
--   USING ((contractor_id IN ( SELECT profiles.id
--      FROM profiles
--     WHERE (profiles.user_id = auth.uid()))));
--
-- CREATE POLICY enquiries_customer_insert ON public.enquiries
--   FOR INSERT
--   WITH CHECK ((customer_id IN ( SELECT profiles.id
--      FROM profiles
--     WHERE (profiles.user_id = auth.uid()))));
--
-- CREATE POLICY enquiries_customer_select ON public.enquiries
--   FOR SELECT
--   USING (((customer_id IN ( SELECT profiles.id
--      FROM profiles
--     WHERE (profiles.user_id = auth.uid()))) OR (contractor_id IN ( SELECT profiles.id
--      FROM profiles
--     WHERE (profiles.user_id = auth.uid())))));
--
-- CREATE POLICY enquiries_customer_update ON public.enquiries
--   FOR UPDATE
--   USING ((customer_id IN ( SELECT profiles.id
--      FROM profiles
--     WHERE (profiles.user_id = auth.uid()))));
--
-- Pre-flight: assert the live policy set matches exactly what this
-- migration was written against, before dropping anything. If the count
-- or the name set has drifted since the audit, fail loudly rather than
-- drop policies this migration doesn't know about.
DO $$
DECLARE
  v_count integer;
  v_expected text[] := ARRAY[
    'Admins can read all enquiries',
    'Company members can create company enquiries',
    'Company members can read company enquiries',
    'Contractors can update enquiry status',
    'Contractors can view their enquiries',
    'Customers can create enquiries',
    'Customers can view own enquiries',
    'admin_select_enquiries',
    'admin_update_enquiries',
    'enquiries_contractor_select',
    'enquiries_customer_insert',
    'enquiries_customer_select',
    'enquiries_customer_update'
  ];
  v_missing text[];
BEGIN
  SELECT array_agg(p) INTO v_missing
  FROM unnest(v_expected) AS p
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'enquiries' AND policyname = p
  );

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION
      'enquiries RLS consolidation: expected policy/policies not found, live schema has drifted since this migration was written: %',
      v_missing;
  END IF;

  SELECT count(*) INTO v_count
  FROM pg_policies WHERE schemaname = 'public' AND tablename = 'enquiries';

  IF v_count <> 13 THEN
    RAISE EXCEPTION
      'enquiries RLS consolidation: expected exactly 13 live policies, found %. Live schema has drifted — resolve manually before applying.',
      v_count;
  END IF;
END $$;

-- `supabase db push` applies each migration file atomically already (see
-- 20260926100000's precedent) — no explicit BEGIN/COMMIT needed or added.

DROP POLICY "Admins can read all enquiries" ON public.enquiries;
DROP POLICY "Company members can create company enquiries" ON public.enquiries;
DROP POLICY "Company members can read company enquiries" ON public.enquiries;
DROP POLICY "Contractors can update enquiry status" ON public.enquiries;
DROP POLICY "Contractors can view their enquiries" ON public.enquiries;
DROP POLICY "Customers can create enquiries" ON public.enquiries;
DROP POLICY "Customers can view own enquiries" ON public.enquiries;
DROP POLICY admin_select_enquiries ON public.enquiries;
DROP POLICY admin_update_enquiries ON public.enquiries;
DROP POLICY enquiries_contractor_select ON public.enquiries;
DROP POLICY enquiries_customer_insert ON public.enquiries;
DROP POLICY enquiries_customer_select ON public.enquiries;
DROP POLICY enquiries_customer_update ON public.enquiries;

-- SELECT — one policy per party, direct auth.uid() form.
CREATE POLICY enquiries_select_customer ON public.enquiries
  FOR SELECT
  USING (auth.uid() = customer_id);

CREATE POLICY enquiries_select_contractor ON public.enquiries
  FOR SELECT
  USING (auth.uid() = contractor_id);

CREATE POLICY enquiries_select_company_member ON public.enquiries
  FOR SELECT TO authenticated
  USING (company_id IS NOT NULL AND is_company_member(company_id));

CREATE POLICY enquiries_select_admin ON public.enquiries
  FOR SELECT
  USING (is_platform_admin());

-- INSERT — customer (direct form) and company-member (kept verbatim in
-- shape, see header note — currently subsumed by the customer policy in
-- practice, not by this migration's design).
CREATE POLICY enquiries_insert_customer ON public.enquiries
  FOR INSERT
  WITH CHECK (auth.uid() = customer_id);

CREATE POLICY enquiries_insert_company_member ON public.enquiries
  FOR INSERT TO authenticated
  WITH CHECK (company_id IS NOT NULL AND is_company_member(company_id) AND auth.uid() = customer_id);

-- UPDATE — customer, contractor, admin. No company-member UPDATE policy
-- (gap tracked in LATER.md, not added here).
CREATE POLICY enquiries_update_customer ON public.enquiries
  FOR UPDATE
  USING (auth.uid() = customer_id);

CREATE POLICY enquiries_update_contractor ON public.enquiries
  FOR UPDATE
  USING (auth.uid() = contractor_id);

CREATE POLICY enquiries_update_admin ON public.enquiries
  FOR UPDATE
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

-- Post-check: exactly 9 policies now live, 4 SELECT + 2 INSERT + 3 UPDATE,
-- no DELETE — the canonical set this migration intended to leave behind.
DO $$
DECLARE
  v_total integer;
  v_select integer;
  v_insert integer;
  v_update integer;
  v_delete integer;
BEGIN
  SELECT count(*) INTO v_total FROM pg_policies WHERE schemaname = 'public' AND tablename = 'enquiries';
  SELECT count(*) INTO v_select FROM pg_policies WHERE schemaname = 'public' AND tablename = 'enquiries' AND cmd = 'SELECT';
  SELECT count(*) INTO v_insert FROM pg_policies WHERE schemaname = 'public' AND tablename = 'enquiries' AND cmd = 'INSERT';
  SELECT count(*) INTO v_update FROM pg_policies WHERE schemaname = 'public' AND tablename = 'enquiries' AND cmd = 'UPDATE';
  SELECT count(*) INTO v_delete FROM pg_policies WHERE schemaname = 'public' AND tablename = 'enquiries' AND cmd = 'DELETE';

  IF v_total <> 9 OR v_select <> 4 OR v_insert <> 2 OR v_update <> 3 OR v_delete <> 0 THEN
    RAISE EXCEPTION
      'enquiries RLS consolidation: post-check failed — total=% select=% insert=% update=% delete=% (expected 9/4/2/3/0)',
      v_total, v_select, v_insert, v_update, v_delete;
  END IF;
END $$;
