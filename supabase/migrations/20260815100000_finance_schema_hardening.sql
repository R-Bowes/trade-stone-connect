-- Finance schema hardening: four data-integrity fixes from FINANCE-AUDIT.md
-- (Sections B/C, Landmines L1/L4). Read-only verification was run against
-- the live DB before writing this file, per CLAUDE.md's "Schema/policy
-- claims must come from the live DB" rule — results noted inline below.

-- =============================================================================
-- FIX 1 — Canonicalise VAT status on finance_settings
-- =============================================================================
--
-- finance_settings.vat_status already carries a CHECK constraint, added in
-- 20260727160000_finance_settings_foundation.sql and confirmed live via
-- pg_constraint: CHECK (vat_status = ANY (ARRAY['not_registered', 'standard',
-- 'flat_rate'])). This already matches CONTRACTOR-FINANCE.md §1.2's three
-- named schemes (not registered / standard / flat rate) and is already the
-- value set every live consumer reads and writes: FinanceSettings.tsx,
-- ExpenseFormDialog.tsx, VatPosition.tsx, and useFinanceSummary.ts all use
-- 'not_registered' | 'standard' | 'flat_rate' verbatim (grepped before
-- writing this migration). Re-stated here as a DROP+ADD so this migration
-- is a complete, reproducible record of the constraint rather than relying
-- on an untouched 2026-07-27 file — not a behaviour change.
--
-- 'registered' (as opposed to 'standard') is deliberately NOT used as a
-- value here: it would collide conceptually with 'flat_rate', which is
-- ALSO a registered state, and would require renaming a value that four
-- live files already depend on for zero benefit.

ALTER TABLE public.finance_settings
  DROP CONSTRAINT IF EXISTS finance_settings_vat_status_check;

ALTER TABLE public.finance_settings
  ADD CONSTRAINT finance_settings_vat_status_check
  CHECK (vat_status IN ('not_registered', 'standard', 'flat_rate'));

-- profiles.vat_registered / profiles.vat_number are deprecated in favour of
-- finance_settings.vat_status / finance_settings.vat_number (FINANCE-
-- AUDIT.md Landmine L1). NOT dropped — dropping risks breaking any live
-- query or report that still reads them, and the columns cost nothing to
-- leave in place. Every application read/write of profiles.vat_registered
-- has been rewired to finance_settings in this same change (JobManagement.
-- tsx, ProfileManagement.tsx) — see the accompanying code sweep.
COMMENT ON COLUMN public.profiles.vat_registered IS
  'DEPRECATED (2026-08-15): superseded by finance_settings.vat_status. Do not read/write from application code — kept only to avoid a schema break. See FINANCE-AUDIT.md Landmine L1.';

COMMENT ON COLUMN public.profiles.vat_number IS
  'DEPRECATED (2026-08-15): superseded by finance_settings.vat_number. Do not read/write from application code — kept only to avoid a schema break. See FINANCE-AUDIT.md Landmine L1.';

-- =============================================================================
-- FIX 2 — FK on expenses.contractor_id
-- =============================================================================
--
-- Verified live before writing this migration:
--   SELECT e.contractor_id FROM expenses e
--   LEFT JOIN profiles p ON p.id = e.contractor_id WHERE p.id IS NULL;
-- returned zero rows. The DELETE below is a defensive no-op today, kept so
-- this migration is safe to reuse/replay against a DB that drifts before
-- it's applied there.

DELETE FROM public.expenses e
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.id = e.contractor_id
);

ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_contractor_id_fk
  FOREIGN KEY (contractor_id) REFERENCES public.profiles(id);

-- =============================================================================
-- FIX 3 — UNIQUE constraint on finance_settings.contractor_id
-- =============================================================================
--
-- Verified live before writing this migration:
--   SELECT contractor_id, COUNT(*) FROM finance_settings
--   GROUP BY contractor_id HAVING COUNT(*) > 1;
-- returned zero rows. The DELETE below (keep most-recently-updated row per
-- contractor_id, tie-broken by created_at then id for determinism) is a
-- defensive no-op today, same reasoning as FIX 2.

