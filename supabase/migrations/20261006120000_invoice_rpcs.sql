-- ROLLBACK (run in this order if this migration must be undone; dropping the
-- void_* columns discards any void reasons recorded since):
--   drop function public.respond_to_invoice(uuid, text);
--   drop function public.record_manual_payment(uuid, text);
--   drop function public.void_invoice(uuid, uuid, text);
--   alter table public.invoices drop column void_reason;
--   alter table public.invoices drop column voided_at;
--   alter table public.invoices drop column voided_by;
--   -- accept_quote_with_slot: re-run its body from before this migration,
--   -- changing the one deposit line back to:
--   --   v_deposit_due := COALESCE(v_quote.deposit_required, false) AND COALESCE(v_quote.deposit_amount, 0) > 0;
--   -- (the rest of the function is unchanged here).
--
-- Invoices hardening, step 1, migration 1 of 2 (additive RPCs + one fix).
--
-- Gives every legitimate client-side invoice write a server path, ahead of
-- migration 2 (20261006130000) removing the customer's direct UPDATE:
--   respond_to_invoice     customer stalls or queries a sent invoice
--   record_manual_payment  contractor records an off-platform payment
--                          (replaces both "Mark as Paid" and "Record Payment")
--   void_invoice           voids an unpaid sent invoice for its contractor or
--                          a platform admin. service_role only: called by
--                          the void-invoice edge function, which cancels any
--                          open Stripe PaymentIntent first so a voided
--                          invoice can never still be paid.
-- adds invoices.void_reason / voided_at / voided_by, and fixes
-- accept_quote_with_slot charging a deposit that is already paid.
--
-- Money rule (matches src/lib/invoiceMoney.ts amountOutstanding):
--   outstanding = max(0, total - deposit settled), where deposit settled is
--   0 unless deposit_paid, and then deposit_deducted if > 0, else
--   deposit_amount.
--
-- Statuses: invoices_status_valid allows draft, sent, viewed, paid, void.
-- payments_status_check does NOT allow 'completed' (the old client path's
-- value, which is why manual payments have always failed); 'released' is
-- what stripe-webhook writes for a settled payment and is used here.

-- ── 0. Void record ───────────────────────────────────────────────────────────
-- Written only by void_invoice. voided_by is an auth user id: an admin
-- actor has no profiles row, so this references auth.users, like
-- payments.payer_id / payee_id.
ALTER TABLE public.invoices
  ADD COLUMN void_reason text,
  ADD COLUMN voided_at   timestamptz,
  ADD COLUMN voided_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- ── 1. respond_to_invoice ────────────────────────────────────────────────────
