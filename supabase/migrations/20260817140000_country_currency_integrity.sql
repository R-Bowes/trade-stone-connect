-- 20260817140000_country_currency_integrity.sql
--
-- Country/currency integrity, additive only. No column is dropped, renamed,
-- or given new semantics. No existing application code needs to change for
-- this migration to be safe to push.
--
-- Three parts:
--   A. Composite FKs pinning currency down the job-to-cash chain
--      (enquiry -> quote -> invoice -> payment), keyed on country_code.
--      invoices/issued_quotes/payments already pin currency FROM
--      country_code via their own CHECK (20260811090000), so chaining
--      country_code alone makes currency transitively consistent — no new
--      currency columns are needed for this part.
--   B. country_code/currency added to the finance and refund tables that
--      currently have neither, so they stop being one join away from
--      knowing their own currency.
--   C. profiles.country_code frozen once a Stripe Connect account exists,
--      so a later profile edit can never desynchronise from an account
--      whose country Stripe itself will never let move.
--
-- Deliberately GB/US/CA only — do NOT read this migration as a template for
-- adding DE/AU. The PaymentIntent code path (create-payment-intent,
-- accept-quote, stripe-webhook) still hardcodes currency: "gbp" and does
-- not read country_code or currency at all (see INTERNATIONAL-AUDIT.md,
-- Stripe boundary section). Widening the country/currency enumeration here
-- would let a row exist in a state the payment code cannot actually
-- service. GB/US/CA is already the full enumeration on every existing
-- country_code CHECK (20260811090000); this migration does not touch that
-- allowlist anywhere.
--
-- jobs_issued_quote_id_fkey is deliberately NOT touched. It carries
-- ON DELETE SET NULL; a composite (issued_quote_id, country_code) version
-- of that FK would require nulling jobs.country_code on delete, but
-- jobs.country_code is NOT NULL (20260811090000) — the delete would fail
-- at runtime with a NOT NULL violation the moment it tried to null a
-- column the FK's own ON DELETE SET NULL can't legally touch. Left as a
-- single-column FK; a SQL comment is placed on it below explaining why, in
-- case a future pass is tempted to "finish the job" here.
--
-- Idempotent throughout — every ADD COLUMN uses IF NOT EXISTS, every
-- ADD CONSTRAINT is wrapped in an existence check against pg_constraint,
-- every trigger is DROP IF EXISTS then CREATE. A partial failure can be
-- re-run from the top safely.

-- ============================================================================
-- PRE-FLIGHT — already run by hand against the live DB before writing this
-- file (Step 0.2 of the brief). All four returned 0. Re-run before push if
-- any time has passed, in case new rows were written in the interim.
-- ============================================================================

-- select 'issued_quotes_enquiry_id' as link, count(*) as violations
-- from issued_quotes q
-- where q.enquiry_id is not null
--   and not exists (
--     select 1 from enquiries e
--     where e.id = q.enquiry_id and e.country_code = q.country_code
--   )
-- union all
-- select 'invoices_quote_id', count(*)
-- from invoices i
-- where i.quote_id is not null
--   and not exists (
--     select 1 from issued_quotes q
--     where q.id = i.quote_id and q.country_code = i.country_code
--   )
-- union all
-- select 'invoices_job_id', count(*)
-- from invoices i
-- where i.job_id is not null
--   and not exists (
--     select 1 from jobs j
--     where j.id = i.job_id and j.country_code = i.country_code
--   )
-- union all
-- select 'payments_invoice_id', count(*)
-- from payments p
-- where p.invoice_id is not null
--   and not exists (
--     select 1 from invoices i
--     where i.id = p.invoice_id and i.country_code = p.country_code
--   );

-- ============================================================================
-- PART A — composite foreign keys pinning currency down the chain
-- ============================================================================

