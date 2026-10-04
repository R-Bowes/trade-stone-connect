alter table public.job_rams
  add column if not exists version integer not null default 1,
  add column if not exists signed_off_by uuid references public.profiles(id),
  add column if not exists supersedes_id uuid references public.job_rams(id);

alter table public.job_rams drop constraint job_rams_job_id_key;

create unique index job_rams_one_live_per_job
  on public.job_rams (job_id) where status <> 'superseded';

alter table public.job_rams
  add constraint job_rams_job_version_key unique (job_id, version);

create or replace function public.job_rams_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.job_id is distinct from old.job_id
     or new.contractor_id is distinct from old.contractor_id
     or new.version is distinct from old.version
     or new.supersedes_id is distinct from old.supersedes_id then
    raise exception 'job_rams: job_id, contractor_id, version and supersedes_id are immutable';
  end if;
  if new.status = 'signed' and old.status <> 'signed' then
    new.signed_off_at := now();
    new.signed_off_by := auth.uid();
  end if;
  return new;
end;
$$;

create trigger job_rams_guard
  before update on public.job_rams
  for each row execute function public.job_rams_guard();

drop policy job_rams_insert on public.job_rams;
create policy job_rams_insert on public.job_rams
  for insert
  with check (
    (contractor_id = auth.uid() or contractor_id in (select acting_contractor_ids()))
    and status in ('draft', 'tailored')
    and exists (
      select 1 from public.jobs j
      where j.id = job_rams.job_id
        and j.contractor_id = job_rams.contractor_id
    )
  );

drop policy job_rams_select on public.job_rams;
create policy job_rams_select on public.job_rams
  for select
  using (
    contractor_id = auth.uid()
    or contractor_id in (select acting_contractor_ids())
    or (
      status in ('signed', 'superseded')
      and exists (
        select 1 from public.jobs j
        where j.id = job_rams.job_id
          and (
            j.customer_id = auth.uid()
            or (j.company_id is not null and is_company_member(j.company_id))
          )
      )
    )
  );

drop policy job_rams_update on public.job_rams;
create policy job_rams_update on public.job_rams
  for update
  using (
    (contractor_id = auth.uid() or contractor_id in (select acting_contractor_ids()))
    and status in ('draft', 'tailored')
  )
  with check (
    (contractor_id = auth.uid() or contractor_id in (select acting_contractor_ids()))
    and status in ('draft', 'tailored', 'signed')
  );

drop policy rams_templates_select on public.rams_templates;
create policy rams_templates_select on public.rams_templates
  for select
  using (
    owner_contractor_id is null
    or owner_contractor_id = auth.uid()
    or owner_contractor_id in (select acting_contractor_ids())
  );

create or replace function public.revise_job_rams(p_job_rams_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_old public.job_rams%rowtype;
  v_new_id uuid;
begin
  select * into v_old from public.job_rams where id = p_job_rams_id for update;
  if not found then
    raise exception 'RAMS not found';
  end if;
  if not (v_old.contractor_id = auth.uid()
          or v_old.contractor_id in (select acting_contractor_ids())) then
    raise exception 'Not authorised';
  end if;
  if v_old.status <> 'signed' then
    raise exception 'Only a signed RAMS can be revised';
  end if;

  update public.job_rams set status = 'superseded' where id = v_old.id;

  insert into public.job_rams (
    job_id, contractor_id, template_id, site_address, job_description,
    hazards, method_steps, ppe_requirements, emergency_procedures, additional_notes,
    tailored_for_job, tailored_at, tailored_by, status, version, supersedes_id,
    addr_line1, addr_line2, addr_city, addr_region, addr_postcode, addr_country,
    addr_lat, addr_lng, addr_place_id
  ) values (
    v_old.job_id, v_old.contractor_id, v_old.template_id, v_old.site_address, v_old.job_description,
    v_old.hazards, v_old.method_steps, v_old.ppe_requirements, v_old.emergency_procedures, v_old.additional_notes,
    v_old.tailored_for_job, v_old.tailored_at, v_old.tailored_by, 'draft', v_old.version + 1, v_old.id,
    v_old.addr_line1, v_old.addr_line2, v_old.addr_city, v_old.addr_region, v_old.addr_postcode, v_old.addr_country,
    v_old.addr_lat, v_old.addr_lng, v_old.addr_place_id
  )
  returning id into v_new_id;

  return v_new_id;
end;
$$;

revoke all on function public.revise_job_rams(uuid) from public, anon;
grant execute on function public.revise_job_rams(uuid) to authenticated;
