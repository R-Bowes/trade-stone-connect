-- Projects slice 4, step 3a: sub-contracting, invite and view.
-- Coordination only -- no prices, no invoices, no payments, no CIS.
-- A contractor who owns a contractor-type project and has a job attached
-- to one of its packages can invite another contractor (by TS-C code) to
-- work that phase. The subcontractor sees phase/scope/dates, the site
-- address, the customer's display name, the other phases on the project
-- and who is doing them, and the main contractor's SIGNED RAMS for that
-- job (and its PDF). They see nothing else: no contract_value, allowance,
-- invoice/quote figures, customer phone/email, or draft/tailored RAMS.
--
-- Deliberately untouched: public.subcontracts, public.contracts,
-- SubcontractManagement.tsx, team_members, acting_contractor_ids(),
-- job_assignments, and every existing jobs policy.
--
-- Display/lookup of the other party reads public.profiles directly, not
-- public_pro_profiles: that view also gates on profile_is_published = true
-- (a public-directory concern), which has no bearing on whether an active
-- contractor can be invited to, or named within, a private subcontract.
-- Found live during the rolled-back proof: the real second test contractor
-- has no published public profile, so public_pro_profiles returned zero
-- rows for them and the invite lookup failed outright.
--
-- ============================================================
-- ROLLBACK (reverse order -- every object here is new, so rollback is drop)
-- ============================================================
-- DROP POLICY IF EXISTS job_rams_select_subcontractor ON public.job_rams;
-- DROP FUNCTION IF EXISTS public.has_accepted_subcontract_on_job(uuid);
-- DROP FUNCTION IF EXISTS public.package_subcontractors(uuid);
-- DROP FUNCTION IF EXISTS public.subcontract_project_phases(uuid);
-- DROP FUNCTION IF EXISTS public.subcontract_detail(uuid);
-- DROP FUNCTION IF EXISTS public.my_subcontract_work();
-- DROP FUNCTION IF EXISTS public.find_contractor_by_ts_code(text);
-- DROP FUNCTION IF EXISTS public.cancel_project_subcontract(uuid);
-- DROP FUNCTION IF EXISTS public.respond_to_subcontract_invite(uuid, boolean, text);
-- DROP FUNCTION IF EXISTS public.invite_subcontractor(uuid, text, text, date, date);
-- DROP TRIGGER IF EXISTS update_project_subcontracts_updated_at ON public.project_subcontracts;
-- DROP TABLE IF EXISTS public.project_subcontracts;
-- ============================================================

