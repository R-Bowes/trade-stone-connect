-- Projects slice 4, step 2: contractor-created projects, and contractor
-- names on the participant's view.
--
-- DRAFT — NOT PUSHED. Verified against a rolled-back transaction on the
-- live schema (see the Step-2 report for the proof output); `npx
-- supabase db push` has not been run for this file.
--
-- No writes to quotes/issued_quotes or invoices anywhere below. The
-- only job write remains through attach_job_to_package /
-- detach_job_from_package (both already live; detach is untouched).
--
-- ============================================================
-- ROLLBACK (once pushed), in reverse order:
-- ============================================================
--
-- 1. contractor_projects() — drop the 8-column version below and
--    restore the live 20261010120000 version (same body, no
--    `relationship` column):
--
--   DROP FUNCTION IF EXISTS public.contractor_projects();
--   CREATE OR REPLACE FUNCTION public.contractor_projects()
--   RETURNS TABLE (
--     project_id uuid, title text, status text, attached_job_count integer,
--     target_start date, target_end date, owner_name text, my_package_count integer
--   )
--   LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
--   AS $$
--     WITH my_projects AS (
--       SELECT DISTINCT pkg.project_id
--       FROM public.project_packages pkg
--       JOIN public.jobs j ON j.id = pkg.job_id
--       WHERE j.contractor_id = auth.uid()
--     ),
--     package_counts AS (
--       SELECT
--         pkg.project_id AS pc_project_id,
--         count(*) FILTER (WHERE pkg.job_id IS NOT NULL) AS pc_attached_job_count,
--         count(*) FILTER (WHERE j2.contractor_id = auth.uid()) AS pc_my_package_count
--       FROM public.project_packages pkg
--       LEFT JOIN public.jobs j2 ON j2.id = pkg.job_id
--       WHERE pkg.project_id IN (SELECT project_id FROM my_projects)
--       GROUP BY pkg.project_id
--     )
--     SELECT
--       p.id AS project_id, p.title, p.status,
--       coalesce(pc.pc_attached_job_count, 0) AS attached_job_count,
--       p.target_start, p.target_end,
--       CASE WHEN p.account_type = 'business' THEN c.name ELSE owner.full_name END AS owner_name,
--       coalesce(pc.pc_my_package_count, 0) AS my_package_count
--     FROM public.projects p
--     JOIN my_projects mp ON mp.project_id = p.id
--     LEFT JOIN package_counts pc ON pc.pc_project_id = p.id
--     LEFT JOIN public.companies c ON p.account_type = 'business' AND c.id = p.company_id
--     LEFT JOIN public.profiles owner ON p.account_type <> 'business' AND owner.id = p.posted_by;
--   $$;
--   REVOKE ALL ON FUNCTION public.contractor_projects() FROM PUBLIC;
--   REVOKE ALL ON FUNCTION public.contractor_projects() FROM anon;
--   GRANT EXECUTE ON FUNCTION public.contractor_projects() TO authenticated;
--
-- 2. contractor_project_view(uuid) — drop the 12-column version and
--    restore the live 20261010120000 version (no contractor_name):
--
--   DROP FUNCTION IF EXISTS public.contractor_project_view(uuid);
--   CREATE OR REPLACE FUNCTION public.contractor_project_view(p_project_id uuid)
--   RETURNS TABLE (
--     package_id uuid, title text, trade text, needed_from date, needed_to date,
--     is_mine boolean, job_status text, job_start_date date, job_end_date date,
--     job_id uuid, job_number integer
--   )
--   LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'public'
--   AS $$
--   BEGIN
--     IF NOT EXISTS (
--       SELECT 1 FROM public.project_packages pkg
--       JOIN public.jobs j ON j.id = pkg.job_id
--       WHERE pkg.project_id = p_project_id AND j.contractor_id = auth.uid()
--     ) THEN
--       RAISE EXCEPTION 'Not authorized to view this project.';
--     END IF;
--     RETURN QUERY
--     SELECT
--       pkg.id AS package_id, pkg.title AS title, pkg.trade AS trade,
--       pkg.needed_from AS needed_from, pkg.needed_to AS needed_to,
--       coalesce(j.contractor_id = auth.uid(), false) AS is_mine,
--       j.status AS job_status, j.start_date AS job_start_date, j.end_date AS job_end_date,
--       CASE WHEN j.contractor_id = auth.uid() THEN j.id ELSE NULL END AS job_id,
--       CASE WHEN j.contractor_id = auth.uid() THEN j.job_number ELSE NULL END AS job_number
--     FROM public.project_packages pkg
--     LEFT JOIN public.jobs j ON j.id = pkg.job_id
--     WHERE pkg.project_id = p_project_id;
--   END;
--   $$;
--   REVOKE ALL ON FUNCTION public.contractor_project_view(uuid) FROM PUBLIC;
--   REVOKE ALL ON FUNCTION public.contractor_project_view(uuid) FROM anon;
--   GRANT EXECUTE ON FUNCTION public.contractor_project_view(uuid) TO authenticated;
--
-- 3. sign_off_project(uuid) — CREATE OR REPLACE back to the live body
--    (verbatim, pre-change), which has no contractor-project refusal:
--
--   CREATE OR REPLACE FUNCTION public.sign_off_project(p_project_id uuid)
--    RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
--   AS $function$
--   DECLARE
--     v_project        public.projects%ROWTYPE;
--     v_package_count  integer;
--     v_unfilled       text;
--     v_not_complete   text;
--     v_open_snags     integer;
--   BEGIN
--     SELECT * INTO v_project FROM public.projects WHERE id = p_project_id FOR UPDATE;
--     IF NOT FOUND THEN
--       RAISE EXCEPTION 'Project not found.' USING ERRCODE = 'no_data_found';
--     END IF;
--     IF NOT public.can_access_project(p_project_id)
--        OR (v_project.account_type = 'personal' AND v_project.posted_by IS DISTINCT FROM auth.uid()) THEN
--       RAISE EXCEPTION 'Only the owner of this project can sign it off.' USING ERRCODE = 'insufficient_privilege';
--     END IF;
--     IF v_project.status = 'completed' THEN
--       RAISE EXCEPTION 'This project has already been signed off.' USING ERRCODE = 'check_violation';
--     ELSIF v_project.status = 'cancelled' THEN
--       RAISE EXCEPTION 'This project is cancelled and cannot be signed off.' USING ERRCODE = 'check_violation';
--     END IF;
--     SELECT count(*) INTO v_package_count FROM public.project_packages WHERE project_id = p_project_id;
--     IF v_package_count = 0 THEN
--       RAISE EXCEPTION 'Add at least one package of work before signing off.' USING ERRCODE = 'check_violation';
--     END IF;
--     SELECT string_agg(title, ', ' ORDER BY sort_order, created_at) INTO v_unfilled
--     FROM public.project_packages WHERE project_id = p_project_id AND job_id IS NULL;
--     IF v_unfilled IS NOT NULL THEN
--       RAISE EXCEPTION 'Every package needs a job before sign-off. Still without one: %.', v_unfilled
--         USING ERRCODE = 'check_violation';
--     END IF;
--     SELECT string_agg(pk.title, ', ' ORDER BY pk.sort_order, pk.created_at) INTO v_not_complete
--     FROM public.project_packages pk JOIN public.jobs j ON j.id = pk.job_id
--     WHERE pk.project_id = p_project_id AND j.status <> 'complete';
--     IF v_not_complete IS NOT NULL THEN
--       RAISE EXCEPTION 'Every job must be complete before sign-off. Not yet complete: %.', v_not_complete
--         USING ERRCODE = 'check_violation';
--     END IF;
--     SELECT count(*) INTO v_open_snags FROM public.project_snags
--     WHERE project_id = p_project_id AND status <> 'resolved';
--     IF v_open_snags > 0 THEN
--       RAISE EXCEPTION 'Resolve every snag before sign-off. % still open.', v_open_snags
--         USING ERRCODE = 'check_violation';
--     END IF;
--     INSERT INTO public.project_sign_offs (project_id, stage, signed_off_by)
--     VALUES (p_project_id, 'final', auth.uid());
--     UPDATE public.projects SET status = 'completed' WHERE id = p_project_id;
--     IF NOT FOUND THEN
--       RAISE EXCEPTION 'Project % was not updated.', p_project_id USING ERRCODE = 'no_data_found';
--     END IF;
--   END;
--   $function$;
--
-- 4. attach_job_to_package(uuid, uuid) — CREATE OR REPLACE back to the
--    live body (verbatim, pre-change — no v_contractor_id, no
--    one-customer check, calls the 5-arg _project_job_link_allowed):
--
--   CREATE OR REPLACE FUNCTION public.attach_job_to_package(p_package_id uuid, p_job_id uuid)
--    RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
--   AS $function$
--   DECLARE
--     v_pkg              public.project_packages%ROWTYPE;
--     v_account_type     text;
--     v_project_company  uuid;
--     v_customer_id      uuid;
--     v_company_id       uuid;
--     v_site_id          uuid;
--     v_job_project      uuid;
--   BEGIN
--     SELECT * INTO v_pkg FROM public.project_packages WHERE id = p_package_id FOR UPDATE;
--     IF NOT FOUND THEN
--       RAISE EXCEPTION 'Package not found.' USING ERRCODE = 'no_data_found';
--     END IF;
--     IF NOT public.can_access_project(v_pkg.project_id)
--        OR NOT (v_pkg.site_id IS NULL
--                OR public.can_access_site(v_pkg.site_id)
--                OR public.is_company_owner(public.project_company_id(v_pkg.project_id))) THEN
--       RAISE EXCEPTION 'You do not have access to this project package.' USING ERRCODE = 'insufficient_privilege';
--     END IF;
--     SELECT account_type, company_id INTO v_account_type, v_project_company
--     FROM public.projects WHERE id = v_pkg.project_id;
--     SELECT customer_id, company_id, site_id, project_id
--       INTO v_customer_id, v_company_id, v_site_id, v_job_project
--     FROM public.jobs WHERE id = p_job_id FOR UPDATE;
--     IF NOT FOUND THEN
--       RAISE EXCEPTION 'Job not found.' USING ERRCODE = 'no_data_found';
--     END IF;
--     IF NOT public._project_job_link_allowed(v_account_type, v_project_company,
--                                             v_customer_id, v_company_id, v_site_id) THEN
--       RAISE EXCEPTION 'You cannot add this job to this project.' USING ERRCODE = 'insufficient_privilege';
--     END IF;
--     IF v_job_project IS NOT NULL AND v_job_project <> v_pkg.project_id THEN
--       RAISE EXCEPTION 'This job already belongs to another project.' USING ERRCODE = 'check_violation';
--     END IF;
--     IF v_pkg.job_id IS NOT NULL THEN
--       RAISE EXCEPTION 'This package already has a job. Detach it first.' USING ERRCODE = 'check_violation';
--     END IF;
--     IF EXISTS (SELECT 1 FROM public.project_packages WHERE job_id = p_job_id) THEN
--       RAISE EXCEPTION 'This job is already attached to another package.' USING ERRCODE = 'check_violation';
--     END IF;
--     IF v_job_project IS NULL THEN
--       UPDATE public.jobs SET project_id = v_pkg.project_id WHERE id = p_job_id;
--     END IF;
--     UPDATE public.project_packages SET job_id = p_job_id WHERE id = p_package_id;
--   END;
--   $function$;
--
-- 4b. detach_job_from_package(uuid) — CREATE OR REPLACE back to the live
--    body (verbatim, pre-change — no v_contractor_id, calls the 5-arg
--    _project_job_link_allowed):
--
--   CREATE OR REPLACE FUNCTION public.detach_job_from_package(p_package_id uuid)
--    RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
--   AS $function$
--   DECLARE
--     v_pkg              public.project_packages%ROWTYPE;
--     v_account_type     text;
--     v_project_company  uuid;
--     v_customer_id      uuid;
--     v_company_id       uuid;
--     v_site_id          uuid;
--   BEGIN
--     SELECT * INTO v_pkg FROM public.project_packages WHERE id = p_package_id FOR UPDATE;
--     IF NOT FOUND THEN
--       RAISE EXCEPTION 'Package not found.' USING ERRCODE = 'no_data_found';
--     END IF;
--     IF NOT public.can_access_project(v_pkg.project_id)
--        OR NOT (v_pkg.site_id IS NULL
--                OR public.can_access_site(v_pkg.site_id)
--                OR public.is_company_owner(public.project_company_id(v_pkg.project_id))) THEN
--       RAISE EXCEPTION 'You do not have access to this project package.' USING ERRCODE = 'insufficient_privilege';
--     END IF;
--     IF v_pkg.job_id IS NULL THEN
--       RAISE EXCEPTION 'This package has no job attached.' USING ERRCODE = 'check_violation';
--     END IF;
--     SELECT account_type, company_id INTO v_account_type, v_project_company
--     FROM public.projects WHERE id = v_pkg.project_id;
--     SELECT customer_id, company_id, site_id INTO v_customer_id, v_company_id, v_site_id
--     FROM public.jobs WHERE id = v_pkg.job_id FOR UPDATE;
--     IF NOT public._project_job_link_allowed(v_account_type, v_project_company,
--                                             v_customer_id, v_company_id, v_site_id) THEN
--       RAISE EXCEPTION 'You cannot remove this job from this project.' USING ERRCODE = 'insufficient_privilege';
--     END IF;
--     UPDATE public.project_packages SET job_id = NULL WHERE id = p_package_id;
--     UPDATE public.jobs SET project_id = NULL
--     WHERE id = v_pkg.job_id AND project_id = v_pkg.project_id;
--   END;
--   $function$;
--
-- 5. _project_job_link_allowed — drop the 6-arg version and restore the
--    live 5-arg version (verbatim, pre-change):
--
--   DROP FUNCTION IF EXISTS public._project_job_link_allowed(text, uuid, uuid, uuid, uuid, uuid);
--   CREATE OR REPLACE FUNCTION public._project_job_link_allowed(p_account_type text, p_project_company uuid, p_job_customer uuid, p_job_company uuid, p_job_site uuid)
--    RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
--   AS $function$
--     SELECT coalesce(
--       CASE
--         WHEN p_account_type <> 'business' THEN p_job_customer = auth.uid()
--         ELSE (p_job_company = p_project_company
--               AND (p_job_site IS NULL OR public.can_access_site(p_job_site)))
--              OR (p_job_company IS NULL AND p_job_customer = auth.uid())
--       END,
--       false
--     );
--   $function$;
--
-- 6. projects_insert policy — ALTER POLICY back to the live check
--    (verbatim, pre-change — no 'contractor' in the array):
--
--   ALTER POLICY projects_insert ON public.projects
--   WITH CHECK (
--     (posted_by = auth.uid())
--     AND (account_type = ANY (ARRAY['personal'::text, 'business'::text]))
--     AND (account_type = ( SELECT (p.user_type)::text FROM profiles p WHERE (p.id = auth.uid()) ))
--     AND ((account_type <> 'business'::text) OR is_company_member(company_id))
--   );
--
-- 7. projects_update policy — ALTER POLICY back to the live check
--    (verbatim, pre-change — no 'contractor' in the array). NOT one of
--    the brief's six listed items — found while building the UI step:
--    projects_update's with_check carries the exact same literal array
--    projects_insert had, so editing a contractor-owned project's
--    title/budget/dates would otherwise fail silently (CLAUDE.md's
--    zero-row-RLS-update failure mode) the first time the project page's
--    Edit button is used. Flagged in the Step-2 report; same minimal,
--    mechanical fix as item 1, not a new design decision.
--
--   ALTER POLICY projects_update ON public.projects
--   WITH CHECK (
--     project_access_rule(id, account_type, company_id, posted_by)
--     AND (account_type = ANY (ARRAY['personal'::text, 'business'::text]))
--   );
-- ============================================================

