-- Projects slice 4, step 3b: the subcontractor's own RAMS, submitted
-- to the main contractor.
--
-- A subcontractor with an ACCEPTED project_subcontracts row writes a
-- RAMS for that sub-contract and submits it; the main contractor
-- accepts it or returns it with a note. This is status only -- a
-- missing or unaccepted RAMS blocks nothing on either side, and there
-- is no PDF in this step.
--
-- Deliberately untouched: job_rams, its policies, job_rams_guard,
-- revise_job_rams, useRams.ts, generate-rams-pdf. subcontract_rams is
-- its own table with its own lifecycle (draft -> submitted ->
-- accepted/returned -> superseded) and its own SECURITY DEFINER
-- write functions -- the client has no write grant on it at all.
--
-- An accepted version stays IN FORCE until its replacement is itself
-- accepted (fixed after an initial build where a revise immediately
-- superseded the accepted version, leaving a brief gap with no RAMS in
-- force at all). "In progress" (draft/submitted) and "in force"
-- (accepted) are therefore two separate live sets, each with its own
-- partial unique index, not one -- a draft/submitted revision of an
-- already-accepted RAMS coexists with the accepted row it is revising
-- until review_subcontract_rams supersedes it on acceptance.
--
-- The customer, company members, team members and other
-- subcontractors see nothing: the SELECT policy only ever admits the
-- author or the one main contractor on that specific sub-contract.
--
-- updated_at trigger follows the RAMS-family convention
-- (update_updated_at(), used by job_rams and rams_templates) rather
-- than project_subcontracts' own update_updated_at_column() --
-- subcontract_rams is a RAMS table first, a project_subcontracts
-- child second.
--
-- ============================================================
-- ROLLBACK (reverse order -- every object here is new, so rollback is drop)
-- ============================================================
-- DROP FUNCTION IF EXISTS public.package_subcontractor_rams(uuid);
-- DROP FUNCTION IF EXISTS public.revise_subcontract_rams(uuid);
-- DROP FUNCTION IF EXISTS public.review_subcontract_rams(uuid, boolean, text);
-- DROP FUNCTION IF EXISTS public.submit_subcontract_rams(uuid, text);
-- DROP FUNCTION IF EXISTS public.save_subcontract_rams(uuid, text, jsonb, jsonb, jsonb, text, text);
-- DROP FUNCTION IF EXISTS public.start_subcontract_rams(uuid, uuid);
-- DROP TRIGGER IF EXISTS subcontract_rams_updated_at ON public.subcontract_rams;
-- DROP TABLE IF EXISTS public.subcontract_rams;
-- ============================================================