-- ------------------------------------------------------------
-- 1. Table
-- ------------------------------------------------------------
create table public.project_subcontracts (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.project_packages(id) on delete cascade,
  main_contractor_id uuid not null references public.profiles(id),
  subcontractor_id uuid not null references public.profiles(id),
  scope text not null,
  starts_on date,
  ends_on date,
  status text not null default 'invited' check (status in ('invited', 'accepted', 'declined', 'cancelled')),
  response_note text,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_subcontracts_scope_not_blank check (btrim(scope) <> ''),
  constraint project_subcontracts_scope_length check (char_length(scope) <= 2000),
  constraint project_subcontracts_response_note_length check (response_note is null or char_length(response_note) <= 500),
  constraint project_subcontracts_parties_distinct check (subcontractor_id <> main_contractor_id),
  constraint project_subcontracts_dates_order check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

comment on table public.project_subcontracts is
  'Coordination only: scope, dates, status. Step 5 adds subcontract payments elsewhere -- do not add a value/money column to this table.';

create unique index project_subcontracts_live_pair_uidx
  on public.project_subcontracts (package_id, subcontractor_id)
  where status in ('invited', 'accepted');

create index project_subcontracts_subcontractor_status_idx
  on public.project_subcontracts (subcontractor_id, status);

create trigger update_project_subcontracts_updated_at
  before update on public.project_subcontracts
  for each row execute function public.update_updated_at_column();

-- ------------------------------------------------------------
-- 2. RLS -- one direct SELECT policy, no write policy at all.
-- ------------------------------------------------------------
alter table public.project_subcontracts enable row level security;

create policy project_subcontracts_select on public.project_subcontracts
  for select
  using (main_contractor_id = auth.uid() or subcontractor_id = auth.uid());

revoke all on public.project_subcontracts from anon;
revoke all on public.project_subcontracts from public;
revoke all on public.project_subcontracts from authenticated;
grant select on public.project_subcontracts to authenticated;

-- ------------------------------------------------------------
-- 3. Write functions -- SECURITY DEFINER, callers reach these only.
-- ------------------------------------------------------------

create or replace function public.invite_subcontractor(
  p_package_id uuid,
  p_ts_code text,
  p_scope text,
  p_starts_on date,
  p_ends_on date
)
returns uuid
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_pkg               public.project_packages%rowtype;
  v_project_account   text;
  v_project_posted_by uuid;
  v_project_status    text;
  v_project_title      text;
  v_job_contractor_id uuid;
  v_sub_id            uuid;
  v_sub_user_type     text;
  v_sub_is_active     boolean;
  v_new_id            uuid;
begin
  select * into v_pkg from public.project_packages where id = p_package_id for update;
  if not found then
    raise exception 'Package not found.' using errcode = 'no_data_found';
  end if;

  select account_type, posted_by, status, title
    into v_project_account, v_project_posted_by, v_project_status, v_project_title
  from public.projects
  where id = v_pkg.project_id;

  if v_project_account <> 'contractor' or v_project_posted_by <> auth.uid() then
    raise exception 'You do not own this project.' using errcode = 'insufficient_privilege';
  end if;

  if v_project_status in ('completed', 'cancelled') then
    raise exception 'This project is % and cannot take new sub-contract invites.', v_project_status
      using errcode = 'check_violation';
  end if;

  if v_pkg.job_id is null then
    raise exception 'Attach a job to this phase first.' using errcode = 'check_violation';
  end if;

  select contractor_id into v_job_contractor_id from public.jobs where id = v_pkg.job_id;
  if v_job_contractor_id is distinct from auth.uid() then
    raise exception 'You are not the contractor on this phase''s job.' using errcode = 'insufficient_privilege';
  end if;

  if p_scope is null or btrim(p_scope) = '' then
    raise exception 'Scope is required.' using errcode = 'check_violation';
  end if;

  if char_length(p_scope) > 2000 then
    raise exception 'Scope must be 2000 characters or fewer.' using errcode = 'check_violation';
  end if;

  -- Read profiles directly, not public_pro_profiles: that view also
  -- gates on profile_is_published (a public-directory concern), which
  -- has no bearing on whether an active contractor account can be
  -- invited to subcontract work.
  select id, user_type, is_active into v_sub_id, v_sub_user_type, v_sub_is_active
  from public.profiles
  where upper(ts_profile_code) = upper(btrim(p_ts_code));

  if v_sub_id is null or v_sub_user_type <> 'contractor' or v_sub_is_active is distinct from true then
    raise exception 'That TS code is not an active contractor profile.' using errcode = 'no_data_found';
  end if;

  if v_sub_id = auth.uid() then
    raise exception 'You cannot invite yourself.' using errcode = 'check_violation';
  end if;

  if exists (
    select 1 from public.project_subcontracts
    where package_id = p_package_id
      and subcontractor_id = v_sub_id
      and status in ('invited', 'accepted')
  ) then
    raise exception 'An invite already exists for this subcontractor on this phase.' using errcode = 'unique_violation';
  end if;

  insert into public.project_subcontracts (package_id, main_contractor_id, subcontractor_id, scope, starts_on, ends_on)
  values (p_package_id, auth.uid(), v_sub_id, btrim(p_scope), p_starts_on, p_ends_on)
  returning id into v_new_id;

  insert into public.notifications (user_id, title, message, type, reference_type, reference_id, is_read)
  values (
    v_sub_id,
    'Sub-contract invitation',
    'You''ve been invited to work "' || v_pkg.title || '" on "' || v_project_title || '"',
    'subcontract_invite',
    'project_subcontract',
    v_new_id,
    false
  );

  return v_new_id;
end;
$function$;

revoke all on function public.invite_subcontractor(uuid, text, text, date, date) from public;
revoke all on function public.invite_subcontractor(uuid, text, text, date, date) from anon;
grant execute on function public.invite_subcontractor(uuid, text, text, date, date) to authenticated;


create or replace function public.respond_to_subcontract_invite(
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
  v_row         public.project_subcontracts%rowtype;
  v_pkg_title   text;
  v_proj_title  text;
  v_sub_name    text;
begin
  select * into v_row from public.project_subcontracts where id = p_id for update;
  if not found then
    raise exception 'Invite not found.' using errcode = 'no_data_found';
  end if;

  if v_row.subcontractor_id <> auth.uid() then
    raise exception 'Not authorised to respond to this invite.' using errcode = 'insufficient_privilege';
  end if;

  if v_row.status <> 'invited' then
    raise exception 'This invite has already been responded to.' using errcode = 'check_violation';
  end if;

  if p_note is not null and char_length(p_note) > 500 then
    raise exception 'Note must be 500 characters or fewer.' using errcode = 'check_violation';
  end if;

  update public.project_subcontracts
  set status = case when p_accept then 'accepted' else 'declined' end,
      responded_at = now(),
      response_note = p_note
  where id = p_id;

  select pk.title, pr.title into v_pkg_title, v_proj_title
  from public.project_packages pk
  join public.projects pr on pr.id = pk.project_id
  where pk.id = v_row.package_id;

  select coalesce(company_name, full_name) into v_sub_name
  from public.profiles where id = v_row.subcontractor_id;

  insert into public.notifications (user_id, title, message, type, reference_type, reference_id, is_read)
  values (
    v_row.main_contractor_id,
    'Sub-contract response',
    coalesce(v_sub_name, 'A subcontractor') || ' ' || (case when p_accept then 'accepted' else 'declined' end)
      || ' your invite to "' || v_pkg_title || '" on "' || v_proj_title || '"',
    'subcontract_response',
    'project_subcontract',
    p_id,
    false
  );
end;
$function$;

revoke all on function public.respond_to_subcontract_invite(uuid, boolean, text) from public;
revoke all on function public.respond_to_subcontract_invite(uuid, boolean, text) from anon;
grant execute on function public.respond_to_subcontract_invite(uuid, boolean, text) to authenticated;


create or replace function public.cancel_project_subcontract(p_id uuid)
returns void
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_row         public.project_subcontracts%rowtype;
  v_pkg_title   text;
  v_proj_title  text;
  v_main_name   text;
begin
  select * into v_row from public.project_subcontracts where id = p_id for update;
  if not found then
    raise exception 'Sub-contract not found.' using errcode = 'no_data_found';
  end if;

  if v_row.main_contractor_id <> auth.uid() then
    raise exception 'Not authorised to cancel this sub-contract.' using errcode = 'insufficient_privilege';
  end if;

  if v_row.status not in ('invited', 'accepted') then
    raise exception 'This sub-contract cannot be cancelled from its current status.' using errcode = 'check_violation';
  end if;

  update public.project_subcontracts
  set status = 'cancelled'
  where id = p_id;

  select pk.title, pr.title into v_pkg_title, v_proj_title
  from public.project_packages pk
  join public.projects pr on pr.id = pk.project_id
  where pk.id = v_row.package_id;

  select coalesce(company_name, full_name) into v_main_name
  from public.profiles where id = v_row.main_contractor_id;

  insert into public.notifications (user_id, title, message, type, reference_type, reference_id, is_read)
  values (
    v_row.subcontractor_id,
    'Sub-contract cancelled',
    'Your sub-contract for "' || v_pkg_title || '" on "' || v_proj_title || '" was cancelled by '
      || coalesce(v_main_name, 'the main contractor') || '.',
    'subcontract_cancelled',
    'project_subcontract',
    p_id,
    false
  );
end;
$function$;

revoke all on function public.cancel_project_subcontract(uuid) from public;
revoke all on function public.cancel_project_subcontract(uuid) from anon;
grant execute on function public.cancel_project_subcontract(uuid) to authenticated;

-- ------------------------------------------------------------
-- 4. Read functions -- every CTE column tagged and qualified to avoid
--    the 42702 OUT-parameter ambiguity trap found in project_money.
-- ------------------------------------------------------------

create or replace function public.my_subcontract_work()
returns table (
  id uuid,
  status text,
  project_title text,
  phase_title text,
  trade text,
  main_contractor_name text,
  scope text,
  starts_on date,
  ends_on date
)
language sql
stable
security definer
set search_path = 'public'
as $function$
  select
    msw_sc.id,
    msw_sc.status,
    msw_pr.title,
    msw_pk.title,
    msw_pk.trade,
    coalesce(msw_mc.company_name, msw_mc.full_name),
    msw_sc.scope,
    msw_sc.starts_on,
    msw_sc.ends_on
  from public.project_subcontracts msw_sc
  join public.project_packages msw_pk on msw_pk.id = msw_sc.package_id
  join public.projects msw_pr on msw_pr.id = msw_pk.project_id
  join public.profiles msw_mc on msw_mc.id = msw_sc.main_contractor_id
  where msw_sc.subcontractor_id = auth.uid()
    and msw_sc.status in ('invited', 'accepted')
  order by msw_sc.created_at desc;
$function$;

revoke all on function public.my_subcontract_work() from public;
revoke all on function public.my_subcontract_work() from anon;
grant execute on function public.my_subcontract_work() to authenticated;


create or replace function public.subcontract_detail(p_id uuid)
returns table (
  id uuid,
  status text,
  project_title text,
  phase_title text,
  trade text,
  main_contractor_name text,
  scope text,
  starts_on date,
  ends_on date,
  needed_from date,
  needed_to date,
  job_status text,
  job_start_date date,
  job_end_date date,
  site_addr_line1 text,
  site_addr_line2 text,
  site_addr_city text,
  site_addr_region text,
  site_addr_postcode text,
  site_addr_country text,
  customer_name text,
  rams_id uuid,
  rams_version integer,
  rams_signed_off_at timestamptz
)
language plpgsql
stable
security definer
set search_path = 'public'
as $function$
begin
  if not exists (
    select 1 from public.project_subcontracts sd_sc
    where sd_sc.id = p_id
      and sd_sc.subcontractor_id = auth.uid()
      and sd_sc.status = 'accepted'
  ) then
    raise exception 'Not authorised to view this sub-contract.' using errcode = 'insufficient_privilege';
  end if;

  return query
  select
    sd_sc.id,
    sd_sc.status,
    sd_pr.title,
    sd_pk.title,
    sd_pk.trade,
    coalesce(sd_mc.company_name, sd_mc.full_name),
    sd_sc.scope,
    sd_sc.starts_on,
    sd_sc.ends_on,
    sd_pk.needed_from,
    sd_pk.needed_to,
    sd_j.status,
    sd_j.start_date,
    sd_j.end_date,
    sd_j.addr_line1,
    sd_j.addr_line2,
    sd_j.addr_city,
    sd_j.addr_region,
    sd_j.addr_postcode,
    sd_j.addr_country,
    coalesce(sd_comp.name, sd_cust.full_name),
    sd_rams.id,
    sd_rams.version,
    sd_rams.signed_off_at
  from public.project_subcontracts sd_sc
  join public.project_packages sd_pk on sd_pk.id = sd_sc.package_id
  join public.projects sd_pr on sd_pr.id = sd_pk.project_id
  join public.profiles sd_mc on sd_mc.id = sd_sc.main_contractor_id
  left join public.jobs sd_j on sd_j.id = sd_pk.job_id
  left join public.profiles sd_cust on sd_cust.id = sd_j.customer_id
  left join public.companies sd_comp on sd_comp.id = sd_j.company_id
  left join public.job_rams sd_rams on sd_rams.job_id = sd_j.id and sd_rams.status = 'signed'
  where sd_sc.id = p_id;
end;
$function$;

revoke all on function public.subcontract_detail(uuid) from public;
revoke all on function public.subcontract_detail(uuid) from anon;
grant execute on function public.subcontract_detail(uuid) to authenticated;


create or replace function public.subcontract_project_phases(p_id uuid)
returns table (
  package_id uuid,
  title text,
  trade text,
  needed_from date,
  needed_to date,
  job_status text,
  main_contractor_name text,
  subcontractor_names text
)
language plpgsql
stable
security definer
set search_path = 'public'
as $function$
declare
  v_project_id uuid;
begin
  select spp_pk.project_id into v_project_id
  from public.project_subcontracts spp_sc
  join public.project_packages spp_pk on spp_pk.id = spp_sc.package_id
  where spp_sc.id = p_id
    and spp_sc.subcontractor_id = auth.uid()
    and spp_sc.status = 'accepted';

  if v_project_id is null then
    raise exception 'Not authorised to view this project.' using errcode = 'insufficient_privilege';
  end if;

  return query
  select
    spp2_pk.id,
    spp2_pk.title,
    spp2_pk.trade,
    spp2_pk.needed_from,
    spp2_pk.needed_to,
    spp2_j.status,
    case when spp2_j.id is not null then coalesce(spp2_mc.company_name, spp2_mc.full_name) else null end,
    (
      select string_agg(coalesce(spp2_sub.company_name, spp2_sub.full_name), ', ' order by spp2_subrow.created_at)
      from public.project_subcontracts spp2_subrow
      join public.profiles spp2_sub on spp2_sub.id = spp2_subrow.subcontractor_id
      where spp2_subrow.package_id = spp2_pk.id
        and spp2_subrow.status = 'accepted'
    )
  from public.project_packages spp2_pk
  left join public.jobs spp2_j on spp2_j.id = spp2_pk.job_id
  left join public.profiles spp2_mc on spp2_mc.id = spp2_j.contractor_id
  where spp2_pk.project_id = v_project_id;
end;
$function$;

revoke all on function public.subcontract_project_phases(uuid) from public;
revoke all on function public.subcontract_project_phases(uuid) from anon;
grant execute on function public.subcontract_project_phases(uuid) to authenticated;


create or replace function public.package_subcontractors(p_project_id uuid)
returns table (
  package_id uuid,
  subcontract_id uuid,
  subcontractor_name text,
  subcontractor_ts_code text,
  scope text,
  starts_on date,
  ends_on date,
  status text,
  response_note text
)
language plpgsql
stable
security definer
set search_path = 'public'
as $function$
begin
  if not exists (
    select 1 from public.projects psub_pr
    where psub_pr.id = p_project_id
      and psub_pr.account_type = 'contractor'
      and psub_pr.posted_by = auth.uid()
  ) then
    raise exception 'Not authorised to view sub-contractors on this project.' using errcode = 'insufficient_privilege';
  end if;

  return query
  select
    psub_pk.id,
    psub_sc.id,
    coalesce(psub_sub.company_name, psub_sub.full_name),
    psub_sub.ts_profile_code,
    psub_sc.scope,
    psub_sc.starts_on,
    psub_sc.ends_on,
    psub_sc.status,
    psub_sc.response_note
  from public.project_packages psub_pk
  join public.project_subcontracts psub_sc on psub_sc.package_id = psub_pk.id
  join public.profiles psub_sub on psub_sub.id = psub_sc.subcontractor_id
  where psub_pk.project_id = p_project_id
  order by psub_pk.sort_order, psub_sc.created_at;
end;
$function$;

revoke all on function public.package_subcontractors(uuid) from public;
revoke all on function public.package_subcontractors(uuid) from anon;
grant execute on function public.package_subcontractors(uuid) to authenticated;


-- Lookup for the invite dialog's "check" step: exact TS-C code match
-- only (no pattern matching), reading profiles directly so an
-- unpublished contractor can still be found and invited. Returns at
-- most one row, and only for an active contractor who is not the
-- caller -- the same eligibility invite_subcontractor itself enforces,
-- so the dialog's confirm step can never show a name that the actual
-- invite would then refuse.
create or replace function public.find_contractor_by_ts_code(p_ts_code text)
returns table (
  display_name text,
  ts_code text
)
language plpgsql
stable
security definer
set search_path = 'public'
as $function$
declare
  v_caller_type   text;
  v_caller_active boolean;
begin
  select user_type, is_active into v_caller_type, v_caller_active
  from public.profiles where id = auth.uid();

  if v_caller_type <> 'contractor' or v_caller_active is distinct from true then
    raise exception 'Only an active contractor can look up a TS code.' using errcode = 'insufficient_privilege';
  end if;

  return query
  select coalesce(fcbt.company_name, fcbt.full_name), fcbt.ts_profile_code
  from public.profiles fcbt
  where upper(fcbt.ts_profile_code) = upper(btrim(p_ts_code))
    and fcbt.user_type = 'contractor'
    and fcbt.is_active = true
    and fcbt.id <> auth.uid();
end;
$function$;

revoke all on function public.find_contractor_by_ts_code(text) from public;
revoke all on function public.find_contractor_by_ts_code(text) from anon;
grant execute on function public.find_contractor_by_ts_code(text) to authenticated;

-- ------------------------------------------------------------
-- 5. RAMS read -- a new permissive SELECT policy, additive only.
--    job_rams_select is untouched. The helper is SECURITY DEFINER and
--    reads only project_subcontracts/project_packages, never job_rams,
--    so it cannot form a policy cycle.
-- ------------------------------------------------------------

create or replace function public.has_accepted_subcontract_on_job(p_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = 'public'
as $function$
  select exists (
    select 1
    from public.project_subcontracts hsc_sc
    join public.project_packages hsc_pk on hsc_pk.id = hsc_sc.package_id
    where hsc_pk.job_id = p_job_id
      and hsc_sc.subcontractor_id = auth.uid()
      and hsc_sc.status = 'accepted'
  );
$function$;

revoke all on function public.has_accepted_subcontract_on_job(uuid) from public;
revoke all on function public.has_accepted_subcontract_on_job(uuid) from anon;
grant execute on function public.has_accepted_subcontract_on_job(uuid) to authenticated;

create policy job_rams_select_subcontractor on public.job_rams
  for select
  using (status = 'signed' and public.has_accepted_subcontract_on_job(job_rams.job_id));
