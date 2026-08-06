-- supabase/migrations/20260807220000_payments_revenue_ledger.sql
-- Revenue ledger columns on public.payments.
--
-- payments.platform_fee currently stores the GROSS 5% application fee taken
-- via Stripe Connect's application_fee_amount. That is NOT platform revenue
-- — under destination charges, Stripe's own processing fee is deducted from
-- the connected account's balance, not from the application fee, so the
-- true net figure requires the charge's balance transaction. This migration
-- adds the columns needed to capture that ledger; stripe-webhook is wired
-- to populate them in the same change set.

BEGIN;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS stripe_charge_id              text,
  ADD COLUMN IF NOT EXISTS stripe_balance_transaction_id text,
  ADD COLUMN IF NOT EXISTS stripe_fee                    numeric,
  ADD COLUMN IF NOT EXISTS net_platform_revenue           numeric,
  ADD COLUMN IF NOT EXISTS refunded_amount                numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS transfer_reversed_amount       numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.payments.platform_fee IS
  'Gross application_fee_amount taken via Stripe Connect, in pounds. NOT platform revenue — see net_platform_revenue.';

COMMENT ON COLUMN public.payments.stripe_fee IS
  'Stripe''s own processing fee for this charge, in pounds, from the charge''s balance transaction.';

COMMENT ON COLUMN public.payments.net_platform_revenue IS
  'Actual platform revenue for this payment, in pounds: platform_fee minus stripe_fee.';

COMMENT ON COLUMN public.payments.stripe_transfer_id IS
  'Stripe transfer id moving funds to the contractor''s connected account. Required to reverse the transfer on refund or dispute.';

CREATE INDEX IF NOT EXISTS payments_stripe_charge_id_idx
  ON public.payments (stripe_charge_id)
  WHERE stripe_charge_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS payments_stripe_transfer_id_idx
  ON public.payments (stripe_transfer_id)
  WHERE stripe_transfer_id IS NOT NULL;

COMMIT;
