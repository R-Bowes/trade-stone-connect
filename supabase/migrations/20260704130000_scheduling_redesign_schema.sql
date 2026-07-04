-- 20260704130000_scheduling_redesign_schema.sql
-- Schema pass for the scheduling/job-lifecycle redesign (sections C, E, F, G).
--
-- C: half-day availability blocking + release on cancellation + release RPC
-- E: timesheets arrived/left pair with server-derived hours
-- F: contractor counter-signature on jobs
-- G: status transition guard (forward + bounded backward) and
--    null-guards on set_job_timestamps

-- ============ C: half-day blocking ============
-- Replaces the whole-day block. Derives AM/PM from the confirmed
-- schedule_events row for the job's quote (proposals store 09:00/13:00
-- start times). Falls back to whole-day when no slot info exists
-- (manually created jobs). Tighten-only on conflict: never unblocks a
-- half something else blocked; never clobbers a manual reason.

CREATE OR REPLACE FUNCTION public.block_date_on_job_confirmed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $function$
DECLARE
  v_start time;
  v_block_am boolean;
  v_block_pm boolean;
BEGIN
  IF NEW.start_date IS NOT NULL AND NEW.contractor_id IS NOT NULL
     AND NEW.status IN ('scheduled', 'in_progress', 'snagging', 'complete') THEN

    SELECT se.start_time::time INTO v_start
    FROM public.schedule_events se
    WHERE se.quote_id = NEW.issued_quote_id
      AND se.event_type = 'quote_proposal'
      AND se.is_confirmed = true
    LIMIT 1;

    IF v_start IS NULL THEN
      v_block_am := true;  v_block_pm := true;      -- no slot info: whole day
    ELSIF extract(hour FROM v_start) < 12 THEN
      v_block_am := true;  v_block_pm := false;      -- AM job
    ELSE
      v_block_am := false; v_block_pm := true;       -- PM job
    END IF;

    INSERT INTO public.contractor_availability_overrides (
      contractor_id, date, am_available, pm_available, reason
    )
    VALUES (
      NEW.contractor_id, NEW.start_date::date,
      NOT v_block_am, NOT v_block_pm,
      'Auto-blocked: confirmed job'
    )
    ON CONFLICT (contractor_id, date)
    DO UPDATE SET
      am_available = contractor_availability_overrides.am_available AND NOT v_block_am,
      pm_available = contractor_availability_overrides.pm_available AND NOT v_block_pm,
      reason = COALESCE(contractor_availability_overrides.reason, 'Auto-blocked: confirmed job');
  END IF;
  RETURN NEW;
END;
$function$;

-- Release the block when a job is cancelled, unless another live job
-- occupies the same contractor/date. Deletes the override entirely when
-- both halves become free and it was auto-created.

CREATE OR REPLACE FUNCTION public.release_date_on_job_cancelled()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $function$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled'
     AND NEW.start_date IS NOT NULL AND NEW.contractor_id IS NOT NULL THEN

    IF NOT EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.contractor_id = NEW.contractor_id
        AND j.start_date = NEW.start_date
        AND j.id <> NEW.id
        AND j.status <> 'cancelled'
    ) THEN
      DELETE FROM public.contractor_availability_overrides
      WHERE contractor_id = NEW.contractor_id
        AND date = NEW.start_date::date
        AND reason = 'Auto-blocked: confirmed job';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_release_date_on_job_cancelled ON public.jobs;
CREATE TRIGGER trg_release_date_on_job_cancelled
  AFTER UPDATE OF status ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.release_date_on_job_cancelled();

-- RPC for scheduling backouts (client gate: "request different date" /
-- "cancel scheduling"): releases the block placed at contractor-confirm
-- time, when no live job exists for the quote. Caller must be a party
-- to the quote.

