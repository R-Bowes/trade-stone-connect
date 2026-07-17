-- 20260717150000_accept_quote_with_slot_full_contract.sql
--
-- Third amendment to accept_quote_with_slot — restates the FULL contract in
-- one CREATE OR REPLACE rather than patching again, per review: three
-- amendments in one build is the point past which "diff on top of a diff"
-- stops being readable. Anyone auditing this function should be able to
-- read this single migration and know its complete behaviour; the two
-- prior amendments (20260717120000, 20260717140000) remain applied history
-- but are superseded in full by the body below.
--
-- What changed this pass: client-side calendar blocking for the
-- pending-deposit gap (src/lib/blockContractorAvailability.ts, called from
-- QuoteAcceptScreen and DepositPaymentDialog) is REMOVED. Reasons: it was a
-- raw client write of a consequential transition; a customer writing
-- contractor availability had an untested RLS story either way; an
-- abandoned deposit flow left the block stranded with no release path; its
-- UTC-hour arithmetic diverged from the trigger's own start_time::time
-- expression; and in the no-deposit path it double-blocked what the
-- jobs-insert trigger (block_date_on_job_confirmed,
-- 20260704130000_scheduling_redesign_schema.sql) already does. The block for
-- a deposit-pending confirm now happens HERE, server-side, inside the same
-- transaction as the rest of this function — using the exact AM/PM
-- expression block_date_on_job_confirmed uses (start_time::time,
-- extract(hour) < 12) and the same tighten-only merge, so the two blocking
-- paths (this function pre-mint, the trigger post-mint) never disagree.
--
-- 'Auto-blocked: awaiting deposit' overrides have no release path yet if the
-- customer abandons payment. Tracked in LATER.md under the future auto-lapse
-- mechanism for unpaid accepted quotes: that mechanism must also release
-- this override and un-confirm the schedule_events row when it lapses a
-- quote, not just flip the quote's own status.
--
-- FULL CONTRACT (this function, current version):
-- 1. Caller auth: resolves the caller's own profiles row via
--    profiles.user_id = auth.uid() (two-step lookup); must equal the
--    quote's recipient_id.
-- 2. Quote validation: status IN ('sent','accepted'); recipient_response
--    IS NULL or 'accepted' (rejects rejected/stalled); valid_until >=
--    current_date.
-- 3. Event validation: must belong to the quote, event_type='quote_proposal'.
--    status='proposed' -> flip to accepted/is_confirmed and this is the
--    confirming write. Already accepted/is_confirmed for this quote
--    (a contractor may have confirmed it directly, outside this RPC,
--    per the confirm-path division of labour: scheduling agreement is
--    bilateral, the transaction is recipient-only) -> idempotent skip of
--    the flip. Anything else -> reject as no longer available.
--    Sibling proposed rows are always declined, regardless of which path
--    confirmed the chosen one.
-- 4. Quote acceptance: recipient_response/accepted_at/responded_at/status
--    set (idempotent if respondToQuote already set them).
-- 5. Deposit gate: if deposit_required and deposit_amount > 0, the job is
--    NOT minted here (LOCKED DECISION 1 — the stripe-webhook mints on
--    payment_intent.succeeded). Instead this upserts
--    contractor_availability_overrides for the confirmed slot's date so the
--    calendar is blocked from the moment of confirmation, not just from the
--    moment a job exists.
-- 6. No deposit gate: mint_job_from_quote runs immediately; its own jobs
--    INSERT fires block_date_on_job_confirmed, which blocks the calendar
--    exactly as it always has. Nothing new to do here for this path.

CREATE OR REPLACE FUNCTION public.accept_quote_with_slot(p_quote_id uuid, p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.accept_quote_with_slot(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_quote_with_slot(uuid, uuid) TO authenticated;
