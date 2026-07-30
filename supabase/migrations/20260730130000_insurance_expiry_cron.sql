-- SCORING.md Phase 1 step 7: daily cron for insurance-expiry-check, following
-- the established unschedule-if-exists-then-schedule idiom (20260328193000,
-- reasserted 20260711130000). Runs after invoice-overdue-check (08:00) at
-- 08:15 to avoid piling every daily job on the same minute.
--
-- Note found while building this: cert-expiry-check (team certifications)
-- has an edge function and a header comment claiming cron invocation, but
-- was never actually given a cron.schedule entry anywhere in migration
-- history — it has never run automatically. Out of scope to fix here (not
-- part of this brief); flagged for a follow-up migration.

SELECT cron.unschedule('insurance-expiry-check')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'insurance-expiry-check');

SELECT cron.schedule(
  'insurance-expiry-check',
  '15 8 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url', true) || '/functions/v1/insurance-expiry-check',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb
  );
  $$
);
