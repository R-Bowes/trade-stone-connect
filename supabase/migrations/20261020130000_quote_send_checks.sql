-- Quote lock follow-ups (browser check, 20 Oct 2026).
--
-- 1. A quote's figures are checked when it is sent, not only when it is
--    accepted. _quote_figures_problem = the rules _invoice_figures_problem
--    already applies at acceptance (accept-quote calls _quote_invoice_problem)
--    — every line has a description, a quantity > 0, a unit price >= 0 and
--    total = quantity × unit price; subtotal = the sum of the lines; tax only
--    when the contractor is VAT registered; tax = subtotal × rate and
--    total = subtotal + tax, at 2dp — plus the deposit: when a deposit is
--    required, a percentage of 1–100 and deposit = total × percentage at 2dp.
--    send_quote runs it on the draft; the lock guard runs it on a direct
--    insert with status 'sent' (SendQuoteDialog). Drafts are not checked.
-- 2. Sending a revision carries the parent's open date proposals over to it
--    (re-pointed, not copied: the parent is superseded in the same step, so
--    a copy would leave a second set of 'proposed' dates on a dead quote; the
--    proposal-notification trigger fires on INSERT only, so re-pointing does
--    not notify again — on_quote_sent already tells the customer). Only when
--    the revision has no proposals of its own.
--
-- Live quotes are not touched. As of 20 Oct, every quote except Q-21 would
-- fail rule 1 (20% tax from a contractor not VAT registered — test data from
-- before the 12 Oct invoice lock, which acceptance already refuses), and the
-- sent revision Q-21.2 fails the deposit rule (0%, £5 of £60).
--
-- New writer of schedule_events: send_quote (the next pre-flight's list:
-- accept_quote_with_slot, mint_job_from_quote, send_quote).

-- ── 0. Pre-flight ────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regprocedure('public._invoice_figures_problem(uuid, jsonb, numeric, numeric, numeric, numeric)') IS NULL THEN
    RAISE EXCEPTION '_invoice_figures_problem missing';
  END IF;
  -- The bodies being replaced must be the ones 20261020120000 created.
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'issued_quotes_lock_guard'
                 AND position('sent_at is always the server''s clock' IN prosrc) > 0)
     OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'send_quote'
                    AND position('on_quote_sent (sent_at NULL' IN prosrc) > 0) THEN
    RAISE EXCEPTION 'issued_quotes_lock_guard / send_quote are not the 20261020120000 versions; apply that first or review drift';
  END IF;
  IF to_regprocedure('public._quote_figures_problem(uuid, jsonb, numeric, numeric, numeric, numeric, boolean, numeric, numeric)') IS NOT NULL THEN
    RAISE EXCEPTION '_quote_figures_problem already exists — this migration appears to be applied';
  END IF;
  IF (SELECT array_agg(p.proname::text ORDER BY p.proname)
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosrc ~* '(update|insert\s+into|delete\s+from)\s+(public\.)?schedule_events\M')
     IS DISTINCT FROM ARRAY['accept_quote_with_slot', 'mint_job_from_quote'] THEN
    RAISE EXCEPTION 'Unaccounted schedule_events writer(s)';
  END IF;
END $$;

-- ── 1. The figure check ──────────────────────────────────────────────────────
-- SECURITY DEFINER so it can call _invoice_figures_problem (service_role
-- only); EXECUTE for authenticated because the lock guard is SECURITY
-- INVOKER and runs as the inserting contractor. It reveals no more than
-- whether a contractor is VAT registered.
CREATE FUNCTION public._quote_figures_problem(
  p_contractor_id uuid, p_items jsonb, p_subtotal numeric, p_tax_rate numeric, p_tax_amount numeric,
  p_total numeric, p_deposit_required boolean, p_deposit_percentage numeric, p_deposit_amount numeric
)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_problem text;
  v_deposit numeric;
