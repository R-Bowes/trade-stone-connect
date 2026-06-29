-- 20260629130000_sla_clock.sql

-- Extend sla_rules to be a proper policy table
-- Rename is too risky (breaks existing FKs) — extend in place instead
ALTER TABLE public.sla_rules
  ADD COLUMN IF NOT EXISTS attendance_hours    integer,
  ADD COLUMN IF NOT EXISTS clock_pausable      boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS alert_pct           integer NOT NULL DEFAULT 75,
  ADD COLUMN IF NOT EXISTS business_hours_only boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS business_hours_start time DEFAULT '08:00',
  ADD COLUMN IF NOT EXISTS business_hours_end  time DEFAULT '18:00';

-- P1 rows should never be pausable — enforce for existing P1 rows
UPDATE public.sla_rules
SET clock_pausable = false
WHERE priority = 'p1';

-- Immutable clock event log — append-only, never updated
CREATE TABLE IF NOT EXISTS public.sla_clock_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  sla_rule_id     uuid REFERENCES public.sla_rules(id) ON DELETE SET NULL,
  event_type      text NOT NULL
    CHECK (event_type IN ('started','paused','resumed','breached','met','closed')),
  clock_target    text NOT NULL
    CHECK (clock_target IN ('response','attendance','completion')),
  reason          text,
  actor_id        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  occurred_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sla_clock_job ON public.sla_clock_events(job_id);
CREATE INDEX idx_sla_clock_event_type ON public.sla_clock_events(event_type);
CREATE INDEX idx_sla_clock_occurred ON public.sla_clock_events(occurred_at);

ALTER TABLE public.sla_clock_events ENABLE ROW LEVEL SECURITY;

-- Business reads clock events for their jobs
CREATE POLICY "Business reads sla clock events for their jobs"
ON public.sla_clock_events
FOR SELECT
TO authenticated
USING (
  job_id IN (
    SELECT j.id FROM public.jobs j
    JOIN public.companies c ON c.id = j.company_id
    JOIN public.profiles p ON p.id = c.owner_id
    WHERE p.user_id = auth.uid()
  )
);

-- Contractor reads clock events for their jobs
CREATE POLICY "Contractor reads sla clock events for their jobs"
ON public.sla_clock_events
FOR SELECT
TO authenticated
USING (
  job_id IN (
    SELECT id FROM public.jobs
    WHERE contractor_id IN (
      SELECT id FROM public.profiles WHERE user_id = auth.uid()
    )
  )
);

-- Service role inserts (edge function uses service role)
CREATE POLICY "Service role inserts sla clock events"
ON public.sla_clock_events
FOR INSERT
TO service_role
WITH CHECK (true);

-- Extend jobs with SLA clock columns
-- sla_rule_id and sla_response_due already exist — add the missing ones
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS sla_attendance_due  timestamptz,
  ADD COLUMN IF NOT EXISTS sla_completion_due  timestamptz,
  ADD COLUMN IF NOT EXISTS sla_status          text DEFAULT 'not_applicable'
    CHECK (sla_status IN ('not_applicable','on_track','at_risk','breached','met'));

CREATE INDEX IF NOT EXISTS idx_jobs_sla_status ON public.jobs(sla_status);
CREATE INDEX IF NOT EXISTS idx_jobs_sla_rule ON public.jobs(sla_rule_id);