-- --- A1. UNIQUE (id, country_code) on the four FK targets -------------------
-- Redundant given each table's own PK on id, but a composite FK requires a
-- unique (or PK) target on exactly the referenced column tuple.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'enquiries_id_country_code_key'
  ) THEN
    ALTER TABLE public.enquiries
      ADD CONSTRAINT enquiries_id_country_code_key UNIQUE (id, country_code);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'issued_quotes_id_country_code_key'
  ) THEN
    ALTER TABLE public.issued_quotes
      ADD CONSTRAINT issued_quotes_id_country_code_key UNIQUE (id, country_code);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoices_id_country_code_key'
  ) THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_id_country_code_key UNIQUE (id, country_code);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'jobs_id_country_code_key'
  ) THEN
    ALTER TABLE public.jobs
      ADD CONSTRAINT jobs_id_country_code_key UNIQUE (id, country_code);
  END IF;
END $$;

-- --- A2. issued_quotes.enquiry_id -> enquiries(id, country_code) -----------
-- Original: FOREIGN KEY (enquiry_id) REFERENCES enquiries(id) -- no ON DELETE.
-- Preserved: no ON DELETE clause.

ALTER TABLE public.issued_quotes
  DROP CONSTRAINT IF EXISTS issued_quotes_enquiry_id_fkey;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'issued_quotes_enquiry_id_fkey'
  ) THEN
    ALTER TABLE public.issued_quotes
      ADD CONSTRAINT issued_quotes_enquiry_id_fkey
      FOREIGN KEY (enquiry_id, country_code)
      REFERENCES public.enquiries (id, country_code);
  END IF;
END $$;

-- --- A3. invoices.quote_id -> issued_quotes(id, country_code) --------------
-- Original: FOREIGN KEY (quote_id) REFERENCES issued_quotes(id)
--   DEFERRABLE INITIALLY DEFERRED.
-- Preserved: DEFERRABLE INITIALLY DEFERRED — mint_job_from_quote depends on
-- the deferral (see CLAUDE.md, "Job creation runs through the
-- mint_job_from_quote RPC").

ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_quote_id_fkey;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoices_quote_id_fkey'
  ) THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_quote_id_fkey
      FOREIGN KEY (quote_id, country_code)
      REFERENCES public.issued_quotes (id, country_code)
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$;

-- --- A4. invoices.job_id -> jobs(id, country_code) -------------------------
-- Original: FOREIGN KEY (job_id) REFERENCES jobs(id) -- no ON DELETE.
-- Preserved: no ON DELETE clause.

ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_job_id_fkey;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoices_job_id_fkey'
  ) THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_job_id_fkey
      FOREIGN KEY (job_id, country_code)
      REFERENCES public.jobs (id, country_code);
  END IF;
END $$;

-- --- A5. payments.invoice_id -> invoices(id, country_code) -----------------
-- Original: FOREIGN KEY (invoice_id) REFERENCES invoices(id) -- no ON DELETE.
-- Preserved: no ON DELETE clause.

ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_invoice_id_fkey;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payments_invoice_id_fkey'
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_invoice_id_fkey
      FOREIGN KEY (invoice_id, country_code)
      REFERENCES public.invoices (id, country_code);
  END IF;
END $$;

-- --- A6. jobs_issued_quote_id_fkey — deliberately untouched -----------------
-- ON DELETE SET NULL, single-column (issued_quote_id) -> issued_quotes(id).
-- NOT converted to a composite FK: doing so would require this FK's own
-- ON DELETE SET NULL to null out jobs.country_code on a referenced-quote
-- delete, but jobs.country_code is NOT NULL (20260811090000) -- the delete
-- would fail at runtime with a NOT NULL violation. Left as-is; no DDL
-- statement of any kind (not even COMMENT ON CONSTRAINT) is executed
-- against jobs_issued_quote_id_fkey in this migration -- this is a plain
-- source comment only, so as to genuinely not touch it in any sense.

-- ============================================================================
-- PART B — country_code/currency on the tables that have none
-- ============================================================================

-- --- B1. refunds and chargebacks — full country_code + currency ------------
-- Rationale: both are one FK hop from payments/invoices (which already
-- carry currency), but neither denormalises it onto its own row, so a
-- refund/chargeback report cannot determine its own currency without a
-- join. The refund architecture is still in design (see
-- CONTRACTOR-FINANCE.md) and should inherit a correct shape from the start
-- rather than needing this bolted on later.

