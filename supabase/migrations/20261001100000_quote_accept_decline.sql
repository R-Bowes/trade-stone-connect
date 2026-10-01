-- Step 2 of the compare-quotes feature: accept declines the rest,
-- atomically, with structured decline reasons.
--
-- enquiry_recipients.status gains 'accepted' — distinct from 'converted'.
-- 'converted' has only ever meant "a contractor sent a quote" (written by
-- SendQuoteDialog.tsx at send time); there has never been a recipient
-- state meaning "this one was chosen". enquiries.status itself is NOT
-- getting a matching 'accepted' value — that CHECK, and every one of the
-- ~8 read sites catalogued when enquiry_recipients was built, stays
-- untouched. An accepted recipient mirrors UP to enquiries.status =
-- 'converted' (the existing "positive terminal state" value), same as a
-- merely-sent quote always has — the single-recipient world never needed
-- to distinguish "sent" from "accepted" at the enquiry level, and still
-- doesn't.
--
-- decline_reason_code: five fixed values, CHECK not a lookup table — a
-- small, product-decided, stable set, the same shape enquiry_recipients.status
-- itself already uses a CHECK for. issued_quotes.status having NO CHECK is
-- a flagged, known gap (LATER.md) — the lesson from it is "do add one",
-- not a precedent to repeat.

ALTER TABLE public.enquiry_recipients
  DROP CONSTRAINT enquiry_recipients_status_check;
ALTER TABLE public.enquiry_recipients
  ADD CONSTRAINT enquiry_recipients_status_check
  CHECK (status IN ('invited', 'viewed', 'replied', 'converted', 'declined', 'accepted'));

ALTER TABLE public.enquiry_recipients
  ADD CONSTRAINT enquiry_recipients_decline_reason_code_check
  CHECK (decline_reason_code IS NULL OR decline_reason_code IN (
    'price', 'timing', 'went_elsewhere', 'changed_mind', 'auto_accepted_another'
  ));

-- ── Mirror-up precedence gains 'accepted' at the top (maps to
-- enquiries.status='converted', not a new enquiries value — see header).
CREATE OR REPLACE FUNCTION public.mirror_recipient_status_to_enquiry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_derived text;
BEGIN
  IF pg_trigger_depth() > 2 THEN
    RETURN NEW;
  END IF;

  SELECT CASE
    WHEN bool_or(status = 'accepted')  THEN 'converted'
    WHEN bool_or(status = 'converted') THEN 'converted'
    WHEN bool_or(status = 'declined')  THEN 'declined'
    WHEN bool_or(status = 'replied')   THEN 'replied'
    ELSE 'new'
  END
  INTO v_derived
  FROM public.enquiry_recipients
  WHERE enquiry_id = NEW.enquiry_id;

  UPDATE public.enquiries
  SET status = v_derived
  WHERE id = NEW.enquiry_id
    AND status IS DISTINCT FROM v_derived;

  RETURN NEW;
END;
$$;

-- ── Mirror-down gains a guard protecting 'accepted' from being
-- downgraded. Trace: SendQuoteDialog always sets enquiries.status=
-- 'converted' BEFORE a quote can ever reach an acceptable state, so in
-- practice enquiries.status is already 'converted' by accept time and
-- trigger A's WHERE (status IS DISTINCT FROM) already no-ops this case —
-- but that relies on call order, not a guarantee. Guarding it directly
-- (same technique as the existing invited/viewed guard below) closes it
-- categorically: a 'converted'-mapped write must never overwrite a
-- recipient row that's already 'accepted'.
CREATE OR REPLACE FUNCTION public.mirror_enquiry_status_to_recipient()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_mapped text;
BEGIN
  IF pg_trigger_depth() > 2 THEN
    RETURN NEW;
  END IF;

  v_mapped := CASE NEW.status
    WHEN 'new' THEN 'invited'
    WHEN 'replied' THEN 'replied'
    WHEN 'declined' THEN 'declined'
    WHEN 'converted' THEN 'converted'
    ELSE 'invited'
  END;

  INSERT INTO public.enquiry_recipients (enquiry_id, contractor_id, status, responded_at)
  VALUES (
    NEW.id,
    NEW.contractor_id,
    v_mapped,
    CASE WHEN v_mapped IN ('replied', 'declined', 'converted') THEN now() ELSE NULL END
  )
  ON CONFLICT (enquiry_id, contractor_id) DO UPDATE
    SET status = EXCLUDED.status,
        responded_at = COALESCE(public.enquiry_recipients.responded_at, EXCLUDED.responded_at),
        updated_at = now()
    WHERE public.enquiry_recipients.status IS DISTINCT FROM EXCLUDED.status
      AND NOT (EXCLUDED.status = 'invited' AND public.enquiry_recipients.status = 'viewed')
      AND NOT (EXCLUDED.status = 'converted' AND public.enquiry_recipients.status = 'accepted');

  RETURN NEW;
