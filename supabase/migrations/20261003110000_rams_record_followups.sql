alter policy job_rams_insert on public.job_rams to authenticated;
alter policy job_rams_select on public.job_rams to authenticated;
alter policy job_rams_update on public.job_rams to authenticated;
alter policy rams_templates_select on public.rams_templates to authenticated;

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

  if (new.hazards is distinct from old.hazards
      or new.method_steps is distinct from old.method_steps
      or new.ppe_requirements is distinct from old.ppe_requirements
      or new.emergency_procedures is distinct from old.emergency_procedures
      or new.additional_notes is distinct from old.additional_notes
      or new.job_description is distinct from old.job_description
      or new.site_address is distinct from old.site_address
      or new.addr_line1 is distinct from old.addr_line1
      or new.addr_line2 is distinct from old.addr_line2
      or new.addr_city is distinct from old.addr_city
      or new.addr_region is distinct from old.addr_region
      or new.addr_postcode is distinct from old.addr_postcode
      or new.addr_country is distinct from old.addr_country)
     and new.pdf_generated_at is not distinct from old.pdf_generated_at then
    new.pdf_storage_path := null;
    new.pdf_generated_at := null;
  end if;

  if new.status = 'signed' and old.status <> 'signed' then
    if old.status <> 'tailored' then
      raise exception 'job_rams: only a tailored RAMS can be signed';
    end if;
    new.signed_off_at := now();
    new.signed_off_by := auth.uid();
  end if;

  return new;
end;
$$;

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
    false, null, null, 'draft', v_old.version + 1, v_old.id,
    v_old.addr_line1, v_old.addr_line2, v_old.addr_city, v_old.addr_region, v_old.addr_postcode, v_old.addr_country,
    v_old.addr_lat, v_old.addr_lng, v_old.addr_place_id
  )
  returning id into v_new_id;

  return v_new_id;
end;
$$;