ALTER TABLE public.refunds
  ADD COLUMN IF NOT EXISTS country_code text NOT NULL DEFAULT 'GB';
ALTER TABLE public.refunds
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'GBP';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'refunds_country_currency_check'
  ) THEN
    ALTER TABLE public.refunds
      ADD CONSTRAINT refunds_country_currency_check
      CHECK (
        (country_code = 'GB' AND currency = 'GBP') OR
        (country_code = 'US' AND currency = 'USD') OR
        (country_code = 'CA' AND currency = 'CAD')
      );
  END IF;
END $$;

ALTER TABLE public.chargebacks
  ADD COLUMN IF NOT EXISTS country_code text NOT NULL DEFAULT 'GB';
ALTER TABLE public.chargebacks
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'GBP';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chargebacks_country_currency_check'
  ) THEN
    ALTER TABLE public.chargebacks
      ADD CONSTRAINT chargebacks_country_currency_check
      CHECK (
        (country_code = 'GB' AND currency = 'GBP') OR
        (country_code = 'US' AND currency = 'USD') OR
        (country_code = 'CA' AND currency = 'CAD')
      );
  END IF;
END $$;

-- --- B2. expenses, mileage_trips, finance_settings — country_code ----------
-- All three get country_code + the plain (non-currency-paired) CHECK, same
-- shape as profiles/companies/jobs/enquiries in 20260811090000.

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS country_code text NOT NULL DEFAULT 'GB';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'expenses_country_code_check'
  ) THEN
    ALTER TABLE public.expenses
      ADD CONSTRAINT expenses_country_code_check
      CHECK (country_code = ANY (ARRAY['GB', 'US', 'CA']));
  END IF;
END $$;

ALTER TABLE public.mileage_trips
  ADD COLUMN IF NOT EXISTS country_code text NOT NULL DEFAULT 'GB';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'mileage_trips_country_code_check'
  ) THEN
    ALTER TABLE public.mileage_trips
      ADD CONSTRAINT mileage_trips_country_code_check
      CHECK (country_code = ANY (ARRAY['GB', 'US', 'CA']));
  END IF;
END $$;

ALTER TABLE public.finance_settings
  ADD COLUMN IF NOT EXISTS country_code text NOT NULL DEFAULT 'GB';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'finance_settings_country_code_check'
  ) THEN
    ALTER TABLE public.finance_settings
      ADD CONSTRAINT finance_settings_country_code_check
      CHECK (country_code = ANY (ARRAY['GB', 'US', 'CA']));
  END IF;
END $$;

-- --- B3. expenses, mileage_trips — currency ---------------------------------
-- Both carry claimable monetary amounts (expenses.amount, expenses.vat_amount,
-- mileage_trips.claim_amount) that will need denominating. finance_settings
-- carries no monetary amount of its own (it's a settings row -- vat_status,
-- flat_rate_percentage, payment-terms defaults) and does NOT get a currency
-- column.
--
-- Note: this compound CHECK re-covers the country_code allowlist already
-- enforced by B2's simple CHECK on the same table -- kept as two separate
-- named constraints (matching the brief's own layering: country_code first,
-- currency second) rather than collapsing them into one. Redundant, not
-- contradictory; both constraints agree on every row.

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'GBP';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'expenses_country_currency_check'
  ) THEN
    ALTER TABLE public.expenses
      ADD CONSTRAINT expenses_country_currency_check
      CHECK (
        (country_code = 'GB' AND currency = 'GBP') OR
        (country_code = 'US' AND currency = 'USD') OR
        (country_code = 'CA' AND currency = 'CAD')
      );
  END IF;
END $$;

ALTER TABLE public.mileage_trips
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'GBP';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'mileage_trips_country_currency_check'
  ) THEN
    ALTER TABLE public.mileage_trips
      ADD CONSTRAINT mileage_trips_country_currency_check
      CHECK (
        (country_code = 'GB' AND currency = 'GBP') OR
        (country_code = 'US' AND currency = 'USD') OR
        (country_code = 'CA' AND currency = 'CAD')
      );
  END IF;
