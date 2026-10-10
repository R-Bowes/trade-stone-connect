-- Projects slice 4, step 1: a contractor's read-only view of projects
-- they take part in. No RLS policy is touched — projects_select,
-- project_packages_select, project_access_rule and can_access_project
-- are all unchanged, per explicit instruction.
--
-- ROLLBACK (once pushed): all three functions are new, so undo is a
-- plain drop, nothing to restore:
--   DROP FUNCTION IF EXISTS public.contractor_project_snags(uuid);
--   DROP FUNCTION IF EXISTS public.contractor_project_view(uuid);
--   DROP FUNCTION IF EXISTS public.contractor_projects();
--
-- "Takes part": a project_packages row whose job_id points at a job
-- whose contractor_id is the caller. This is deliberately NOT the same
-- test as project_access_rule/can_access_project — those answer "does
-- this person own or have company coverage over this project"; a
-- contractor with an attached job is neither, which is exactly the gap
-- the Step-0 investigation found (projects_select has no job-attachment
-- arm at all, so an attached contractor gets zero rows today). These
-- functions are a deliberately narrow, separate read surface rather
-- than a new RLS arm, because the requirement is also to REDACT columns
-- (budget, allowance, other contractors' identity, site ids) that a
-- same-row RLS arm could never hide — RLS gates rows, not columns.

CREATE OR REPLACE FUNCTION public.contractor_projects()
RETURNS TABLE (
  project_id uuid,
  title text,
  status text,
  attached_job_count integer,
  target_start date,
  target_end date,
  owner_name text,
  my_package_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  WITH my_projects AS (
    SELECT DISTINCT pkg.project_id
    FROM public.project_packages pkg
    JOIN public.jobs j ON j.id = pkg.job_id
    WHERE j.contractor_id = auth.uid()
  ),
  package_counts AS (
    SELECT
      pkg.project_id AS pc_project_id,
      count(*) FILTER (WHERE pkg.job_id IS NOT NULL) AS pc_attached_job_count,
      count(*) FILTER (WHERE j2.contractor_id = auth.uid()) AS pc_my_package_count
    FROM public.project_packages pkg
    LEFT JOIN public.jobs j2 ON j2.id = pkg.job_id
    WHERE pkg.project_id IN (SELECT project_id FROM my_projects)
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
    coalesce(pc.pc_my_package_count, 0) AS my_package_count
  FROM public.projects p
  JOIN my_projects mp ON mp.project_id = p.id
  LEFT JOIN package_counts pc ON pc.pc_project_id = p.id
  LEFT JOIN public.companies c ON p.account_type = 'business' AND c.id = p.company_id
  LEFT JOIN public.profiles owner ON p.account_type <> 'business' AND owner.id = p.posted_by;
$$;

REVOKE ALL ON FUNCTION public.contractor_projects() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.contractor_projects() FROM anon;
GRANT EXECUTE ON FUNCTION public.contractor_projects() TO authenticated;


-- Columns here are deliberately NOT named package_id/job_id/etc. inside
-- the function body (only in the final RETURN QUERY list): this
-- function's own OUT parameters carry those names, and plpgsql raises
-- 42702 "ambiguous" on a bare reference that matches an OUT parameter,
-- even in a one-shot query with no CTEs (confirmed the hard way while
-- building project_money in 20261009120000). Everything here stays
-- fully qualified (pkg.*, j.*) for exactly that reason, and never
-- selects jobs.contractor_id, jobs.company_id, jobs.site_id, or any
-- allowance/budget column for a package that is not the caller's own.
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
  job_number integer
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
    -- coalesce to false, not null: an unfilled package has no job, so
    -- `j.contractor_id = auth.uid()` compares NULL = uuid and evaluates
    -- to NULL under three-valued logic, not false. Caught live in the
    -- Step-1 proof (Paint Kitchen / Flooring both came back NULL here).
    coalesce(j.contractor_id = auth.uid(), false) AS is_mine,
    j.status AS job_status,
    j.start_date AS job_start_date,
    j.end_date AS job_end_date,
    CASE WHEN j.contractor_id = auth.uid() THEN j.id ELSE NULL END AS job_id,
    CASE WHEN j.contractor_id = auth.uid() THEN j.job_number ELSE NULL END AS job_number
  FROM public.project_packages pkg
  LEFT JOIN public.jobs j ON j.id = pkg.job_id
  WHERE pkg.project_id = p_project_id;
END;
$$;

REVOKE ALL ON FUNCTION public.contractor_project_view(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.contractor_project_view(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.contractor_project_view(uuid) TO authenticated;


-- Only snags raised against one of the caller's own packages. A
-- whole-project snag (package_id IS NULL) is never returned here — the
-- inner joins require a real package with the caller's job attached.
CREATE OR REPLACE FUNCTION public.contractor_project_snags(p_project_id uuid)
RETURNS TABLE (
  snag_id uuid,
  description text,
  status text,
  raised_at timestamptz,
  resolved_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT
    s.id AS snag_id,
    s.description,
    s.status,
    s.created_at AS raised_at,
    s.resolved_at
  FROM public.project_snags s
  JOIN public.project_packages pkg ON pkg.id = s.package_id
  JOIN public.jobs j ON j.id = pkg.job_id
  WHERE s.project_id = p_project_id
    AND j.contractor_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.contractor_project_snags(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.contractor_project_snags(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.contractor_project_snags(uuid) TO authenticated;
