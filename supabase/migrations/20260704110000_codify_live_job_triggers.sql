-- 20260704110000_codify_live_job_triggers.sql
-- Codifies triggers that exist on the live DB but not in migrations
-- (dashboard-authored, pre-Vercel era). Captured verbatim from
-- pg_get_functiondef on 2026-07-04 — deliberately NOT improved here;
-- known issues (whole-day blocking, legacy status values, no release
-- path, timestamp overwrite on re-entry) are scheduled redesign work.
-- Also documents that 20260328170000's enforce_job_status_transition
-- and timesheet-seed triggers are NOT live (dropped or never applied);
-- their replacements arrive with the scheduling redesign.

CREATE OR REPLACE FUNCTION public.set_job_timestamps()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF NEW.status = 'in_progress' AND OLD.status != 'in_progress' THEN
    NEW.actual_start = now();
  END IF;
  IF NEW.status = 'complete' AND OLD.status != 'complete' THEN
    NEW.actual_end = now();
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_set_job_timestamps ON public.jobs;
CREATE TRIGGER trg_set_job_timestamps
  BEFORE UPDATE ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.set_job_timestamps();

CREATE OR REPLACE FUNCTION public.block_date_on_job_confirmed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $function$
BEGIN
  IF NEW.start_date IS NOT NULL AND NEW.contractor_id IS NOT NULL
     AND NEW.status IN ('scheduled', 'in_progress', 'confirmed', 'active', 'complete', 'completed') THEN
    INSERT INTO contractor_availability_overrides (
      contractor_id, date, am_available, pm_available, reason
    )
    VALUES (
      NEW.contractor_id, NEW.start_date::DATE, false, false,
      'Auto-blocked: confirmed job'
    )
    ON CONFLICT (contractor_id, date)
    DO UPDATE SET
      am_available = false,
      pm_available = false,
      reason = 'Auto-blocked: confirmed job';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_block_date_on_job_confirmed ON public.jobs;
CREATE TRIGGER trg_block_date_on_job_confirmed
  AFTER INSERT OR UPDATE OF start_date, status ON public.jobs
  FOR EACH ROW
  WHEN (NEW.start_date IS NOT NULL)
  EXECUTE FUNCTION public.block_date_on_job_confirmed();

CREATE OR REPLACE FUNCTION public.notify_job_status_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $function$
DECLARE
  job_title text;
  status_label text;
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    job_title := NEW.title;

    CASE NEW.status
      WHEN 'scheduled'        THEN status_label := 'Scheduled';
      WHEN 'in_progress'      THEN status_label := 'In Progress';
      WHEN 'snagging'         THEN status_label := 'Snagging';
      WHEN 'pending_sign_off' THEN status_label := 'Pending Sign Off';
      WHEN 'complete'         THEN status_label := 'Complete';
      WHEN 'cancelled'        THEN status_label := 'Cancelled';
      ELSE status_label := NEW.status;
    END CASE;

    IF NEW.customer_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, title, message, type, reference_type, reference_id)
      VALUES (NEW.customer_id, 'Job Status Updated',
              'Job "' || job_title || '" is now ' || status_label,
              'job_status', 'job', NEW.id);
    END IF;

    IF NEW.contractor_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, title, message, type, reference_type, reference_id)
      VALUES (NEW.contractor_id, 'Job Status Updated',
              'Job "' || job_title || '" is now ' || status_label,
              'job_status', 'job', NEW.id);
    END IF;

  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_job_status_change ON public.jobs;
CREATE TRIGGER on_job_status_change
  AFTER UPDATE ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_job_status_change();