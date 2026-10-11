-- Projects slice 4, step 4: the customer's view of a contractor-owned
-- project, snags, and customer sign-off. Personal customers only --
-- business customers are step 4b.
--
-- "The customer" of a contractor project (projects.account_type =
-- 'contractor') is the personal account that is jobs.customer_id on a
-- job attached to one of its packages, where that job's company_id IS
-- NULL. The view is read-only except for snags (raise/resolve) and
-- sign-off. No change to projects_select, project_packages policies,
-- project_access_rule or can_access_project -- the customer's access
-- is granted entirely by the new is_contractor_project_customer()
-- helper and the new functions/policies that call it.
--
-- Money: project_money's body is extracted into _project_money_rows()
-- so the SAME rules serve both the existing project_money (owner/
-- company access) and the new customer_contractor_project_money
-- (customer access) without a second copy. project_money_totals was
-- checked and does NOT share project_money's body -- it is its own,
-- separately written aggregate query over an array of project ids (a
-- different grouping level: per-project, not per-package). It
-- duplicates the deposit/paid/agreed CALCULATION RULES, not the
-- function body itself, so per instruction it is left untouched here.
--
-- ============================================================
-- ROLLBACK (reverse order). Live bodies of every replaced object,
-- pasted verbatim, follow below the DROP statements.
-- ============================================================
-- DROP POLICY IF EXISTS project_sign_offs_select_contractor_project_customer ON public.project_sign_offs;
-- (sign_off_project, project_sign_offs_insert, project_snags policies: see restore bodies below)
-- DROP FUNCTION IF EXISTS public.set_contractor_project_snag_status(uuid, boolean);
-- DROP FUNCTION IF EXISTS public.raise_contractor_project_snag(uuid, uuid, text);
-- DROP POLICY IF EXISTS project_snags_select_contractor_project_customer ON public.project_snags;
-- DROP FUNCTION IF EXISTS public.customer_contractor_project_money(uuid);
-- DROP FUNCTION IF EXISTS public._project_money_rows(uuid);
-- DROP FUNCTION IF EXISTS public.customer_contractor_project_view(uuid);
-- DROP FUNCTION IF EXISTS public.customer_contractor_projects();
-- DROP FUNCTION IF EXISTS public.is_contractor_project_customer(uuid);
-- DROP FUNCTION IF EXISTS public.project_is_contractor_type(uuid);
--
-- -- Restore project_snags_insert / project_snags_update to their live bodies:
-- -- (ALTER POLICY project_snags_insert ... WITH CHECK (can_access_project(project_id) AND (raised_by = auth.uid())); )
-- -- (ALTER POLICY project_snags_update ... USING (can_access_project(project_id)) WITH CHECK (can_access_project(project_id)); )
--
-- -- Restore project_sign_offs_insert (only if this migration dropped it):
-- -- CREATE POLICY project_sign_offs_insert ON public.project_sign_offs
-- --   FOR INSERT WITH CHECK (can_access_project(project_id) AND (signed_off_by = auth.uid()));
-- -- GRANT INSERT, UPDATE, DELETE ON public.project_sign_offs TO authenticated;
--
-- -- Restore sign_off_project (live body before this migration):
-- -- CREATE OR REPLACE FUNCTION public.sign_off_project(p_project_id uuid)
-- --  RETURNS void
-- --  LANGUAGE plpgsql
-- --  SECURITY DEFINER
-- --  SET search_path TO 'public'
-- -- AS $function$
-- -- DECLARE
-- --   v_project        public.projects%ROWTYPE;
-- --   v_package_count  integer;
-- --   v_unfilled       text;
-- --   v_not_complete   text;
-- --   v_open_snags     integer;
-- -- BEGIN
-- --   SELECT * INTO v_project FROM public.projects WHERE id = p_project_id FOR UPDATE;
-- --   IF NOT FOUND THEN
-- --     RAISE EXCEPTION 'Project not found.' USING ERRCODE = 'no_data_found';
-- --   END IF;
-- --   IF v_project.account_type = 'contractor' THEN
-- --     RAISE EXCEPTION 'The customer signs off, not the contractor.' USING ERRCODE = 'insufficient_privilege';
-- --   END IF;
-- --   IF NOT public.can_access_project(p_project_id)
-- --      OR (v_project.account_type = 'personal' AND v_project.posted_by IS DISTINCT FROM auth.uid()) THEN
-- --     RAISE EXCEPTION 'Only the owner of this project can sign it off.' USING ERRCODE = 'insufficient_privilege';
-- --   END IF;
-- --   IF v_project.status = 'completed' THEN
-- --     RAISE EXCEPTION 'This project has already been signed off.' USING ERRCODE = 'check_violation';
-- --   ELSIF v_project.status = 'cancelled' THEN
-- --     RAISE EXCEPTION 'This project is cancelled and cannot be signed off.' USING ERRCODE = 'check_violation';
-- --   END IF;
-- --   SELECT count(*) INTO v_package_count FROM public.project_packages WHERE project_id = p_project_id;
-- --   IF v_package_count = 0 THEN
-- --     RAISE EXCEPTION 'Add at least one package of work before signing off.' USING ERRCODE = 'check_violation';
-- --   END IF;
-- --   SELECT string_agg(title, ', ' ORDER BY sort_order, created_at) INTO v_unfilled
-- --   FROM public.project_packages WHERE project_id = p_project_id AND job_id IS NULL;
-- --   IF v_unfilled IS NOT NULL THEN
-- --     RAISE EXCEPTION 'Every package needs a job before sign-off. Still without one: %.', v_unfilled
-- --       USING ERRCODE = 'check_violation';
-- --   END IF;
-- --   SELECT string_agg(pk.title, ', ' ORDER BY pk.sort_order, pk.created_at) INTO v_not_complete
-- --   FROM public.project_packages pk JOIN public.jobs j ON j.id = pk.job_id
-- --   WHERE pk.project_id = p_project_id AND j.status <> 'complete';
-- --   IF v_not_complete IS NOT NULL THEN
-- --     RAISE EXCEPTION 'Every job must be complete before sign-off. Not yet complete: %.', v_not_complete
-- --       USING ERRCODE = 'check_violation';
-- --   END IF;
-- --   SELECT count(*) INTO v_open_snags FROM public.project_snags
-- --   WHERE project_id = p_project_id AND status <> 'resolved';
-- --   IF v_open_snags > 0 THEN
-- --     RAISE EXCEPTION 'Resolve every snag before sign-off. % still open.', v_open_snags
-- --       USING ERRCODE = 'check_violation';
-- --   END IF;
-- --   INSERT INTO public.project_sign_offs (project_id, stage, signed_off_by) VALUES (p_project_id, 'final', auth.uid());
-- --   UPDATE public.projects SET status = 'completed' WHERE id = p_project_id;
-- --   IF NOT FOUND THEN
-- --     RAISE EXCEPTION 'Project % was not updated.', p_project_id USING ERRCODE = 'no_data_found';
-- --   END IF;
-- -- END;
-- -- $function$;
--
-- -- project_money's live body (before extracting _project_money_rows) is
-- -- identical to the new project_money wrapper's RETURN QUERY target --
-- -- i.e. re-inline _project_money_rows' body directly into project_money
-- -- and drop _project_money_rows to restore exactly.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Helpers
-- ------------------------------------------------------------

