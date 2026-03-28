-- Job + timesheet flow hardening for contractor operations

-- Keep legacy status values compatible while enforcing forward-only transitions.
ALTER TABLE public.jobs
  DROP CONSTRAINT IF EXISTS jobs_status_check;

ALTER TABLE public.jobs
  ADD CONSTRAINT jobs_status_check
  CHECK (status IN ('scheduled', 'in_progress', 'snagging', 'complete', 'cancelled', 'not_started', 'completed'));

-- Normalize historical values to the new canonical statuses.
UPDATE public.jobs
SET status = 'scheduled'
WHERE status = 'not_started';

UPDATE public.jobs
SET status = 'complete'
WHERE status = 'completed';

ALTER TABLE public.jobs
  ALTER COLUMN status SET DEFAULT 'scheduled';

-- Team members can optionally map to a user profile for timesheet participation.
ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON public.team_members(user_id);

-- Snag list support.
CREATE TABLE IF NOT EXISTS public.job_snag_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  contractor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  is_resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamptz,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.job_snag_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Contractors can manage snag items for their jobs" ON public.job_snag_items;
CREATE POLICY "Contractors can manage snag items for their jobs"
ON public.job_snag_items
FOR ALL TO authenticated
USING (contractor_id = auth.uid())
WITH CHECK (contractor_id = auth.uid());

DROP POLICY IF EXISTS "Clients can view snag items for their jobs" ON public.job_snag_items;
CREATE POLICY "Clients can view snag items for their jobs"
ON public.job_snag_items
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.jobs j
    WHERE j.id = job_snag_items.job_id
      AND j.client_id = auth.uid()
  )
);

DROP TRIGGER IF EXISTS set_job_snag_items_updated_at ON public.job_snag_items;
CREATE TRIGGER set_job_snag_items_updated_at
BEFORE UPDATE ON public.job_snag_items
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Timesheet shape and constraints.
ALTER TABLE public.timesheets
  ADD COLUMN IF NOT EXISTS job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS worker_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS hours numeric,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS approved boolean NOT NULL DEFAULT false;

-- Normalize from legacy columns when present.
UPDATE public.timesheets
SET
  hours = COALESCE(hours, hours_worked),
  notes = COALESCE(notes, description),
  worker_id = COALESCE(worker_id, contractor_id)
WHERE true;

ALTER TABLE public.timesheets
  ALTER COLUMN hours SET DEFAULT 0;

UPDATE public.timesheets
SET hours = 0
WHERE hours IS NULL;

ALTER TABLE public.timesheets
  ALTER COLUMN hours SET NOT NULL;

ALTER TABLE public.timesheets
  DROP CONSTRAINT IF EXISTS timesheets_hours_range_check;
ALTER TABLE public.timesheets
  ADD CONSTRAINT timesheets_hours_range_check
  CHECK (hours >= 0 AND hours <= 12);

ALTER TABLE public.timesheets
  DROP CONSTRAINT IF EXISTS timesheets_hours_half_hour_check;
ALTER TABLE public.timesheets
  ADD CONSTRAINT timesheets_hours_half_hour_check
  CHECK (mod((hours * 2)::numeric, 1) = 0);

CREATE UNIQUE INDEX IF NOT EXISTS idx_timesheets_job_worker_date
  ON public.timesheets(job_id, worker_id, date)
  WHERE job_id IS NOT NULL AND worker_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_timesheets_job_week ON public.timesheets(job_id, date);

-- Contractors and workers can view rows relevant to them.
DROP POLICY IF EXISTS "Workers can view their own timesheets" ON public.timesheets;
CREATE POLICY "Workers can view their own timesheets"
ON public.timesheets
FOR SELECT TO authenticated
USING (worker_id = auth.uid());

-- Recreate worker update policy with approval lock.
DROP POLICY IF EXISTS "Workers can update their own timesheets" ON public.timesheets;
CREATE POLICY "Workers can update their own timesheets"
ON public.timesheets
FOR UPDATE TO authenticated
USING (worker_id = auth.uid() AND approved = false)
WITH CHECK (worker_id = auth.uid());

