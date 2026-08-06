-- supabase/migrations/20260807250000_refund_request_approve_reject.sql
-- Brief 2 (refunds): SECURITY DEFINER RPCs for the request/approve/reject
-- steps of the refund flow. Money itself never moves from SQL — Stripe is
-- only ever called from supabase/functions/process-refund/index.ts (Step 3),
-- triggered after approve_refund returns (see that function's own comment
-- header for exactly how — no pg_net call is added here; see this
-- migration's note on approve_refund below).

BEGIN;

-- =========================================================================
-- request_refund — contractor-initiated (D1)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.request_refund(
  p_payment_id    uuid,
  p_amount        numeric,
  p_reason        text,
  p_reason_detail text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_payment       public.payments%ROWTYPE;
  v_contractor_id uuid;
  v_refund_id     uuid;
  v_remaining     numeric;
BEGIN
  -- Lock the payment row for the duration of this transaction — this is
  -- also what serialises two concurrent request_refund calls against the
  -- same payment (the second waits here until the first commits, then its
  -- "already in flight" check below sees the first call's inserted row).
  SELECT * INTO v_payment FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'request_refund: payment % not found', p_payment_id;
  END IF;

  -- Caller must be the contractor on the payment. payee_id is used because
  -- it is populated by every payment-creation path in this codebase
  -- (stripe-webhook's deposit branch, its invoice branch, and
  -- useInvoices.ts's recordManualPayment for off-platform payments) — unlike
  -- invoices.contractor_id (not FK-constrained, per CLAUDE.md) or a job
  -- join (payments.job_id is nullable), payee_id is reliably the contractor
  -- on every payments row this function needs to authorise against.
  SELECT id INTO v_contractor_id FROM public.profiles WHERE user_id = auth.uid();
  IF v_contractor_id IS NULL OR v_payment.payee_id IS DISTINCT FROM v_contractor_id THEN
    RAISE EXCEPTION 'request_refund: not authorised to request a refund on payment %', p_payment_id;
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'request_refund: amount must be greater than zero';
  END IF;

  v_remaining := COALESCE(v_payment.amount, 0) - COALESCE(v_payment.refunded_amount, 0);
  IF p_amount > v_remaining THEN
    RAISE EXCEPTION 'request_refund: amount % exceeds remaining refundable amount % on payment %', p_amount, v_remaining, p_payment_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.refunds
    WHERE payment_id = p_payment_id
      AND status IN ('requested', 'approved', 'processing')
  ) THEN
    RAISE EXCEPTION 'request_refund: a refund is already in flight for payment %', p_payment_id;
  END IF;

  INSERT INTO public.refunds (
    payment_id, invoice_id, job_id, contractor_id, requested_by,
    amount, reason, reason_detail, status
  ) VALUES (
    p_payment_id, v_payment.invoice_id, v_payment.job_id, v_contractor_id, auth.uid(),
    p_amount, p_reason, p_reason_detail, 'requested'
  )
  RETURNING id INTO v_refund_id;

  -- Notify every TradeStone admin. Admin accounts have no profile row
  -- (CLAUDE.md) — notifications.user_id is an auth.users id either way, so
  -- admin_users.user_id is used directly, not routed through profiles.
  INSERT INTO public.notifications (user_id, title, message, type, reference_type, reference_id, is_read)
  SELECT au.user_id,
         'Refund requested',
         'A contractor has requested a £' || p_amount::text || ' refund (' || p_reason || ').',
         'refund_requested', 'refund', v_refund_id, false
  FROM public.admin_users au;

  RETURN v_refund_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.request_refund(uuid, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_refund(uuid, numeric, text, text) TO authenticated;

-- =========================================================================
-- approve_refund — admin-only (D1). Sets status 'approved' only; does NOT
-- call Stripe and does NOT fire a pg_net call to process-refund. The trigger
-- for actually processing the refund is the caller's OWN client invoking
-- supabase/functions/process-refund/index.ts immediately after this RPC
-- returns, using the admin's own session JWT — process-refund itself
-- re-verifies is_tradestone_admin on that JWT (Step 3), which only makes
-- sense against a real end-user identity, not a shared service-role secret.
-- This repo does have a precedent for a SECURITY DEFINER function firing a
-- fire-and-forget net.http_post with the service-role key (see
-- mint_job_from_quote -> sla-clock / send-cooling-off-notice) but that
-- pattern was deliberately NOT reused here — see process-refund's header
-- comment for the full reasoning, and the Brief 2 report for the same.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.approve_refund(p_refund_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_status text;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'approve_refund: not authorised';
  END IF;

  SELECT status INTO v_status FROM public.refunds WHERE id = p_refund_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'approve_refund: refund % not found', p_refund_id;
  END IF;

  IF v_status <> 'requested' THEN
    RAISE EXCEPTION 'approve_refund: refund % is not in requested status (status=%)', p_refund_id, v_status;
  END IF;

  UPDATE public.refunds
  SET status = 'approved',
      approved_by = auth.uid(),
      approved_at = now()
  WHERE id = p_refund_id;

  RETURN p_refund_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.approve_refund(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_refund(uuid) TO authenticated;

-- =========================================================================
-- reject_refund — admin-only (D1)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.reject_refund(p_refund_id uuid, p_reason text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_status        text;
  v_contractor_id uuid;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'reject_refund: not authorised';
  END IF;

  SELECT status, contractor_id INTO v_status, v_contractor_id
  FROM public.refunds WHERE id = p_refund_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'reject_refund: refund % not found', p_refund_id;
  END IF;

  IF v_status <> 'requested' THEN
    RAISE EXCEPTION 'reject_refund: refund % is not in requested status (status=%)', p_refund_id, v_status;
  END IF;

  UPDATE public.refunds
  SET status = 'rejected',
      rejected_reason = p_reason
  WHERE id = p_refund_id;

  INSERT INTO public.notifications (user_id, title, message, type, reference_type, reference_id, is_read)
  VALUES (
    v_contractor_id,
    'Refund request rejected',
    COALESCE('Reason: ' || p_reason, 'Your refund request was rejected.'),
    'refund_rejected', 'refund', p_refund_id, false
  );

  RETURN p_refund_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.reject_refund(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_refund(uuid, text) TO authenticated;

COMMIT;