-- 1. projects_insert: widen the account_type array to also allow
-- 'contractor'. Nothing else in the policy changes — the user_type-match
-- clause (3rd line) and the business/is_company_member clause (4th line)
-- already generalise correctly (a contractor project's account_type is
-- never 'business', so the 4th clause passes for free, same as 'personal').
ALTER POLICY projects_insert ON public.projects
WITH CHECK (
  (posted_by = auth.uid())
  AND (account_type = ANY (ARRAY['personal'::text, 'business'::text, 'contractor'::text]))
  AND (account_type = ( SELECT (p.user_type)::text FROM public.profiles p WHERE (p.id = auth.uid()) ))
  AND ((account_type <> 'business'::text) OR public.is_company_member(company_id))
);

-- 1b. projects_update: the same widen, same reason — see rollback item 7
-- above. Not one of the brief's six listed items; added because the
-- contractor project page's Edit button would otherwise fail silently.
ALTER POLICY projects_update ON public.projects
WITH CHECK (
  project_access_rule(id, account_type, company_id, posted_by)
  AND (account_type = ANY (ARRAY['personal'::text, 'business'::text, 'contractor'::text]))
);

-- 2. _project_job_link_allowed: new 6th parameter (the job's
-- contractor_id) and a dedicated 'contractor' arm, split out from the
-- old catch-all "anything that isn't business" branch — that branch
-- checked customer_id, which is right for 'personal' (the homeowner IS
-- the job's customer) but wrong for 'contractor' (the project's owner is
-- the job's CONTRACTOR, not its customer; a contractor is never their
-- own job's customer_id). Signature changes, so the old 5-arg function
-- is dropped rather than left as a dead overload.
DROP FUNCTION IF EXISTS public._project_job_link_allowed(text, uuid, uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION public._project_job_link_allowed(
  p_account_type text,
  p_project_company uuid,
  p_job_customer uuid,
  p_job_company uuid,
  p_job_site uuid,
  p_job_contractor uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT coalesce(
    CASE
      WHEN p_account_type = 'contractor' THEN p_job_contractor = auth.uid()
      WHEN p_account_type <> 'business' THEN p_job_customer = auth.uid()
      ELSE (p_job_company = p_project_company
            AND (p_job_site IS NULL OR public.can_access_site(p_job_site)))
           OR (p_job_company IS NULL AND p_job_customer = auth.uid())
    END,
    false
  );
$$;

REVOKE ALL ON FUNCTION public._project_job_link_allowed(text, uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._project_job_link_allowed(text, uuid, uuid, uuid, uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public._project_job_link_allowed(text, uuid, uuid, uuid, uuid, uuid) TO authenticated;

-- 3. attach_job_to_package: fetch the job's contractor_id, pass it to
-- the new 6-arg _project_job_link_allowed, and — only for a contractor
-- project — refuse a job whose customer_id/company_id differs from a
-- job already attached elsewhere in the SAME project. This is the "one
-- customer per contractor project" rule; personal projects already have
-- exactly one customer by construction (the poster), and business
-- projects are scoped by company_id already, so neither needs this
-- check.
CREATE OR REPLACE FUNCTION public.attach_job_to_package(p_package_id uuid, p_job_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_pkg              public.project_packages%ROWTYPE;
  v_account_type     text;
  v_project_company  uuid;
  v_customer_id      uuid;
  v_company_id       uuid;
  v_site_id          uuid;
  v_job_project      uuid;
  v_contractor_id    uuid;
BEGIN
  SELECT * INTO v_pkg FROM public.project_packages WHERE id = p_package_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Package not found.' USING ERRCODE = 'no_data_found';
  END IF;

  -- Same visibility the package's own SELECT policy applies.
  IF NOT public.can_access_project(v_pkg.project_id)
     OR NOT (v_pkg.site_id IS NULL
             OR public.can_access_site(v_pkg.site_id)
             OR public.is_company_owner(public.project_company_id(v_pkg.project_id))) THEN
    RAISE EXCEPTION 'You do not have access to this project package.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT account_type, company_id INTO v_account_type, v_project_company
  FROM public.projects WHERE id = v_pkg.project_id;

  SELECT customer_id, company_id, site_id, project_id, contractor_id
    INTO v_customer_id, v_company_id, v_site_id, v_job_project, v_contractor_id
  FROM public.jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job not found.' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public._project_job_link_allowed(v_account_type, v_project_company,
                                          v_customer_id, v_company_id, v_site_id, v_contractor_id) THEN
    RAISE EXCEPTION 'You cannot add this job to this project.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_account_type = 'contractor' AND EXISTS (
    SELECT 1
    FROM public.project_packages pp2
    JOIN public.jobs j2 ON j2.id = pp2.job_id
    WHERE pp2.project_id = v_pkg.project_id
      AND pp2.id <> v_pkg.id
      AND (j2.customer_id IS DISTINCT FROM v_customer_id OR j2.company_id IS DISTINCT FROM v_company_id)
  ) THEN
    RAISE EXCEPTION 'This project is for one customer. That job belongs to a different one.' USING ERRCODE = 'check_violation';
  END IF;

  IF v_job_project IS NOT NULL AND v_job_project <> v_pkg.project_id THEN
    RAISE EXCEPTION 'This job already belongs to another project.' USING ERRCODE = 'check_violation';
  END IF;

  IF v_pkg.job_id IS NOT NULL THEN
    RAISE EXCEPTION 'This package already has a job. Detach it first.' USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (SELECT 1 FROM public.project_packages WHERE job_id = p_job_id) THEN
    RAISE EXCEPTION 'This job is already attached to another package.' USING ERRCODE = 'check_violation';
  END IF;

  -- jobs first: the package link guard requires jobs.project_id to match.
  IF v_job_project IS NULL THEN
    UPDATE public.jobs SET project_id = v_pkg.project_id WHERE id = p_job_id;
  END IF;

  UPDATE public.project_packages SET job_id = p_job_id WHERE id = p_package_id;
END;
$$;

-- 3b. detach_job_from_package: NOT one of the brief's items, but it also
-- calls _project_job_link_allowed with the old 5-argument shape. Since
-- item 2 drops that 5-arg overload outright, leaving this call
-- unchanged would break detach on EVERY project, not just contractor
-- ones, the moment this migration is pushed — caught while preparing
-- this diff review, before push. Same fix as attach: fetch
-- jobs.contractor_id, pass it as the 6th argument. No other behaviour
-- changes.
CREATE OR REPLACE FUNCTION public.detach_job_from_package(p_package_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_pkg              public.project_packages%ROWTYPE;
  v_account_type     text;
  v_project_company  uuid;
  v_customer_id      uuid;
  v_company_id       uuid;
  v_site_id          uuid;
  v_contractor_id    uuid;
BEGIN
  SELECT * INTO v_pkg FROM public.project_packages WHERE id = p_package_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Package not found.' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.can_access_project(v_pkg.project_id)
     OR NOT (v_pkg.site_id IS NULL
             OR public.can_access_site(v_pkg.site_id)
             OR public.is_company_owner(public.project_company_id(v_pkg.project_id))) THEN
    RAISE EXCEPTION 'You do not have access to this project package.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_pkg.job_id IS NULL THEN
    RAISE EXCEPTION 'This package has no job attached.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT account_type, company_id INTO v_account_type, v_project_company
  FROM public.projects WHERE id = v_pkg.project_id;

  SELECT customer_id, company_id, site_id, contractor_id
    INTO v_customer_id, v_company_id, v_site_id, v_contractor_id
  FROM public.jobs WHERE id = v_pkg.job_id FOR UPDATE;

  IF NOT public._project_job_link_allowed(v_account_type, v_project_company,
                                          v_customer_id, v_company_id, v_site_id, v_contractor_id) THEN
    RAISE EXCEPTION 'You cannot remove this job from this project.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Package first, so the link guard never sees a job/project mismatch.
  UPDATE public.project_packages SET job_id = NULL WHERE id = p_package_id;
  UPDATE public.jobs SET project_id = NULL
  WHERE id = v_pkg.job_id AND project_id = v_pkg.project_id;
END;
$$;

-- 4. sign_off_project: a contractor-owned project is refused outright,
-- before any other check — sign-off for these comes in a later step,
-- and the customer, not the contractor, signs off.
CREATE OR REPLACE FUNCTION public.sign_off_project(p_project_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_project        public.projects%ROWTYPE;
  v_package_count  integer;
  v_unfilled       text;
  v_not_complete   text;
  v_open_snags     integer;
BEGIN
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project not found.' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_project.account_type = 'contractor' THEN
    RAISE EXCEPTION 'The customer signs off, not the contractor.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.can_access_project(p_project_id)
     OR (v_project.account_type = 'personal' AND v_project.posted_by IS DISTINCT FROM auth.uid()) THEN
    RAISE EXCEPTION 'Only the owner of this project can sign it off.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_project.status = 'completed' THEN
    RAISE EXCEPTION 'This project has already been signed off.' USING ERRCODE = 'check_violation';
  ELSIF v_project.status = 'cancelled' THEN
    RAISE EXCEPTION 'This project is cancelled and cannot be signed off.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO v_package_count FROM public.project_packages WHERE project_id = p_project_id;
  IF v_package_count = 0 THEN
    RAISE EXCEPTION 'Add at least one package of work before signing off.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT string_agg(title, ', ' ORDER BY sort_order, created_at) INTO v_unfilled
  FROM public.project_packages
  WHERE project_id = p_project_id AND job_id IS NULL;
  IF v_unfilled IS NOT NULL THEN
    RAISE EXCEPTION 'Every package needs a job before sign-off. Still without one: %.', v_unfilled
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT string_agg(pk.title, ', ' ORDER BY pk.sort_order, pk.created_at) INTO v_not_complete
  FROM public.project_packages pk
  JOIN public.jobs j ON j.id = pk.job_id
  WHERE pk.project_id = p_project_id AND j.status <> 'complete';
  IF v_not_complete IS NOT NULL THEN
    RAISE EXCEPTION 'Every job must be complete before sign-off. Not yet complete: %.', v_not_complete
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO v_open_snags
  FROM public.project_snags
  WHERE project_id = p_project_id AND status <> 'resolved';
  IF v_open_snags > 0 THEN
    RAISE EXCEPTION 'Resolve every snag before sign-off. % still open.', v_open_snags
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.project_sign_offs (project_id, stage, signed_off_by)
  VALUES (p_project_id, 'final', auth.uid());

  UPDATE public.projects SET status = 'completed' WHERE id = p_project_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project % was not updated.', p_project_id USING ERRCODE = 'no_data_found';
  END IF;
END;
$$;

-- 5. contractor_project_view: add contractor_name for every package
-- that has a job (mine or another contractor's) — the public company
-- name, else the full name, read from public_pro_profiles (never
-- `profiles` directly, per house convention). Other packages' job_id/
-- job_number stay hidden; no money, no allowance, no site id is added.
-- RETURNS TABLE shape changes (one new column), so the function must be
-- dropped before CREATE — Postgres refuses to CREATE OR REPLACE a
-- function into a different return shape.
DROP FUNCTION IF EXISTS public.contractor_project_view(uuid);

CREATE OR REPLACE FUNCTION public.contractor_project_view(p_project_id uuid)
RETURNS TABLE (
  package_id uuid,
  title text,
  trade text,
  needed_from date,
  needed_to date,
  is_mine boolean,
  job_status text,
  job_start_date date,
  job_end_date date,
  job_id uuid,
  job_number integer,
  contractor_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.project_packages pkg
    JOIN public.jobs j ON j.id = pkg.job_id
    WHERE pkg.project_id = p_project_id
      AND j.contractor_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized to view this project.';
  END IF;

  RETURN QUERY
  SELECT
    pkg.id AS package_id,
    pkg.title AS title,
    pkg.trade AS trade,
    pkg.needed_from AS needed_from,
    pkg.needed_to AS needed_to,
    coalesce(j.contractor_id = auth.uid(), false) AS is_mine,
    j.status AS job_status,
    j.start_date AS job_start_date,
    j.end_date AS job_end_date,
    CASE WHEN j.contractor_id = auth.uid() THEN j.id ELSE NULL END AS job_id,
    CASE WHEN j.contractor_id = auth.uid() THEN j.job_number ELSE NULL END AS job_number,
    CASE WHEN j.id IS NOT NULL THEN coalesce(pp.company_name, pp.full_name) ELSE NULL END AS contractor_name
  FROM public.project_packages pkg
  LEFT JOIN public.jobs j ON j.id = pkg.job_id
  LEFT JOIN public.public_pro_profiles pp ON pp.id = j.contractor_id
  WHERE pkg.project_id = p_project_id;
END;
$$;

REVOKE ALL ON FUNCTION public.contractor_project_view(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.contractor_project_view(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.contractor_project_view(uuid) TO authenticated;

-- 6. contractor_projects: also return projects the caller OWNS
-- (account_type = 'contractor', posted_by = auth.uid()), unioned with
-- the existing "takes part in" set, plus a `relationship` column
-- ('owner' | 'participant') so the UI can label each row "Yours" or
-- "For {owner}" without a second round trip. RETURNS TABLE shape
-- changes (one new column), so drop-then-create, same reason as above.
DROP FUNCTION IF EXISTS public.contractor_projects();

CREATE OR REPLACE FUNCTION public.contractor_projects()
RETURNS TABLE (
  project_id uuid,
  title text,
  status text,
  attached_job_count integer,
  target_start date,
  target_end date,
  owner_name text,
  my_package_count integer,
  relationship text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  WITH participant_projects AS (
    SELECT DISTINCT pkg.project_id
    FROM public.project_packages pkg
    JOIN public.jobs j ON j.id = pkg.job_id
    WHERE j.contractor_id = auth.uid()
  ),
  owned_projects AS (
    SELECT id AS project_id
    FROM public.projects
    WHERE account_type = 'contractor' AND posted_by = auth.uid()
  ),
  relevant_projects AS (
    SELECT project_id FROM participant_projects
    UNION
    SELECT project_id FROM owned_projects
  ),
  package_counts AS (
    SELECT
      pkg.project_id AS pc_project_id,
      count(*) FILTER (WHERE pkg.job_id IS NOT NULL) AS pc_attached_job_count,
      count(*) FILTER (WHERE j2.contractor_id = auth.uid()) AS pc_my_package_count
    FROM public.project_packages pkg
    LEFT JOIN public.jobs j2 ON j2.id = pkg.job_id
    WHERE pkg.project_id IN (SELECT project_id FROM relevant_projects)
    GROUP BY pkg.project_id
  )
  SELECT
    p.id AS project_id,
    p.title,
    p.status,
    coalesce(pc.pc_attached_job_count, 0) AS attached_job_count,
    p.target_start,
    p.target_end,
    CASE WHEN p.account_type = 'business' THEN c.name ELSE owner.full_name END AS owner_name,
    coalesce(pc.pc_my_package_count, 0) AS my_package_count,
    CASE WHEN p.posted_by = auth.uid() THEN 'owner' ELSE 'participant' END AS relationship
  FROM public.projects p
  JOIN relevant_projects rp ON rp.project_id = p.id
  LEFT JOIN package_counts pc ON pc.pc_project_id = p.id
  LEFT JOIN public.companies c ON p.account_type = 'business' AND c.id = p.company_id
  LEFT JOIN public.profiles owner ON p.account_type <> 'business' AND owner.id = p.posted_by;
$$;

REVOKE ALL ON FUNCTION public.contractor_projects() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.contractor_projects() FROM anon;
GRANT EXECUTE ON FUNCTION public.contractor_projects() TO authenticated;