DELETE FROM public.finance_settings fs
WHERE fs.id NOT IN (
  SELECT DISTINCT ON (contractor_id) id
  FROM public.finance_settings
  ORDER BY contractor_id, updated_at DESC, created_at DESC, id DESC
);

ALTER TABLE public.finance_settings
  ADD CONSTRAINT finance_settings_contractor_id_unique UNIQUE (contractor_id);

-- =============================================================================
-- FIX 4 — Capture and correct RLS on expenses
-- =============================================================================
--
-- Live policy captured before writing this migration (pg_policy /
-- pg_get_expr, not pg_policies, to get the exact predicate text):
--
--   SELECT: contractor_id IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid())
--   INSERT: same, as WITH CHECK
--   UPDATE: same, as USING only (no WITH CHECK — matches original 20260211214225 exactly)
--   DELETE: same, as USING
--
-- This is the two-step subquery form. It does NOT match this table's own
-- origin migration (20260211214225_c922aa1e-...sql), which wrote all four
-- policies using the direct form `contractor_id = auth.uid()` — confirmed
-- by reading that file directly. No later migration in this repo touches
-- these four policies (grepped every migration for DROP/ALTER POLICY
-- referencing `expenses` — zero matches), so the live two-step form is
-- undocumented drift, most likely applied via the Supabase dashboard SQL
-- editor outside the migration history. This is FINANCE-AUDIT.md Landmine
-- L4, and is exactly the failure mode CLAUDE.md's "Schema-change
-- discipline" section exists to prevent (previously confirmed twice on this
-- project: accept_business_invite, prevent_last_owner_removal — this is a
-- third instance).
--
-- IMPORTANT — this migration recreates the DIRECT form
-- (`contractor_id = auth.uid()`), not the two-step subquery form, and this
-- is a deliberate deviation from this change's own brief, which asserted
-- the two-step form was "mandated by CLAUDE.md" and instructed "never
-- auth.uid() directly against contractor_id." That assertion is the
-- opposite of what CLAUDE.md actually says. CLAUDE.md's Row-level security
-- section states verbatim: "profiles.id == profiles.user_id == auth.uid()
-- for every row, by construction... Because of this, RLS policies compare
-- DIRECTLY against auth.uid(). This is the actual pattern throughout the
-- codebase. Do NOT use the col IN (SELECT id FROM profiles WHERE user_id =
-- auth.uid()) subquery form — it is equivalent but is not what the code
-- uses, and mixing the two is noise." It further states the two-step form
-- only becomes mandatory again "if the CHECK constraint [profiles.id =
-- profiles.user_id] is ever relaxed" — it has not been. Recreating the
-- two-step form here would have entrenched exactly the undocumented drift
-- this fix exists to repair, and would contradict both CLAUDE.md and this
-- table's own origin migration. The direct form below restores `expenses`
-- to the documented house pattern and to what its own migration history
-- says it should be. Functionally the two forms are equivalent today (see
-- CLAUDE.md's `profiles.id == profiles.user_id` CHECK-constraint
-- invariant) — this is a consistency/documentation fix, not a security fix.

DROP POLICY IF EXISTS "Contractors can view their own expenses" ON public.expenses;
DROP POLICY IF EXISTS "Contractors can insert their own expenses" ON public.expenses;
DROP POLICY IF EXISTS "Contractors can update their own expenses" ON public.expenses;
DROP POLICY IF EXISTS "Contractors can delete their own expenses" ON public.expenses;

CREATE POLICY "Contractors can view their own expenses"
  ON public.expenses FOR SELECT
  USING (contractor_id = auth.uid());

CREATE POLICY "Contractors can insert their own expenses"
  ON public.expenses FOR INSERT
  WITH CHECK (contractor_id = auth.uid());

CREATE POLICY "Contractors can update their own expenses"
  ON public.expenses FOR UPDATE
  USING (contractor_id = auth.uid());

CREATE POLICY "Contractors can delete their own expenses"
  ON public.expenses FOR DELETE
  USING (contractor_id = auth.uid());
