-- PPM Scheduling — Automation, Compliance & Integration.
-- Purely additive: no changes to existing table shapes beyond the new
-- service_visits.work_order_id column.
--
-- Corrections made to the brief's given SQL, both verified against the live
-- schema (information_schema.columns) rather than assumed:
--
-- 1. service_visits.scheduled_window_start/_end/completed_at and
--    service_schedules.next_due_at/last_completed_at are all `timestamptz`,
--    NOT `text` — the brief's `v_next_due::text` / `next_due_at::text`
--    round-trips were written as if these were text columns. date/timestamp
--    values assign into timestamptz columns via a standard implicit
--    widening cast, so the extra ::text cast is dropped rather than kept
--    for a schema that doesn't have it.
-- 2. `v_schedule.notice_days || 0` is a bug in the brief, not a stylistic
--    choice: `||` is the string-concatenation operator, not COALESCE, and
--    notice_days is nullable (`integer | null`). Fixed to
--    `COALESCE(v_schedule.notice_days, 0)`.
-- 3. The frequency->days CASE only covered up to '5_yearly', but
--    maintenance-types.ts's ServiceFrequency/FREQUENCY_DAYS also defines
--    6_yearly through 10_yearly (confirmed live in the service_frequency
--    enum) — extended the CASE to match, so a 6-10 yearly schedule doesn't
--    silently fall through to the wrong 365-day default.
--
-- Also: MaintenanceManagement.tsx's existing VisitsTab.handleMarkComplete
-- already does this exact "mark complete -> compute next due -> insert next
-- visit" sequence client-side. Once this trigger exists, that client-side
-- logic would create a SECOND next-visit row (and a second schedule update)
-- every time an FM completes a visit from the existing UI. Fixed by
-- removing the now-redundant client-side portion in the same change that
-- ships this migration (src/components/business/MaintenanceManagement.tsx)
-- — not a restructure, just deleting logic the trigger now owns.

-- =============================================================================
-- 1. auto_roll_next_visit — fires when a visit is marked completed.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.auto_roll_next_visit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_schedule service_schedules%ROWTYPE;
  v_freq_days integer;
  v_next_due date;
  v_window_start date;
  v_window_end date;
BEGIN
  -- Only fire when status changes to 'completed'
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN

    SELECT * INTO v_schedule FROM service_schedules WHERE id = NEW.schedule_id;

    IF FOUND AND v_schedule.is_active THEN
      v_freq_days := CASE v_schedule.frequency
        WHEN 'weekly' THEN 7
        WHEN 'bi_weekly' THEN 14
        WHEN 'monthly' THEN 30
        WHEN 'bi_monthly' THEN 61
        WHEN 'quarterly' THEN 91
        WHEN 'six_monthly' THEN 183
        WHEN 'annual' THEN 365
        WHEN '2_yearly' THEN 730
        WHEN '3_yearly' THEN 1095
        WHEN '4_yearly' THEN 1460
        WHEN '5_yearly' THEN 1825
        WHEN '6_yearly' THEN 2190
        WHEN '7_yearly' THEN 2555
        WHEN '8_yearly' THEN 2920
        WHEN '9_yearly' THEN 3285
        WHEN '10_yearly' THEN 3650
        ELSE 365
      END;

      v_next_due := COALESCE(NEW.completed_at::date, CURRENT_DATE) + v_freq_days;
      v_window_start := v_next_due - COALESCE(v_schedule.notice_days, 0);
      v_window_end := v_next_due;

      UPDATE service_schedules
      SET last_completed_at = NEW.completed_at,
          next_due_at = v_next_due
      WHERE id = NEW.schedule_id;

      INSERT INTO service_visits (
        schedule_id, asset_id, contractor_id, company_id,
        scheduled_window_start, scheduled_window_end, status
      ) VALUES (
        NEW.schedule_id, NEW.asset_id, NEW.contractor_id, NEW.company_id,
        v_window_start, v_window_end, 'scheduled'
      );

      UPDATE assets
      SET last_serviced = COALESCE(NEW.completed_at::date, CURRENT_DATE),
          next_service_due = v_next_due
      WHERE id = NEW.asset_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS visit_completion_auto_roll ON public.service_visits;
CREATE TRIGGER visit_completion_auto_roll
  AFTER UPDATE ON public.service_visits
  FOR EACH ROW EXECUTE FUNCTION public.auto_roll_next_visit();

-- =============================================================================
-- 2. mark_overdue_visits — called by cron, direct SQL (no edge function).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.mark_overdue_visits()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE service_visits
  SET status = 'overdue'
  WHERE status IN ('scheduled', 'confirmed')
  AND scheduled_window_end::date < CURRENT_DATE;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_overdue_visits() FROM PUBLIC, anon, authenticated;

-- =============================================================================
-- 3. Cron registrations — unschedule-then-schedule idiom (established
--    pattern, see e.g. 20260711130000's tendering-scheduled-runner for the
--    direct-SQL form used here).
-- =============================================================================

SELECT cron.unschedule('mark-overdue-visits')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mark-overdue-visits');

SELECT cron.schedule(
  'mark-overdue-visits',
  '0 7 * * *',
  $$ SELECT public.mark_overdue_visits(); $$
);

SELECT cron.unschedule('notify-overdue-visits')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notify-overdue-visits');

SELECT cron.schedule(
  'notify-overdue-visits',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url := public.supabase_project_url() || '/functions/v1/notify-overdue-visits',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || public.get_secret('service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- =============================================================================
-- 4. service_visits.work_order_id — links a visit to the work order raised
--    from it (either overdue remediation or a planned PPM call-out).
-- =============================================================================

ALTER TABLE public.service_visits
  ADD COLUMN work_order_id uuid REFERENCES public.work_orders(id);
