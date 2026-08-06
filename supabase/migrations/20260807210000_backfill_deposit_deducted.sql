-- supabase/migrations/20260807210000_backfill_deposit_deducted.sql
-- deposit_deducted has never been populated by any writer to date — every
-- paid-deposit invoice row has deposit_amount set but deposit_deducted
-- NULL. src/lib/invoiceMoney.ts and supabase/functions/_shared/paymentMath.ts
-- both fall back to deposit_amount when deposit_deducted is NULL, but the
-- fallback should not be the only source of truth going forward (see
-- stripe-webhook's deposit branch, which now writes deposit_deducted
-- directly). Backfill existing paid-deposit rows so deposit_deducted is
-- correct immediately, not just from here on.

BEGIN;

UPDATE public.invoices
SET    deposit_deducted = deposit_amount
WHERE  deposit_paid IS TRUE
  AND  deposit_deducted IS NULL
  AND  deposit_amount IS NOT NULL
  AND  deposit_amount > 0;

COMMIT;
