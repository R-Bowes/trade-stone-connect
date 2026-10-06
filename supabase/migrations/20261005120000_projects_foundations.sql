-- ROLLBACK (run in this order if this migration must be undone). Dropping
-- columns and tables discards their data. jobs.project_id values written by
-- attach_job_to_package are NOT reverted by this block — clear them by hand
-- first if they must go (SELECT job_id FROM project_packages WHERE job_id IS
-- NOT NULL lists them).
--
--   -- 1. project_snags / project_sign_offs: back to the pre-slice-1 policies
--   drop policy project_snags_select     on public.project_snags;
--   drop policy project_snags_insert     on public.project_snags;
--   drop policy project_snags_update     on public.project_snags;
--   drop policy project_sign_offs_select on public.project_sign_offs;
--   drop policy project_sign_offs_insert on public.project_sign_offs;
--   create policy ps_select  on public.project_snags     for select using (is_project_party(project_id));
--   create policy ps_insert  on public.project_snags     for insert with check (is_project_party(project_id) and raised_by = auth.uid());
--   create policy ps_update  on public.project_snags     for update using (is_project_party(project_id));
--   create policy pso_select on public.project_sign_offs for select using (is_project_party(project_id));
--   create policy pso_insert on public.project_sign_offs for insert with check (is_project_party(project_id) and signed_off_by = auth.uid());
--
--   -- 2. projects: back to the pre-slice-1 policies and table-wide UPDATE
--   drop policy projects_select on public.projects;
--   drop policy projects_insert on public.projects;
--   drop policy projects_update on public.projects;
--   drop policy projects_delete on public.projects;
--   create policy projects_customer_all on public.projects for all
--     using      (posted_by in (select profiles.id from profiles where profiles.user_id = auth.uid()))
--     with check (posted_by in (select profiles.id from profiles where profiles.user_id = auth.uid()));
--   create policy projects_contractor_select on public.projects for select
--     using (id in (select enquiries.project_id from enquiries
--                   where enquiries.contractor_id in (select profiles.id from profiles where profiles.user_id = auth.uid())));
--   revoke update on public.projects from authenticated;  -- clears the column grants
--   grant  update on public.projects to authenticated;
--   revoke insert on public.projects from authenticated;  -- clears the column grants
--   grant  insert on public.projects to authenticated;
--
--   -- 3. functions, triggers, tables, columns
--   drop function public.attach_job_to_package(uuid, uuid);
--   drop function public.detach_job_from_package(uuid);
--   drop function public._project_job_link_allowed(text, uuid, uuid, uuid, uuid);
--   drop trigger project_snags_package_guard on public.project_snags;
--   drop function public.project_snags_package_guard();
--   alter table public.project_snags drop column package_id;
--   drop table public.project_packages;
--   drop table public.project_sites;
--   drop function public.project_packages_link_guard();
--   drop function public.project_sites_company_guard();
--   drop function public.can_access_project(uuid);
--   drop function public.project_company_id(uuid);
--   drop function public.project_access_rule(uuid, text, uuid, uuid);
--   drop index public.idx_project_snags_project_id;
--   drop index public.idx_project_sign_offs_project_id;
--   drop index public.idx_jobs_project_id;
--   drop index public.idx_projects_company_id;
--   drop index public.idx_projects_posted_by;
--   alter table public.projects drop constraint projects_company_account_check;
--   alter table public.projects drop column company_id;
--   alter table public.projects drop column status;
--   alter table public.projects drop column target_start;
--   alter table public.projects drop column target_end;
--   alter table public.projects rename constraint projects_posted_by_fkey to projects_customer_id_fkey;
--
-- Projects slice 1: foundations.
--
-- Additive. Adds company ownership and a delivery status to projects, a
-- project <-> sites link (mirrors tender_sites), project packages (one
-- package = one trade/scope, optionally one job and one tender), and ONE
-- access model for the owner side. No contractor access in this slice.
--
-- Access rule (project_access_rule below is the single definition):
--   - not a business project: posted_by = auth.uid()
--   - business project: company owner; or an active company member who
--     can_access_site() for at least one project_sites row, or — while the
--     project has no sites — is the poster.
--
-- Left exactly as they are: project_jobs, project_proposals, project_qanda,
-- project_members, project_notes, project_events, project_contracts,
-- project_updates, project_change_requests, is_project_poster,
-- is_project_party.
--
-- Known gaps (slice 4 hardening):
--   - jobs.project_id and tenders.project_id can still be changed directly
--     through those tables' own UPDATE policies. The package link guard
--     only runs when a package is written, so a later direct change leaves
--     a package pointing at a job/tender of another project.
--   - Deleting a site sets project_packages.site_id to NULL (ON DELETE SET
--     NULL), which un-pins the package: it becomes visible to every project
--     member instead of only that site's coverage.
--   - projects.status (delivery) and projects.tender_status (bidding era)
--     are both present.
--   - Removing a project_sites row leaves packages pinned to that site;
--     their next write fails project_packages_link_guard until site_id is
--     cleared. The UI must block unlinking a site that still has pinned
--     packages.
--   - src/components/management/financials/ExpenseFormDialog.tsx:144 and
--     src/components/management/financials/MileageTracking.tsx:114 read
--     projects by lead_contractor_id. They return nothing under these
--     policies until contractor access is built.

