-- SCORING.md Phase 2 Step 3: daily cron for evaluate-craft-timers, following
-- the established unschedule-if-exists-then-schedule idiom. Runs at 08:30,
-- after invoice-overdue-check (08:00) and insurance-expiry-check (08:15).

SELECT cron.unschedule('evaluate-craft-timers')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'evaluate-craft-timers');

SELECT cron.schedule(
  'evaluate-craft-timers',
  '30 8 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url', true) || '/functions/v1/evaluate-craft-timers',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb
  );
  $$
);
