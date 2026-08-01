-- Recurring expenses: schema + daily cron.
--
-- Step 1 (schema) was never actually built in a prior session — the brief
-- for this migration started at "Step 2 — register the cron job" assuming
-- it already existed, but `expenses` only had the pre-existing `is_recurring`
-- boolean (20260211214225) with no interval/next-due/status columns and no
-- process-recurring-expenses edge function. Both are added here since Step 2
-- has nothing to call without them.
--
-- Auth pattern: the cron_secrets_to_vault migration (20260712130000) moved
-- cron HTTP secrets off the app.settings.* GUC approach (confirmed dead —
-- ALTER DATABASE ... SET app.settings.* fails permission-denied on this
-- project) onto Supabase Vault via get_secret('service_role_key') and
-- supabase_project_url(). Two LATER crons (20260730130000
-- insurance-expiry-check, 20260730220000 evaluate-craft-timers) regressed
-- back to the dead current_setting('app.settings...') pattern and are
-- therefore silently non-functional today — not fixed here (out of scope
-- for this brief) but flagged. This migration uses the correct,
-- currently-working get_secret()/supabase_project_url() pattern from
-- 20260712130000, matching invoice-overdue-check and sla-clock-check.

-- =============================================================================
-- 1. Schema — recurrence columns on expenses
-- =============================================================================

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS recurrence_interval text
    CHECK (recurrence_interval IN ('weekly', 'fortnightly', 'monthly', 'quarterly', 'annually')),
  ADD COLUMN IF NOT EXISTS recurrence_next_due date,
  ADD COLUMN IF NOT EXISTS recurrence_end_date date,
  ADD COLUMN IF NOT EXISTS recurrence_parent_id uuid REFERENCES public.expenses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recurrence_auto_confirm boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS expense_status text NOT NULL DEFAULT 'confirmed'
    CHECK (expense_status IN ('confirmed', 'pending_confirmation', 'skipped'));

CREATE INDEX IF NOT EXISTS idx_expenses_recurrence_due
  ON public.expenses(recurrence_next_due)
  WHERE is_recurring = true;

CREATE INDEX IF NOT EXISTS idx_expenses_recurrence_parent
  ON public.expenses(recurrence_parent_id)
  WHERE recurrence_parent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_expenses_status
  ON public.expenses(contractor_id, expense_status);

-- No RLS changes needed: expenses.contractor_id = auth.uid() directly
-- (house pattern, see CLAUDE.md), and the cron edge function below writes
-- via the service_role key, which bypasses RLS entirely.

-- =============================================================================
-- 2. Cron — daily at 06:00, unschedule-then-schedule idiom
-- =============================================================================

SELECT cron.unschedule('process-recurring-expenses')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-recurring-expenses');

SELECT cron.schedule(
  'process-recurring-expenses',
  '0 6 * * *',
  $$
  SELECT net.http_post(
    url := public.supabase_project_url() || '/functions/v1/process-recurring-expenses',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || public.get_secret('service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
