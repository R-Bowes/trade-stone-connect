-- Quote a customer by TS code, with no enquiry (direct-quote design rev 5,
-- 20 Oct 2026), plus the search_customers privacy fix it depends on.
--
-- 1. enquiries: customer_id and company_id are fixed once written.
--    authenticated holds UPDATE on the whole table, and the contractor's
--    UPDATE policy only checks contractor_id = auth.uid(), so a contractor
--    could point an enquiry they had received at any customer and so fake
--    "an enquiry the customer sent" (found 21 Oct). Nothing legitimately
--    changes either column: no client update (src/), no edge function, and
--    the only SQL writers of enquiries are anonymise_user (name/email/phone)
--    and mirror_recipient_status_to_enquiry (status); there is no
--    guest-enquiry claim path. Only the service role, a platform admin and
--    SECURITY DEFINER code (none of which changes them today; the pre-flight
--    pins that list) may change them.
--    enquiry_recipients.enquiry_id and contractor_id get the same guard, for
--    the same reason: the contractor's UPDATE policy plus a whole-table
--    UPDATE grant let a contractor move their recipient row onto any
--    enquiry. Client inserts are already closed (RLS, no INSERT policy;
--    add_enquiry_recipient checks the caller is the customer). Writers
--    change status and reason fields only: RejectDialog/RespondDialog
--    (client), decline_quote, accept_quote_with_slot,
--    mirror_enquiry_status_to_recipient.
-- 2. _customer_relationship(contractor, customer): the customer-participated
--    relationship test. "Sent this contractor" means enquiries.contractor_id
--    (single-contractor flow) or an enquiry_recipients row (the compare flow,
--    send-quote-notification-multi, leaves contractor_id NULL). True when
--    the customer:
--      - sent this contractor an enquiry (directly, or as a company they own);
--      - accepted a quote from this contractor (recipient_response or status
--        'accepted' are server-written only, by the customer's own accept);
--      - received a B2B invoice from this contractor for a company they own
--        (invoices.company_id is set only by generate_b2b_invoice, from
--        work the business approved; contractor inserts must leave it NULL).
--    A job whose issued_quote_id is an accepted quote of the same contractor
--    AND the same recipient, and an invoice linked to such a job or quote,
--    also qualify; both imply the accepted-quote arm, so they need no arm of
--    their own. Contractor-created quotes of any other status, jobs with no
--    such quote (jobs has no reliable creator column; issued_quote_id,
--    customer_id and company_id are contractor-settable) and draft or
--    standalone invoices do not count.
-- 3. search_customers: that test, evaluated for every contractor the caller
--    acts for (acting_contractor_ids()), governs the name, name search and
--    address. Exact-code lookup without a relationship returns a masked name
--    ("Sarah J."; "TradeStone customer" when there is no name) and no
--    address. The mask is cosmetic (profiles names are readable by any
--    signed-in user); the address protection is real.
-- 4. issued_quotes.decline_reason_code: written by decline_quote when the
--    quote has no enquiry (an enquiry quote keeps its reason on
--    enquiry_recipients). New code 'not_requested' ("I didn't ask for
--    this"), accepted by decline_quote for no-enquiry quotes only, and added
--    to enquiry_recipients_decline_reason_code_check as the brief asks.
--    NULL on insert (lock guard); no client grant.
-- 5. issued_quotes_direct_recipient_guard (BEFORE INSERT, only when
--    enquiry_id IS NULL AND parent_quote_id IS NULL): one contractor at a
--    time (advisory lock), a personal recipient who is not a team member,
--    and at most 10 distinct no-enquiry recipients per contractor per
--    Europe/London day, unless the recipient already has a relationship or
--    was already quoted that way today. Only recipients with no
--    relationship use a slot. Revisions never reach it.
-- 6. issued_quotes_binding_guard (BEFORE INSERT, enquiry or parent set):
--    without it the limit in 5 is skipped by naming any enquiry id, or by
--    revising a quote to a different customer. A revision keeps its parent's
--    recipient and enquiry; a quote on an enquiry must be on an enquiry sent
--    to this contractor (contractor_id or an enquiry_recipients row, as in
--    2), and go to that enquiry's customer when it has one. Checked against
--    the quote's own contractor_id, not acting_contractor_ids(): the quote
--    belongs to that contractor (the INSERT policy pins it to auth.uid()),
--    and a caller who is also on another contractor's team must not quote
--    that contractor's enquiries under their own name.
--    A guest enquiry (customer_id NULL; 0 live on 21 Oct) still lets the
--    contractor pick the recipient, as SendQuoteDialog does today.
--
-- Live checks, 21 Oct 2026: 53 issued_quotes columns; 7 quotes with no
-- enquiry (all to personal accounts, historic: no current client path
-- inserts one); 0 quotes whose enquiry belongs to another contractor or
-- another customer; 0 revisions with a different recipient or enquiry;
-- 0 compare-flow enquiries (contractor_id NULL), so 0 quotes from them;
-- 23 enquiry_recipients rows.
-- No existing issued_quotes INSERT policy is changed.
--
-- ROLLBACK (in this order):
--   drop trigger issued_quotes_binding_guard_trigger on public.issued_quotes;
--   drop trigger issued_quotes_direct_recipient_guard_trigger on public.issued_quotes;
--   drop function public.issued_quotes_binding_guard();
--   drop function public.issued_quotes_direct_recipient_guard();
--   re-run section 3 of 20261020130000_quote_send_checks.sql (lock guard);
--   recreate decline_quote from the body recorded in this file's pre-flight
--     (the four-code list, no issued_quotes reason write);
--   alter table public.enquiry_recipients drop constraint enquiry_recipients_decline_reason_code_check;
--   alter table public.enquiry_recipients add constraint enquiry_recipients_decline_reason_code_check
--     check (decline_reason_code is null or decline_reason_code = any (array['price','timing','went_elsewhere','changed_mind','auto_accepted_another']));
--   alter table public.issued_quotes drop column decline_reason_code;
--   re-run section 2 of 20261012140000_customer_search.sql (search_customers);
--   drop function public._mask_customer_name(text);
--   drop function public._customer_relationship(uuid, uuid);
--   drop trigger enquiry_recipients_party_guard_trigger on public.enquiry_recipients;
--   drop trigger enquiries_party_guard_trigger on public.enquiries;
--   drop function public.enquiries_party_guard();

-- ── 0. Pre-flight ────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_names text[];
  v_count integer;
BEGIN
  -- Bodies being replaced are the ones this migration was written against.
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'search_customers'
                 AND pronamespace = 'public'::regnamespace AND position('AS has_rel' IN prosrc) > 0) THEN
    RAISE EXCEPTION 'search_customers is not the 20261012140000 version; review drift';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'decline_quote'
                 AND pronamespace = 'public'::regnamespace
                 AND position('NOT IN (''price'', ''timing'', ''went_elsewhere'', ''changed_mind'')' IN prosrc) > 0) THEN
    RAISE EXCEPTION 'decline_quote reason list is not the expected one; review drift';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'issued_quotes_lock_guard'
                 AND position('_quote_figures_problem' IN prosrc) > 0
                 AND position('decline_reason_code' IN prosrc) = 0) THEN
    RAISE EXCEPTION 'issued_quotes_lock_guard is not the 20261020130000 version; review drift';
  END IF;
  IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'enquiry_recipients_decline_reason_code_check')
     IS DISTINCT FROM 'CHECK (((decline_reason_code IS NULL) OR (decline_reason_code = ANY (ARRAY[''price''::text, ''timing''::text, ''went_elsewhere''::text, ''changed_mind''::text, ''auto_accepted_another''::text]))))' THEN
    RAISE EXCEPTION 'enquiry_recipients_decline_reason_code_check is not the expected definition; review drift';
  END IF;

  -- Not already applied.
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
             AND table_name = 'issued_quotes' AND column_name = 'decline_reason_code')
     OR to_regprocedure('public._customer_relationship(uuid, uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'This migration appears to be applied already';
  END IF;

  IF to_regprocedure('public.acting_contractor_ids()') IS NULL
     OR to_regprocedure('public.is_platform_admin()') IS NULL THEN
    RAISE EXCEPTION 'acting_contractor_ids / is_platform_admin missing';
  END IF;

  -- Triggers, exactly.
  SELECT array_agg(tgname::text ORDER BY tgname) INTO v_names
  FROM pg_trigger WHERE tgrelid = 'public.issued_quotes'::regclass AND NOT tgisinternal;
  IF v_names IS DISTINCT FROM ARRAY['assign_quote_number_trigger', 'issued_quotes_country_immutable',
       'issued_quotes_lock_guard_trigger', 'on_quote_issued', 'on_quote_response', 'on_quote_sent',
       'update_issued_quotes_updated_at'] THEN
    RAISE EXCEPTION 'Unexpected triggers on issued_quotes: %', v_names;
  END IF;
  SELECT array_agg(tgname::text ORDER BY tgname) INTO v_names
  FROM pg_trigger WHERE tgrelid = 'public.enquiries'::regclass AND NOT tgisinternal;
  IF v_names IS DISTINCT FROM ARRAY['enquiries_country_immutable', 'enquiries_mirror_status_to_recipient_ins',
       'enquiries_mirror_status_to_recipient_upd'] THEN
    RAISE EXCEPTION 'Unexpected triggers on enquiries: %', v_names;
  END IF;

  -- SQL writers of enquiries, exactly: the guard trusts SECURITY DEFINER
  -- code, so a new writer must be reviewed before this is re-run.
  SELECT array_agg(p.proname::text ORDER BY p.proname) INTO v_names
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
    AND p.prosrc ~* 'update\s+(public\.)?enquiries\M';
  IF v_names IS DISTINCT FROM ARRAY['anonymise_user', 'mirror_recipient_status_to_enquiry'] THEN
    RAISE EXCEPTION 'Unaccounted enquiries UPDATE writer(s): %', v_names;
  END IF;

  -- The same for enquiry_recipients.
  SELECT array_agg(tgname::text ORDER BY tgname) INTO v_names
  FROM pg_trigger WHERE tgrelid = 'public.enquiry_recipients'::regclass AND NOT tgisinternal;
  IF v_names IS DISTINCT FROM ARRAY['enquiry_recipients_enforce_limits', 'enquiry_recipients_mirror_status_to_enquiry_ins',
       'enquiry_recipients_mirror_status_to_enquiry_upd', 'update_enquiry_recipients_updated_at'] THEN
    RAISE EXCEPTION 'Unexpected triggers on enquiry_recipients: %', v_names;
  END IF;
  SELECT array_agg(p.proname::text ORDER BY p.proname) INTO v_names
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
    AND p.prosrc ~* 'update\s+(public\.)?enquiry_recipients\M';
  IF v_names IS DISTINCT FROM ARRAY['accept_quote_with_slot', 'decline_quote', 'mirror_enquiry_status_to_recipient'] THEN
    RAISE EXCEPTION 'Unaccounted enquiry_recipients UPDATE writer(s): %', v_names;
  END IF;

  -- Existing rows already satisfy the binding rules (section 6). Fail, never fix.
  SELECT count(*) INTO v_count
  FROM public.issued_quotes q JOIN public.enquiries e ON e.id = q.enquiry_id
  WHERE (e.contractor_id IS DISTINCT FROM q.contractor_id
         AND NOT EXISTS (SELECT 1 FROM public.enquiry_recipients er
                         WHERE er.enquiry_id = e.id AND er.contractor_id = q.contractor_id))
     OR (e.customer_id IS NOT NULL AND q.recipient_id IS DISTINCT FROM e.customer_id);
  IF v_count > 0 THEN
    RAISE EXCEPTION '% quote(s) are on an enquiry of another contractor or customer. Resolve manually before applying.', v_count;
  END IF;
  SELECT count(*) INTO v_count
  FROM public.issued_quotes q JOIN public.issued_quotes p ON p.id = q.parent_quote_id
  WHERE q.recipient_id IS DISTINCT FROM p.recipient_id OR q.enquiry_id IS DISTINCT FROM p.enquiry_id;
  IF v_count > 0 THEN
    RAISE EXCEPTION '% revision(s) differ from their parent in recipient or enquiry. Resolve manually before applying.', v_count;
  END IF;
END $$;

-- ── 1. enquiries: customer_id and company_id are fixed ──────────────────────
-- SECURITY INVOKER on purpose, as issued_quotes_lock_guard: current_user
-- tells a direct client write (authenticated/anon) from the service role or
-- a SECURITY DEFINER function (its owner).
CREATE FUNCTION public.enquiries_party_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF current_user IN ('authenticated', 'anon') AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Who an enquiry is from, or which contractor it was sent to, cannot be changed.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER enquiries_party_guard_trigger
  BEFORE UPDATE ON public.enquiries
  FOR EACH ROW
  WHEN (NEW.customer_id IS DISTINCT FROM OLD.customer_id OR NEW.company_id IS DISTINCT FROM OLD.company_id)
  EXECUTE FUNCTION public.enquiries_party_guard();

-- Same function: which enquiry a recipient row is for, and which
-- contractor it names, are fixed too.
CREATE TRIGGER enquiry_recipients_party_guard_trigger
  BEFORE UPDATE ON public.enquiry_recipients
  FOR EACH ROW
  WHEN (NEW.enquiry_id IS DISTINCT FROM OLD.enquiry_id OR NEW.contractor_id IS DISTINCT FROM OLD.contractor_id)
  EXECUTE FUNCTION public.enquiries_party_guard();

-- ── 2. The customer-participated relationship test ──────────────────────────
CREATE FUNCTION public._customer_relationship(p_contractor_id uuid, p_customer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    -- An enquiry the customer, or a company they own, sent this contractor:
    -- named on the enquiry, or on an enquiry_recipients row (compare flow).
    EXISTS (SELECT 1 FROM public.enquiries e
            LEFT JOIN public.companies k ON k.id = e.company_id
            WHERE (e.customer_id = p_customer_id OR k.owner_id = p_customer_id)
              AND (e.contractor_id = p_contractor_id
                   OR EXISTS (SELECT 1 FROM public.enquiry_recipients er
                              WHERE er.enquiry_id = e.id AND er.contractor_id = p_contractor_id)))
    -- A quote from this contractor that the customer accepted. Covers a job
    -- minted from it (same contractor, same recipient) and an invoice linked
    -- to that job or quote.
    OR EXISTS (SELECT 1 FROM public.issued_quotes q
               WHERE q.contractor_id = p_contractor_id AND q.recipient_id = p_customer_id
                 AND (q.recipient_response = 'accepted' OR q.status = 'accepted'))
    -- A B2B invoice from this contractor to the customer's company.
    OR EXISTS (SELECT 1 FROM public.invoices i
               JOIN public.companies k ON k.id = i.company_id
               WHERE i.contractor_id = p_contractor_id AND k.owner_id = p_customer_id);
$function$;

-- "Sarah Jones" -> "Sarah J."; one word stays as it is; no name ->
-- "TradeStone customer".
CREATE FUNCTION public._mask_customer_name(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN p_name IS NULL OR btrim(p_name) = '' THEN 'TradeStone customer'
    WHEN array_length(regexp_split_to_array(btrim(p_name), '\s+'), 1) = 1 THEN btrim(p_name)
    ELSE (regexp_split_to_array(btrim(p_name), '\s+'))[1] || ' '
         || upper(left((regexp_split_to_array(btrim(p_name), '\s+'))[array_length(regexp_split_to_array(btrim(p_name), '\s+'), 1)], 1))
         || '.'
  END;
$function$;

-- ── 3. search_customers ──────────────────────────────────────────────────────
-- Same signature and columns. has_relationship is now the test above, for
-- any contractor the caller acts for.
CREATE OR REPLACE FUNCTION public.search_customers(p_query text)
RETURNS TABLE(profile_id uuid, company_id uuid, display_name text, ts_code text, account_type text, has_relationship boolean, addr_line1 text, addr_line2 text, addr_city text, addr_region text, addr_postcode text, addr_country text, legacy_address text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_query    text := btrim(p_query);
  v_escaped  text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id IN (SELECT acting_contractor_ids())
      AND p.user_type = 'contractor'
      AND coalesce(p.is_active, true)
  ) THEN
    RAISE EXCEPTION 'Only a contractor can search for customers.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_query IS NULL OR length(v_query) < 2 THEN
    RETURN;
  END IF;

  -- Escape ILIKE's own wildcards so a query containing % or _ is matched
  -- literally, not as a pattern -- a query of "%" must not become "match
  -- everything".
  v_escaped := replace(replace(replace(v_query, '\', '\\'), '%', '\%'), '_', '\_');

  -- Exact TS code match: that one account, whoever it is. Without a
  -- relationship: masked name, no address.
  IF EXISTS (SELECT 1 FROM public.profiles p WHERE upper(p.ts_profile_code) = upper(v_query)) THEN
    RETURN QUERY
    SELECT
      p.id,
      c.id,
      CASE WHEN rel.has_rel THEN coalesce(c.name, p.company_name, p.full_name)
           ELSE public._mask_customer_name(coalesce(c.name, p.company_name, p.full_name)) END,
      p.ts_profile_code,
      p.user_type::text,
      rel.has_rel,
      CASE WHEN rel.has_rel THEN p.addr_line1 ELSE NULL END,
      CASE WHEN rel.has_rel THEN p.addr_line2 ELSE NULL END,
      CASE WHEN rel.has_rel THEN p.addr_city ELSE NULL END,
      CASE WHEN rel.has_rel THEN p.addr_region ELSE NULL END,
      CASE WHEN rel.has_rel THEN coalesce(p.addr_postcode, p.postcode) ELSE NULL END,
      CASE WHEN rel.has_rel THEN p.addr_country ELSE NULL END,
      CASE WHEN rel.has_rel THEN nullif(p.address, '') ELSE NULL END
    FROM public.profiles p
    LEFT JOIN public.companies c ON c.owner_id = p.id
    CROSS JOIN LATERAL (
      SELECT EXISTS (
        SELECT 1 FROM public.acting_contractor_ids() AS a(contractor_id)
        WHERE public._customer_relationship(a.contractor_id, p.id)
      ) AS has_rel
    ) rel
    WHERE upper(p.ts_profile_code) = upper(v_query)
      AND p.id <> auth.uid()
      AND p.user_type IN ('personal', 'business')
      AND coalesce(p.is_active, true)
      AND NOT EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.profile_id = p.id);
    RETURN;
  END IF;

  -- Name match: only accounts the caller has a relationship with.
  RETURN QUERY
  SELECT
    p.id,
    c.id,
    coalesce(c.name, p.company_name, p.full_name),
    p.ts_profile_code,
    p.user_type::text,
    true,
    p.addr_line1,
    p.addr_line2,
    p.addr_city,
    p.addr_region,
    coalesce(p.addr_postcode, p.postcode),
    p.addr_country,
    nullif(p.address, '')
  FROM public.profiles p
  LEFT JOIN public.companies c ON c.owner_id = p.id
  WHERE (
      p.full_name ILIKE '%' || v_escaped || '%'
      OR c.name ILIKE '%' || v_escaped || '%'
      OR p.company_name ILIKE '%' || v_escaped || '%'
    )
    AND p.id <> auth.uid()
    AND p.user_type IN ('personal', 'business')
    AND coalesce(p.is_active, true)
    AND NOT EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.profile_id = p.id)
    AND EXISTS (
      SELECT 1 FROM public.acting_contractor_ids() AS a(contractor_id)
      WHERE public._customer_relationship(a.contractor_id, p.id)
    )
  LIMIT 10;
END;
$function$;

-- ── 4. Decline reason on quotes with no enquiry ─────────────────────────────
ALTER TABLE public.issued_quotes
  ADD COLUMN decline_reason_code text
  CONSTRAINT issued_quotes_decline_reason_code_check
    CHECK (decline_reason_code IS NULL
           OR decline_reason_code IN ('price', 'timing', 'went_elsewhere', 'changed_mind', 'not_requested'));

COMMENT ON COLUMN public.issued_quotes.decline_reason_code IS
  'Why the customer declined a quote with no enquiry; written by decline_quote only. An enquiry quote keeps its reason on enquiry_recipients.';

-- No grant: the quote lock (20261020120000) gives authenticated column
-- grants only, so a new column is not client-writable.

ALTER TABLE public.enquiry_recipients DROP CONSTRAINT enquiry_recipients_decline_reason_code_check;
ALTER TABLE public.enquiry_recipients ADD CONSTRAINT enquiry_recipients_decline_reason_code_check
  CHECK (decline_reason_code IS NULL
         OR decline_reason_code = ANY (ARRAY['price', 'timing', 'went_elsewhere', 'changed_mind', 'auto_accepted_another', 'not_requested']));

-- Live body (21 Oct) with two changes: 'not_requested' is accepted on a
-- quote with no enquiry only (a quote on an enquiry was asked for), and the
-- reason is written to issued_quotes when there is no enquiry.
CREATE OR REPLACE FUNCTION public.decline_quote(p_quote_id uuid, p_reason_code text DEFAULT NULL::text, p_reason_note text DEFAULT NULL::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_quote             public.issued_quotes%ROWTYPE;
  v_caller_profile_id uuid;
BEGIN
  SELECT id INTO v_caller_profile_id FROM public.profiles WHERE user_id = auth.uid();
  IF v_caller_profile_id IS NULL THEN
    RAISE EXCEPTION 'decline_quote: no profile found for caller';
  END IF;

  SELECT * INTO v_quote FROM public.issued_quotes WHERE id = p_quote_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'decline_quote: quote % not found', p_quote_id;
  END IF;

  IF v_quote.recipient_id IS DISTINCT FROM v_caller_profile_id THEN
    RAISE EXCEPTION 'decline_quote: not authorised to decline quote %', p_quote_id;
  END IF;

  IF v_quote.recipient_response IS NOT NULL THEN
    RAISE EXCEPTION 'decline_quote: quote % has already been responded to (%)', p_quote_id, v_quote.recipient_response;
  END IF;

  IF p_reason_code = 'auto_accepted_another' THEN
    RAISE EXCEPTION 'decline_quote: that reason code is reserved for the automatic accept-one-decline-rest path';
  END IF;

  IF p_reason_code IS NOT NULL AND p_reason_code NOT IN ('price', 'timing', 'went_elsewhere', 'changed_mind', 'not_requested') THEN
    RAISE EXCEPTION 'decline_quote: unrecognised reason code %', p_reason_code;
  END IF;

  IF p_reason_code = 'not_requested' AND v_quote.enquiry_id IS NOT NULL THEN
    RAISE EXCEPTION 'decline_quote: this quote answers your enquiry, so that reason does not apply';
  END IF;

  -- This UPDATE fires the existing on_quote_response trigger (any
  -- recipient_response change on issued_quotes), which already inserts
  -- a "Quote Rejected" notification for the contractor and a "You have
  -- rejected" confirmation for the homeowner — no separate notify insert
  -- needed here, a decline_quote call always has a real quote to
  -- transition, unlike the automatic sibling path above.
  UPDATE public.issued_quotes
  SET recipient_response = 'rejected',
      status = CASE WHEN status = 'sent' THEN 'rejected' ELSE status END,
      responded_at = COALESCE(responded_at, now()),
      decline_reason_code = CASE WHEN v_quote.enquiry_id IS NULL THEN p_reason_code ELSE decline_reason_code END
  WHERE id = p_quote_id;

  IF v_quote.enquiry_id IS NOT NULL THEN
    UPDATE public.enquiry_recipients
    SET status = 'declined',
        decline_reason_code = p_reason_code,
        decline_reason_note = NULLIF(trim(p_reason_note), ''),
        responded_at = now()
    WHERE enquiry_id = v_quote.enquiry_id AND contractor_id = v_quote.contractor_id;
  END IF;
END;
$function$;

-- Lock guard: unchanged from 20261020130000 except decline_reason_code must
-- be NULL on every insert.
CREATE OR REPLACE FUNCTION public.issued_quotes_lock_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_parent  public.issued_quotes%ROWTYPE;
  v_next    integer;
  v_problem text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'A sent quote cannot be deleted.' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN OLD;
  END IF;

  -- A decline reason is recorded by decline_quote, never set on insert.
  IF TG_OP = 'INSERT' AND NEW.decline_reason_code IS NOT NULL THEN
    RAISE EXCEPTION 'A decline reason is recorded by TradeStone, not set on insert.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- (a) Once sent, the priced content and the identity of the quote are
  -- fixed for everyone. Status, responses, deposit payment and client
  -- details (anonymise_user) remain server-writable.
  IF TG_OP = 'UPDATE' AND OLD.status <> 'draft' AND (
       NEW.contractor_id      IS DISTINCT FROM OLD.contractor_id
    OR NEW.recipient_id       IS DISTINCT FROM OLD.recipient_id
    OR NEW.quote_number       IS DISTINCT FROM OLD.quote_number
    OR NEW.version            IS DISTINCT FROM OLD.version
    OR NEW.parent_quote_id    IS DISTINCT FROM OLD.parent_quote_id
    OR NEW.enquiry_id         IS DISTINCT FROM OLD.enquiry_id
    OR NEW.project_id         IS DISTINCT FROM OLD.project_id
    OR NEW.title              IS DISTINCT FROM OLD.title
    OR NEW.description        IS DISTINCT FROM OLD.description
    OR NEW.items              IS DISTINCT FROM OLD.items
    OR NEW.subtotal           IS DISTINCT FROM OLD.subtotal
    OR NEW.tax_rate           IS DISTINCT FROM OLD.tax_rate
    OR NEW.tax_amount         IS DISTINCT FROM OLD.tax_amount
    OR NEW.total              IS DISTINCT FROM OLD.total
    OR NEW.valid_until        IS DISTINCT FROM OLD.valid_until
    OR NEW.terms              IS DISTINCT FROM OLD.terms
    OR NEW.notes              IS DISTINCT FROM OLD.notes
    OR NEW.completion_time    IS DISTINCT FROM OLD.completion_time
    OR NEW.estimated_duration_minutes IS DISTINCT FROM OLD.estimated_duration_minutes
    OR NEW.payment_schedule   IS DISTINCT FROM OLD.payment_schedule
    OR NEW.deposit_required   IS DISTINCT FROM OLD.deposit_required
    OR NEW.deposit_percentage IS DISTINCT FROM OLD.deposit_percentage
    OR NEW.deposit_amount     IS DISTINCT FROM OLD.deposit_amount
    OR NEW.sent_at            IS DISTINCT FROM OLD.sent_at
  ) THEN
    RAISE EXCEPTION 'A sent quote cannot be changed. Revise it instead.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- (b) Direct client writes.
  IF current_user IN ('authenticated', 'anon') THEN
    IF TG_OP = 'UPDATE' THEN
      -- The policy already limits this to the contractor's drafts, and the
      -- column grants keep status and sent_at out; this is the backstop.
      IF OLD.status <> 'draft' OR NEW.status IS DISTINCT FROM OLD.status OR NEW.sent_at IS DISTINCT FROM OLD.sent_at THEN
        RAISE EXCEPTION 'Only a draft quote can be changed from the app. Send it with send_quote; change a sent quote by revising it.'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
      RETURN NEW;
    END IF;

    -- INSERT. Server-owned columns carry their defaults (the grants keep
    -- them out of the insert; this is the backstop).
    IF NEW.recipient_response IS NOT NULL OR NEW.responded_at IS NOT NULL OR NEW.accepted_at IS NOT NULL
       OR NEW.rejected_at IS NOT NULL OR NEW.viewed_at IS NOT NULL OR COALESCE(NEW.deposit_paid, false)
       OR NEW.deposit_paid_at IS NOT NULL OR NEW.customer_note IS NOT NULL THEN
      RAISE EXCEPTION 'Responses and payments on a quote are recorded by TradeStone, not set on insert.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- sent_at is always the server's clock, never the client's value.
    IF NEW.status = 'sent' THEN
      NEW.sent_at := now();
      -- A quote sent straight from the form is checked as send_quote checks a draft.
      v_problem := public._quote_figures_problem(NEW.contractor_id, NEW.items, NEW.subtotal, NEW.tax_rate,
        NEW.tax_amount, NEW.total, NEW.deposit_required, NEW.deposit_percentage, NEW.deposit_amount);
      IF v_problem IS NOT NULL THEN
        RAISE EXCEPTION '%', v_problem USING ERRCODE = 'check_violation';
      END IF;
    ELSE
      NEW.sent_at := NULL;
    END IF;

    IF NEW.parent_quote_id IS NULL THEN
      IF NEW.version <> 1 THEN
        RAISE EXCEPTION 'A new quote starts at version 1; a later version is a revision of an existing quote.'
          USING ERRCODE = 'check_violation';
      END IF;
    ELSE
      -- A revision: a draft of the contractor's own sent or turned-down
      -- quote, same number, next version.
      SELECT * INTO v_parent FROM public.issued_quotes WHERE id = NEW.parent_quote_id;
      IF NOT FOUND OR v_parent.contractor_id IS DISTINCT FROM NEW.contractor_id THEN
        RAISE EXCEPTION 'You can only revise your own quote.' USING ERRCODE = 'insufficient_privilege';
      END IF;
      IF v_parent.status NOT IN ('sent', 'rejected') OR v_parent.recipient_response IS NOT DISTINCT FROM 'accepted' THEN
        RAISE EXCEPTION 'Only a sent or turned-down quote can be revised (this one is %).', v_parent.status
          USING ERRCODE = 'check_violation';
      END IF;
      IF NEW.status <> 'draft' THEN
        RAISE EXCEPTION 'A revision starts as a draft; send it with send_quote.' USING ERRCODE = 'check_violation';
      END IF;
      SELECT COALESCE(max(version), 0) + 1 INTO v_next
      FROM public.issued_quotes
      WHERE contractor_id = v_parent.contractor_id AND quote_number = v_parent.quote_number;
      IF NEW.quote_number IS DISTINCT FROM v_parent.quote_number OR NEW.version IS DISTINCT FROM v_next THEN
        RAISE EXCEPTION 'A revision keeps the quote number (%) and takes the next version (%).', v_parent.quote_number, v_next
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- ── 5. Quotes with no enquiry: who, and how many a day ───────────────────────
-- SECURITY DEFINER: reads team_members, other quotes and the relationship
-- test regardless of the caller's RLS. Binds every insert of a new
-- no-enquiry quote; revisions (parent_quote_id set) never reach it.
CREATE FUNCTION public.issued_quotes_direct_recipient_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_type  text;
  v_active     boolean;
  v_day_start  timestamptz;
  v_recipients integer;
BEGIN
  -- One no-enquiry insert per contractor at a time, so two at once can't
  -- both pass the count below.
  PERFORM pg_advisory_xact_lock(hashtextextended('issued_quotes_direct_recipient:' || NEW.contractor_id::text, 0));

  IF NEW.recipient_id IS NULL THEN
    RAISE EXCEPTION 'A quote without an enquiry needs a customer. Enter their TS-P code.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT p.user_type::text, coalesce(p.is_active, true) INTO v_user_type, v_active
  FROM public.profiles p WHERE p.id = NEW.recipient_id;

  IF v_user_type IS DISTINCT FROM 'personal' THEN
    RAISE EXCEPTION 'Only a personal TradeStone account (a TS-P code) can be sent a quote without an enquiry. Business accounts can''t be quoted this way yet.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT v_active OR EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.profile_id = NEW.recipient_id) THEN
    RAISE EXCEPTION 'That account can''t be sent a quote.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF public._customer_relationship(NEW.contractor_id, NEW.recipient_id) THEN
    RETURN NEW;
  END IF;

  v_day_start := date_trunc('day', now() AT TIME ZONE 'Europe/London') AT TIME ZONE 'Europe/London';

  IF EXISTS (
    SELECT 1 FROM public.issued_quotes q
    WHERE q.contractor_id = NEW.contractor_id AND q.recipient_id = NEW.recipient_id
      AND q.enquiry_id IS NULL AND q.parent_quote_id IS NULL AND q.created_at >= v_day_start
  ) THEN
    RETURN NEW;
  END IF;

  -- Slots used today: distinct no-enquiry recipients with no relationship
  -- (as of now: one who has since accepted a quote frees their slot).
  SELECT count(*) INTO v_recipients
  FROM (
    SELECT DISTINCT q.recipient_id
    FROM public.issued_quotes q
    WHERE q.contractor_id = NEW.contractor_id
      AND q.enquiry_id IS NULL AND q.parent_quote_id IS NULL
      AND q.recipient_id IS NOT NULL AND q.created_at >= v_day_start
  ) r
  WHERE NOT public._customer_relationship(NEW.contractor_id, r.recipient_id);

  IF v_recipients >= 10 THEN
    RAISE EXCEPTION 'You''ve quoted 10 new customers without an enquiry today, which is the daily limit. Customers who have already worked with you aren''t limited; anyone else can be quoted tomorrow.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER issued_quotes_direct_recipient_guard_trigger
  BEFORE INSERT ON public.issued_quotes
  FOR EACH ROW
  WHEN (NEW.enquiry_id IS NULL AND NEW.parent_quote_id IS NULL)
  EXECUTE FUNCTION public.issued_quotes_direct_recipient_guard();

-- ── 6. A quote stays bound to its enquiry and its parent ────────────────────
CREATE FUNCTION public.issued_quotes_binding_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_parent_recipient uuid;
  v_parent_enquiry   uuid;
  v_enq_contractor   uuid;
  v_enq_customer     uuid;
BEGIN
  IF NEW.parent_quote_id IS NOT NULL THEN
    SELECT q.recipient_id, q.enquiry_id INTO v_parent_recipient, v_parent_enquiry
    FROM public.issued_quotes q WHERE q.id = NEW.parent_quote_id;
    -- A missing parent is refused by the lock guard.
    IF FOUND AND (NEW.recipient_id IS DISTINCT FROM v_parent_recipient
                  OR NEW.enquiry_id IS DISTINCT FROM v_parent_enquiry) THEN
      RAISE EXCEPTION 'A revision goes to the same customer, for the same enquiry, as the quote it revises.'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  SELECT e.contractor_id, e.customer_id INTO v_enq_contractor, v_enq_customer
  FROM public.enquiries e WHERE e.id = NEW.enquiry_id;
  -- Sent to this contractor: named on the enquiry (single-contractor flow)
  -- or on an enquiry_recipients row (compare flow, contractor_id NULL).
  IF NOT FOUND OR (
       v_enq_contractor IS DISTINCT FROM NEW.contractor_id
       AND NOT EXISTS (SELECT 1 FROM public.enquiry_recipients er
                       WHERE er.enquiry_id = NEW.enquiry_id AND er.contractor_id = NEW.contractor_id)
     ) THEN
    RAISE EXCEPTION 'That enquiry wasn''t sent to you.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_enq_customer IS NOT NULL AND NEW.recipient_id IS DISTINCT FROM v_enq_customer THEN
    RAISE EXCEPTION 'A quote on an enquiry goes to the customer who sent it.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER issued_quotes_binding_guard_trigger
  BEFORE INSERT ON public.issued_quotes
  FOR EACH ROW
  WHEN (NEW.enquiry_id IS NOT NULL OR NEW.parent_quote_id IS NOT NULL)
  EXECUTE FUNCTION public.issued_quotes_binding_guard();

-- ── 7. Function grants ───────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.enquiries_party_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._customer_relationship(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._mask_customer_name(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.issued_quotes_direct_recipient_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.issued_quotes_binding_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.issued_quotes_lock_guard() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._customer_relationship(uuid, uuid) TO service_role;

-- ── 8. Post-flight ───────────────────────────────────────────────────────────
DO $$
DECLARE
  v_names text[];
BEGIN
  SELECT array_agg(tgname::text ORDER BY tgname) INTO v_names
  FROM pg_trigger WHERE tgrelid = 'public.issued_quotes'::regclass AND NOT tgisinternal;
  IF v_names IS DISTINCT FROM ARRAY['assign_quote_number_trigger', 'issued_quotes_binding_guard_trigger',
       'issued_quotes_country_immutable', 'issued_quotes_direct_recipient_guard_trigger',
       'issued_quotes_lock_guard_trigger', 'on_quote_issued', 'on_quote_response', 'on_quote_sent',
       'update_issued_quotes_updated_at'] THEN
    RAISE EXCEPTION 'issued_quotes triggers not as intended: %', v_names;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'enquiries_party_guard_trigger')
     OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'enquiry_recipients_party_guard_trigger') THEN
    RAISE EXCEPTION 'enquiries / enquiry_recipients guard missing';
  END IF;

  IF has_column_privilege('authenticated', 'public.issued_quotes', 'decline_reason_code', 'INSERT')
     OR has_column_privilege('authenticated', 'public.issued_quotes', 'decline_reason_code', 'UPDATE')
     OR has_column_privilege('anon', 'public.issued_quotes', 'decline_reason_code', 'INSERT')
     OR has_column_privilege('anon', 'public.issued_quotes', 'decline_reason_code', 'UPDATE') THEN
    RAISE EXCEPTION 'decline_reason_code is client-writable';
  END IF;

  IF has_function_privilege('authenticated', 'public._customer_relationship(uuid, uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public._customer_relationship(uuid, uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.search_customers(text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.decline_quote(uuid, text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'function grants not as intended';
  END IF;

  IF public._mask_customer_name('Sarah Jones') <> 'Sarah J.'
     OR public._mask_customer_name(NULL) <> 'TradeStone customer'
     OR public._mask_customer_name('  ') <> 'TradeStone customer'
     OR public._mask_customer_name('Sarah') <> 'Sarah'
     OR public._mask_customer_name('Mary Ann  smith') <> 'Mary S.' THEN
    RAISE EXCEPTION '_mask_customer_name output not as intended';
  END IF;
END $$;
