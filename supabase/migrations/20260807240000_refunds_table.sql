-- supabase/migrations/20260807240000_refunds_table.sql
-- Brief 2 (refunds): audit-trail table for the refund request/approve/process
-- flow. LOCKED DECISIONS (do not reinterpret):
--   D1. Contractor INITIATES a refund request; a TradeStone admin APPROVES it.
--       Money moves only on approval.
--   D2. reverse_transfer is ALWAYS true — enforced in process-refund, not here.
--   D3. If the transfer reversal fails or is short, the customer refund still
--       proceeds; the shortfall lands in contractor_debt (enforced in
--       process-refund; the columns exist here to record the outcome).
--   D5. Partial refunds supported from v1 (amount is not required to equal
--       the payment's full amount).
--   D6. payments.refunded_amount / payments.transfer_reversed_amount become
--       DERIVED running totals over refunds rows for the same payment — this
--       table is the source of truth, payments carries the summary.

BEGIN;

CREATE TABLE public.refunds (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id                  uuid NOT NULL REFERENCES public.payments(id),
  invoice_id                  uuid REFERENCES public.invoices(id),
  job_id                      uuid REFERENCES public.jobs(id),
  contractor_id               uuid NOT NULL,
  requested_by                uuid NOT NULL,     -- auth.users(id)

  amount                      numeric NOT NULL CHECK (amount > 0),
  reason                      text NOT NULL,
  reason_detail               text,

  status                      text NOT NULL DEFAULT 'requested',

  approved_by                 uuid,               -- auth.users(id), admin
  approved_at                 timestamptz,
  rejected_reason             text,

  stripe_refund_id            text,
  -- Stripe does not return the original processing fee on a refund — this is
  -- computed pro rata from payments.stripe_fee by process-refund.
  stripe_fee_lost             numeric,

  transfer_reversed_amount    numeric NOT NULL DEFAULT 0,
  contractor_debt             numeric NOT NULL DEFAULT 0,
  application_fee_refunded    numeric NOT NULL DEFAULT 0,

  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT refunds_status_valid CHECK (
    status IN ('requested', 'approved', 'rejected', 'processing', 'succeeded', 'failed')
  ),
  CONSTRAINT refunds_reason_valid CHECK (
    reason IN (
      'cooling_off_cancellation', 'work_not_completed', 'work_defective',
      'overpayment', 'duplicate_payment', 'goodwill', 'other'
    )
  )
);

CREATE INDEX refunds_payment_id_idx ON public.refunds (payment_id);
CREATE INDEX refunds_contractor_id_idx ON public.refunds (contractor_id);
CREATE INDEX refunds_status_idx ON public.refunds (status);

CREATE TRIGGER update_refunds_updated_at
  BEFORE UPDATE ON public.refunds
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;

-- Contractors: two-step pattern (refunds.contractor_id is a profiles.id, not
-- necessarily equal to auth.uid() by column name alone — go through profiles
-- explicitly rather than assume the direct-equality shortcut applies here).
CREATE POLICY "Contractors can view own refund requests"
  ON public.refunds FOR SELECT
  TO authenticated
  USING (contractor_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Contractors can create own refund requests"
  ON public.refunds FOR INSERT
  TO authenticated
  WITH CHECK (contractor_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

-- No UPDATE policy for contractors at all: approval, rejection, and Stripe
-- processing state (status, approved_by, approved_at, stripe_refund_id,
-- transfer_reversed_amount, contractor_debt, ...) are exclusively written by
-- the SECURITY DEFINER functions below (approve_refund, reject_refund) and by
-- process-refund's service-role client — never by a contractor's own UPDATE.
-- Column-level GRANTs would still leave the row-level gate to get right, and
-- "no UPDATE policy" is the same outcome with nothing to get subtly wrong.

-- Admins: is_platform_admin() checks admin_users, not profiles — admin
-- accounts have no profile row (CLAUDE.md), so this must not route through
-- the two-step profiles pattern used above.
CREATE POLICY "Admins have full access to refunds"
  ON public.refunds FOR ALL
  TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

COMMENT ON TABLE public.refunds IS
  'Audit trail for the refund request/approve/process flow. payments.refunded_amount and payments.transfer_reversed_amount are derived running totals over this table (D6) — this table is the source of truth.';
COMMENT ON COLUMN public.refunds.contractor_debt IS
  'Shortfall recorded when the Stripe transfer reversal is short or fails (D3) — the customer refund still proceeds regardless.';

COMMIT;
