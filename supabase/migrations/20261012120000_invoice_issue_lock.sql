-- Invoices hardening, step 1: lock and issue.
--
-- ROLLBACK (run in this order if this migration must be undone):
--   drop policy invoices_recipient_select_issued on public.invoices;
--   create policy "Recipients can view their invoices" on public.invoices
--     for select
--     using (recipient_id in (select profiles.id from profiles where profiles.user_id = auth.uid()));
--   drop trigger invoices_issue_lock_guard_trigger on public.invoices;
--   drop function public.invoices_issue_lock_guard();
--   drop policy invoices_contractor_insert_draft on public.invoices;
--   drop policy invoices_contractor_update_draft on public.invoices;
--   drop policy invoices_contractor_delete_draft on public.invoices;
--   create policy "Contractors can insert their own invoices" on public.invoices
--     for insert
--     with check (contractor_id in (select profiles.id from profiles where profiles.user_id = auth.uid()));
--   create policy "Contractors can update their own invoices" on public.invoices
--     for update
--     using (contractor_id in (select profiles.id from profiles where profiles.user_id = auth.uid()));
--   create policy "Contractors can delete their own invoices" on public.invoices
--     for delete
--     using (contractor_id in (select profiles.id from profiles where profiles.user_id = auth.uid()));
--   create policy "Recipients can respond to their invoices" on public.invoices
--     for update
--     using (recipient_id in (select profiles.id from profiles where profiles.user_id = auth.uid()));
--   revoke insert, update on public.invoices from authenticated;  -- clears the column grants
--   grant insert, update, truncate, references, trigger on public.invoices to authenticated;
--   grant truncate, references, trigger on public.invoices to anon;
--   drop index public.invoices_one_live_per_quote;
--   drop function public.issue_invoice(uuid);
--   drop function public._issue_invoice(uuid);
--   drop function public._quote_invoice_problem(uuid);
--   drop function public._invoice_figures_problem(uuid, jsonb, numeric, numeric, numeric, numeric);
--   create or replace function public.assign_invoice_number()
--   returns trigger language plpgsql security definer set search_path to 'public' as $$
--   begin
--     if new.invoice_number is null then
--       new.invoice_number := next_document_number(new.contractor_id, 'invoice');
--     end if;
--     return new;
--   end;
--   $$;
--   alter table public.invoices drop constraint invoices_number_draft_or_assigned;
--   alter table public.invoices alter column invoice_number set not null;
--   alter table public.invoices drop column supplier_snapshot;
--   alter table public.invoices drop column customer_snapshot;
--   alter table public.invoices drop column issued_at;
--
-- Replaces live bodies (pasted verbatim below, as read on 2026-10-12, so a
-- rollback can restore them exactly):
--
-- public.next_document_number(uuid, text) -- UNCHANGED, not touched by this migration:
--   CREATE OR REPLACE FUNCTION public.next_document_number(p_contractor_id uuid, p_entity text)
--    RETURNS integer
--    LANGUAGE sql
--    SECURITY DEFINER
--    SET search_path TO 'public'
--   AS $function$
--     INSERT INTO contractor_counters (contractor_id, entity, next_value)
--     VALUES (p_contractor_id, p_entity, 2)
--     ON CONFLICT (contractor_id, entity)
--     DO UPDATE SET next_value = contractor_counters.next_value + 1
--     RETURNING next_value - 1;
--   $function$
--
-- public.assign_invoice_number() -- REPLACED below (only assigns when NOT a draft):
--   CREATE OR REPLACE FUNCTION public.assign_invoice_number()
--    RETURNS trigger
--    LANGUAGE plpgsql
--    SECURITY DEFINER
--    SET search_path TO 'public'
--   AS $function$
--   BEGIN
--     IF NEW.invoice_number IS NULL THEN
--       NEW.invoice_number := next_document_number(NEW.contractor_id, 'invoice');
--     END IF;
--     RETURN NEW;
--   END;
--   $function$
--
-- Live policies on public.invoices replaced below (two-step profiles-subquery
-- form, pre-this-migration):
--   "Contractors can insert their own invoices" FOR INSERT
--     WITH CHECK (contractor_id IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid()))
--   "Contractors can update their own invoices" FOR UPDATE
--     USING (contractor_id IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid()))
--   "Contractors can delete their own invoices" FOR DELETE
--     USING (contractor_id IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid()))
--   "Recipients can view their invoices" FOR SELECT
--     USING (recipient_id IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid()))
--   "Recipients can respond to their invoices" FOR UPDATE
--     USING (recipient_id IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid()))
--
-- Live column grants replaced below (confirmed via information_schema.column_privileges
-- on 2026-10-12: authenticated held ALL privilege types on ALL columns -- no
-- column restriction at all):
--   GRANT INSERT, UPDATE, TRUNCATE, REFERENCES, TRIGGER ON public.invoices TO authenticated, anon;
--
-- What this migration does:
--
-- 1. Numbering: invoice_number becomes nullable, with a CHECK that only a
--    draft may have a NULL number. assign_invoice_number now only fires for
--    a non-draft INSERT (the only live path is generate_b2b_invoice's direct
--    'sent' insert -- everything else now inserts a draft and issues
--    separately through _issue_invoice, which assigns the number itself on
--    the draft -> sent UPDATE).
-- 2. New columns: supplier_snapshot jsonb, customer_snapshot jsonb, issued_at
--    timestamptz. Server-owned -- not in any column grant to authenticated/anon.
-- 3. _invoice_figures_problem(contractor, items, subtotal, tax_rate,
--    tax_amount, total): one set of figure-validation rules (items,
--    subtotal, tax vs VAT status, total), returning the plain problem
--    message or NULL. _quote_invoice_problem(quote_id) runs the same rules
--    over a quote's own figures, so accept-quote can refuse acceptance
--    before a deposit PaymentIntent is ever created for a quote that could
--    never be issued. _issue_invoice(uuid) is the actual issuing logic
--    (calls _invoice_figures_problem, then due date, numbering,
--    snapshotting). All three ungranted to authenticated/anon -- callable
--    only by service_role and by SECURITY DEFINER functions that run as
--    their owner.
-- 4. issue_invoice(uuid): the authenticated-callable wrapper -- checks the
--    caller owns the invoice, then calls _issue_invoice. Mirrors the
--    project_money / _project_money_rows split (20261011180000).
-- 5. The lock, folded in from the parked 20261006130000 draft and extended
--    with a universal (role-independent) content/number/snapshot immutability
--    check, not just a blanket authenticated/anon block:
--      - one live invoice per quote (partial unique index);
--      - "Recipients can respond to their invoices" dropped -- respond_to_invoice
--        (SECURITY DEFINER) is the only route, confirmed by read-only grep
--        of every .rpc("respond_to_invoice"... and every direct
--        .from("invoices").update(...) call site on 2026-10-12;
--      - contractor writes: insert as a draft only, update/delete drafts only;
--      - column grants: authenticated may INSERT/UPDATE content columns only;
--      - a BEFORE UPDATE OR DELETE guard that (a) blocks deleting a non-draft
--        row for anyone, (b) blocks changing a non-draft row's content, number,
--        snapshot, issued_date or issued_at columns for ANY role including
--        service_role/SECURITY DEFINER functions -- "once issued, never
--        changed, by anyone" -- and (c) separately blocks the authenticated/anon
--        role from changing a non-draft row AT ALL, even the payment-bucket
--        columns that (b) would otherwise allow, so those can only ever move
--        through a SECURITY DEFINER function or the service role;
--      - recipients see an invoice only once issued (SELECT excludes drafts).
--
-- Server writers unaffected by the authenticated/anon block, since none of
-- them runs as those roles (service_role bypasses RLS and column grants
-- entirely; SECURITY DEFINER functions run as their owner):
--   stripe-webhook (service key), create-payment-intent (service key, after
--   this migration calls issue_invoice over the caller's own JWT instead of
--   writing status directly), accept-quote (service key), void-invoice ->
--   void_invoice, mint_job_from_quote, generate_b2b_invoice, anonymise_user,
--   respond_to_invoice, record_manual_payment, issue_invoice/_issue_invoice,
--   assign_invoice_number / update_invoices_updated_at (BEFORE triggers),
--   mark-overdue-invoices (reads only).
-- All of the above are still bound by guard (b): none of them touches a
-- content/number/snapshot column on an already-issued row.

-- ── 0. Pre-flight ────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_expected text[] := ARRAY[
    'id', 'contractor_id', 'client_name', 'client_email', 'client_phone',
    'client_address', 'items', 'subtotal', 'tax_rate', 'tax_amount', 'total',
    'status', 'issued_date', 'due_date', 'paid_date', 'notes', 'created_at',
    'updated_at', 'recipient_id', 'recipient_response', 'responded_at',
    'deposit_amount', 'deposit_paid', 'deposit_paid_at', 'quote_id',
    'stripe_payment_intent_id', 'project_id', 'job_id', 'amount_due',
    'deposit_deducted', 'sent_at', 'viewed_at', 'invoice_number',
    'country_code', 'currency', 'addr_line1', 'addr_line2', 'addr_city',
    'addr_region', 'addr_postcode', 'addr_country', 'addr_lat', 'addr_lng',
    'addr_place_id', 'company_id', 'engagement_id', 'period_start', 'period_end',
    'void_reason', 'voided_at', 'voided_by'
  ];
  v_unlisted   text;
  v_missing    text;
  v_dupes      text;
  v_missing_fn text;
  v_already    boolean;
BEGIN
  -- invoices column list (48 live columns as of 2026-10-12, before the 3 this
  -- migration adds). Every column must be classified above before this can
  -- apply: an unlisted new column would silently be non-writable or
  -- unlocked.
  SELECT string_agg(column_name, ', ' ORDER BY column_name) INTO v_unlisted
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'invoices'
    AND column_name <> ALL (v_expected);

  SELECT string_agg(c, ', ' ORDER BY c) INTO v_missing
  FROM unnest(v_expected) AS c
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'invoices' AND column_name = c
  );

  IF v_unlisted IS NOT NULL OR v_missing IS NOT NULL THEN
    RAISE EXCEPTION
      'invoices column list out of date. Not listed: [%]. Listed but not on the table: [%]. Classify them before applying.',
      coalesce(v_unlisted, ''), coalesce(v_missing, '');
  END IF;

  -- No quote may already have more than one live invoice.
  SELECT string_agg(format('%s (%s live invoices)', quote_id, n), ', ') INTO v_dupes
  FROM (
    SELECT quote_id, count(*) AS n
    FROM public.invoices
    WHERE quote_id IS NOT NULL AND status <> 'void'
    GROUP BY quote_id
    HAVING count(*) > 1
  ) d;

  IF v_dupes IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot add invoices_one_live_per_quote: quotes with more than one live invoice: %. Void the extras manually before applying.',
      v_dupes;
  END IF;

  -- The invoice-RPC baseline (20261006120000) must already be applied.
  SELECT string_agg(f, ', ') INTO v_missing_fn
  FROM unnest(ARRAY[
    'public.respond_to_invoice(uuid, text)',
    'public.record_manual_payment(uuid, text)',
    'public.void_invoice(uuid, uuid, text)'
  ]) AS f
  WHERE to_regprocedure(f) IS NULL;

  IF v_missing_fn IS NOT NULL THEN
    RAISE EXCEPTION 'Missing functions: %. Apply 20261006120000 first.', v_missing_fn;
  END IF;

  -- This migration must not already be applied (idempotency guard -- the
  -- lock index is the clearest single marker).
  SELECT EXISTS (
    SELECT 1 FROM pg_class WHERE relname = 'invoices_one_live_per_quote' AND relkind = 'i'
  ) INTO v_already;
  IF v_already THEN
    RAISE EXCEPTION 'invoices_one_live_per_quote already exists -- this migration appears to already be applied.';
  END IF;
