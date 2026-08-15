-- Correction to 20260815100000_finance_schema_hardening.sql's FIX 3.
--
-- That migration added `finance_settings_contractor_id_unique UNIQUE
-- (contractor_id)` on the assumption (stated in FINANCE-AUDIT.md Section C1)
-- that no unique constraint existed on finance_settings.contractor_id. That
-- assumption was wrong: 20260727160000_finance_settings_foundation.sql's
-- CREATE TABLE already declares `UNIQUE (contractor_id)` inline (line 31 of
-- that file), which Postgres auto-named `finance_settings_contractor_id_key`
-- — confirmed live via pg_indexes immediately after 20260815100000 applied:
-- both `finance_settings_contractor_id_key` and the newly-added
-- `finance_settings_contractor_id_unique` exist as identical unique btree
-- indexes on the same single column. The audit finding was based on reading
-- the spec's own SQL stub reasoning rather than re-verifying this specific
-- point against the live DB — a violation of CLAUDE.md's own "Schema/policy
-- claims must come from the live DB" rule, caught on review immediately
-- after apply rather than left in place.
--
-- Fix: drop the redundant constraint just added, keep the original. No data
-- risk — both enforce the identical uniqueness rule, this only removes
-- duplicate bookkeeping.

ALTER TABLE public.finance_settings
  DROP CONSTRAINT IF EXISTS finance_settings_contractor_id_unique;