-- ── 0. Pre-flight ────────────────────────────────────────────────────────────
-- Fail, never fix. Every object this migration renames or depends on must be
-- as confirmed live on 5 Oct 2026.
DO $$
DECLARE
  v_business_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.projects'::regclass AND conname = 'projects_customer_id_fkey'
  ) THEN
    RAISE EXCEPTION 'projects_customer_id_fkey not found on public.projects. The live FK name has drifted; check before applying.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'jobs' AND column_name = 'project_id'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tenders' AND column_name = 'project_id'
  ) THEN
    RAISE EXCEPTION 'jobs.project_id or tenders.project_id missing. The package guards depend on both; check before applying.';
  END IF;

  -- projects_company_account_check requires company_id on every business
  -- project. company_id does not exist yet, so any business row would fail.
  SELECT count(*) INTO v_business_count
  FROM public.projects WHERE account_type = 'business';

  IF v_business_count > 0 THEN
    RAISE EXCEPTION
      'Cannot add projects_company_account_check: % business projects have no company_id. Resolve manually before applying.',
      v_business_count;
  END IF;
END $$;

-- ── A. projects ──────────────────────────────────────────────────────────────
ALTER TABLE public.projects
  ADD COLUMN company_id uuid
    CONSTRAINT projects_company_id_fkey REFERENCES public.companies(id),
  ADD COLUMN status text NOT NULL DEFAULT 'planning'
    CONSTRAINT projects_status_check
    CHECK (status IN ('planning', 'in_progress', 'completed', 'cancelled')),
  ADD COLUMN target_start date,
  ADD COLUMN target_end   date;

-- Business projects are company-owned; nothing else is.
ALTER TABLE public.projects
  ADD CONSTRAINT projects_company_account_check
  CHECK ((account_type = 'business') = (company_id IS NOT NULL));

-- The FK is on posted_by; the old name dates from a customer_id column.
ALTER TABLE public.projects
  RENAME CONSTRAINT projects_customer_id_fkey TO projects_posted_by_fkey;

CREATE INDEX idx_projects_company_id ON public.projects(company_id);
CREATE INDEX idx_projects_posted_by  ON public.projects(posted_by);

-- Clients may set only these columns at insert. Every bidding-era column
-- (tender_status, visibility, lead_contractor_id, deposit_*, retention_*,
-- scoring_criteria, ...) and the legacy address_line_1/2, city, postcode
-- columns take their defaults. The insert policy still checks posted_by,
-- account_type and company_id.
REVOKE INSERT ON public.projects FROM authenticated;
GRANT INSERT (posted_by, account_type, company_id, title, description, budget,
              status, target_start, target_end,
              addr_line1, addr_line2, addr_city, addr_region, addr_postcode,
              addr_country, addr_lat, addr_lng, addr_place_id)
  ON public.projects TO authenticated;

-- Clients may edit only these columns. Ownership (posted_by, account_type,
-- company_id) and every bidding-era column are fixed once inserted; the
-- access rule depends on the ownership columns, so an UPDATE policy alone
-- could not stop a user with access rewriting them. Confirmed 5 Oct 2026:
-- no live client, edge function or SQL function UPDATEs projects (the
-- bidding/delivery pages were removed in fc482fc). SECURITY DEFINER
-- functions run as the table owner and are unaffected by these grants.
REVOKE UPDATE ON public.projects FROM authenticated;
GRANT UPDATE (title, description, budget, status, target_start, target_end,
              addr_line1, addr_line2, addr_city, addr_region, addr_postcode,
              addr_country, addr_lat, addr_lng, addr_place_id)
  ON public.projects TO authenticated;