-- The customer's only legitimate write to an invoice.
CREATE FUNCTION public.respond_to_invoice(p_invoice_id uuid, p_response text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv public.invoices%ROWTYPE;
BEGIN
  IF p_response IS NULL OR p_response NOT IN ('stalled', 'queried') THEN
    RAISE EXCEPTION 'A response must be stalled or queried.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_inv FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found.' USING ERRCODE = 'no_data_found';
  END IF;

  -- invoices.recipient_id references profiles(user_id), i.e. auth.uid().
  IF v_inv.recipient_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the recipient of this invoice can respond to it.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_inv.status NOT IN ('sent', 'viewed') THEN
    RAISE EXCEPTION 'This invoice is % and cannot be responded to.', v_inv.status
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.invoices
  SET recipient_response = p_response,
      responded_at       = now()
  WHERE id = p_invoice_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice % was not updated.', p_invoice_id USING ERRCODE = 'no_data_found';
  END IF;
END;
$$;
REVOKE ALL     ON FUNCTION public.respond_to_invoice(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.respond_to_invoice(uuid, text) TO authenticated;

-- ── 2. record_manual_payment ─────────────────────────────────────────────────
-- One payments row (type 'manual', status 'released', no platform fee) and
-- the invoice marked paid, in one transaction. The amount is what is still
-- payable under the money rule above, never a client-supplied figure.
-- Returns the new payments.id, or NULL when nothing was outstanding (the
-- invoice is closed as paid without inventing a zero-value payment).
CREATE FUNCTION public.record_manual_payment(p_invoice_id uuid, p_notes text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv              public.invoices%ROWTYPE;
  v_deposit_settled  numeric;
  v_amount           numeric;
  v_payment_id       uuid;
BEGIN
  SELECT * INTO v_inv FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found.' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_inv.contractor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the contractor who issued this invoice can record a payment on it.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_inv.status = 'draft' THEN
    RAISE EXCEPTION 'Send this invoice before recording a payment on it.' USING ERRCODE = 'check_violation';
  ELSIF v_inv.status NOT IN ('sent', 'viewed') THEN
    RAISE EXCEPTION 'This invoice is % and cannot take a payment.', v_inv.status
      USING ERRCODE = 'check_violation';
  END IF;

  -- An unpaid deposit is collected by card through accept-quote, which is
  -- what mints the job. Marking the invoice paid here would leave the quote
  -- unpaid and the job never minted.
  IF COALESCE(v_inv.deposit_amount, 0) > 0 AND NOT COALESCE(v_inv.deposit_paid, false) THEN
    RAISE EXCEPTION 'This invoice has an unpaid deposit. The deposit must be paid by card first.'
      USING ERRCODE = 'check_violation';
  END IF;

  v_deposit_settled := CASE
    WHEN NOT COALESCE(v_inv.deposit_paid, false) THEN 0
    WHEN COALESCE(v_inv.deposit_deducted, 0) > 0 THEN v_inv.deposit_deducted
    ELSE COALESCE(v_inv.deposit_amount, 0)
  END;
  v_amount := GREATEST(0, COALESCE(v_inv.total, 0) - v_deposit_settled);

  IF v_amount > 0 THEN
    INSERT INTO public.payments (
      invoice_id, job_id, payer_id, payee_id, amount,
      platform_fee, contractor_payout, status, type, notes,
      country_code, currency
    ) VALUES (
      v_inv.id, v_inv.job_id, v_inv.recipient_id, v_inv.contractor_id, v_amount,
      0, v_amount, 'released', 'manual',
      COALESCE(NULLIF(btrim(p_notes), ''), 'Manual payment'),
      v_inv.country_code, v_inv.currency
    )
    RETURNING id INTO v_payment_id;
  END IF;

  -- Fires invoice_paid_marks_stage (auto_mark_stage_paid) and
  -- payment_triggers_score_recalc, exactly as a Stripe payment does.
  UPDATE public.invoices
  SET status    = 'paid',
      paid_date = CURRENT_DATE
  WHERE id = p_invoice_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice % was not updated.', p_invoice_id USING ERRCODE = 'no_data_found';
  END IF;

  RETURN v_payment_id;
END;
$$;
REVOKE ALL     ON FUNCTION public.record_manual_payment(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.record_manual_payment(uuid, text) TO authenticated;

-- ── 3. void_invoice ──────────────────────────────────────────────────────────
-- Unpaid sent invoices only. A draft is deleted, not voided. Refuses when
-- any money has moved: a paid deposit, or any payments row that has not
-- failed. Carrying a paid deposit onto a reissued invoice is step 2.
--
-- service_role only. The void-invoice edge function authenticates the user,
-- cancels any open Stripe PaymentIntent on the invoice (refusing if it has
-- succeeded or is processing), then calls this with p_actor = that user.
-- Authorisation is therefore checked against p_actor, not auth.uid():
-- the invoice's contractor, or a platform admin (admin_users, the same
-- table is_platform_admin() reads).
-- A payment stage invoiced on this invoice goes back to 'ready' so it can
-- be billed again.
CREATE FUNCTION public.void_invoice(p_invoice_id uuid, p_actor uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv public.invoices%ROWTYPE;
BEGIN
  IF p_actor IS NULL THEN
    RAISE EXCEPTION 'An acting user is required to void an invoice.' USING ERRCODE = 'null_value_not_allowed';
  END IF;

  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'A reason is required to void an invoice.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_inv FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found.' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_inv.contractor_id IS DISTINCT FROM p_actor
     AND NOT EXISTS (SELECT 1 FROM public.admin_users au WHERE au.user_id = p_actor) THEN
    RAISE EXCEPTION 'Only the contractor who issued this invoice, or a platform admin, can void it.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_inv.status = 'draft' THEN
    RAISE EXCEPTION 'A draft invoice is deleted, not voided.' USING ERRCODE = 'check_violation';
  ELSIF v_inv.status NOT IN ('sent', 'viewed') THEN
    RAISE EXCEPTION 'This invoice is % and cannot be voided.', v_inv.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF COALESCE(v_inv.deposit_paid, false) THEN
    RAISE EXCEPTION 'A deposit has been paid on this invoice, so it cannot be voided yet.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.payments p
    WHERE p.invoice_id = p_invoice_id
      AND COALESCE(p.status, 'pending') <> 'failed'
  ) THEN
    RAISE EXCEPTION 'A payment has been recorded against this invoice, so it cannot be voided.'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.invoices
  SET status      = 'void',
      void_reason = btrim(p_reason),
      voided_at   = now(),
      voided_by   = p_actor
  WHERE id = p_invoice_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice % was not updated.', p_invoice_id USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE public.payment_stages
  SET status = 'ready', invoice_id = NULL
  WHERE invoice_id = p_invoice_id;
END;
$$;
REVOKE ALL     ON FUNCTION public.void_invoice(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.void_invoice(uuid, uuid, text) TO service_role;

-- ── 4. accept_quote_with_slot: no deposit due once it is paid ────────────────
-- Live definition reproduced verbatim (pg_get_functiondef, 6 Oct 2026) with
-- ONE line changed: v_deposit_due now also requires NOT deposit_paid. On a
-- repeat call for a quote whose deposit is paid, the no-deposit branch runs
-- mint_job_from_quote, which is idempotent and returns the existing job, and
-- the result reports deposit_required = false. accept-quote then returns
-- early and creates no second invoice or PaymentIntent.
-- CREATE OR REPLACE keeps the function's owner and grants.

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

  v_deposit_due := COALESCE(v_quote.deposit_required, false) AND COALESCE(v_quote.deposit_amount, 0) > 0
                   AND NOT COALESCE(v_quote.deposit_paid, false);

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
