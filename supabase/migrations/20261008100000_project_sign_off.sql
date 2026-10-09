-- ROLLBACK (run in this order if this migration must be undone):
--   drop trigger project_packages_delete_guard on public.project_packages;
--   drop function public.project_packages_delete_guard();
--   revoke insert, update on public.project_snags from authenticated;  -- clears the column grants
--   grant insert, update on public.project_snags to authenticated;
--   grant insert, update, delete on public.project_sign_offs to authenticated;
--   grant insert (status), update (status) on public.projects to authenticated;
--   drop function public.sign_off_project(uuid);
--
-- Projects slice 2, step 4: sign-off, snags and package deletion.
--
-- 1. sign_off_project(p_project_id) is the only way a project is signed off
--    and marked completed. It checks every condition the homeowner's
--    sign-off card shows, then writes the sign-off row and the status in
--    one transaction.
-- 2. projects.status becomes server-only (out of the client INSERT/UPDATE
--    column grants). The page derives Planning / In progress from attached
--    jobs; only sign-off sets 'completed'.
-- 3. project_sign_offs loses client INSERT/UPDATE/DELETE: the function is
--    its only writer. SELECT is unchanged (the card reads the date).
-- 4. project_snags gets column grants: a client may raise a snag
--    (project, package, raiser, description) and update its description,
--    status, resolved date and package. RLS (can_access_project, and
--    raised_by = auth.uid() on insert) is unchanged.
-- 5. A package with a job attached cannot be deleted (it must be detached
--    first, through detach_job_from_package).
--
-- Not changed: RLS policies on all four tables; the project_snags package
-- guard; attach_job_to_package / detach_job_from_package.

-- ── 0. Pre-flight ────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regprocedure('public.can_access_project(uuid)') IS NULL THEN
    RAISE EXCEPTION 'public.can_access_project(uuid) not found. Projects slice 1 (20261005120000) must be applied first.';
  END IF;
  IF to_regclass('public.project_sign_offs') IS NULL OR to_regclass('public.project_snags') IS NULL THEN
    RAISE EXCEPTION 'project_sign_offs or project_snags missing.';
  END IF;
END $$;

-- ── 1. sign_off_project ──────────────────────────────────────────────────────
CREATE FUNCTION public.sign_off_project(p_project_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
REVOKE ALL     ON FUNCTION public.sign_off_project(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.sign_off_project(uuid) TO authenticated;

-- ── 2. projects.status is server-only ────────────────────────────────────────
REVOKE INSERT (status), UPDATE (status) ON public.projects FROM authenticated;

-- ── 3. project_sign_offs: written only by sign_off_project ───────────────────
REVOKE INSERT, UPDATE, DELETE ON public.project_sign_offs FROM authenticated;

-- ── 4. project_snags column grants ───────────────────────────────────────────
REVOKE INSERT, UPDATE ON public.project_snags FROM authenticated;
GRANT INSERT (project_id, package_id, raised_by, description) ON public.project_snags TO authenticated;
GRANT UPDATE (description, status, resolved_at, package_id) ON public.project_snags TO authenticated;

-- ── 5. No deleting a package that has a job ──────────────────────────────────
-- Applies to every caller. Deleting a whole project still cascades only
-- once its jobs are detached: jobs.project_id already blocks that delete.
CREATE FUNCTION public.project_packages_delete_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.job_id IS NOT NULL THEN
    RAISE EXCEPTION 'Detach the job before deleting this package.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.project_packages_delete_guard() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER project_packages_delete_guard
  BEFORE DELETE ON public.project_packages
  FOR EACH ROW EXECUTE FUNCTION public.project_packages_delete_guard();
