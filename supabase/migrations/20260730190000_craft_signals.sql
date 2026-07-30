-- SCORING.md Phase 2 Step 4: craft_signals — normalised 0-10 evidence feed
-- for the Phase 3 Craft score engine (Section 3). System-generated only.

CREATE TABLE public.craft_signals (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  job_id         uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  signal_type    text NOT NULL CHECK (signal_type IN (
    'inspection_pass', 'inspection_remediation', 'inspection_fail',
    'callback_clear_90d', 'callback_fault', 'callback_unrelated',
    'warranty_honoured', 'warranty_ghosted', 'warranty_charged',
    'photo_documentation'
  )),
  signal_value   numeric NOT NULL CHECK (signal_value BETWEEN 0 AND 10),
  raw_data       jsonb,
  job_complexity numeric,
  recorded_at    timestamptz NOT NULL DEFAULT now(),
  decay_anchor   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.craft_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Contractor selects own craft signals"
  ON public.craft_signals FOR SELECT
  TO authenticated
  USING (contractor_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

-- No client access. No contractor INSERT/UPDATE — signals are exclusively
-- system-generated (edge functions / SECURITY DEFINER triggers via
-- service_role), never contractor-submitted.
CREATE POLICY "Service role full access to craft signals"
  ON public.craft_signals FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_craft_signals_contractor ON public.craft_signals(contractor_id);
CREATE INDEX idx_craft_signals_job ON public.craft_signals(job_id);

-- ── Trigger: craft_timer_windows outcome -> craft_signals ────────────────
-- Fires whenever evaluate-craft-timers (or anything else) resolves a timer
-- window's outcome out of 'pending'. Living as a DB trigger rather than
-- inline in the edge function means the signal is always recorded no
-- matter what sets the outcome, and it can never be set without one.

CREATE OR REPLACE FUNCTION public.record_craft_timer_signal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.outcome = 'clear' AND OLD.outcome IS DISTINCT FROM 'clear' THEN
    INSERT INTO public.craft_signals (contractor_id, job_id, signal_type, signal_value, raw_data, decay_anchor)
    VALUES (NEW.contractor_id, NEW.job_id, 'callback_clear_90d', 8.0,
            jsonb_build_object('craft_timer_window_id', NEW.id), NEW.evaluated_at);
  ELSIF NEW.outcome = 'callback_raised' AND OLD.outcome IS DISTINCT FROM 'callback_raised' THEN
    INSERT INTO public.craft_signals (contractor_id, job_id, signal_type, signal_value, raw_data, decay_anchor)
    VALUES (NEW.contractor_id, NEW.job_id, 'callback_fault', 2.0,
            jsonb_build_object('craft_timer_window_id', NEW.id, 'callback_id', NEW.callback_id), NEW.evaluated_at);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_craft_timer_outcome_set
  AFTER UPDATE ON public.craft_timer_windows
  FOR EACH ROW
  WHEN (NEW.outcome IS DISTINCT FROM OLD.outcome)
  EXECUTE FUNCTION public.record_craft_timer_signal();