CREATE OR REPLACE FUNCTION public.release_schedule_block(p_quote_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $function$
DECLARE
  v_contractor uuid;
  v_recipient uuid;
  v_date date;
BEGIN
  SELECT q.contractor_id, q.recipient_id INTO v_contractor, v_recipient
  FROM public.issued_quotes q WHERE q.id = p_quote_id;

  IF v_contractor IS NULL THEN
    RAISE EXCEPTION 'Quote not found';
  END IF;

  IF auth.uid() NOT IN (
    SELECT user_id FROM public.profiles WHERE id IN (v_contractor, v_recipient)
  ) THEN
    RAISE EXCEPTION 'Not a party to this quote';
  END IF;

  SELECT se.start_time::date INTO v_date
  FROM public.schedule_events se
  WHERE se.quote_id = p_quote_id
    AND se.event_type = 'quote_proposal'
    AND se.is_confirmed = true
  LIMIT 1;

  IF v_date IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.issued_quote_id = p_quote_id AND j.status <> 'cancelled'
  ) THEN
    DELETE FROM public.contractor_availability_overrides
    WHERE contractor_id = v_contractor
      AND date = v_date
      AND reason = 'Auto-blocked: confirmed job';
  END IF;
END;
$function$;

-- ============ E: timesheet arrived/left ============

ALTER TABLE public.timesheets
  ADD COLUMN arrived_at time,
  ADD COLUMN left_at time;

CREATE OR REPLACE FUNCTION public.derive_timesheet_hours()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF NEW.arrived_at IS NOT NULL AND NEW.left_at IS NOT NULL THEN
    IF NEW.left_at <= NEW.arrived_at THEN
      RAISE EXCEPTION 'left_at must be after arrived_at';
    END IF;
    NEW.hours := round((extract(epoch FROM (NEW.left_at - NEW.arrived_at)) / 3600.0)::numeric, 2);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_derive_timesheet_hours ON public.timesheets;
CREATE TRIGGER trg_derive_timesheet_hours
  BEFORE INSERT OR UPDATE ON public.timesheets
  FOR EACH ROW
  EXECUTE FUNCTION public.derive_timesheet_hours();

-- ============ F: contractor counter-signature ============

ALTER TABLE public.jobs
  ADD COLUMN contractor_signed_off_at timestamptz,
  ADD COLUMN contractor_signed_off_name text;

-- ============ G: transition guard + timestamp null-guards ============
-- Forward: scheduled→in_progress→snagging→complete.
-- Backward: in_progress→scheduled, snagging→in_progress;
-- complete→snagging only while unsigned. Cancel from anywhere until
-- both parties have signed. Same-status updates pass through.

CREATE OR REPLACE FUNCTION public.enforce_job_status_transition()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'cancelled' THEN
    IF OLD.signed_off_at IS NOT NULL AND OLD.contractor_signed_off_at IS NOT NULL THEN
      RAISE EXCEPTION 'Cannot cancel a fully signed-off job';
    END IF;
    RETURN NEW;
  END IF;

  IF (OLD.status = 'scheduled'   AND NEW.status = 'in_progress')
  OR (OLD.status = 'in_progress' AND NEW.status = 'snagging')
  OR (OLD.status = 'snagging'    AND NEW.status = 'complete'
      AND NOT EXISTS (
        SELECT 1 FROM public.job_snag_items s
        WHERE s.job_id = NEW.id AND s.is_resolved = false
      ))
  OR (OLD.status = 'in_progress' AND NEW.status = 'scheduled')
  OR (OLD.status = 'snagging'    AND NEW.status = 'in_progress')
  OR (OLD.status = 'complete'    AND NEW.status = 'snagging'
      AND OLD.signed_off_at IS NULL AND OLD.contractor_signed_off_at IS NULL)
  THEN
    RETURN NEW;
  END IF;
IF OLD.status = 'snagging' AND NEW.status = 'complete' THEN
    RAISE EXCEPTION 'Cannot complete: unresolved snag items remain';
  END IF;
  RAISE EXCEPTION 'Invalid status transition: % -> %', OLD.status, NEW.status;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_job_status_transition ON public.jobs;
CREATE TRIGGER trg_enforce_job_status_transition
  BEFORE UPDATE OF status ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_job_status_transition();

-- Null-guards: re-entering a stage no longer overwrites the original
-- timestamps.

CREATE OR REPLACE FUNCTION public.set_job_timestamps()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF NEW.status = 'in_progress' AND OLD.status != 'in_progress'
     AND NEW.actual_start IS NULL THEN
    NEW.actual_start = now();
  END IF;
  IF NEW.status = 'complete' AND OLD.status != 'complete'
     AND NEW.actual_end IS NULL THEN
    NEW.actual_end = now();
  END IF;
  RETURN NEW;
END;
$function$;