-- ------------------------------------------------------------
-- 1. Table
-- ------------------------------------------------------------
create table public.subcontract_rams (
  id uuid primary key default gen_random_uuid(),
  subcontract_id uuid not null references public.project_subcontracts(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  version integer not null default 1,
  supersedes_id uuid references public.subcontract_rams(id),
  template_id uuid references public.rams_templates(id),
  job_description text check (job_description is null or char_length(job_description) <= 10000),
  hazards jsonb not null default '[]'::jsonb,
  method_steps jsonb not null default '[]'::jsonb,
  ppe_requirements jsonb not null default '[]'::jsonb,
  emergency_procedures text check (emergency_procedures is null or char_length(emergency_procedures) <= 10000),
  additional_notes text check (additional_notes is null or char_length(additional_notes) <= 10000),
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'accepted', 'returned', 'superseded')),
  submitted_at timestamptz,
  submitted_by_name text check (submitted_by_name is null or char_length(submitted_by_name) <= 200),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id),
  review_note text check (review_note is null or char_length(review_note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subcontract_rams_version_unique unique (subcontract_id, version)
);

comment on table public.subcontract_rams is
  'The subcontractor''s own RAMS for one accepted project_subcontracts row. Never written to job_rams -- a separate lifecycle, status only, no PDF in this step.';

-- An accepted version stays in force until its replacement is itself
-- accepted, so "one version in progress" (draft/submitted) and "one
-- version in force" (accepted) are tracked as two SEPARATE live sets,
-- not one -- a draft/submitted revision of an already-accepted RAMS
-- must be able to coexist with the accepted row it is revising.
create unique index subcontract_rams_in_progress_uidx
  on public.subcontract_rams (subcontract_id)
  where status in ('draft', 'submitted');

create unique index subcontract_rams_in_force_uidx
  on public.subcontract_rams (subcontract_id)
  where status = 'accepted';

create trigger subcontract_rams_updated_at
  before update on public.subcontract_rams
  for each row execute function public.update_updated_at();

-- ------------------------------------------------------------
-- 2. RLS -- one direct SELECT policy, no write policy at all.
-- ------------------------------------------------------------
alter table public.subcontract_rams enable row level security;

create policy subcontract_rams_select on public.subcontract_rams
  for select
  using (
    author_id = auth.uid()
    or (
      status <> 'draft'
      and exists (
        select 1 from public.project_subcontracts ps
        where ps.id = subcontract_rams.subcontract_id
          and ps.main_contractor_id = auth.uid()
      )
    )
  );

revoke all on public.subcontract_rams from anon;
revoke all on public.subcontract_rams from public;
revoke all on public.subcontract_rams from authenticated;
grant select on public.subcontract_rams to authenticated;

-- ------------------------------------------------------------
-- 3. Write functions -- SECURITY DEFINER, callers reach these only.
-- ------------------------------------------------------------

create or replace function public.start_subcontract_rams(
  p_subcontract_id uuid,
  p_template_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_sc              public.project_subcontracts%rowtype;
  v_tpl             public.rams_templates%rowtype;
  v_tpl_readable    boolean;
  v_new_id          uuid;
begin
  select * into v_sc from public.project_subcontracts where id = p_subcontract_id for update;
  if not found then
    raise exception 'Sub-contract not found.' using errcode = 'no_data_found';
  end if;

  if v_sc.subcontractor_id <> auth.uid() then
    raise exception 'Only the subcontractor on this sub-contract can start a RAMS.' using errcode = 'insufficient_privilege';
  end if;

  if v_sc.status <> 'accepted' then
    raise exception 'This sub-contract has not been accepted.' using errcode = 'check_violation';
  end if;

  if exists (
    select 1 from public.subcontract_rams
    where subcontract_id = p_subcontract_id
  ) then
    raise exception 'A RAMS already exists for this sub-contract. Revise it instead.' using errcode = 'unique_violation';
  end if;

  if p_template_id is not null then
    select * into v_tpl from public.rams_templates where id = p_template_id;
    if not found then
      raise exception 'Template not found.' using errcode = 'no_data_found';
    end if;

    if v_tpl.is_active is distinct from true then
      raise exception 'That template is no longer active.' using errcode = 'check_violation';
    end if;

    -- Re-derives rams_templates_select by hand: this read runs as
    -- SECURITY DEFINER and bypasses RLS, so the same eligibility the
    -- policy would apply is enforced here explicitly.
    v_tpl_readable := v_tpl.owner_contractor_id is null
      or v_tpl.owner_contractor_id = auth.uid()
      or v_tpl.owner_contractor_id in (select acting_contractor_ids());

    if not v_tpl_readable then
      raise exception 'You do not have access to that template.' using errcode = 'insufficient_privilege';
    end if;
  end if;

  insert into public.subcontract_rams (
    subcontract_id, author_id, version, template_id,
    hazards, method_steps, ppe_requirements, emergency_procedures
  )
  values (
    p_subcontract_id, auth.uid(), 1, p_template_id,
    coalesce(v_tpl.hazards, '[]'::jsonb),
    coalesce(v_tpl.method_steps, '[]'::jsonb),
    coalesce(v_tpl.ppe_requirements, '[]'::jsonb),
    v_tpl.emergency_procedures
  )
  returning id into v_new_id;

  return v_new_id;
end;
$function$;

revoke all on function public.start_subcontract_rams(uuid, uuid) from public;
revoke all on function public.start_subcontract_rams(uuid, uuid) from anon;
grant execute on function public.start_subcontract_rams(uuid, uuid) to authenticated;


create or replace function public.save_subcontract_rams(
  p_id uuid,
  p_job_description text,
  p_hazards jsonb,
  p_method_steps jsonb,
  p_ppe_requirements jsonb,
  p_emergency_procedures text,
  p_additional_notes text
)
returns void
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_row public.subcontract_rams%rowtype;
  v_sc_status text;
begin
  select * into v_row from public.subcontract_rams where id = p_id for update;
  if not found then
    raise exception 'RAMS not found.' using errcode = 'no_data_found';
  end if;

  if v_row.author_id <> auth.uid() then
    raise exception 'Only the author can edit this RAMS.' using errcode = 'insufficient_privilege';
  end if;

  if v_row.status <> 'draft' then
    raise exception 'Only a draft RAMS can be edited.' using errcode = 'check_violation';
  end if;

  select status into v_sc_status from public.project_subcontracts where id = v_row.subcontract_id;
  if v_sc_status <> 'accepted' then
    raise exception 'This sub-contract is no longer accepted.' using errcode = 'check_violation';
  end if;

  if jsonb_typeof(p_hazards) <> 'array' then
    raise exception 'Hazards must be a list.' using errcode = 'invalid_parameter_value';
  end if;
  if jsonb_typeof(p_method_steps) <> 'array' then
    raise exception 'Method steps must be a list.' using errcode = 'invalid_parameter_value';
  end if;
  if jsonb_typeof(p_ppe_requirements) <> 'array' then
    raise exception 'PPE requirements must be a list.' using errcode = 'invalid_parameter_value';
  end if;

  if p_job_description is not null and char_length(p_job_description) > 10000 then
    raise exception 'Job description must be 10000 characters or fewer.' using errcode = 'check_violation';
  end if;
  if p_emergency_procedures is not null and char_length(p_emergency_procedures) > 10000 then
    raise exception 'Emergency procedures must be 10000 characters or fewer.' using errcode = 'check_violation';
  end if;
  if p_additional_notes is not null and char_length(p_additional_notes) > 10000 then
    raise exception 'Additional notes must be 10000 characters or fewer.' using errcode = 'check_violation';
  end if;
  if octet_length(p_hazards::text) > 200000 then
    raise exception 'Hazards is too large.' using errcode = 'check_violation';
  end if;
  if octet_length(p_method_steps::text) > 200000 then
    raise exception 'Method steps is too large.' using errcode = 'check_violation';
  end if;
  if octet_length(p_ppe_requirements::text) > 200000 then
    raise exception 'PPE requirements is too large.' using errcode = 'check_violation';
  end if;

  update public.subcontract_rams
  set job_description = p_job_description,
      hazards = p_hazards,
      method_steps = p_method_steps,
      ppe_requirements = p_ppe_requirements,
      emergency_procedures = p_emergency_procedures,
      additional_notes = p_additional_notes
  where id = p_id;
end;
$function$;

revoke all on function public.save_subcontract_rams(uuid, text, jsonb, jsonb, jsonb, text, text) from public;
revoke all on function public.save_subcontract_rams(uuid, text, jsonb, jsonb, jsonb, text, text) from anon;
grant execute on function public.save_subcontract_rams(uuid, text, jsonb, jsonb, jsonb, text, text) to authenticated;


create or replace function public.submit_subcontract_rams(
  p_id uuid,
  p_name text
)
returns void
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_row        public.subcontract_rams%rowtype;
  v_sc_status  text;
  v_pkg_title  text;
  v_proj_title text;
  v_sub_name   text;
begin
  select * into v_row from public.subcontract_rams where id = p_id for update;
  if not found then
    raise exception 'RAMS not found.' using errcode = 'no_data_found';
  end if;

  if v_row.author_id <> auth.uid() then
    raise exception 'Only the author can submit this RAMS.' using errcode = 'insufficient_privilege';
  end if;

  if v_row.status <> 'draft' then
    raise exception 'Only a draft RAMS can be submitted.' using errcode = 'check_violation';
  end if;

  select status into v_sc_status from public.project_subcontracts where id = v_row.subcontract_id;
  if v_sc_status <> 'accepted' then
    raise exception 'This sub-contract is no longer accepted.' using errcode = 'check_violation';
  end if;

  if jsonb_array_length(v_row.hazards) < 1 then
    raise exception 'At least one hazard is required before submitting.' using errcode = 'check_violation';
  end if;

  if jsonb_array_length(v_row.method_steps) < 1 then
    raise exception 'At least one method step is required before submitting.' using errcode = 'check_violation';
  end if;

  if p_name is null or btrim(p_name) = '' then
    raise exception 'Your name is required before submitting.' using errcode = 'check_violation';
  end if;

  if char_length(p_name) > 200 then
    raise exception 'Your name must be 200 characters or fewer.' using errcode = 'check_violation';
  end if;

  update public.subcontract_rams
  set status = 'submitted',
      submitted_at = now(),
      submitted_by_name = btrim(p_name)
  where id = p_id;

  select pk.title, pr.title into v_pkg_title, v_proj_title
  from public.project_subcontracts sc
  join public.project_packages pk on pk.id = sc.package_id
  join public.projects pr on pr.id = pk.project_id
  where sc.id = v_row.subcontract_id;

  select coalesce(company_name, full_name) into v_sub_name
  from public.profiles where id = auth.uid();

  insert into public.notifications (user_id, title, message, type, reference_type, reference_id, is_read)
  select
    ps.main_contractor_id,
    'Sub-contract RAMS submitted',
    coalesce(v_sub_name, 'The subcontractor') || ' submitted RAMS for "' || v_pkg_title || '" on "' || v_proj_title || '"',
    'subcontract_rams_submitted',
    'project_subcontract',
    v_row.subcontract_id,
    false
  from public.project_subcontracts ps
  where ps.id = v_row.subcontract_id;
end;
$function$;

revoke all on function public.submit_subcontract_rams(uuid, text) from public;
revoke all on function public.submit_subcontract_rams(uuid, text) from anon;
grant execute on function public.submit_subcontract_rams(uuid, text) to authenticated;


create or replace function public.review_subcontract_rams(
  p_id uuid,
  p_accept boolean,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_row         public.subcontract_rams%rowtype;
  v_main_id     uuid;
  v_pkg_title   text;
  v_proj_title  text;
  v_main_name   text;
begin
  select * into v_row from public.subcontract_rams where id = p_id for update;
  if not found then
    raise exception 'RAMS not found.' using errcode = 'no_data_found';
  end if;

  select main_contractor_id into v_main_id from public.project_subcontracts where id = v_row.subcontract_id;
  if v_main_id <> auth.uid() then
    raise exception 'Only the main contractor on this sub-contract can review this RAMS.' using errcode = 'insufficient_privilege';
  end if;

  if v_row.status <> 'submitted' then
    raise exception 'Only a submitted RAMS can be reviewed.' using errcode = 'check_violation';
  end if;

  if not p_accept and (p_note is null or btrim(p_note) = '') then
    raise exception 'A note is required when returning a RAMS.' using errcode = 'check_violation';
  end if;

  if p_note is not null and char_length(p_note) > 1000 then
    raise exception 'The note must be 1000 characters or fewer.' using errcode = 'check_violation';
  end if;

  if p_accept then
    -- The version currently in force (if any) is superseded by this one.
    update public.subcontract_rams
    set status = 'superseded'
    where subcontract_id = v_row.subcontract_id
      and status = 'accepted'
      and id <> p_id;
  end if;

  update public.subcontract_rams
  set status = case when p_accept then 'accepted' else 'returned' end,
      reviewed_at = now(),
      reviewed_by = auth.uid(),
      review_note = p_note
  where id = p_id;

  select pk.title, pr.title into v_pkg_title, v_proj_title
  from public.project_subcontracts sc
  join public.project_packages pk on pk.id = sc.package_id
  join public.projects pr on pr.id = pk.project_id
  where sc.id = v_row.subcontract_id;

  select coalesce(company_name, full_name) into v_main_name
  from public.profiles where id = auth.uid();

  insert into public.notifications (user_id, title, message, type, reference_type, reference_id, is_read)
  values (
    v_row.author_id,
    'Sub-contract RAMS reviewed',
    case when p_accept
      then 'Your RAMS for "' || v_pkg_title || '" on "' || v_proj_title || '" was accepted by ' || coalesce(v_main_name, 'the main contractor') || '.'
      else 'Your RAMS for "' || v_pkg_title || '" on "' || v_proj_title || '" was returned by ' || coalesce(v_main_name, 'the main contractor') || '. Open it to read the note.'
    end,
    'subcontract_rams_reviewed',
    'project_subcontract',
    v_row.subcontract_id,
    false
  );
end;
$function$;

revoke all on function public.review_subcontract_rams(uuid, boolean, text) from public;
revoke all on function public.review_subcontract_rams(uuid, boolean, text) from anon;
grant execute on function public.review_subcontract_rams(uuid, boolean, text) to authenticated;


create or replace function public.revise_subcontract_rams(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_row public.subcontract_rams%rowtype;
  v_sc_status text;
  v_new_id uuid;
begin
  select * into v_row from public.subcontract_rams where id = p_id for update;
  if not found then
    raise exception 'RAMS not found.' using errcode = 'no_data_found';
  end if;

  if v_row.author_id <> auth.uid() then
    raise exception 'Only the author can revise this RAMS.' using errcode = 'insufficient_privilege';
  end if;

  if v_row.status not in ('returned', 'accepted') then
    raise exception 'Only a returned or accepted RAMS can be revised.' using errcode = 'check_violation';
  end if;

  select status into v_sc_status from public.project_subcontracts where id = v_row.subcontract_id;
  if v_sc_status <> 'accepted' then
    raise exception 'This sub-contract is no longer accepted.' using errcode = 'check_violation';
  end if;

  if exists (
    select 1 from public.subcontract_rams
    where subcontract_id = v_row.subcontract_id
      and status in ('draft', 'submitted')
  ) then
    raise exception 'A revision is already in progress.' using errcode = 'unique_violation';
  end if;

  -- The source row's status is left exactly as it was: an 'accepted'
  -- version stays in force (and stays 'accepted') until the revision
  -- itself is accepted (review_subcontract_rams supersedes it then); a
  -- 'returned' version simply stays 'returned'.
  insert into public.subcontract_rams (
    subcontract_id, author_id, version, supersedes_id, template_id,
    job_description, hazards, method_steps, ppe_requirements,
    emergency_procedures, additional_notes
  )
  values (
    v_row.subcontract_id, auth.uid(), v_row.version + 1, p_id, v_row.template_id,
    v_row.job_description, v_row.hazards, v_row.method_steps, v_row.ppe_requirements,
    v_row.emergency_procedures, v_row.additional_notes
  )
  returning id into v_new_id;

  return v_new_id;
end;
$function$;

revoke all on function public.revise_subcontract_rams(uuid) from public;
revoke all on function public.revise_subcontract_rams(uuid) from anon;
grant execute on function public.revise_subcontract_rams(uuid) to authenticated;

-- ------------------------------------------------------------
-- 4. Read function -- every column qualified to avoid the 42702
--    OUT-parameter ambiguity trap found in project_money.
-- ------------------------------------------------------------

create or replace function public.package_subcontractor_rams(p_project_id uuid)
returns table (
  subcontract_id uuid,
  rams_id uuid,
  rams_status text,
  rams_version integer,
  submitted_at timestamptz,
  in_force_version integer
)
language plpgsql
stable
security definer
set search_path = 'public'
as $function$
begin
  if not exists (
    select 1 from public.projects psr_pr
    where psr_pr.id = p_project_id
      and psr_pr.account_type = 'contractor'
      and psr_pr.posted_by = auth.uid()
  ) then
    raise exception 'Not authorised to view sub-contractor RAMS on this project.' using errcode = 'insufficient_privilege';
  end if;

  return query
  select
    psr_sc.id,
    psr_latest.id,
    psr_latest.status,
    psr_latest.version,
    psr_latest.submitted_at,
    psr_force.version
  from public.project_packages psr_pk
  join public.project_subcontracts psr_sc on psr_sc.package_id = psr_pk.id
  left join lateral (
    select psr_r.id, psr_r.status, psr_r.version, psr_r.submitted_at
    from public.subcontract_rams psr_r
    where psr_r.subcontract_id = psr_sc.id
      and psr_r.status <> 'draft'
    order by psr_r.version desc
    limit 1
  ) psr_latest on true
  left join lateral (
    select psr_f.version
    from public.subcontract_rams psr_f
    where psr_f.subcontract_id = psr_sc.id
      and psr_f.status = 'accepted'
    limit 1
  ) psr_force on true
  where psr_pk.project_id = p_project_id;
end;
$function$;

revoke all on function public.package_subcontractor_rams(uuid) from public;
revoke all on function public.package_subcontractor_rams(uuid) from anon;
grant execute on function public.package_subcontractor_rams(uuid) to authenticated;
