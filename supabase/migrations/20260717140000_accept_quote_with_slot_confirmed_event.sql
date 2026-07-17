-- 20260717140000_accept_quote_with_slot_confirmed_event.sql
--
-- Corrective amendment to accept_quote_with_slot (20260717120000). Confirm-
-- path resolution, this build: slot AGREEMENT is bilateral (either party can
-- confirm a proposed date via the existing direct schedule_events update --
-- InlineConfirmDate, contractor-mode negotiation), but the TRANSACTION
-- (quote acceptance + deposit + job mint) is recipient-only, always via this
-- RPC. That split means a contractor may already have confirmed the event
-- (status='accepted', is_confirmed=true) by the time the recipient calls
-- this RPC to actually transact -- the original version only accepted
-- status='proposed' and would reject that case with "no longer available".
--
-- Amended: the event step is now idempotent over prior agreement. If the
-- event is already the accepted/confirmed quote_proposal for this quote,
-- the flip is skipped (nothing to do) but sibling proposed rows are still
-- declined defensively, and the function proceeds straight to quote
-- acceptance / deposit gate / mint exactly as before. Anything else
-- (a different status, or an event that isn't this quote's accepted one)
-- is still rejected.

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
BEGIN
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

  IF v_quote.status NOT IN ('sent', 'accepted') THEN
    RAISE EXCEPTION 'accept_quote_with_slot: quote % is not open to acceptance (status=%)', p_quote_id, v_quote.status;
  END IF;

  IF v_quote.valid_until < CURRENT_DATE THEN
    RAISE EXCEPTION 'accept_quote_with_slot: quote % has expired (valid_until=%)', p_quote_id, v_quote.valid_until;
  END IF;

  IF v_quote.recipient_response IS NOT NULL AND v_quote.recipient_response <> 'accepted' THEN
    RAISE EXCEPTION 'accept_quote_with_slot: quote % has already been responded to (%)', p_quote_id, v_quote.recipient_response;
  END IF;

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

  -- Idempotent over prior agreement: a contractor-side confirm (direct
  -- schedule_events update, outside this RPC) may already have flipped this
  -- exact event to accepted/is_confirmed before the recipient transacts.
  v_already_confirmed := v_event.status = 'accepted' AND v_event.is_confirmed = true;

  IF v_event.status <> 'proposed' AND NOT v_already_confirmed THEN
    RAISE EXCEPTION 'accept_quote_with_slot: proposal % is no longer available (status=%)', p_event_id, v_event.status;
  END IF;

  IF NOT v_already_confirmed THEN
    -- 1. Confirm the chosen event.
    UPDATE public.schedule_events
    SET status = 'accepted', is_confirmed = true
    WHERE id = p_event_id;
  END IF;

  -- 2. Decline every other still-open proposal for this quote (matches the
  -- negotiation's own vocabulary -- see useQuoteScheduling.ts's acceptProposal).
  -- Runs regardless of v_already_confirmed: a contractor-side confirm already
  -- declines siblings itself, but this is a harmless no-op re-assertion if so,
  -- and a real cleanup step if this RPC is doing the confirming itself.
  UPDATE public.schedule_events
  SET status = 'declined', is_confirmed = false
  WHERE quote_id = p_quote_id
    AND event_type = 'quote_proposal'
    AND status = 'proposed'
    AND id <> p_event_id;

  -- 3. Mark the quote accepted (idempotent if respondToQuote already did this).
  UPDATE public.issued_quotes
  SET recipient_response = 'accepted',
      accepted_at        = COALESCE(accepted_at, now()),
      responded_at       = COALESCE(responded_at, now()),
      status              = CASE WHEN status = 'sent' THEN 'accepted' ELSE status END
  WHERE id = p_quote_id;

  v_deposit_due := COALESCE(v_quote.deposit_required, false) AND COALESCE(v_quote.deposit_amount, 0) > 0;

  -- 4. No deposit due -> mint the job immediately. Deposit due -> the caller
  -- (accept-quote edge function) takes the payment and the stripe-webhook
  -- mints the job on payment success (LOCKED DECISION 1).
  IF NOT v_deposit_due THEN
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