DROP POLICY IF EXISTS "Contractors can update approved on their timesheets" ON public.timesheets;
CREATE POLICY "Contractors can update approved on their timesheets"
ON public.timesheets
FOR UPDATE TO authenticated
USING (contractor_id = auth.uid())
WITH CHECK (contractor_id = auth.uid());

CREATE OR REPLACE FUNCTION public.prevent_edit_on_approved_timesheet()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.approved = true AND NEW.approved = true AND (NEW.hours IS DISTINCT FROM OLD.hours OR NEW.notes IS DISTINCT FROM OLD.notes) THEN
    RAISE EXCEPTION 'Approved timesheet rows cannot be edited';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_edit_on_approved_timesheet_trigger ON public.timesheets;
CREATE TRIGGER prevent_edit_on_approved_timesheet_trigger
BEFORE UPDATE ON public.timesheets
FOR EACH ROW
EXECUTE FUNCTION public.prevent_edit_on_approved_timesheet();

CREATE OR REPLACE FUNCTION public.start_of_week_monday(input_date date)
RETURNS date
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (input_date - (((extract(dow FROM input_date)::int + 6) % 7) * interval '1 day'))::date;
$$;

CREATE OR REPLACE FUNCTION public.seed_job_timesheets_for_week(
  p_job_id uuid,
  p_contractor_id uuid,
  p_reference_date date DEFAULT CURRENT_DATE
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  week_start date;
BEGIN
  week_start := public.start_of_week_monday(p_reference_date);

  INSERT INTO public.timesheets (contractor_id, job_id, worker_id, date, hours, approved, notes)
  SELECT p_contractor_id, p_job_id, p_contractor_id, (week_start + offs.day_offset), 0, false, NULL
  FROM generate_series(0, 6) AS offs(day_offset)
  ON CONFLICT (job_id, worker_id, date) DO NOTHING;

  INSERT INTO public.timesheets (contractor_id, job_id, worker_id, date, hours, approved, notes)
  SELECT
    p_contractor_id,
    p_job_id,
    tm.user_id,
    (week_start + offs.day_offset),
    0,
    false,
    NULL
  FROM public.job_team_members jtm
  JOIN public.team_members tm ON tm.id = jtm.team_member_id
  CROSS JOIN generate_series(0, 6) AS offs(day_offset)
  WHERE jtm.job_id = p_job_id
    AND tm.user_id IS NOT NULL
  ON CONFLICT (job_id, worker_id, date) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.seed_job_timesheets_for_week(uuid, uuid, date) FROM public;
GRANT EXECUTE ON FUNCTION public.seed_job_timesheets_for_week(uuid, uuid, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.on_job_moved_to_in_progress_seed_timesheets()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'in_progress' AND OLD.status IS DISTINCT FROM 'in_progress' THEN
    PERFORM public.seed_job_timesheets_for_week(NEW.id, NEW.contractor_id, CURRENT_DATE);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_seed_timesheets_on_job_in_progress ON public.jobs;
CREATE TRIGGER trigger_seed_timesheets_on_job_in_progress
AFTER UPDATE OF status ON public.jobs
FOR EACH ROW
EXECUTE FUNCTION public.on_job_moved_to_in_progress_seed_timesheets();

CREATE OR REPLACE FUNCTION public.enforce_job_status_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  has_open_snags boolean;
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'cancelled' THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'scheduled' AND NEW.status = 'in_progress' THEN
    RETURN NEW;
  ELSIF OLD.status = 'in_progress' AND NEW.status = 'snagging' THEN
    RETURN NEW;
  ELSIF OLD.status = 'snagging' AND NEW.status = 'complete' THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.job_snag_items s
      WHERE s.job_id = NEW.id
        AND s.is_resolved = false
    ) INTO has_open_snags;

    IF has_open_snags THEN
      RAISE EXCEPTION 'Cannot move job to complete while snag items remain unresolved';
    END IF;

    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Invalid status transition from % to %', OLD.status, NEW.status;
END;
$$;

DROP TRIGGER IF EXISTS trigger_enforce_job_status_transition ON public.jobs;
CREATE TRIGGER trigger_enforce_job_status_transition
BEFORE UPDATE OF status ON public.jobs
FOR EACH ROW
EXECUTE FUNCTION public.enforce_job_status_transition();
