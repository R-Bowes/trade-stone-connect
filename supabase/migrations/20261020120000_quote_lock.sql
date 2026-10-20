-- Quotes hardening: lock (work orders step 2b, part B step 1). All quotes,
-- personal and business. Mirrors the invoice lock (20261012120000).
--
-- The hole (found 19 Oct 2026): the recipient's UPDATE policy on
-- issued_quotes had no column limits and no WITH CHECK, and authenticated
-- held UPDATE on all 53 columns. A recipient could set deposit_paid = true
-- and then call accept_quote_with_slot, which minted the job with no
-- deposit; or change total / items before accepting. The contractor's
-- UPDATE policy was as open: a sent or accepted quote could be edited.
--
-- After this migration:
-- 1. Recipients change nothing directly. Their writes are
--    accept_quote_with_slot, decline_quote and the new stall_quote (all
--    SECURITY DEFINER), plus a cooling-off cancellation, which now cancels
--    the quote server-side (trigger on cooling_off_records) instead of from
--    the browser — and only inside the 14-day window, before work starts.
--    viewed_at and customer_note had no writer anywhere (client, edge or
--    SQL; 0 of 22 quotes set either, 19 Oct), so locking them stops nothing.
-- 2. Contractors insert drafts or sent quotes and edit drafts only. A draft
--    is sent with send_quote (which also supersedes the quote it revises);
--    a sent quote is changed by revision (a new draft with parent_quote_id,
--    the same quote_number and the next version). Archiving is lapse_quote.
-- 3. Server-only columns: recipient_response, responded_at, accepted_at,
--    rejected_at, viewed_at, deposit_paid, deposit_paid_at, customer_note,
--    and, on update, status and sent_at.
-- 4. Once a quote is sent, its priced content is fixed for everyone,
--    SECURITY DEFINER functions included (no server writer changes it).
--    Client details (client_*, business_name, addr_*) stay writable by the
--    server only, for anonymise_user.
--
-- Writers of issued_quotes after this migration (the next pre-flight's list):
--   SQL:     accept_quote_with_slot, anonymise_user, decline_quote,
--            send_quote, lapse_quote, stall_quote,
--            _cooling_off_cancel_quote (trigger on cooling_off_records)
--   Service: stripe-webhook (deposit_paid, deposit_paid_at; service_role)
--   Client:  SendQuoteDialog.tsx (insert, draft or sent),
--            IssuedQuotes.tsx (draft edits; revision insert),
--            through the policies and column grants below.
--
-- ROLLBACK (in this order):
--   drop trigger issued_quotes_lock_guard_trigger on public.issued_quotes;
--   drop function public.issued_quotes_lock_guard();
--   drop trigger cooling_off_cancel_quote on public.cooling_off_records;
--   drop function public._cooling_off_cancel_quote();
--   drop function public.send_quote(uuid);
--   drop function public.lapse_quote(uuid);
--   drop function public.stall_quote(uuid);
--   drop policy issued_quotes_contractor_insert on public.issued_quotes;
--   drop policy issued_quotes_contractor_update_draft on public.issued_quotes;
--   drop policy issued_quotes_contractor_delete_draft on public.issued_quotes;
--   create policy issued_quotes_contractor_insert on public.issued_quotes for insert
--     with check (contractor_id in (select profiles.id from profiles where profiles.user_id = auth.uid()));
--   create policy issued_quotes_contractor_update on public.issued_quotes for update
--     using (contractor_id in (select profiles.id from profiles where profiles.user_id = auth.uid()));
--   create policy issued_quotes_contractor_delete on public.issued_quotes for delete
--     using (contractor_id in (select profiles.id from profiles where profiles.user_id = auth.uid()));
--   create policy "Recipients can respond to their quotes" on public.issued_quotes for update
--     using (recipient_id in (select profiles.id from profiles where profiles.user_id = auth.uid()));
--   revoke insert, update on public.issued_quotes from authenticated;
--   grant insert, update, truncate, references, trigger on public.issued_quotes to authenticated, anon;

-- ── 0. Pre-flight ────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_expected text[] := ARRAY[
    'id', 'contractor_id', 'quote_number', 'client_type', 'client_name', 'business_name',
    'client_email', 'client_phone', 'client_address', 'title', 'description', 'items',
    'subtotal', 'tax_rate', 'tax_amount', 'total', 'status', 'valid_until', 'sent_at',
    'responded_at', 'terms', 'notes', 'created_at', 'updated_at', 'recipient_id',
    'recipient_response', 'completion_time', 'deposit_required', 'deposit_percentage',
    'enquiry_id', 'project_id', 'version', 'parent_quote_id', 'deposit_amount',
    'deposit_paid', 'deposit_paid_at', 'accepted_at', 'rejected_at', 'customer_note',
    'viewed_at', 'estimated_duration_minutes', 'payment_schedule', 'country_code',
    'currency', 'addr_line1', 'addr_line2', 'addr_city', 'addr_region', 'addr_postcode',
    'addr_country', 'addr_lat', 'addr_lng', 'addr_place_id'
  ];
  v_unlisted text;
  v_missing  text;
  v_writers  text[];
  v_names    text[];
BEGIN
  -- Every column classified (53 live columns, 19 Oct 2026): an unlisted new
  -- column would silently be unwritable or unlocked.
  SELECT string_agg(column_name, ', ' ORDER BY column_name) INTO v_unlisted
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'issued_quotes' AND column_name <> ALL (v_expected);
  SELECT string_agg(c, ', ' ORDER BY c) INTO v_missing
  FROM unnest(v_expected) AS c
  WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'issued_quotes' AND column_name = c);
  IF v_unlisted IS NOT NULL OR v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'issued_quotes column list out of date. Not listed: [%]. Listed but not on the table: [%].',
      coalesce(v_unlisted, ''), coalesce(v_missing, '');
  END IF;

  -- SQL writers of issued_quotes, exactly. (Client and service writers are
  -- listed in the header: SendQuoteDialog, IssuedQuotes, EngagementThread,
  -- useCoolingOff, useReceivedQuotes, stripe-webhook.)
  SELECT array_agg(p.proname::text ORDER BY p.proname) INTO v_writers
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
    AND p.prosrc ~* '(insert\s+into|update|delete\s+from)\s+(public\.)?issued_quotes\M';
  IF v_writers IS DISTINCT FROM ARRAY['accept_quote_with_slot', 'anonymise_user', 'decline_quote'] THEN
    RAISE EXCEPTION 'Unaccounted issued_quotes writer(s): %', v_writers;
  END IF;

  -- Triggers on issued_quotes and cooling_off_records, exactly.
  SELECT array_agg(tgname::text ORDER BY tgname) INTO v_names
  FROM pg_trigger WHERE tgrelid = 'public.issued_quotes'::regclass AND NOT tgisinternal;
  IF v_names IS DISTINCT FROM ARRAY['assign_quote_number_trigger', 'issued_quotes_country_immutable',
       'on_quote_issued', 'on_quote_response', 'on_quote_sent', 'update_issued_quotes_updated_at'] THEN
    RAISE EXCEPTION 'Unexpected triggers on issued_quotes: %', v_names;
  END IF;
  SELECT array_agg(tgname::text ORDER BY tgname) INTO v_names
  FROM pg_trigger WHERE tgrelid = 'public.cooling_off_records'::regclass AND NOT tgisinternal;
  IF v_names IS DISTINCT FROM ARRAY['update_cooling_off_records_updated_at'] THEN
    RAISE EXCEPTION 'Unexpected triggers on cooling_off_records: %', v_names;
  END IF;

  -- Policies on issued_quotes, exactly.
  SELECT array_agg(policyname::text ORDER BY policyname) INTO v_names
  FROM pg_policies WHERE schemaname = 'public' AND tablename = 'issued_quotes';
  IF v_names IS DISTINCT FROM ARRAY['Recipients can respond to their quotes', 'Recipients can view their quotes',
       'issued_quotes_contractor_delete', 'issued_quotes_contractor_insert',
       'issued_quotes_contractor_select', 'issued_quotes_contractor_update'] THEN
    RAISE EXCEPTION 'Unexpected policies on issued_quotes: %', v_names;
  END IF;

  -- Not already applied.
  IF to_regprocedure('public.issued_quotes_lock_guard()') IS NOT NULL
     OR to_regprocedure('public.send_quote(uuid)') IS NOT NULL
     OR to_regprocedure('public.stall_quote(uuid)') IS NOT NULL
     OR to_regprocedure('public.lapse_quote(uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'The quote lock appears to be applied already';
  END IF;

  -- The figure checks and the RPCs this relies on exist.
  IF to_regprocedure('public.accept_quote_with_slot(uuid, uuid)') IS NULL
     OR to_regprocedure('public.decline_quote(uuid, text, text)') IS NULL THEN
    RAISE EXCEPTION 'accept_quote_with_slot / decline_quote missing';
  END IF;
END $$;

-- ── 1. Recipients lose direct UPDATE ─────────────────────────────────────────
-- Their only direct write was useReceivedQuotes.respondToQuote ("stalled");
-- it moves to stall_quote below. Accept and decline were already RPCs.
DROP POLICY "Recipients can respond to their quotes" ON public.issued_quotes;

-- ── 2. Contractor writes: insert draft or sent, edit and delete drafts ──────
-- Direct auth.uid() form (house pattern for new policies; issued_quotes.
-- contractor_id references profiles(id) = auth.uid()).
DROP POLICY issued_quotes_contractor_insert ON public.issued_quotes;
DROP POLICY issued_quotes_contractor_update ON public.issued_quotes;
DROP POLICY issued_quotes_contractor_delete ON public.issued_quotes;

CREATE POLICY issued_quotes_contractor_insert ON public.issued_quotes
  FOR INSERT TO authenticated
  WITH CHECK (contractor_id = auth.uid() AND status IN ('draft', 'sent'));

CREATE POLICY issued_quotes_contractor_update_draft ON public.issued_quotes
  FOR UPDATE TO authenticated
  USING (contractor_id = auth.uid() AND status = 'draft')
  WITH CHECK (contractor_id = auth.uid() AND status = 'draft');

CREATE POLICY issued_quotes_contractor_delete_draft ON public.issued_quotes
  FOR DELETE TO authenticated
  USING (contractor_id = auth.uid() AND status = 'draft');

-- ── 3. Column grants ─────────────────────────────────────────────────────────
-- Not client-writable at all: id, created_at, updated_at, recipient_response,
-- responded_at, accepted_at, rejected_at, viewed_at, deposit_paid,
-- deposit_paid_at, customer_note.
-- Insert-only (fixed for the life of the row, or changed by RPC only):
-- contractor_id, recipient_id, enquiry_id, project_id, parent_quote_id,
-- version, quote_number, client_type, status, sent_at, country_code, currency.
REVOKE INSERT, UPDATE, TRUNCATE, REFERENCES, TRIGGER ON public.issued_quotes FROM authenticated, anon;

GRANT INSERT (
  contractor_id, recipient_id, enquiry_id, project_id, parent_quote_id, version, quote_number,
  client_type, status, sent_at, country_code, currency,
  client_name, business_name, client_email, client_phone, client_address,
  addr_line1, addr_line2, addr_city, addr_region, addr_postcode, addr_country, addr_lat, addr_lng, addr_place_id,
  title, description, items, subtotal, tax_rate, tax_amount, total, valid_until, terms, notes,
  completion_time, estimated_duration_minutes, payment_schedule,
  deposit_required, deposit_percentage, deposit_amount
) ON public.issued_quotes TO authenticated;

GRANT UPDATE (
  client_name, business_name, client_email, client_phone, client_address,
  addr_line1, addr_line2, addr_city, addr_region, addr_postcode, addr_country, addr_lat, addr_lng, addr_place_id,
  title, description, items, subtotal, tax_rate, tax_amount, total, valid_until, terms, notes,
  completion_time, estimated_duration_minutes, payment_schedule,
  deposit_required, deposit_percentage, deposit_amount
) ON public.issued_quotes TO authenticated;

-- ── 4. Guard ─────────────────────────────────────────────────────────────────
-- SECURITY INVOKER on purpose, as invoices_issue_lock_guard: it reads
-- current_user to tell a direct authenticated/anon write from a SECURITY
-- DEFINER function (current_user = its owner) or the service role.
-- Part (a) binds everyone; part (b) binds direct client writes.
CREATE FUNCTION public.issued_quotes_lock_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_parent public.issued_quotes%ROWTYPE;
  v_next   integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'A sent quote cannot be deleted.' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN OLD;
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

-- Before the number allocator? Not needed: a revision supplies its number,
-- and assign_quote_number_trigger only fills a NULL one. Trigger order
-- (alphabetical) therefore doesn't matter here.
CREATE TRIGGER issued_quotes_lock_guard_trigger
  BEFORE INSERT OR UPDATE OR DELETE ON public.issued_quotes
  FOR EACH ROW EXECUTE FUNCTION public.issued_quotes_lock_guard();

-- ── 5. send_quote: send a draft (and supersede the quote it revises) ────────
CREATE FUNCTION public.send_quote(p_quote_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_quote  public.issued_quotes%ROWTYPE;
  v_parent public.issued_quotes%ROWTYPE;
BEGIN
  SELECT * INTO v_quote FROM public.issued_quotes WHERE id = p_quote_id FOR UPDATE;
  IF NOT FOUND OR v_quote.contractor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Quote not found.' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_quote.status <> 'draft' THEN
    RAISE EXCEPTION 'Only a draft quote can be sent (this one is %).', v_quote.status USING ERRCODE = 'check_violation';
  END IF;

  IF v_quote.parent_quote_id IS NOT NULL THEN
    SELECT * INTO v_parent FROM public.issued_quotes WHERE id = v_quote.parent_quote_id FOR UPDATE;
    IF v_parent.status = 'accepted' OR v_parent.recipient_response = 'accepted' THEN
      RAISE EXCEPTION 'The original quote was accepted while this revision was in draft.' USING ERRCODE = 'check_violation';
    END IF;
    UPDATE public.issued_quotes SET status = 'superseded'
    WHERE id = v_parent.id AND status IN ('sent', 'rejected');
  END IF;

  -- on_quote_sent (sent_at NULL → set) notifies the recipient, as before.
  UPDATE public.issued_quotes SET status = 'sent', sent_at = now() WHERE id = p_quote_id;
END;
$function$;

-- ── 6. lapse_quote: the contractor archives a quote no job came from ────────
-- Same rule as EngagementThread's Archive button: any quote with no job,
-- not already lapsed.
CREATE FUNCTION public.lapse_quote(p_quote_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_quote public.issued_quotes%ROWTYPE;
BEGIN
  SELECT * INTO v_quote FROM public.issued_quotes WHERE id = p_quote_id FOR UPDATE;
  IF NOT FOUND OR v_quote.contractor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Quote not found.' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_quote.status = 'lapsed' THEN
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.jobs WHERE issued_quote_id = p_quote_id) THEN
    RAISE EXCEPTION 'A job has been created from this quote, so it cannot be archived.' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.issued_quotes SET status = 'lapsed' WHERE id = p_quote_id;
END;
$function$;

-- ── 7. stall_quote: the recipient puts a sent quote on hold ─────────────────
-- Same effect as useReceivedQuotes.respondToQuote('stalled') had: response
-- 'stalled', status stays 'sent'. on_quote_response notifies both sides.
CREATE FUNCTION public.stall_quote(p_quote_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_quote public.issued_quotes%ROWTYPE;
  v_caller_profile_id uuid;
BEGIN
  SELECT id INTO v_caller_profile_id FROM public.profiles WHERE user_id = auth.uid();
  SELECT * INTO v_quote FROM public.issued_quotes WHERE id = p_quote_id FOR UPDATE;
  IF NOT FOUND OR v_caller_profile_id IS NULL OR v_quote.recipient_id IS DISTINCT FROM v_caller_profile_id THEN
    RAISE EXCEPTION 'Quote not found.' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_quote.status <> 'sent' OR v_quote.recipient_response IS NOT NULL THEN
    RAISE EXCEPTION 'This quote has already been answered.' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.issued_quotes
  SET recipient_response = 'stalled', responded_at = now()
  WHERE id = p_quote_id;
END;
$function$;

-- ── 8. Cooling-off cancellation cancels the quote, server-side ──────────────
-- useCoolingOff cancelled the quote from the browser after cancelling the
-- record; recipients can no longer write quotes, so the record's own
-- cancellation carries it through — but only a cancellation the right
-- covers: inside the window (cooling_off_end, start + 14 days, set by
-- mint_job_from_quote; measured against now(), not the client-set
-- cancelled_at, and not after the record was marked elapsed) and before any
-- work has started on the job. Otherwise the quote is left as it is.
-- cooling_off_records itself is still writable by the homeowner at any time
-- (RLS has no window check); that is on NOW.md for a cancel_cooling_off RPC.
CREATE FUNCTION public._cooling_off_cancel_quote()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.quote_id IS NULL
     OR NEW.cooling_off_end IS NULL OR now() > NEW.cooling_off_end
     OR COALESCE(NEW.cooling_off_elapsed, false) THEN
    RETURN NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = NEW.job_id
      AND (j.actual_start IS NOT NULL OR j.status IN ('in_progress', 'snagging', 'complete'))
  ) THEN
    RETURN NULL;
  END IF;

  UPDATE public.issued_quotes SET status = 'cancelled'
  WHERE id = NEW.quote_id AND status = 'accepted';
  RETURN NULL;
END;
$function$;

CREATE TRIGGER cooling_off_cancel_quote
  AFTER UPDATE OF cancelled ON public.cooling_off_records
  FOR EACH ROW
  WHEN (NEW.cancelled IS TRUE AND OLD.cancelled IS NOT TRUE)
  EXECUTE FUNCTION public._cooling_off_cancel_quote();

-- ── 9. Function grants ───────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.issued_quotes_lock_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._cooling_off_cancel_quote() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.send_quote(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lapse_quote(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.stall_quote(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_quote(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.lapse_quote(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.stall_quote(uuid) TO authenticated, service_role;

-- ── 10. Post-flight ──────────────────────────────────────────────────────────
DO $$
DECLARE
  v_names text[];
  v_bad   text;
BEGIN
  SELECT array_agg(policyname::text ORDER BY policyname) INTO v_names
  FROM pg_policies WHERE schemaname = 'public' AND tablename = 'issued_quotes';
  IF v_names IS DISTINCT FROM ARRAY['Recipients can view their quotes', 'issued_quotes_contractor_delete_draft',
       'issued_quotes_contractor_insert', 'issued_quotes_contractor_select', 'issued_quotes_contractor_update_draft'] THEN
    RAISE EXCEPTION 'issued_quotes policies not as intended: %', v_names;
  END IF;

  SELECT string_agg(c || ':' || p, ', ') INTO v_bad
  FROM unnest(ARRAY['recipient_response', 'responded_at', 'accepted_at', 'rejected_at', 'viewed_at',
                    'deposit_paid', 'deposit_paid_at', 'customer_note']) AS c,
       unnest(ARRAY['INSERT', 'UPDATE']) AS p
  WHERE has_column_privilege('authenticated', 'public.issued_quotes', c, p)
     OR has_column_privilege('anon', 'public.issued_quotes', c, p);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Server-only columns still client-writable: %', v_bad;
  END IF;

  SELECT string_agg(c, ', ') INTO v_bad
  FROM unnest(ARRAY['status', 'sent_at', 'contractor_id', 'recipient_id', 'quote_number', 'version', 'parent_quote_id']) AS c
  WHERE has_column_privilege('authenticated', 'public.issued_quotes', c, 'UPDATE');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Insert-only columns still client-updatable: %', v_bad;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'issued_quotes_lock_guard_trigger')
     OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'cooling_off_cancel_quote') THEN
    RAISE EXCEPTION 'lock triggers missing';
  END IF;

  IF has_function_privilege('anon', 'public.stall_quote(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._cooling_off_cancel_quote()', 'EXECUTE') THEN
    RAISE EXCEPTION 'function grants wider than intended';
  END IF;
END $$;
