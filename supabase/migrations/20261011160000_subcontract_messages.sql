-- Projects slice 4, step 3c: messaging between the main contractor
-- and the subcontractor on a sub-contract.
--
-- One thread per project_subcontracts row, between main_contractor_id
-- and subcontractor_id only -- no customer, company member, team
-- member, other subcontractor or other contractor can read or write
-- it. Sending is allowed while the sub-contract is 'invited' or
-- 'accepted'; once 'declined' or 'cancelled' the thread is read-only
-- for both parties. Text only -- no attachments, no edit, no delete.
--
-- Deliberately untouched: job_conversations, job_messages,
-- job_message_notifications, is_conversation_party and their
-- policies. subcontract_messages is a separate table with its own
-- SELECT policy and its own SECURITY DEFINER write functions -- the
-- client has no write grant on it at all, as in 20261011120000
-- (project_subcontracts) and 20261011140000 (subcontract_rams).
--
-- No contact-detail sanitiser was found live for job_messages content
-- (20260807190000_gdpr_anonymise_and_notify_sanitize.sql only
-- overwrites content with a placeholder on GDPR anonymisation --
-- unrelated to filtering live message text), so none is invented
-- here either. send_subcontract_message stores content verbatim
-- (trimmed, length-checked only).
--
-- ============================================================
-- ROLLBACK (reverse order -- every object here is new, so rollback is drop)
-- ============================================================
-- DROP FUNCTION IF EXISTS public.subcontract_unread_counts();
-- DROP FUNCTION IF EXISTS public.mark_subcontract_messages_read(uuid);
-- DROP FUNCTION IF EXISTS public.send_subcontract_message(uuid, text);
-- DROP TABLE IF EXISTS public.subcontract_messages;
-- ============================================================

