-- Drop the legacy expenses.category text column (FINANCE-AUDIT.md Section B2 /
-- Landmine L3). category_id (FK to expense_categories) is the live,
-- normalised category mechanism.
--
-- IMPORTANT CORRECTION to the audit's original characterisation: `category`
-- was NOT actually dead weight before this migration. It was:
--   - actively WRITTEN on every insert/update by src/hooks/useExpenses.ts
--     (a denormalised display-name cache derived from category_id via
--     resolveCategoryName), and
--   - explicitly selected/inserted by the process-recurring-expenses edge
--     function's column list.
-- Both write paths were removed from the application code (useExpenses.ts,
-- supabase/functions/process-recurring-expenses/index.ts) in the same
-- change as this migration -- see the accompanying code sweep. Without that
-- code sweep, dropping this column outright would have broken the daily
-- process-recurring-expenses cron on every invocation (PostgREST errors on
-- a select naming a nonexistent column) rather than degrading gracefully.

-- Verified live before writing this migration:
--   SELECT DISTINCT category FROM expenses WHERE category IS NOT NULL;
-- returned zero rows (the live `expenses` table currently has zero rows at
-- all). No data loss from this drop.

ALTER TABLE public.expenses DROP COLUMN category;
