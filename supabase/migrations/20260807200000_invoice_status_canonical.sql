-- supabase/migrations/20260804120000_invoice_status_canonical.sql
-- Canonical invoice status vocabulary.
-- 'overdue' is deliberately NOT a status: it is derived from due_date at read time.
-- See invoiceMoney.ts for the single source of truth on money predicates.

BEGIN;

-- 1. Backfill legacy values onto the canonical vocabulary.
UPDATE public.invoices
SET status = 'sent'
WHERE status = 'pending';

-- Defensive: no row currently holds 'overdue' (nothing ever wrote it),
-- but fold any that appear so the CHECK below cannot fail.
UPDATE public.invoices
SET status = 'sent'
WHERE status = 'overdue';

-- 2. Lock the vocabulary. This is the constraint whose absence allowed
--    'pending' and 'draft' to diverge across five screens.
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_status_valid
  CHECK (status IN ('draft', 'sent', 'viewed', 'paid', 'void'));

-- 3. Support the derived-overdue predicate.
CREATE INDEX IF NOT EXISTS invoices_contractor_due_open_idx
  ON public.invoices (contractor_id, due_date)
  WHERE status IN ('sent', 'viewed');

COMMENT ON COLUMN public.invoices.status IS
  'Lifecycle only: draft | sent | viewed | paid | void. Overdue is derived from due_date, never stored.';

COMMIT;