-- ------------------------------------------------------------
-- 1. Table
-- ------------------------------------------------------------
create table public.subcontract_messages (
  id uuid primary key default gen_random_uuid(),
  subcontract_id uuid not null references public.project_subcontracts(id) on delete cascade,
  sender_id uuid not null references public.profiles(id),
  content text not null check (btrim(content) <> '' and char_length(content) <= 4000),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.subcontract_messages is
  'One thread per project_subcontracts row, between its main_contractor_id and subcontractor_id only. Text only, no edit, no delete. Deliberately separate from job_conversations/job_messages.';

create index subcontract_messages_subcontract_created_idx
  on public.subcontract_messages (subcontract_id, created_at);

-- ------------------------------------------------------------
-- 2. RLS -- one direct SELECT policy, no write policy at all.
-- ------------------------------------------------------------
alter table public.subcontract_messages enable row level security;

create policy subcontract_messages_select on public.subcontract_messages
  for select
  using (
    exists (
      select 1 from public.project_subcontracts ps
      where ps.id = subcontract_messages.subcontract_id
        and (ps.main_contractor_id = auth.uid() or ps.subcontractor_id = auth.uid())
    )
  );

revoke all on public.subcontract_messages from anon;
revoke all on public.subcontract_messages from public;
revoke all on public.subcontract_messages from authenticated;
grant select on public.subcontract_messages to authenticated;

-- ------------------------------------------------------------
-- 3. Write functions -- SECURITY DEFINER, callers reach these only.
-- ------------------------------------------------------------

create or replace function public.send_subcontract_message(
  p_subcontract_id uuid,
  p_content text
)
returns uuid
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_sc           public.project_subcontracts%rowtype;
  v_recipient_id uuid;
  v_content      text;
  v_new_id       uuid;
  v_pkg_title    text;
  v_proj_title   text;
  v_sender_name  text;
begin
  select * into v_sc from public.project_subcontracts where id = p_subcontract_id for update;
  if not found then
    raise exception 'Sub-contract not found.' using errcode = 'no_data_found';
  end if;

  if auth.uid() <> v_sc.main_contractor_id and auth.uid() <> v_sc.subcontractor_id then
    raise exception 'You are not a party to this sub-contract.' using errcode = 'insufficient_privilege';
  end if;

  if v_sc.status not in ('invited', 'accepted') then
    raise exception 'This thread is closed.' using errcode = 'check_violation';
  end if;

  v_content := btrim(p_content);
  if v_content = '' then
    raise exception 'Message cannot be blank.' using errcode = 'check_violation';
  end if;
  if char_length(v_content) > 4000 then
    raise exception 'Message must be 4000 characters or fewer.' using errcode = 'check_violation';
  end if;

  v_recipient_id := case when auth.uid() = v_sc.main_contractor_id then v_sc.subcontractor_id else v_sc.main_contractor_id end;

  insert into public.subcontract_messages (subcontract_id, sender_id, content)
  values (p_subcontract_id, auth.uid(), v_content)
  returning id into v_new_id;

  select pk.title, pr.title into v_pkg_title, v_proj_title
  from public.project_packages pk
  join public.projects pr on pr.id = pk.project_id
  where pk.id = v_sc.package_id;

  select coalesce(company_name, full_name) into v_sender_name
  from public.profiles where id = auth.uid();

  -- Skip the insert if the recipient already has an unread
  -- subcontract_message notification for this sub-contract -- avoids a
  -- pile of identical unread notifications from a burst of messages.
  if not exists (
    select 1 from public.notifications
    where user_id = v_recipient_id
      and type = 'subcontract_message'
      and reference_id = p_subcontract_id
      and is_read = false
  ) then
    insert into public.notifications (user_id, title, message, type, reference_type, reference_id, is_read)
    values (
      v_recipient_id,
      'New message',
      coalesce(v_sender_name, 'The other party') || ' sent you a message about "' || v_pkg_title || '" on "' || v_proj_title || '"',
      'subcontract_message',
      'project_subcontract',
      p_subcontract_id,
      false
    );
  end if;

  return v_new_id;
end;
$function$;

revoke all on function public.send_subcontract_message(uuid, text) from public;
revoke all on function public.send_subcontract_message(uuid, text) from anon;
grant execute on function public.send_subcontract_message(uuid, text) to authenticated;


create or replace function public.mark_subcontract_messages_read(p_subcontract_id uuid)
returns integer
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_sc        public.project_subcontracts%rowtype;
  v_count     integer;
begin
  select * into v_sc from public.project_subcontracts where id = p_subcontract_id;
  if not found then
    raise exception 'Sub-contract not found.' using errcode = 'no_data_found';
  end if;

  if auth.uid() <> v_sc.main_contractor_id and auth.uid() <> v_sc.subcontractor_id then
    raise exception 'You are not a party to this sub-contract.' using errcode = 'insufficient_privilege';
  end if;

  update public.subcontract_messages
  set read_at = now()
  where subcontract_id = p_subcontract_id
    and sender_id <> auth.uid()
    and read_at is null;
  get diagnostics v_count = row_count;

  update public.notifications
  set is_read = true
  where user_id = auth.uid()
    and type = 'subcontract_message'
    and reference_id = p_subcontract_id
    and is_read = false;

  return v_count;
end;
$function$;

revoke all on function public.mark_subcontract_messages_read(uuid) from public;
revoke all on function public.mark_subcontract_messages_read(uuid) from anon;
grant execute on function public.mark_subcontract_messages_read(uuid) to authenticated;

-- ------------------------------------------------------------
-- 4. Read function -- every column qualified to avoid the 42702
--    OUT-parameter ambiguity trap found in project_money.
-- ------------------------------------------------------------

create or replace function public.subcontract_unread_counts()
returns table (
  subcontract_id uuid,
  unread integer
)
language sql
stable
security definer
set search_path = 'public'
as $function$
  select
    suc_sc.id,
    count(suc_m.id)::integer
  from public.project_subcontracts suc_sc
  join public.subcontract_messages suc_m on suc_m.subcontract_id = suc_sc.id
  where (suc_sc.main_contractor_id = auth.uid() or suc_sc.subcontractor_id = auth.uid())
    and suc_m.sender_id <> auth.uid()
    and suc_m.read_at is null
  group by suc_sc.id
  having count(suc_m.id) > 0;
$function$;

revoke all on function public.subcontract_unread_counts() from public;
revoke all on function public.subcontract_unread_counts() from anon;
grant execute on function public.subcontract_unread_counts() to authenticated;
