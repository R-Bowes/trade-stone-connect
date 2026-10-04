-- Profiles exposure, stage 1, migration 1 of 2 (additive only).
--
-- Adds the access paths the frontend needs BEFORE the column lock
-- (migration 2) revokes table-wide SELECT on public.profiles:
--   1. my_profile                   — the caller's own full row
--   2. get_job_customer_phone       — field job page Call button
--   3. lookup_ts_codes_by_email     — contractor invoice/contract/CRM linking
--   4. get_company_member_contacts  — business team roster
--   5. admin_list_profiles          — admin dashboard
-- Nothing here changes any existing grant, policy or row. Safe to push on
-- its own; the existing USING (true) SELECT policy is untouched.

-- ── 1. my_profile ────────────────────────────────────────────────────────────
-- Owner-run view (not security_invoker): reads past the column lock that
-- migration 2 adds, so its WHERE clause is the whole access gate (CLAUDE.md
-- view idiom 1). security_barrier stops caller-supplied filters being
-- evaluated against other users' rows before the WHERE applies.
create view public.my_profile
  with (security_barrier = true)
as
  select *
  from public.profiles
  where user_id = auth.uid();

-- Read-only. Supabase's default privileges grant ALL on new relations to
-- anon and authenticated, and a simple view like this one is
-- auto-updatable — an UPDATE through it would run as the view owner and
-- skip profiles' RLS and any column protection (is_verified, user_type,
-- stripe_* …). So revoke everything from everyone and grant back SELECT
-- only. All writes stay on public.profiles under its own policies.
revoke all on public.my_profile from public, anon, authenticated;
grant select on public.my_profile to authenticated;

-- ── 2. get_job_customer_phone ────────────────────────────────────────────────
-- Comms invariant exception (NOW.md): the customer's phone is shown to the
-- contractor and their team on the field job page for a confirmed job that
-- is not yet complete. Null in every other case — no error, so the caller
-- cannot distinguish "not allowed" from "no phone on file".
create or replace function public.get_job_customer_phone(p_job_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.phone
  from public.jobs j
  join public.profiles p on p.id = j.customer_id
  where j.id = p_job_id
    and j.contractor_id in (select public.acting_contractor_ids())
    and j.status in ('scheduled', 'in_progress', 'snagging');
$$;

-- ── 3. lookup_ts_codes_by_email ──────────────────────────────────────────────
-- Contractor-only. Exact email match, as the existing client queries do.
-- Capped at 50 emails per call to keep it from being an enumeration tool.
create or replace function public.lookup_ts_codes_by_email(p_emails text[])
returns table (email text, ts_profile_code text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles me
    where me.id = auth.uid() and me.user_type = 'contractor'
  ) then
    raise exception 'lookup_ts_codes_by_email: contractors only';
  end if;

  if coalesce(array_length(p_emails, 1), 0) > 50 then
    raise exception 'lookup_ts_codes_by_email: at most 50 emails per call';
  end if;

  return query
    select p.email::text, p.ts_profile_code::text
    from public.profiles p
    where p.email = any (p_emails);
end;
$$;

-- ── 4. get_company_member_contacts ───────────────────────────────────────────
-- Business team roster: active members' name, email and TS code, for anyone
-- who is themselves a member (or the owner) of that company.
create or replace function public.get_company_member_contacts(p_company_id uuid)
returns table (profile_id uuid, full_name text, email text, ts_profile_code text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_company_member(p_company_id) then
    raise exception 'get_company_member_contacts: not a member of this company';
  end if;

  return query
    select p.id, p.full_name::text, p.email::text, p.ts_profile_code::text
    from public.business_members bm
    join public.profiles p on p.id = bm.profile_id
    where bm.company_id = p_company_id
      and bm.status = 'active';
end;
$$;

-- ── 5. admin_list_profiles ───────────────────────────────────────────────────
create or replace function public.admin_list_profiles()
returns setof public.profiles
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'admin_list_profiles: platform admins only';
  end if;

  return query
    select * from public.profiles order by created_at desc;
end;
$$;

-- ── 6. Execute grants ────────────────────────────────────────────────────────
revoke execute on function public.get_job_customer_phone(uuid) from public, anon;
revoke execute on function public.lookup_ts_codes_by_email(text[]) from public, anon;
revoke execute on function public.get_company_member_contacts(uuid) from public, anon;
revoke execute on function public.admin_list_profiles() from public, anon;

grant execute on function public.get_job_customer_phone(uuid) to authenticated;
grant execute on function public.lookup_ts_codes_by_email(text[]) to authenticated;
grant execute on function public.get_company_member_contacts(uuid) to authenticated;
grant execute on function public.admin_list_profiles() to authenticated;