END;
$$;

-- ── accept_quote_with_slot, extended in place — not wrapped — so the
-- sibling-decline writes land in the SAME transaction that sets
-- recipient_response='accepted'. Everything above the new block is
-- byte-for-byte the existing function; only the block after quote
-- acceptance (step 4) is new.
--
-- UNDO PATH: as with the enquiries RLS consolidation, pg_dump gives no
-- one-command rollback for a function body. If any post-migration proof
-- fails, recovery is a NEW migration (never edit this one) that restores
-- this definition verbatim. Recorded from live pg_proc, 2026-10-01,
-- before this migration was written:
--
-- CREATE OR REPLACE FUNCTION public.accept_quote_with_slot(p_quote_id uuid, p_event_id uuid)
--  RETURNS jsonb
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO 'public'
-- AS $function$
-- DECLARE
--   v_quote              public.issued_quotes%ROWTYPE;
--   v_event              public.schedule_events%ROWTYPE;
--   v_caller_profile_id  uuid;
--   v_job_id             uuid;
--   v_deposit_due        boolean;
--   v_already_confirmed  boolean;
--   v_confirmed_date     date;
--   v_start_time         time;
--   v_block_am           boolean;
--   v_block_pm           boolean;
-- BEGIN
--   -- 1. Caller auth.
--   SELECT id INTO v_caller_profile_id FROM public.profiles WHERE user_id = auth.uid();
--   IF v_caller_profile_id IS NULL THEN
--     RAISE EXCEPTION 'accept_quote_with_slot: no profile found for caller';
--   END IF;
--
--   SELECT * INTO v_quote FROM public.issued_quotes WHERE id = p_quote_id FOR UPDATE;
--   IF NOT FOUND THEN
--     RAISE EXCEPTION 'accept_quote_with_slot: quote % not found', p_quote_id;
--   END IF;
--
--   IF v_quote.recipient_id IS DISTINCT FROM v_caller_profile_id THEN
--     RAISE EXCEPTION 'accept_quote_with_slot: not authorised to accept quote %', p_quote_id;
--   END IF;
--
--   -- 2. Quote validation.
--   IF v_quote.status NOT IN ('sent', 'accepted') THEN
--     RAISE EXCEPTION 'accept_quote_with_slot: quote % is not open to acceptance (status=%)', p_quote_id, v_quote.status;
--   END IF;
--
--   IF v_quote.valid_until < CURRENT_DATE THEN
--     RAISE EXCEPTION 'accept_quote_with_slot: quote % has expired (valid_until=%)', p_quote_id, v_quote.valid_until;
--   END IF;
--
--   IF v_quote.recipient_response IS NOT NULL AND v_quote.recipient_response <> 'accepted' THEN
--     RAISE EXCEPTION 'accept_quote_with_slot: quote % has already been responded to (%)', p_quote_id, v_quote.recipient_response;
--   END IF;
--
--   -- 3. Event validation.
--   SELECT * INTO v_event FROM public.schedule_events WHERE id = p_event_id FOR UPDATE;
--   IF NOT FOUND THEN
--     RAISE EXCEPTION 'accept_quote_with_slot: schedule proposal % not found', p_event_id;
--   END IF;
--
--   IF v_event.quote_id IS DISTINCT FROM p_quote_id THEN
--     RAISE EXCEPTION 'accept_quote_with_slot: proposal % does not belong to quote %', p_event_id, p_quote_id;
--   END IF;
--
--   IF v_event.event_type <> 'quote_proposal' THEN
--     RAISE EXCEPTION 'accept_quote_with_slot: proposal % is not a quote scheduling proposal', p_event_id;
--   END IF;
--
--   v_already_confirmed := v_event.status = 'accepted' AND v_event.is_confirmed = true;
--
--   IF v_event.status <> 'proposed' AND NOT v_already_confirmed THEN
--     RAISE EXCEPTION 'accept_quote_with_slot: proposal % is no longer available (status=%)', p_event_id, v_event.status;
--   END IF;
--
--   IF NOT v_already_confirmed THEN
--     UPDATE public.schedule_events
--     SET status = 'accepted', is_confirmed = true
--     WHERE id = p_event_id;
--   END IF;
--
--   UPDATE public.schedule_events
--   SET status = 'declined', is_confirmed = false
--   WHERE quote_id = p_quote_id
--     AND event_type = 'quote_proposal'
--     AND status = 'proposed'
--     AND id <> p_event_id;
--
--   -- 4. Quote acceptance.
--   UPDATE public.issued_quotes
--   SET recipient_response = 'accepted',
--       accepted_at        = COALESCE(accepted_at, now()),
--       responded_at       = COALESCE(responded_at, now()),
--       status              = CASE WHEN status = 'sent' THEN 'accepted' ELSE status END
--   WHERE id = p_quote_id;
--
--   v_deposit_due := COALESCE(v_quote.deposit_required, false) AND COALESCE(v_quote.deposit_amount, 0) > 0;
--
--   IF v_deposit_due THEN
--     -- 5. Deposit gate holds the mint — block the calendar now, same
--     -- expression and tighten-only merge as block_date_on_job_confirmed
--     -- (20260704130000), so the two never disagree once the trigger takes
--     -- over at job-insert time.
--     v_confirmed_date := v_event.start_time::date;
--     v_start_time := v_event.start_time::time;
--
--     IF extract(hour FROM v_start_time) < 12 THEN
--       v_block_am := true;  v_block_pm := false;
--     ELSE
--       v_block_am := false; v_block_pm := true;
--     END IF;
--
--     INSERT INTO public.contractor_availability_overrides (
--       contractor_id, date, am_available, pm_available, reason
--     )
--     VALUES (
--       v_quote.contractor_id, v_confirmed_date,
--       NOT v_block_am, NOT v_block_pm,
--       'Auto-blocked: awaiting deposit'
--     )
--     ON CONFLICT (contractor_id, date)
--     DO UPDATE SET
--       am_available = contractor_availability_overrides.am_available AND NOT v_block_am,
--       pm_available = contractor_availability_overrides.pm_available AND NOT v_block_pm,
--       reason = COALESCE(contractor_availability_overrides.reason, 'Auto-blocked: awaiting deposit');
--   ELSE
--     -- 6. No deposit due -> mint immediately; block_date_on_job_confirmed
--     -- blocks the calendar off the jobs INSERT this triggers.
--     v_job_id := public.mint_job_from_quote(p_quote_id);
--   END IF;
--
--   RETURN jsonb_build_object(
--     'deposit_required', v_deposit_due,
--     'deposit_amount',   v_quote.deposit_amount,
--     'job_id',           v_job_id,
--     'confirmed_start',  v_event.start_time
--   );
-- END;
-- $function$;
--
CREATE OR REPLACE FUNCTION public.accept_quote_with_slot(p_quote_id uuid, p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_quote              public.issued_quotes%ROWTYPE;
  v_event              public.schedule_events%ROWTYPE;
  v_caller_profile_id  uuid;
  v_job_id             uuid;
  v_deposit_due        boolean;
  v_already_confirmed  boolean;
  v_confirmed_date     date;
  v_start_time         time;
  v_block_am           boolean;
  v_block_pm           boolean;
  v_other              record;
  v_quote_rows         integer;
BEGIN
  -- 1. Caller auth.
  SELECT id INTO v_caller_profile_id FROM public.profiles WHERE user_id = auth.uid();
  IF v_caller_profile_id IS NULL THEN
    RAISE EXCEPTION 'accept_quote_with_slot: no profile found for caller';
  END IF;

  SELECT * INTO v_quote FROM public.issued_quotes WHERE id = p_quote_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'accept_quote_with_slot: quote % not found', p_quote_id;
  END IF;

  IF v_quote.recipient_id IS DISTINCT FROM v_caller_profile_id THEN
    RAISE EXCEPTION 'accept_quote_with_slot: not authorised to accept quote %', p_quote_id;
  END IF;

  -- 2. Quote validation.
  IF v_quote.status NOT IN ('sent', 'accepted') THEN
    RAISE EXCEPTION 'accept_quote_with_slot: quote % is not open to acceptance (status=%)', p_quote_id, v_quote.status;
  END IF;

  IF v_quote.valid_until < CURRENT_DATE THEN
    RAISE EXCEPTION 'accept_quote_with_slot: quote % has expired (valid_until=%)', p_quote_id, v_quote.valid_until;
  END IF;

  IF v_quote.recipient_response IS NOT NULL AND v_quote.recipient_response <> 'accepted' THEN
    RAISE EXCEPTION 'accept_quote_with_slot: quote % has already been responded to (%)', p_quote_id, v_quote.recipient_response;
  END IF;

  -- 3. Event validation.
  SELECT * INTO v_event FROM public.schedule_events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'accept_quote_with_slot: schedule proposal % not found', p_event_id;
  END IF;

  IF v_event.quote_id IS DISTINCT FROM p_quote_id THEN
    RAISE EXCEPTION 'accept_quote_with_slot: proposal % does not belong to quote %', p_event_id, p_quote_id;
  END IF;

  IF v_event.event_type <> 'quote_proposal' THEN
    RAISE EXCEPTION 'accept_quote_with_slot: proposal % is not a quote scheduling proposal', p_event_id;
  END IF;

  v_already_confirmed := v_event.status = 'accepted' AND v_event.is_confirmed = true;

  IF v_event.status <> 'proposed' AND NOT v_already_confirmed THEN
    RAISE EXCEPTION 'accept_quote_with_slot: proposal % is no longer available (status=%)', p_event_id, v_event.status;
  END IF;

  IF NOT v_already_confirmed THEN
    UPDATE public.schedule_events
    SET status = 'accepted', is_confirmed = true
    WHERE id = p_event_id;
  END IF;

  UPDATE public.schedule_events
  SET status = 'declined', is_confirmed = false
  WHERE quote_id = p_quote_id
    AND event_type = 'quote_proposal'
    AND status = 'proposed'
    AND id <> p_event_id;

  -- 4. Quote acceptance.
  UPDATE public.issued_quotes
  SET recipient_response = 'accepted',
      accepted_at        = COALESCE(accepted_at, now()),
      responded_at       = COALESCE(responded_at, now()),
      status              = CASE WHEN status = 'sent' THEN 'accepted' ELSE status END
  WHERE id = p_quote_id;

  -- 4a. NEW — accept this recipient, decline the rest of the field.
  -- Guarded on enquiry_id IS NOT NULL: a quote not tied to any enquiry
  -- (direct/panel sourced) has no siblings to speak of.
  IF v_quote.enquiry_id IS NOT NULL THEN
    UPDATE public.enquiry_recipients
    SET status = 'accepted', responded_at = COALESCE(responded_at, now())
    WHERE enquiry_id = v_quote.enquiry_id AND contractor_id = v_quote.contractor_id;

    FOR v_other IN
      SELECT contractor_id FROM public.enquiry_recipients
      WHERE enquiry_id = v_quote.enquiry_id AND contractor_id <> v_quote.contractor_id
    LOOP
      UPDATE public.enquiry_recipients
      SET status = 'declined',
          decline_reason_code = 'auto_accepted_another',
          responded_at = now()
      WHERE enquiry_id = v_quote.enquiry_id AND contractor_id = v_other.contractor_id;

      -- That contractor's own quote against this enquiry, if they'd sent
      -- one — reuses the SAME status/response values a manual decline
      -- already writes (see decline_quote below), not a new vocabulary.
      -- This UPDATE fires the existing on_quote_response trigger (fires on
      -- any recipient_response change), which already notifies both
      -- parties — tracked via v_quote_rows so the explicit notify below
      -- isn't sent twice to the same contractor.
      UPDATE public.issued_quotes
      SET recipient_response = 'rejected',
          status = CASE WHEN status = 'sent' THEN 'rejected' ELSE status END,
          responded_at = COALESCE(responded_at, now())
      WHERE enquiry_id = v_quote.enquiry_id
        AND contractor_id = v_other.contractor_id
        AND recipient_response IS NULL;
      GET DIAGNOSTICS v_quote_rows = ROW_COUNT;

      -- Their pending proposals against this enquiry — both kinds, scoped
      -- to this one contractor, not the whole enquiry (SiteVisitReviewDialog's
      -- bug from Step 1 is exactly what this guards against repeating).
      UPDATE public.schedule_events
      SET status = 'declined', is_confirmed = false
      WHERE enquiry_id = v_quote.enquiry_id
        AND contractor_id = v_other.contractor_id
        AND event_type IN ('site_visit', 'quote_proposal')
        AND status = 'proposed';

      -- Only this recipient's OWN quote update (above) fires
      -- on_quote_response — a recipient who never sent a quote has no
      -- issued_quotes row to transition, so they'd otherwise hear nothing
      -- at all. One notification per losing recipient either way: via
      -- on_quote_response when they had a quote, explicitly here when
      -- they didn't.
      IF v_quote_rows = 0 THEN
        INSERT INTO public.notifications (user_id, title, message, type, reference_type, reference_id, is_read)
        VALUES (
          v_other.contractor_id,
          'Quote not selected',
          'The client has accepted a different quote for "' || v_quote.title || '".',
          'quote_declined', 'enquiry', v_quote.enquiry_id, false
        );
      END IF;
    END LOOP;
  END IF;

  v_deposit_due := COALESCE(v_quote.deposit_required, false) AND COALESCE(v_quote.deposit_amount, 0) > 0;

  IF v_deposit_due THEN
    -- 5. Deposit gate holds the mint — block the calendar now, same
    -- expression and tighten-only merge as block_date_on_job_confirmed
    -- (20260704130000), so the two never disagree once the trigger takes
    -- over at job-insert time.
    v_confirmed_date := v_event.start_time::date;
    v_start_time := v_event.start_time::time;

    IF extract(hour FROM v_start_time) < 12 THEN
      v_block_am := true;  v_block_pm := false;
    ELSE
      v_block_am := false; v_block_pm := true;
    END IF;

    INSERT INTO public.contractor_availability_overrides (
      contractor_id, date, am_available, pm_available, reason
    )
    VALUES (
      v_quote.contractor_id, v_confirmed_date,
      NOT v_block_am, NOT v_block_pm,
      'Auto-blocked: awaiting deposit'
    )
    ON CONFLICT (contractor_id, date)
    DO UPDATE SET
      am_available = contractor_availability_overrides.am_available AND NOT v_block_am,
      pm_available = contractor_availability_overrides.pm_available AND NOT v_block_pm,
      reason = COALESCE(contractor_availability_overrides.reason, 'Auto-blocked: awaiting deposit');
  ELSE
    -- 6. No deposit due -> mint immediately; block_date_on_job_confirmed
    -- blocks the calendar off the jobs INSERT this triggers.
    v_job_id := public.mint_job_from_quote(p_quote_id);
  END IF;

  RETURN jsonb_build_object(
    'deposit_required', v_deposit_due,
    'deposit_amount',   v_quote.deposit_amount,
    'job_id',           v_job_id,
    'confirmed_start',  v_event.start_time
  );
END;
$function$;

-- ── decline_quote — the homeowner's direct-decline path (not tied to
-- accepting anything else). Closes the gap found in Step 0: today's
-- client-side reject (respondToQuote) only ever touches issued_quotes,
-- leaving enquiry_recipients looking identical to a live, undecided row.
-- Reason is optional — NULL skips it (a forced picker on an already
-- awkward action produces nothing but five-first-option noise).
-- 'auto_accepted_another' is reserved for the automatic path above —
-- a homeowner cannot pass it here.
CREATE OR REPLACE FUNCTION public.decline_quote(p_quote_id uuid, p_reason_code text DEFAULT NULL, p_reason_note text DEFAULT NULL)
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

  IF p_reason_code IS NOT NULL AND p_reason_code NOT IN ('price', 'timing', 'went_elsewhere', 'changed_mind') THEN
    RAISE EXCEPTION 'decline_quote: unrecognised reason code %', p_reason_code;
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
      responded_at = COALESCE(responded_at, now())
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

REVOKE ALL ON FUNCTION public.decline_quote(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decline_quote(uuid, text, text) TO authenticated;
