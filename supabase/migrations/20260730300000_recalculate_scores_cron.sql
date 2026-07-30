-- SCORING.md Phase 3 Step 7: reschedule evaluate-craft-timers from 08:30 to
-- 03:00, and add recalculate-scores at 04:00 — so timers evaluated at 03:00
-- (which can flip craft_timer_windows.outcome and insert craft_signals) are
-- included in the same day's 04:00 score recalculation.

SELECT cron.unschedule('evaluate-craft-timers')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'evaluate-craft-timers');

SELECT cron.schedule(
  'evaluate-craft-timers',
  '0 3 * * *',
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

SELECT cron.unschedule('recalculate-scores')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'recalculate-scores');

SELECT cron.schedule(
  'recalculate-scores',
  '0 4 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url', true) || '/functions/v1/recalculate-scores',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb
  );
  $$
);