-- ── B. project_sites ─────────────────────────────────────────────────────────
-- Mirrors tender_sites.
CREATE TABLE public.project_sites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  site_id     uuid NOT NULL REFERENCES public.sites(id)    ON DELETE CASCADE,
  CONSTRAINT project_sites_project_site_key UNIQUE (project_id, site_id)
);
CREATE INDEX idx_project_sites_project_id ON public.project_sites(project_id);
CREATE INDEX idx_project_sites_site_id    ON public.project_sites(site_id);
ALTER TABLE public.project_sites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.project_sites FROM anon;

-- A site must belong to the project's company. A personal project has no
-- company, so it can never have sites. SECURITY DEFINER so the check sees
-- the project and site rows whatever the caller's own RLS allows.
CREATE FUNCTION public.project_sites_company_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_company uuid;
  v_site_company    uuid;
BEGIN
  SELECT company_id INTO v_project_company FROM public.projects WHERE id = NEW.project_id;
  SELECT company_id INTO v_site_company    FROM public.sites    WHERE id = NEW.site_id;

  IF v_project_company IS NULL OR v_site_company IS DISTINCT FROM v_project_company THEN
    RAISE EXCEPTION
      'Site % does not belong to the company that owns project % (site company: %, project company: %).',
      NEW.site_id, NEW.project_id,
      coalesce(v_site_company::text, 'none'), coalesce(v_project_company::text, 'none')
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.project_sites_company_guard() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER project_sites_company_guard
  BEFORE INSERT OR UPDATE OF project_id, site_id ON public.project_sites
  FOR EACH ROW EXECUTE FUNCTION public.project_sites_company_guard();

-- ── C. project_packages ──────────────────────────────────────────────────────
CREATE TABLE public.project_packages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title        text NOT NULL,
  trade        text,
  -- NULL = applies to all of the project's sites.
  site_id      uuid REFERENCES public.sites(id) ON DELETE SET NULL,
  sort_order   integer NOT NULL DEFAULT 0,
  allowance    numeric(12,2) CONSTRAINT project_packages_allowance_check CHECK (allowance >= 0),
  needed_from  date,
  needed_to    date,
  job_id       uuid REFERENCES public.jobs(id)    ON DELETE SET NULL,
  tender_id    uuid REFERENCES public.tenders(id) ON DELETE SET NULL,
  created_by   uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  -- A job belongs to one project, and to at most one package within it.
  CONSTRAINT project_packages_job_id_key UNIQUE (job_id)
);
CREATE INDEX idx_project_packages_project_id ON public.project_packages(project_id);
ALTER TABLE public.project_packages ENABLE ROW LEVEL SECURITY;

-- job_id is written ONLY by attach_job_to_package / detach_job_from_package
-- (SECURITY DEFINER), which enforce the job-side check. project_id and
-- created_by are fixed at insert. Column-level grants make that a privilege
-- rule, not just an RLS one (same idiom as the profiles column lock,
-- 20261004110000).
REVOKE ALL ON public.project_packages FROM anon;
REVOKE INSERT, UPDATE ON public.project_packages FROM authenticated;
GRANT INSERT (project_id, title, trade, site_id, sort_order, allowance,
              needed_from, needed_to, tender_id, created_by)
  ON public.project_packages TO authenticated;
GRANT UPDATE (title, trade, site_id, sort_order, allowance,
              needed_from, needed_to, tender_id)
  ON public.project_packages TO authenticated;

CREATE TRIGGER update_project_packages_updated_at
  BEFORE UPDATE ON public.project_packages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- A package may only point at a site, job or tender that is already linked
-- to the same project. SECURITY DEFINER so the check reads project_sites,
-- jobs and tenders regardless of the caller's RLS on them.
CREATE FUNCTION public.project_packages_link_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job_project    uuid;
  v_tender_project uuid;