END $$;

-- ── 1. Numbering: a draft has no number ─────────────────────────────────────
ALTER TABLE public.invoices ALTER COLUMN invoice_number DROP NOT NULL;

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_number_draft_or_assigned
  CHECK (status = 'draft' OR invoice_number IS NOT NULL);

-- Existing rows (including today's one live draft) keep whatever they have.
-- The unique constraint (contractor_id, invoice_number) already tolerates
-- unlimited NULLs under standard SQL NULL semantics -- no index change needed.

CREATE OR REPLACE FUNCTION public.assign_invoice_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- A draft inserted from now on gets no number at all -- issuing (through
  -- _issue_invoice) is the only thing that ever assigns one. The only insert
  -- path that still lands here with status <> 'draft' is generate_b2b_invoice.
  IF NEW.invoice_number IS NULL AND NEW.status <> 'draft' THEN
    NEW.invoice_number := next_document_number(NEW.contractor_id, 'invoice');
  END IF;
  RETURN NEW;
END;
$$;

-- ── 2. New columns: server-owned snapshot + issue timestamp ─────────────────
ALTER TABLE public.invoices
  ADD COLUMN supplier_snapshot jsonb,
  ADD COLUMN customer_snapshot jsonb,
  ADD COLUMN issued_at timestamptz;

-- ── 3a. _invoice_figures_problem: one set of figure-validation rules, shared
-- by _issue_invoice (an invoice row) and _quote_invoice_problem (a quote row,
-- checked BEFORE acceptance so a bad quote never gets as far as a deposit
-- PaymentIntent). Returns the plain problem message, or NULL when the
-- figures are fine. Never raises itself -- callers decide what to do with a
-- non-NULL result.
CREATE FUNCTION public._invoice_figures_problem(
  p_contractor_id uuid, p_items jsonb, p_subtotal numeric,
  p_tax_rate numeric, p_tax_amount numeric, p_total numeric
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_item           jsonb;
  v_items_total    numeric := 0;
  v_vat_registered boolean;
BEGIN
  IF jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 THEN
    RETURN 'Add at least one line item before issuing this invoice.';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    IF btrim(coalesce(v_item->>'description', '')) = '' THEN
      RETURN 'Every line item needs a description.';
    END IF;
    IF coalesce((v_item->>'quantity')::numeric, 0) <= 0 THEN
      RETURN 'Every line item needs a quantity greater than zero.';
    END IF;
    IF coalesce((v_item->>'unit_price')::numeric, -1) < 0 THEN
      RETURN 'A line item cannot have a negative unit price.';
    END IF;
    IF round((v_item->>'quantity')::numeric * (v_item->>'unit_price')::numeric, 2)
       <> round(coalesce((v_item->>'total')::numeric, -1), 2) THEN
      RETURN 'A line item total does not match its quantity and unit price.';
    END IF;
    v_items_total := v_items_total + round((v_item->>'total')::numeric, 2);
  END LOOP;

  IF round(v_items_total, 2) <> round(p_subtotal, 2) THEN
    RETURN 'The subtotal does not match the sum of the line items.';
  END IF;

  SELECT fs.vat_status IN ('standard', 'flat_rate') INTO v_vat_registered
  FROM public.finance_settings fs
  WHERE fs.contractor_id = p_contractor_id;

  v_vat_registered := coalesce(v_vat_registered, false);

  IF NOT v_vat_registered AND (p_tax_rate <> 0 OR p_tax_amount <> 0) THEN
    RETURN 'This contractor is not VAT registered, so tax must be zero.';
  END IF;

  IF round(p_subtotal * p_tax_rate / 100, 2) <> round(p_tax_amount, 2) THEN
    RETURN 'The tax amount does not match the subtotal and tax rate.';
  END IF;

  IF round(p_subtotal + p_tax_amount, 2) <> round(p_total, 2) THEN
    RETURN 'The total does not match the subtotal and tax.';
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public._invoice_figures_problem(uuid, jsonb, numeric, numeric, numeric, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._invoice_figures_problem(uuid, jsonb, numeric, numeric, numeric, numeric) TO service_role;

-- ── 3b. _quote_invoice_problem: the same rules, run over a quote's own
-- figures -- so accept-quote can refuse acceptance BEFORE a deposit
-- PaymentIntent is ever created for a quote that could never be issued.
CREATE FUNCTION public._quote_invoice_problem(p_quote_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_quote public.issued_quotes%ROWTYPE;
BEGIN
  SELECT * INTO v_quote FROM public.issued_quotes WHERE id = p_quote_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quote not found.' USING ERRCODE = 'no_data_found';
  END IF;

  RETURN public._invoice_figures_problem(
    v_quote.contractor_id, v_quote.items, v_quote.subtotal,
    v_quote.tax_rate, v_quote.tax_amount, v_quote.total
  );
END;
$$;

REVOKE ALL ON FUNCTION public._quote_invoice_problem(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._quote_invoice_problem(uuid) TO service_role;

-- ── 3c. _issue_invoice: the actual issuing logic ──────────────────────────────
CREATE FUNCTION public._issue_invoice(p_invoice_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_inv            public.invoices%ROWTYPE;
  v_contractor     public.profiles%ROWTYPE;
  v_problem        text;
  v_number         integer;
  v_customer_code  text;
  v_supplier_addr  jsonb;
  v_customer_addr  jsonb;
BEGIN
  SELECT * INTO v_inv FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found.' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_inv.status <> 'draft' THEN
    RAISE EXCEPTION 'Only a draft invoice can be issued.' USING ERRCODE = 'check_violation';
  END IF;

  -- Items, subtotal, tax -- the one shared rule set.
  v_problem := public._invoice_figures_problem(
    v_inv.contractor_id, v_inv.items, v_inv.subtotal,
    v_inv.tax_rate, v_inv.tax_amount, v_inv.total
  );
  IF v_problem IS NOT NULL THEN
    RAISE EXCEPTION '%', v_problem USING ERRCODE = 'check_violation';
  END IF;

  -- Due date.
  IF v_inv.due_date < current_date THEN
    RAISE EXCEPTION 'The due date cannot be before today.' USING ERRCODE = 'check_violation';
  END IF;

  -- Snapshot the supplier (the contractor), as things stand today. No phone,
  -- no email -- CLAUDE.md: no phone numbers or email addresses on the
  -- invoice or its PDF, for either party.
  SELECT * INTO v_contractor FROM public.profiles WHERE id = v_inv.contractor_id;

  v_supplier_addr := jsonb_build_object(
    'line1', v_contractor.addr_line1,
    'line2', v_contractor.addr_line2,
    'city', v_contractor.addr_city,
    'region', v_contractor.addr_region,
    'postcode', coalesce(v_contractor.addr_postcode, v_contractor.postcode),
    'country', v_contractor.addr_country,
    -- Fallback free-text line, for profiles that only ever filled the
    -- legacy `address` column -- structured addr_* fields are empty on
    -- every profile seen live on 2026-10-12.
    'legacy_address', nullif(v_contractor.address, '')
  );

  SELECT ts_profile_code INTO v_customer_code
  FROM public.profiles WHERE id = v_inv.recipient_id;

  v_customer_addr := CASE
    WHEN v_inv.addr_line1 IS NOT NULL OR v_inv.addr_postcode IS NOT NULL THEN
      jsonb_build_object(
        'line1', v_inv.addr_line1, 'line2', v_inv.addr_line2, 'city', v_inv.addr_city,
        'region', v_inv.addr_region, 'postcode', v_inv.addr_postcode, 'country', v_inv.addr_country
      )
    ELSE jsonb_build_object('legacy_address', v_inv.client_address)
  END;

  v_number := next_document_number(v_inv.contractor_id, 'invoice');

  UPDATE public.invoices
  SET invoice_number    = v_number,
      status             = 'sent',
      issued_date        = current_date,
      issued_at          = now(),
      sent_at            = now(),
      supplier_snapshot  = jsonb_build_object(
        'legal_name', v_contractor.full_name,
        'trading_name', v_contractor.company_name,
        'address', v_supplier_addr,
        'country_code', v_contractor.country_code,
        'ts_profile_code', v_contractor.ts_profile_code,
        'vat_status', coalesce((SELECT fs.vat_status FROM public.finance_settings fs WHERE fs.contractor_id = v_inv.contractor_id), 'not_registered'),
        'vat_number', (SELECT fs.vat_number FROM public.finance_settings fs WHERE fs.contractor_id = v_inv.contractor_id)
      ),
      customer_snapshot  = jsonb_build_object(
        'client_name', v_inv.client_name,
        'address', v_customer_addr,
        'ts_profile_code', v_customer_code
      )
  WHERE id = p_invoice_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice % was not updated.', p_invoice_id USING ERRCODE = 'no_data_found';
  END IF;

  RETURN v_number;
END;
$$;

REVOKE ALL ON FUNCTION public._issue_invoice(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._issue_invoice(uuid) TO service_role;

-- ── 4. issue_invoice: the authenticated-callable wrapper ─────────────────────
CREATE FUNCTION public.issue_invoice(p_invoice_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_contractor_id uuid;
BEGIN
  SELECT contractor_id INTO v_contractor_id FROM public.invoices WHERE id = p_invoice_id;
  IF v_contractor_id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found.' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_contractor_id IS DISTINCT FROM auth.uid()
     AND v_contractor_id NOT IN (SELECT acting_contractor_ids()) THEN
    RAISE EXCEPTION 'Only the contractor who owns this invoice can issue it.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN public._issue_invoice(p_invoice_id);
END;
$$;

REVOKE ALL ON FUNCTION public.issue_invoice(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_invoice(uuid) TO authenticated;

-- ── 5. One live invoice per quote ────────────────────────────────────────────
CREATE UNIQUE INDEX invoices_one_live_per_quote
  ON public.invoices (quote_id)
  WHERE quote_id IS NOT NULL AND status <> 'void';

-- ── 6. Customers lose direct UPDATE ──────────────────────────────────────────
-- Confirmed on 2026-10-12: nothing calls this policy's path directly --
-- every client-side invoice response goes through respond_to_invoice (SECURITY
-- DEFINER), and record_manual_payment / void_invoice / webhooks are the only
-- other writers of recipient_response-adjacent columns.
DROP POLICY "Recipients can respond to their invoices" ON public.invoices;

-- ── 7. Contractor writes: drafts only ────────────────────────────────────────
-- Direct auth.uid() form (CLAUDE.md house pattern for new policies --
-- invoices.contractor_id references profiles(user_id), i.e. auth.uid(),
-- exactly as respond_to_invoice / record_manual_payment / void_invoice
-- already compare it).
DROP POLICY "Contractors can insert their own invoices" ON public.invoices;
DROP POLICY "Contractors can update their own invoices" ON public.invoices;
DROP POLICY "Contractors can delete their own invoices" ON public.invoices;

CREATE POLICY invoices_contractor_insert_draft ON public.invoices
  FOR INSERT TO authenticated
  WITH CHECK (
    contractor_id = auth.uid()
    AND status = 'draft'
    AND company_id IS NULL
    AND (job_id IS NULL OR EXISTS (
          SELECT 1 FROM public.jobs j
          WHERE j.id = invoices.job_id AND j.contractor_id = auth.uid()))
    -- A quote-linked invoice is only for the contractor's own accepted quote.
    AND (quote_id IS NULL OR EXISTS (
          SELECT 1 FROM public.issued_quotes q
          WHERE q.id = invoices.quote_id
            AND q.contractor_id = auth.uid()
            AND q.status = 'accepted'))
    -- When both are set, the job must be the one minted from that quote.
    AND (job_id IS NULL OR quote_id IS NULL OR EXISTS (
          SELECT 1 FROM public.jobs j
          WHERE j.id = invoices.job_id AND j.issued_quote_id = invoices.quote_id))
  );

CREATE POLICY invoices_contractor_update_draft ON public.invoices
  FOR UPDATE TO authenticated
  USING (contractor_id = auth.uid() AND status = 'draft')
  WITH CHECK (contractor_id = auth.uid() AND status = 'draft');

CREATE POLICY invoices_contractor_delete_draft ON public.invoices
  FOR DELETE TO authenticated
  USING (contractor_id = auth.uid() AND status = 'draft');

-- ── 8. Column grants: content columns only ───────────────────────────────────
-- Not client-writable: status, issued_date, issued_at, paid_date, amount_due,
-- recipient_response, responded_at, deposit_paid, deposit_paid_at,
-- deposit_deducted, stripe_payment_intent_id, sent_at, viewed_at,
-- invoice_number, void_reason, voided_at, voided_by, company_id,
-- engagement_id, period_start, period_end, supplier_snapshot,
-- customer_snapshot, id, created_at, updated_at, country_code, currency.
-- deposit_amount is also not in the client grant: the deposit requirement is
-- set once, server-side, at draft creation (copied from the quote).
REVOKE INSERT, UPDATE, TRUNCATE, REFERENCES, TRIGGER ON public.invoices FROM authenticated, anon;

GRANT INSERT (
  contractor_id, recipient_id, quote_id, job_id,
  client_name, client_email, client_phone, client_address,
  due_date, items, subtotal, tax_rate, tax_amount, total, notes,
  addr_line1, addr_line2, addr_city, addr_region, addr_postcode,
  addr_country, addr_lat, addr_lng, addr_place_id
) ON public.invoices TO authenticated;

GRANT UPDATE (
  client_name, client_email, client_phone, client_address,
  due_date, items, subtotal, tax_rate, tax_amount, total, notes,
  addr_line1, addr_line2, addr_city, addr_region, addr_postcode,
  addr_country, addr_lat, addr_lng, addr_place_id
) ON public.invoices TO authenticated;

-- ── 9. Guard: once issued, locked for everyone; authenticated locked out entirely ──
-- SECURITY INVOKER on purpose: part (b) of this must see current_user to tell
-- a direct authenticated/anon write from a SECURITY DEFINER function or the
-- service role (both of which need to keep moving payment/status columns).
-- Part (a) (content/number/snapshot immutability once issued) applies to
-- every role, including service_role and SECURITY DEFINER functions -- there
-- is deliberately no bypass for it here.
CREATE FUNCTION public.invoices_issue_lock_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'An issued invoice cannot be deleted. Void it and issue a new one instead.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN OLD;
  END IF;

  -- UPDATE
  IF OLD.status <> 'draft' THEN
    IF NEW.contractor_id     IS DISTINCT FROM OLD.contractor_id
    OR NEW.recipient_id      IS DISTINCT FROM OLD.recipient_id
    OR NEW.client_name       IS DISTINCT FROM OLD.client_name
    OR NEW.client_email      IS DISTINCT FROM OLD.client_email
    OR NEW.client_phone      IS DISTINCT FROM OLD.client_phone
    OR NEW.client_address    IS DISTINCT FROM OLD.client_address
    OR NEW.addr_line1        IS DISTINCT FROM OLD.addr_line1
    OR NEW.addr_line2        IS DISTINCT FROM OLD.addr_line2
    OR NEW.addr_city         IS DISTINCT FROM OLD.addr_city
    OR NEW.addr_region       IS DISTINCT FROM OLD.addr_region
    OR NEW.addr_postcode     IS DISTINCT FROM OLD.addr_postcode
    OR NEW.addr_country      IS DISTINCT FROM OLD.addr_country
    OR NEW.addr_lat          IS DISTINCT FROM OLD.addr_lat
    OR NEW.addr_lng          IS DISTINCT FROM OLD.addr_lng
    OR NEW.addr_place_id     IS DISTINCT FROM OLD.addr_place_id
    OR NEW.items             IS DISTINCT FROM OLD.items
    OR NEW.subtotal          IS DISTINCT FROM OLD.subtotal
    OR NEW.tax_rate          IS DISTINCT FROM OLD.tax_rate
    OR NEW.tax_amount        IS DISTINCT FROM OLD.tax_amount
    OR NEW.total             IS DISTINCT FROM OLD.total
    OR NEW.due_date          IS DISTINCT FROM OLD.due_date
    OR NEW.notes             IS DISTINCT FROM OLD.notes
    OR NEW.quote_id          IS DISTINCT FROM OLD.quote_id
    OR NEW.job_id            IS DISTINCT FROM OLD.job_id
    OR NEW.project_id        IS DISTINCT FROM OLD.project_id
    OR NEW.deposit_amount    IS DISTINCT FROM OLD.deposit_amount
    OR NEW.invoice_number    IS DISTINCT FROM OLD.invoice_number
    OR NEW.issued_date       IS DISTINCT FROM OLD.issued_date
    OR NEW.issued_at         IS DISTINCT FROM OLD.issued_at
    OR NEW.sent_at           IS DISTINCT FROM OLD.sent_at
    OR NEW.supplier_snapshot IS DISTINCT FROM OLD.supplier_snapshot
    OR NEW.customer_snapshot IS DISTINCT FROM OLD.customer_snapshot
    THEN
      RAISE EXCEPTION 'An issued invoice''s content cannot be changed. Void it and issue a new one instead.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- Even the columns this guard does allow to move (status, payment,
    -- deposit, Stripe, void, response) may only move through a SECURITY
    -- DEFINER function or the service role -- never a direct app write.
    IF current_user IN ('authenticated', 'anon') THEN
      RAISE EXCEPTION 'Only a draft invoice can be changed from the app. A sent invoice is corrected by voiding it and issuing a new one.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.invoices_issue_lock_guard() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER invoices_issue_lock_guard_trigger
  BEFORE UPDATE OR DELETE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.invoices_issue_lock_guard();

-- ── 10. Recipients never see a draft ─────────────────────────────────────────
-- Replaces "Recipients can view their invoices" (two-step profiles form, all
-- statuses). Direct auth.uid() form (house pattern for new policies):
-- invoices.recipient_id references profiles(user_id), i.e. auth.uid().
-- Checked 2026-10-12: no other SELECT policy lets a recipient read a draft --
-- invoices_company_member_select only covers B2B rows (company_id set), and
-- those are created by generate_b2b_invoice as 'sent' and can never be a
-- draft (guard_b2b_invoice_mutation blocks any other insert or conversion);
-- the remaining policies are admin-only or the contractor's own.
DROP POLICY "Recipients can view their invoices" ON public.invoices;

CREATE POLICY invoices_recipient_select_issued ON public.invoices
  FOR SELECT TO authenticated
  USING (recipient_id = auth.uid() AND status <> 'draft');