END $$;

-- --- B4. immutability triggers ----------------------------------------------
-- Reuses the existing public.prevent_country_currency_change() function
-- unchanged (defined in 20260811090000) -- it already keys off to_jsonb(OLD)/
-- to_jsonb(NEW) and only enforces the 'currency' half when a 'currency' key
-- is actually present on the row, so it is safe to attach as-is to tables
-- that do (refunds, chargebacks, expenses, mileage_trips) without attaching
-- it to finance_settings, which has no currency column and is intentionally
-- excluded below -- its country_code stays correctable (CHECK only, no
-- immutability trigger), because it is a settings row, not a financial
-- transaction record.

DROP TRIGGER IF EXISTS refunds_country_immutable ON public.refunds;
CREATE TRIGGER refunds_country_immutable
  BEFORE UPDATE ON public.refunds
  FOR EACH ROW EXECUTE FUNCTION public.prevent_country_currency_change();

DROP TRIGGER IF EXISTS chargebacks_country_immutable ON public.chargebacks;
CREATE TRIGGER chargebacks_country_immutable
  BEFORE UPDATE ON public.chargebacks
  FOR EACH ROW EXECUTE FUNCTION public.prevent_country_currency_change();

DROP TRIGGER IF EXISTS expenses_country_immutable ON public.expenses;
CREATE TRIGGER expenses_country_immutable
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.prevent_country_currency_change();

DROP TRIGGER IF EXISTS mileage_trips_country_immutable ON public.mileage_trips;
CREATE TRIGGER mileage_trips_country_immutable
  BEFORE UPDATE ON public.mileage_trips
  FOR EACH ROW EXECUTE FUNCTION public.prevent_country_currency_change();

-- finance_settings: CHECK only (B2 above), no trigger -- deliberately
-- correctable. Do not add a trigger here.

-- ============================================================================
-- PART C — guard profiles.country_code against Stripe desync
-- ============================================================================

-- profiles.country_code already has a CHECK (20260811090000) but no
-- immutability trigger, so it is currently freely mutable at any time. A
-- Stripe Connect account's country is fixed permanently at account creation
-- (see supabase/functions/create-connect-account/index.ts's own comment:
-- "country is immutable in Stripe, so any account already created..."), so
-- an unguarded profile country edit after that point would silently
-- desynchronise the profile from the Connect account.
--
-- This is a NEW function, distinct from prevent_country_currency_change() --
-- that function enforces unconditional immutability once a row exists; this
-- one is conditional: country_code stays freely editable on profiles.id
-- until a Stripe Connect account exists (stripe_account_id IS NOT NULL --
-- confirmed live as the Connect account id column, Step 0.3), and is frozen
-- only from that point on.

CREATE OR REPLACE FUNCTION public.prevent_profile_country_change_once_stripe_connected()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.stripe_account_id IS NOT NULL
     AND NEW.country_code IS DISTINCT FROM OLD.country_code THEN
    RAISE EXCEPTION
      'country_code cannot be changed once a Stripe Connect account exists (country is fixed at account creation); contact support to migrate the account';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_country_stripe_lock ON public.profiles;
CREATE TRIGGER profiles_country_stripe_lock
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  WHEN (OLD.country_code IS DISTINCT FROM NEW.country_code)
  EXECUTE FUNCTION public.prevent_profile_country_change_once_stripe_connected();

-- ============================================================================
-- POST-APPLY VERIFICATION — run after this migration is pushed, not before.
-- Not executed as part of the migration itself.
-- ============================================================================

-- select conrelid::regclass as tbl, conname, pg_get_constraintdef(oid) as def
-- from pg_constraint
-- where conname in (
--   'issued_quotes_enquiry_id_fkey',
--   'invoices_quote_id_fkey',
--   'invoices_job_id_fkey',
--   'payments_invoice_id_fkey'
-- )
-- order by tbl, conname;