BEGIN
  IF NEW.site_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.project_sites
    WHERE project_id = NEW.project_id AND site_id = NEW.site_id
  ) THEN
    RAISE EXCEPTION
      'Site % is not one of project %''s sites.',
      NEW.site_id, NEW.project_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.job_id IS NOT NULL THEN
    SELECT project_id INTO v_job_project FROM public.jobs WHERE id = NEW.job_id;
    IF v_job_project IS DISTINCT FROM NEW.project_id THEN
      RAISE EXCEPTION
        'Job % is not linked to project % (jobs.project_id is %).',
        NEW.job_id, NEW.project_id, coalesce(v_job_project::text, 'null')
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.tender_id IS NOT NULL THEN
    SELECT project_id INTO v_tender_project FROM public.tenders WHERE id = NEW.tender_id;
    IF v_tender_project IS DISTINCT FROM NEW.project_id THEN
      RAISE EXCEPTION
        'Tender % is not linked to project % (tenders.project_id is %).',
        NEW.tender_id, NEW.project_id, coalesce(v_tender_project::text, 'null')
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.project_packages_link_guard() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER project_packages_link_guard
  BEFORE INSERT OR UPDATE ON public.project_packages
  FOR EACH ROW EXECUTE FUNCTION public.project_packages_link_guard();

-- ── D. project_snags, indexes ────────────────────────────────────────────────
ALTER TABLE public.project_snags
  ADD COLUMN package_id uuid
    CONSTRAINT project_snags_package_id_fkey
    REFERENCES public.project_packages(id) ON DELETE SET NULL;

-- A snag's package must belong to the snag's own project.
CREATE FUNCTION public.project_snags_package_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_package_project uuid;
BEGIN
  IF NEW.package_id IS NOT NULL THEN
    SELECT project_id INTO v_package_project FROM public.project_packages WHERE id = NEW.package_id;
    IF v_package_project IS DISTINCT FROM NEW.project_id THEN
      RAISE EXCEPTION
        'Package % is not part of project % (package project is %).',
        NEW.package_id, NEW.project_id, coalesce(v_package_project::text, 'none')
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.project_snags_package_guard() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER project_snags_package_guard
  BEFORE INSERT OR UPDATE OF package_id, project_id ON public.project_snags
  FOR EACH ROW EXECUTE FUNCTION public.project_snags_package_guard();

CREATE INDEX idx_project_snags_project_id     ON public.project_snags(project_id);
CREATE INDEX idx_project_sign_offs_project_id ON public.project_sign_offs(project_id);
CREATE INDEX idx_jobs_project_id ON public.jobs(project_id) WHERE project_id IS NOT NULL;

-- ── E. Access ────────────────────────────────────────────────────────────────

-- E0. The rule, defined once. Takes the project row's own values, so the
-- projects policies can call it WITHOUT re-reading projects — an INSERT ...
-- RETURNING on projects is checked against the values being inserted, not
-- against a snapshot that cannot see the new row (CLAUDE.md: STABLE helper
-- anti-pattern). It reads project_sites only, never projects.
-- SECURITY DEFINER so the project_sites read is not itself put through
-- project_sites' RLS (which calls can_access_project -> projects).
CREATE FUNCTION public.project_access_rule(
  p_project_id   uuid,
  p_account_type text,
  p_company_id   uuid,
  p_posted_by    uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    CASE
      WHEN p_account_type <> 'business' THEN p_posted_by = auth.uid()
      WHEN p_company_id IS NULL THEN false
      WHEN public.is_company_owner(p_company_id) THEN true
      WHEN NOT public.is_company_member(p_company_id) THEN false
      ELSE EXISTS (
             SELECT 1 FROM public.project_sites ps
             WHERE ps.project_id = p_project_id
               AND public.can_access_site(ps.site_id)
           )
           OR (
             p_posted_by = auth.uid()
             AND NOT EXISTS (
               SELECT 1 FROM public.project_sites ps
               WHERE ps.project_id = p_project_id
             )
           )
    END,
    false
  );