BEGIN
  v_problem := public._invoice_figures_problem(p_contractor_id, p_items, p_subtotal, p_tax_rate, p_tax_amount, p_total);
  IF v_problem IS NOT NULL THEN
    RETURN replace(v_problem, 'before issuing this invoice', 'before sending this quote');
  END IF;

  IF COALESCE(p_deposit_required, false) THEN
    IF p_deposit_percentage IS NULL OR p_deposit_percentage <= 0 OR p_deposit_percentage > 100 THEN
      RETURN 'A deposit needs a percentage between 1% and 100% of the total.';
    END IF;
    v_deposit := round(p_total * p_deposit_percentage / 100, 2);
    IF p_deposit_amount IS NULL OR round(p_deposit_amount, 2) <> v_deposit THEN
      RETURN format('The deposit should be £%s (%s%% of £%s).',
        to_char(v_deposit, 'FM999999990.00'), trim(to_char(p_deposit_percentage, 'FM990.##'), '.'),
        to_char(round(p_total, 2), 'FM999999990.00'));
    END IF;
  END IF;

  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public._quote_figures_problem(uuid, jsonb, numeric, numeric, numeric, numeric, boolean, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._quote_figures_problem(uuid, jsonb, numeric, numeric, numeric, numeric, boolean, numeric, numeric) TO authenticated, service_role;

-- ── 2. send_quote: check the figures; carry the parent's open dates over ────
CREATE OR REPLACE FUNCTION public.send_quote(p_quote_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_quote   public.issued_quotes%ROWTYPE;
  v_parent  public.issued_quotes%ROWTYPE;
  v_problem text;
BEGIN
  SELECT * INTO v_quote FROM public.issued_quotes WHERE id = p_quote_id FOR UPDATE;
  IF NOT FOUND OR v_quote.contractor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Quote not found.' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_quote.status <> 'draft' THEN
    RAISE EXCEPTION 'Only a draft quote can be sent (this one is %).', v_quote.status USING ERRCODE = 'check_violation';
  END IF;

  -- An accepted original is the first thing to tell the contractor; then
  -- the figures. Nothing is changed until both pass.
  IF v_quote.parent_quote_id IS NOT NULL THEN
    SELECT * INTO v_parent FROM public.issued_quotes WHERE id = v_quote.parent_quote_id FOR UPDATE;
    IF v_parent.status = 'accepted' OR v_parent.recipient_response = 'accepted' THEN
      RAISE EXCEPTION 'The original quote was accepted while this revision was in draft.' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  v_problem := public._quote_figures_problem(v_quote.contractor_id, v_quote.items, v_quote.subtotal, v_quote.tax_rate,
    v_quote.tax_amount, v_quote.total, v_quote.deposit_required, v_quote.deposit_percentage, v_quote.deposit_amount);
  IF v_problem IS NOT NULL THEN
    RAISE EXCEPTION '%', v_problem USING ERRCODE = 'check_violation';
  END IF;

  IF v_quote.parent_quote_id IS NOT NULL THEN
    UPDATE public.issued_quotes SET status = 'superseded'
    WHERE id = v_parent.id AND status IN ('sent', 'rejected');

    -- The dates the customer was offered on the parent stay on offer.
    IF NOT EXISTS (SELECT 1 FROM public.schedule_events
                   WHERE quote_id = p_quote_id AND event_type = 'quote_proposal') THEN
      UPDATE public.schedule_events SET quote_id = p_quote_id
      WHERE quote_id = v_parent.id AND event_type = 'quote_proposal' AND status = 'proposed';
    END IF;
  END IF;

  -- on_quote_sent (sent_at NULL → set) notifies the recipient, as before.
  UPDATE public.issued_quotes SET status = 'sent', sent_at = now() WHERE id = p_quote_id;
END;
$function$;

-- ── 3. Guard: the same check on a direct insert with status 'sent' ──────────
-- Unchanged from 20261020120000 except the figure check in the INSERT branch.
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

REVOKE ALL ON FUNCTION public.issued_quotes_lock_guard() FROM PUBLIC, anon, authenticated;

-- ── 4. Post-flight ───────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT has_function_privilege('authenticated', 'public._quote_figures_problem(uuid, jsonb, numeric, numeric, numeric, numeric, boolean, numeric, numeric)', 'EXECUTE')
     OR has_function_privilege('anon', 'public._quote_figures_problem(uuid, jsonb, numeric, numeric, numeric, numeric, boolean, numeric, numeric)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.send_quote(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.send_quote(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'function grants not as intended';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'issued_quotes_lock_guard' AND position('_quote_figures_problem' IN prosrc) > 0)
     OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'send_quote' AND position('_quote_figures_problem' IN prosrc) > 0) THEN
    RAISE EXCEPTION 'figure check not wired into the guard and send_quote';
  END IF;
END $$;