create or replace function public.project_is_contractor_type(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = 'public'
as $function$
  select exists (
    select 1 from public.projects where id = p_project_id and account_type = 'contractor'
  );
$function$;

revoke all on function public.project_is_contractor_type(uuid) from public;
revoke all on function public.project_is_contractor_type(uuid) from anon;
grant execute on function public.project_is_contractor_type(uuid) to authenticated;


create or replace function public.is_contractor_project_customer(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = 'public'
as $function$
  select exists (
    select 1
    from public.project_packages icpc_pk
    join public.jobs icpc_j on icpc_j.id = icpc_pk.job_id
    join public.projects icpc_pr on icpc_pr.id = icpc_pk.project_id
    where icpc_pk.project_id = p_project_id
      and icpc_pr.account_type = 'contractor'
      and icpc_j.customer_id = auth.uid()
      and icpc_j.company_id is null
  );
$function$;

revoke all on function public.is_contractor_project_customer(uuid) from public;
revoke all on function public.is_contractor_project_customer(uuid) from anon;
grant execute on function public.is_contractor_project_customer(uuid) to authenticated;

-- ------------------------------------------------------------
-- 2. Read functions
--    Chose two functions, header-free detail rows (package_id, title,
--    trade, ... only) -- same convention as contractor_projects() +
--    contractor_project_view() in migration 20261010120000: the list
--    function carries title/contractor_name, the detail function does
--    not repeat them.
-- ------------------------------------------------------------

create or replace function public.customer_contractor_projects()
returns table (
  project_id uuid,
  title text,
  status text,
  target_start date,
  target_end date,
  contractor_name text,
  phase_count integer,
  complete_phase_count integer
)
language plpgsql
stable
security definer
set search_path = 'public'
as $function$
begin
  return query
  with ccp_mine as (
    select distinct ccp_pk.project_id as pid
    from public.project_packages ccp_pk
    join public.jobs ccp_j on ccp_j.id = ccp_pk.job_id
    join public.projects ccp_pr on ccp_pr.id = ccp_pk.project_id
    where ccp_pr.account_type = 'contractor'
      and ccp_j.customer_id = auth.uid()
      and ccp_j.company_id is null
  )
  select
    ccp2_pr.id,
    ccp2_pr.title,
    ccp2_pr.status,
    ccp2_pr.target_start,
    ccp2_pr.target_end,
    coalesce(ccp2_mc.company_name, ccp2_mc.full_name),
    count(ccp2_pk.id)::integer,
    count(ccp2_pk.id) filter (where ccp2_j.status = 'complete')::integer
  from ccp_mine
  join public.projects ccp2_pr on ccp2_pr.id = ccp_mine.pid
  join public.profiles ccp2_mc on ccp2_mc.id = ccp2_pr.posted_by
  join public.project_packages ccp2_pk on ccp2_pk.project_id = ccp2_pr.id
  left join public.jobs ccp2_j on ccp2_j.id = ccp2_pk.job_id
  group by ccp2_pr.id, ccp2_pr.title, ccp2_pr.status, ccp2_pr.target_start, ccp2_pr.target_end,
           ccp2_mc.company_name, ccp2_mc.full_name;
end;
$function$;

revoke all on function public.customer_contractor_projects() from public;
revoke all on function public.customer_contractor_projects() from anon;
grant execute on function public.customer_contractor_projects() to authenticated;


create or replace function public.customer_contractor_project_view(p_project_id uuid)
returns table (
  package_id uuid,
  title text,
  trade text,
  needed_from date,
  needed_to date,
  job_id uuid,
  job_number integer,
  job_status text,
  job_start_date date,
  job_end_date date,
  contractor_name text,
  contractor_ts_code text,
  subcontractor_names text
)
language plpgsql
stable
security definer
set search_path = 'public'
as $function$
begin
  if not public.is_contractor_project_customer(p_project_id) then
    raise exception 'Not authorized to view this project.' using errcode = 'insufficient_privilege';
  end if;

  return query
  select
    ccv_pk.id,
    ccv_pk.title,
    ccv_pk.trade,
    ccv_pk.needed_from,
    ccv_pk.needed_to,
    ccv_j.id,
    ccv_j.job_number,
    ccv_j.status,
    ccv_j.start_date,
    ccv_j.end_date,
    coalesce(ccv_mc.company_name, ccv_mc.full_name),
    ccv_mc.ts_profile_code,
    (
      select string_agg(coalesce(ccv_sub.company_name, ccv_sub.full_name), ', ' order by ccv_subrow.created_at)
      from public.project_subcontracts ccv_subrow
      join public.profiles ccv_sub on ccv_sub.id = ccv_subrow.subcontractor_id
      where ccv_subrow.package_id = ccv_pk.id
        and ccv_subrow.status = 'accepted'
    )
  from public.project_packages ccv_pk
  left join public.jobs ccv_j on ccv_j.id = ccv_pk.job_id
  join public.projects ccv_pr on ccv_pr.id = ccv_pk.project_id
  join public.profiles ccv_mc on ccv_mc.id = ccv_pr.posted_by
  where ccv_pk.project_id = p_project_id
  order by ccv_pk.sort_order, ccv_pk.created_at;
end;
$function$;

revoke all on function public.customer_contractor_project_view(uuid) from public;
revoke all on function public.customer_contractor_project_view(uuid) from anon;
grant execute on function public.customer_contractor_project_view(uuid) to authenticated;

-- ------------------------------------------------------------
-- 3. Money -- one body, two gated callers.
-- ------------------------------------------------------------

create or replace function public._project_money_rows(p_project_id uuid)
returns table(package_id uuid, job_id uuid, agreed numeric, paid numeric, still_to_pay numeric, due_now numeric)
language plpgsql
stable
security definer
set search_path = 'public'
as $function$
BEGIN
  RETURN QUERY
  WITH visible_packages AS (
    SELECT pkg.id, pkg.job_id, pkg.project_id
    FROM public.project_packages pkg
    WHERE pkg.project_id = p_project_id
      AND (
        pkg.site_id IS NULL
        OR public.can_access_site(pkg.site_id)
        OR public.is_company_owner(public.project_company_id(pkg.project_id))
      )
  ),
  job_invoices AS (
    SELECT
      vp.id AS jiv_package_id,
      vp.job_id AS jiv_job_id,
      inv.status AS jiv_status,
      inv.total AS jiv_total,
      inv.deposit_amount AS jiv_deposit_amount,
      inv.deposit_deducted AS jiv_deposit_deducted,
      inv.deposit_paid AS jiv_deposit_paid
    FROM visible_packages vp
    JOIN public.jobs j ON j.id = vp.job_id
    JOIN public.invoices inv
      ON inv.status NOT IN ('void', 'draft')
     AND (
       inv.job_id = j.id
       OR (inv.job_id IS NULL AND j.issued_quote_id IS NOT NULL AND inv.quote_id = j.issued_quote_id)
     )
    WHERE vp.job_id IS NOT NULL
  ),
  settled AS (
    SELECT
      jiv_package_id,
      jiv_job_id,
      jiv_status AS stl_status,
      jiv_total AS stl_total,
      CASE
        WHEN jiv_deposit_paid IS TRUE THEN
          CASE WHEN COALESCE(jiv_deposit_deducted, 0) > 0 THEN jiv_deposit_deducted ELSE COALESCE(jiv_deposit_amount, 0) END
        ELSE 0
      END AS stl_amount_settled
    FROM job_invoices
  ),
  per_job AS (
    SELECT
      jiv_package_id AS pj_package_id,
      jiv_job_id AS pj_job_id,
      SUM(CASE WHEN stl_status = 'paid' THEN stl_total ELSE stl_amount_settled END) AS pj_paid,
      MAX(stl_total) AS pj_max_invoice_total,
      SUM(CASE WHEN stl_status IN ('sent', 'viewed') THEN GREATEST(0, stl_total - stl_amount_settled) ELSE 0 END) AS pj_due_now
    FROM settled
    GROUP BY jiv_package_id, jiv_job_id
  )
  SELECT
    vp.id AS package_id,
    vp.job_id AS job_id,
    COALESCE(j.contract_value, pj.pj_max_invoice_total) AS agreed,
    COALESCE(pj.pj_paid, 0) AS paid,
    GREATEST(0, COALESCE(j.contract_value, pj.pj_max_invoice_total, 0) - COALESCE(pj.pj_paid, 0)) AS still_to_pay,
    COALESCE(pj.pj_due_now, 0) AS due_now
  FROM visible_packages vp
  LEFT JOIN public.jobs j ON j.id = vp.job_id
  LEFT JOIN per_job pj ON pj.pj_package_id = vp.id;
END;
$function$;

revoke all on function public._project_money_rows(uuid) from public;
revoke all on function public._project_money_rows(uuid) from anon;
revoke all on function public._project_money_rows(uuid) from authenticated;


create or replace function public.project_money(p_project_id uuid)
returns table(package_id uuid, job_id uuid, agreed numeric, paid numeric, still_to_pay numeric, due_now numeric)
language plpgsql
stable
security definer
set search_path = 'public'
as $function$
BEGIN
  IF NOT public.can_access_project(p_project_id) THEN
    RAISE EXCEPTION 'Not authorized to view this project''s money.';
  END IF;

  RETURN QUERY SELECT * FROM public._project_money_rows(p_project_id);
END;
$function$;

revoke all on function public.project_money(uuid) from public;
revoke all on function public.project_money(uuid) from anon;
grant execute on function public.project_money(uuid) to authenticated;


create or replace function public.customer_contractor_project_money(p_project_id uuid)
returns table(package_id uuid, job_id uuid, agreed numeric, paid numeric, still_to_pay numeric, due_now numeric)
language plpgsql
stable
security definer
set search_path = 'public'
as $function$
BEGIN
  IF NOT public.is_contractor_project_customer(p_project_id) THEN
    RAISE EXCEPTION 'Not authorized to view this project''s money.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY SELECT * FROM public._project_money_rows(p_project_id);
END;
$function$;

revoke all on function public.customer_contractor_project_money(uuid) from public;
revoke all on function public.customer_contractor_project_money(uuid) from anon;
grant execute on function public.customer_contractor_project_money(uuid) to authenticated;

-- ------------------------------------------------------------
-- 4. Snags on contractor projects
-- ------------------------------------------------------------

-- Pre-flight: fail, never delete (CLAUDE.md). Confirmed live count is 0.
DO $preflight$
DECLARE v_bad_count integer;
BEGIN
  SELECT count(*) INTO v_bad_count
  FROM public.project_snags ps
  JOIN public.projects p ON p.id = ps.project_id
  WHERE p.account_type = 'contractor'
    AND NOT EXISTS (
      SELECT 1
      FROM public.project_packages pk
      JOIN public.jobs j ON j.id = pk.job_id
      WHERE pk.project_id = ps.project_id
        AND j.customer_id = ps.raised_by
        AND j.company_id IS NULL
    );
  IF v_bad_count > 0 THEN
    RAISE EXCEPTION
      'Cannot proceed: % snag(s) on contractor-type projects were raised by someone other than that project''s customer. Resolve manually before applying.',
      v_bad_count;
  END IF;
END $preflight$;

alter policy project_snags_insert on public.project_snags
  with check (can_access_project(project_id) and (raised_by = auth.uid()) and not project_is_contractor_type(project_id));

alter policy project_snags_update on public.project_snags
  using (can_access_project(project_id) and not project_is_contractor_type(project_id))
  with check (can_access_project(project_id) and not project_is_contractor_type(project_id));

create policy project_snags_select_contractor_project_customer on public.project_snags
  for select
  using (is_contractor_project_customer(project_id));


create or replace function public.raise_contractor_project_snag(
  p_project_id uuid,
  p_package_id uuid,
  p_description text
)
returns uuid
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_project public.projects%rowtype;
  v_desc    text;
  v_new_id  uuid;
begin
  if not public.is_contractor_project_customer(p_project_id) then
    raise exception 'Only the customer can raise a snag on this project.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_project from public.projects where id = p_project_id for update;
  if not found then
    raise exception 'Project not found.' using errcode = 'no_data_found';
  end if;

  if v_project.status in ('completed', 'cancelled') then
    raise exception 'This project is % and cannot take new snags.', v_project.status
      using errcode = 'check_violation';
  end if;

  if p_package_id is not null and not exists (
    select 1 from public.project_packages where id = p_package_id and project_id = p_project_id
  ) then
    raise exception 'That phase does not belong to this project.' using errcode = 'check_violation';
  end if;

  v_desc := btrim(p_description);
  if v_desc = '' then
    raise exception 'Description is required.' using errcode = 'check_violation';
  end if;
  if char_length(v_desc) > 2000 then
    raise exception 'Description must be 2000 characters or fewer.' using errcode = 'check_violation';
  end if;

  insert into public.project_snags (project_id, package_id, raised_by, description)
  values (p_project_id, p_package_id, auth.uid(), v_desc)
  returning id into v_new_id;

  insert into public.notifications (user_id, title, message, type, reference_type, reference_id, is_read)
  values (
    v_project.posted_by,
    'New snag raised',
    'Your customer raised a snag on "' || v_project.title || '"',
    'project_snag_raised',
    'project',
    p_project_id,
    false
  );

  return v_new_id;
end;
$function$;

revoke all on function public.raise_contractor_project_snag(uuid, uuid, text) from public;
revoke all on function public.raise_contractor_project_snag(uuid, uuid, text) from anon;
grant execute on function public.raise_contractor_project_snag(uuid, uuid, text) to authenticated;


create or replace function public.set_contractor_project_snag_status(
  p_snag_id uuid,
  p_resolved boolean
)
returns void
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_snag    public.project_snags%rowtype;
  v_project public.projects%rowtype;
begin
  select * into v_snag from public.project_snags where id = p_snag_id for update;
  if not found then
    raise exception 'Snag not found.' using errcode = 'no_data_found';
  end if;

  if not public.is_contractor_project_customer(v_snag.project_id) then
    raise exception 'Only the customer can update this snag.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_project from public.projects where id = v_snag.project_id;
  if v_project.status in ('completed', 'cancelled') then
    raise exception 'This project is % and its snags cannot be changed.', v_project.status
      using errcode = 'check_violation';
  end if;

  update public.project_snags
  set status = case when p_resolved then 'resolved' else 'open' end,
      resolved_at = case when p_resolved then now() else null end
  where id = p_snag_id;

  if p_resolved then
    insert into public.notifications (user_id, title, message, type, reference_type, reference_id, is_read)
    values (
      v_project.posted_by,
      'Snag resolved',
      'Your customer resolved a snag on "' || v_project.title || '"',
      'project_snag_resolved',
      'project',
      v_snag.project_id,
      false
    );
  end if;
end;
$function$;

revoke all on function public.set_contractor_project_snag_status(uuid, boolean) from public;
revoke all on function public.set_contractor_project_snag_status(uuid, boolean) from anon;
grant execute on function public.set_contractor_project_snag_status(uuid, boolean) to authenticated;

-- ------------------------------------------------------------
-- 5. Sign-off
-- ------------------------------------------------------------

create or replace function public.sign_off_project(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = 'public'
as $function$
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
    IF NOT public.is_contractor_project_customer(p_project_id) THEN
      RAISE EXCEPTION 'Only the customer can sign off this project.' USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF NOT public.can_access_project(p_project_id)
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

  IF v_project.account_type = 'contractor' THEN
    INSERT INTO public.notifications (user_id, title, message, type, reference_type, reference_id, is_read)
    VALUES (
      v_project.posted_by,
      'Project signed off',
      'Your customer signed off "' || v_project.title || '".',
      'project_signed_off',
      'project',
      p_project_id,
      false
    );
  END IF;
END;
$function$;

-- No client code inserts into project_sign_offs directly (confirmed by
-- the live read -- useProjectDetail.ts's signOff() only ever calls the
-- sign_off_project RPC). Close the hole flagged in NOW.md: drop the
-- insert policy and revoke the write grants outright.
drop policy if exists project_sign_offs_insert on public.project_sign_offs;
revoke insert, update, delete on public.project_sign_offs from authenticated;

create policy project_sign_offs_select_contractor_project_customer on public.project_sign_offs
  for select
  using (is_contractor_project_customer(project_id));