$$;
REVOKE ALL     ON FUNCTION public.project_access_rule(uuid, text, uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.project_access_rule(uuid, text, uuid, uuid) TO authenticated;

-- E2. For child tables only. Reads the projects row, then applies the rule.
-- Safe for child-table INSERT ... RETURNING: the projects row it reads
-- already exists before the child statement starts.
CREATE FUNCTION public.can_access_project(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce((
    SELECT public.project_access_rule(p.id, p.account_type, p.company_id, p.posted_by)
    FROM public.projects p
    WHERE p.id = p_project_id
  ), false);
$$;
REVOKE ALL     ON FUNCTION public.can_access_project(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.can_access_project(uuid) TO authenticated;

-- Mirrors tender_company_id(): lets child-table policies resolve the owning
-- company without depending on the caller's own SELECT on projects.
CREATE FUNCTION public.project_company_id(p_project_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM public.projects WHERE id = p_project_id;
$$;
REVOKE ALL     ON FUNCTION public.project_company_id(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.project_company_id(uuid) TO authenticated;

-- E1. projects — evaluated on the row itself.
DROP POLICY projects_customer_all      ON public.projects;
DROP POLICY projects_contractor_select ON public.projects;

CREATE POLICY projects_select ON public.projects
  FOR SELECT TO authenticated
  USING (public.project_access_rule(id, account_type, company_id, posted_by));

-- Contractor-created projects are not in slice 1.
CREATE POLICY projects_insert ON public.projects
  FOR INSERT TO authenticated
  WITH CHECK (
    posted_by = auth.uid()
    AND account_type IN ('personal', 'business')
    AND account_type = (SELECT p.user_type::text FROM public.profiles p WHERE p.id = auth.uid())
    AND (account_type <> 'business' OR public.is_company_member(company_id))
  );

CREATE POLICY projects_update ON public.projects
  FOR UPDATE TO authenticated
  USING (public.project_access_rule(id, account_type, company_id, posted_by))
  WITH CHECK (
    public.project_access_rule(id, account_type, company_id, posted_by)
    AND account_type IN ('personal', 'business')
  );

-- Current access AND (creator or company owner): a creator who has since
-- lost access (e.g. left the company) cannot delete.
CREATE POLICY projects_delete ON public.projects
  FOR DELETE TO authenticated
  USING (
    public.project_access_rule(id, account_type, company_id, posted_by)
    AND (posted_by = auth.uid()
         OR (company_id IS NOT NULL AND public.is_company_owner(company_id)))
  );

-- E3. project_sites. Writes also need coverage of the site being linked, so
-- a member cannot attach a site outside their own coverage.
CREATE POLICY project_sites_select ON public.project_sites
  FOR SELECT TO authenticated
  USING (public.can_access_project(project_id));

CREATE POLICY project_sites_insert ON public.project_sites
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_project(project_id) AND public.can_access_site(site_id));

CREATE POLICY project_sites_update ON public.project_sites
  FOR UPDATE TO authenticated
  USING (public.can_access_project(project_id))
  WITH CHECK (public.can_access_project(project_id) AND public.can_access_site(site_id));

CREATE POLICY project_sites_delete ON public.project_sites
  FOR DELETE TO authenticated
  USING (public.can_access_project(project_id));

-- E3. project_packages. A package pinned to a site is visible only to users
-- who cover that site (or the company owner).
CREATE POLICY project_packages_select ON public.project_packages
  FOR SELECT TO authenticated
  USING (
    public.can_access_project(project_id)
    AND (site_id IS NULL
         OR public.can_access_site(site_id)
         OR public.is_company_owner(public.project_company_id(project_id)))
  );

CREATE POLICY project_packages_insert ON public.project_packages
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND public.can_access_project(project_id)
    AND (site_id IS NULL
         OR public.can_access_site(site_id)
         OR public.is_company_owner(public.project_company_id(project_id)))
  );

CREATE POLICY project_packages_update ON public.project_packages
  FOR UPDATE TO authenticated
  USING (
    public.can_access_project(project_id)
    AND (site_id IS NULL
         OR public.can_access_site(site_id)
         OR public.is_company_owner(public.project_company_id(project_id)))
  )
  WITH CHECK (
    public.can_access_project(project_id)
    AND (site_id IS NULL
         OR public.can_access_site(site_id)
         OR public.is_company_owner(public.project_company_id(project_id)))
  );

CREATE POLICY project_packages_delete ON public.project_packages
  FOR DELETE TO authenticated
  USING (
    public.can_access_project(project_id)
    AND (site_id IS NULL
         OR public.can_access_site(site_id)
         OR public.is_company_owner(public.project_company_id(project_id)))
  );

-- E4. project_snags, project_sign_offs — owner side only in slice 1.
DROP POLICY ps_select  ON public.project_snags;
DROP POLICY ps_insert  ON public.project_snags;
DROP POLICY ps_update  ON public.project_snags;
DROP POLICY pso_select ON public.project_sign_offs;
DROP POLICY pso_insert ON public.project_sign_offs;

CREATE POLICY project_snags_select ON public.project_snags
  FOR SELECT TO authenticated
  USING (public.can_access_project(project_id));

CREATE POLICY project_snags_insert ON public.project_snags
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_project(project_id) AND raised_by = auth.uid());

CREATE POLICY project_snags_update ON public.project_snags
  FOR UPDATE TO authenticated
  USING (public.can_access_project(project_id))
  WITH CHECK (public.can_access_project(project_id));

CREATE POLICY project_sign_offs_select ON public.project_sign_offs
  FOR SELECT TO authenticated
  USING (public.can_access_project(project_id));

CREATE POLICY project_sign_offs_insert ON public.project_sign_offs
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_project(project_id) AND signed_off_by = auth.uid());

-- ── F. Attach / detach a job ─────────────────────────────────────────────────
-- The only path that writes project_packages.job_id, and the only path this
-- slice adds that writes jobs.project_id. Writes no other jobs column (the
-- existing jobs BEFORE UPDATE triggers still run: updated_at is bumped).

-- Which jobs may be linked to a project, given the project's ownership and
-- the job's own customer side:
--   - personal project: the caller is the job's customer.
--   - business project: the job is the project company's job and the
--     caller covers its site (or it has no site); or the job has no company
--     and the caller is its customer.
-- Internal: called only from the two SECURITY DEFINER functions below.
CREATE FUNCTION public._project_job_link_allowed(
  p_account_type    text,
  p_project_company uuid,
  p_job_customer    uuid,
  p_job_company     uuid,
  p_job_site        uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    CASE
      WHEN p_account_type <> 'business' THEN p_job_customer = auth.uid()
      ELSE (p_job_company = p_project_company
            AND (p_job_site IS NULL OR public.can_access_site(p_job_site)))
           OR (p_job_company IS NULL AND p_job_customer = auth.uid())
    END,
    false
  );
$$;
REVOKE ALL ON FUNCTION public._project_job_link_allowed(text, uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.attach_job_to_package(p_package_id uuid, p_job_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pkg              public.project_packages%ROWTYPE;
  v_account_type     text;
  v_project_company  uuid;
  v_customer_id      uuid;
  v_company_id       uuid;
  v_site_id          uuid;
  v_job_project      uuid;
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

  SELECT customer_id, company_id, site_id, project_id
    INTO v_customer_id, v_company_id, v_site_id, v_job_project
  FROM public.jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job not found.' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public._project_job_link_allowed(v_account_type, v_project_company,
                                          v_customer_id, v_company_id, v_site_id) THEN
    RAISE EXCEPTION 'You cannot add this job to this project.' USING ERRCODE = 'insufficient_privilege';
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
REVOKE ALL     ON FUNCTION public.attach_job_to_package(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.attach_job_to_package(uuid, uuid) TO authenticated;

CREATE FUNCTION public.detach_job_from_package(p_package_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pkg              public.project_packages%ROWTYPE;
  v_account_type     text;
  v_project_company  uuid;
  v_customer_id      uuid;
  v_company_id       uuid;
  v_site_id          uuid;
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

  SELECT customer_id, company_id, site_id INTO v_customer_id, v_company_id, v_site_id
  FROM public.jobs WHERE id = v_pkg.job_id FOR UPDATE;

  IF NOT public._project_job_link_allowed(v_account_type, v_project_company,
                                          v_customer_id, v_company_id, v_site_id) THEN
    RAISE EXCEPTION 'You cannot remove this job from this project.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Package first, so the link guard never sees a job/project mismatch.
  UPDATE public.project_packages SET job_id = NULL WHERE id = p_package_id;
  UPDATE public.jobs SET project_id = NULL
  WHERE id = v_pkg.job_id AND project_id = v_pkg.project_id;
END;
$$;
REVOKE ALL     ON FUNCTION public.detach_job_from_package(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.detach_job_from_package(uuid) TO authenticated;
