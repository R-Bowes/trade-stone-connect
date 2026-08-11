-- 20260811090000_add_country_code_and_currency.sql
-- Adds country_code to Tier A records and currency to money tables.
-- All existing data is UK by construction, so backfill is universal.

-- Phase 1: add nullable
ALTER TABLE public.profiles       ADD COLUMN country_code text;
ALTER TABLE public.companies      ADD COLUMN country_code text;
ALTER TABLE public.jobs           ADD COLUMN country_code text;
ALTER TABLE public.enquiries      ADD COLUMN country_code text;
ALTER TABLE public.issued_quotes  ADD COLUMN country_code text;
ALTER TABLE public.invoices       ADD COLUMN country_code text;
ALTER TABLE public.payments       ADD COLUMN country_code text;

ALTER TABLE public.issued_quotes  ADD COLUMN currency text;
ALTER TABLE public.invoices       ADD COLUMN currency text;
ALTER TABLE public.payments       ADD COLUMN currency text;

-- Phase 2: backfill
UPDATE public.profiles       SET country_code = 'GB' WHERE country_code IS NULL;
UPDATE public.companies      SET country_code = 'GB' WHERE country_code IS NULL;
UPDATE public.jobs           SET country_code = 'GB' WHERE country_code IS NULL;
UPDATE public.enquiries      SET country_code = 'GB' WHERE country_code IS NULL;
UPDATE public.issued_quotes  SET country_code = 'GB' WHERE country_code IS NULL;
UPDATE public.invoices       SET country_code = 'GB' WHERE country_code IS NULL;
UPDATE public.payments       SET country_code = 'GB' WHERE country_code IS NULL;

UPDATE public.issued_quotes  SET currency = 'GBP' WHERE currency IS NULL;
UPDATE public.invoices       SET currency = 'GBP' WHERE currency IS NULL;
UPDATE public.payments       SET currency = 'GBP' WHERE currency IS NULL;
-- Drain deferred constraint trigger events queued by the backfill above.
-- Without this, ALTER TABLE ... SET NOT NULL fails with SQLSTATE 55006
-- on tables carrying DEFERRABLE foreign keys (e.g. issued_quotes).
SET CONSTRAINTS ALL IMMEDIATE;

-- Phase 3: enforce NOT NULL
ALTER TABLE public.profiles       ALTER COLUMN country_code SET NOT NULL;
ALTER TABLE public.companies      ALTER COLUMN country_code SET NOT NULL;
ALTER TABLE public.jobs           ALTER COLUMN country_code SET NOT NULL;
ALTER TABLE public.enquiries      ALTER COLUMN country_code SET NOT NULL;
ALTER TABLE public.issued_quotes  ALTER COLUMN country_code SET NOT NULL;
ALTER TABLE public.invoices       ALTER COLUMN country_code SET NOT NULL;
ALTER TABLE public.payments       ALTER COLUMN country_code SET NOT NULL;

ALTER TABLE public.issued_quotes  ALTER COLUMN currency SET NOT NULL;
ALTER TABLE public.invoices       ALTER COLUMN currency SET NOT NULL;
ALTER TABLE public.payments       ALTER COLUMN currency SET NOT NULL;

-- Phase 4: transitional defaults.
-- These exist ONLY so current insert paths keep working while the
-- application is still UK-only. They MUST be dropped in the migration
-- accompanying the first non-UK launch, so that any unstamped insert
-- fails loudly instead of silently recording a GB record.
ALTER TABLE public.profiles       ALTER COLUMN country_code SET DEFAULT 'GB';
ALTER TABLE public.companies      ALTER COLUMN country_code SET DEFAULT 'GB';
ALTER TABLE public.jobs           ALTER COLUMN country_code SET DEFAULT 'GB';
ALTER TABLE public.enquiries      ALTER COLUMN country_code SET DEFAULT 'GB';
ALTER TABLE public.issued_quotes  ALTER COLUMN country_code SET DEFAULT 'GB';
ALTER TABLE public.invoices       ALTER COLUMN country_code SET DEFAULT 'GB';
ALTER TABLE public.payments       ALTER COLUMN country_code SET DEFAULT 'GB';

ALTER TABLE public.issued_quotes  ALTER COLUMN currency SET DEFAULT 'GBP';
ALTER TABLE public.invoices       ALTER COLUMN currency SET DEFAULT 'GBP';
ALTER TABLE public.payments       ALTER COLUMN currency SET DEFAULT 'GBP';

-- Phase 5: value constraints (ISO 3166-1 alpha-2 / ISO 4217)
ALTER TABLE public.profiles      ADD CONSTRAINT profiles_country_code_check
  CHECK (country_code IN ('GB','US','CA'));
ALTER TABLE public.companies     ADD CONSTRAINT companies_country_code_check
  CHECK (country_code IN ('GB','US','CA'));
ALTER TABLE public.jobs          ADD CONSTRAINT jobs_country_code_check
  CHECK (country_code IN ('GB','US','CA'));
ALTER TABLE public.enquiries     ADD CONSTRAINT enquiries_country_code_check
  CHECK (country_code IN ('GB','US','CA'));

-- Money tables additionally pin currency to country.
ALTER TABLE public.issued_quotes ADD CONSTRAINT issued_quotes_country_currency_check
  CHECK (
    (country_code = 'GB' AND currency = 'GBP') OR
    (country_code = 'US' AND currency = 'USD') OR
    (country_code = 'CA' AND currency = 'CAD')
  );
ALTER TABLE public.invoices      ADD CONSTRAINT invoices_country_currency_check
  CHECK (
    (country_code = 'GB' AND currency = 'GBP') OR
    (country_code = 'US' AND currency = 'USD') OR
    (country_code = 'CA' AND currency = 'CAD')
  );
ALTER TABLE public.payments      ADD CONSTRAINT payments_country_currency_check
  CHECK (
    (country_code = 'GB' AND currency = 'GBP') OR
    (country_code = 'US' AND currency = 'USD') OR
    (country_code = 'CA' AND currency = 'CAD')
  );

-- Phase 6: immutability.
-- Applied to records, not people. A quote issued in Ontario is
-- Canadian permanently; a contractor may relocate.
CREATE OR REPLACE FUNCTION public.prevent_country_currency_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  old_j jsonb := to_jsonb(OLD);
  new_j jsonb := to_jsonb(NEW);
BEGIN
  IF old_j->>'country_code' IS DISTINCT FROM new_j->>'country_code' THEN
    RAISE EXCEPTION 'country_code is immutable (table %)', TG_TABLE_NAME;
  END IF;
  IF (old_j ? 'currency')
     AND old_j->>'currency' IS DISTINCT FROM new_j->>'currency' THEN
    RAISE EXCEPTION 'currency is immutable (table %)', TG_TABLE_NAME;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER jobs_country_immutable
  BEFORE UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.prevent_country_currency_change();

CREATE TRIGGER enquiries_country_immutable
  BEFORE UPDATE ON public.enquiries
  FOR EACH ROW EXECUTE FUNCTION public.prevent_country_currency_change();

CREATE TRIGGER issued_quotes_country_immutable
  BEFORE UPDATE ON public.issued_quotes
  FOR EACH ROW EXECUTE FUNCTION public.prevent_country_currency_change();

CREATE TRIGGER invoices_country_immutable
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.prevent_country_currency_change();

CREATE TRIGGER payments_country_immutable
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.prevent_country_currency_change();