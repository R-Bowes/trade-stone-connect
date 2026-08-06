-- supabase/migrations/20260807260000_chargebacks_and_contractor_debts.sql
-- Brief 3 (chargebacks): public.chargebacks is Stripe dispute handling — the
-- money-side recovery mechanism for a chargeback, mirroring Brief 2's refund
-- flow but auto-reversed (E1, no approval step) rather than admin-approved.
--
-- NAMING: public.disputes (job_id / raised_by / notes / status) is an
-- UNRELATED, pre-existing IN-PLATFORM job disputes table. Not touched, not
-- extended. public.chargebacks is a new, distinct table for Stripe disputes.
--
-- public.contractor_debts (E5) is a unified ledger sourced from BOTH refunds
-- (Brief 2, contractor_debt column) and chargebacks (contractor_debt column
-- here) — one row per shortfall, regardless of which flow produced it.

BEGIN;

-- =========================================================================
-- 1. chargebacks
-- =========================================================================

CREATE TABLE public.chargebacks (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_dispute_id           text NOT NULL UNIQUE,
  stripe_charge_id            text NOT NULL,
  payment_id                  uuid REFERENCES public.payments(id),
  invoice_id                  uuid REFERENCES public.invoices(id),
  job_id                      uuid REFERENCES public.jobs(id),
  contractor_id               uuid,
  customer_id                 uuid,

  amount                      numeric NOT NULL,
  dispute_fee                 numeric,

  -- Stripe's own reason/status strings, NOT CHECK-constrained enums: Stripe
  -- adds values over time and an unrecognised one must never block the
  -- webhook from recording the dispute.
  reason                      text,
  status                      text NOT NULL,

  evidence_due_by             timestamptz,

  transfer_reversed_amount    numeric NOT NULL DEFAULT 0,
  contractor_debt             numeric NOT NULL DEFAULT 0,
  reversal_error              text,

  outcome                     text,     -- 'won' | 'lost' | NULL while open
  funds_returned_amount       numeric NOT NULL DEFAULT 0,
  closed_at                   timestamptz,

  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

-- stripe_dispute_id's UNIQUE constraint already creates a unique index,
-- covering the "index on chargebacks.stripe_dispute_id" requirement.
CREATE INDEX chargebacks_contractor_id_idx ON public.chargebacks (contractor_id);
CREATE INDEX chargebacks_status_idx ON public.chargebacks (status);

CREATE TRIGGER update_chargebacks_updated_at
  BEFORE UPDATE ON public.chargebacks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.chargebacks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Contractors can view own chargebacks"
  ON public.chargebacks FOR SELECT
  TO authenticated
  USING (contractor_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

-- No INSERT/UPDATE policy for contractors at all — chargebacks are written
-- exclusively by stripe-webhook's service-role client (bypasses RLS), same
-- posture as refunds (Brief 2): a contractor's own write path here would be
-- nonsensical anyway, since the whole point is Stripe telling us this
-- happened, not a contractor initiating it.

CREATE POLICY "Admins have full access to chargebacks"
  ON public.chargebacks FOR ALL
  TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

COMMENT ON TABLE public.chargebacks IS
  'Stripe dispute handling (charge.dispute.created/.closed) — auto-reversed on creation (E1), unrelated to public.disputes (in-platform job disputes).';

-- =========================================================================
-- 2. contractor_debts — unified ledger (E5)
-- =========================================================================

CREATE TABLE public.contractor_debts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id      uuid NOT NULL,
  source_type        text NOT NULL CHECK (source_type IN ('refund', 'chargeback')),
  source_id          uuid NOT NULL,     -- refunds.id or chargebacks.id, per source_type
  amount             numeric NOT NULL CHECK (amount > 0),
  recovered_amount   numeric NOT NULL DEFAULT 0,
  status             text NOT NULL DEFAULT 'outstanding'
    CHECK (status IN ('outstanding', 'partially_recovered', 'recovered', 'written_off')),
  notes              text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  UNIQUE (source_type, source_id)
);

CREATE INDEX contractor_debts_contractor_id_idx ON public.contractor_debts (contractor_id);
CREATE INDEX contractor_debts_status_idx ON public.contractor_debts (status);

CREATE TRIGGER update_contractor_debts_updated_at
  BEFORE UPDATE ON public.contractor_debts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.contractor_debts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Contractors can view own debts"
  ON public.contractor_debts FOR SELECT
  TO authenticated
  USING (contractor_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

-- No INSERT/UPDATE policy for contractors — written only by SECURITY
-- DEFINER / service-role paths (stripe-webhook, and the Brief 2 refund
-- backfill below).

CREATE POLICY "Admins have full access to debts"
  ON public.contractor_debts FOR ALL
  TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

COMMENT ON TABLE public.contractor_debts IS
  'Unified contractor debt ledger (E5), sourced from both refunds.contractor_debt (Brief 2) and chargebacks.contractor_debt (this migration) — one row per shortfall.';

-- =========================================================================
-- 3. Backfill — existing refunds rows with a shortfall predate this table.
-- =========================================================================

INSERT INTO public.contractor_debts (contractor_id, source_type, source_id, amount, status)
SELECT r.contractor_id, 'refund', r.id, r.contractor_debt, 'outstanding'
FROM public.refunds r
WHERE r.contractor_debt > 0
ON CONFLICT (source_type, source_id) DO NOTHING;

COMMIT;
