-- SCORING.md Phase 2 Step 3: craft_timer_windows — the 90-day no-callback
-- window (Section 3.1). One row per job; a job can re-enter 'complete' via
-- the snagging round-trip (see Step 0 report), so the INSERT trigger below
-- is idempotent via ON CONFLICT (job_id) DO NOTHING — a re-completion never
-- resets an already-running or already-evaluated timer.

CREATE TABLE public.craft_timer_windows (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id         uuid NOT NULL UNIQUE REFERENCES public.jobs(id) ON DELETE CASCADE,
  contractor_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  window_start   timestamptz NOT NULL,
  window_end     timestamptz NOT NULL,
  outcome        text NOT NULL DEFAULT 'pending' CHECK (outcome IN ('pending', 'clear', 'callback_raised')),
  callback_id    uuid REFERENCES public.job_callbacks(id) ON DELETE SET NULL,
  evaluated_at   timestamptz
);

ALTER TABLE public.craft_timer_windows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Contractor selects own timer windows"
  ON public.craft_timer_windows FOR SELECT
  TO authenticated
  USING (contractor_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

-- No client access — internal scoring infrastructure, not client-facing.

CREATE POLICY "Service role full access to timer windows"
  ON public.craft_timer_windows FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_craft_timer_windows_pending ON public.craft_timer_windows(window_end) WHERE outcome = 'pending';

-- ── Completion trigger ─────────────────────────────────────────────────────
-- Fires AFTER UPDATE on jobs when status transitions TO 'complete' (the live
-- completed-status value confirmed in Step 0 — NOT 'completed').

CREATE OR REPLACE FUNCTION public.start_craft_timer_window()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'complete' AND OLD.status IS DISTINCT FROM 'complete' THEN
    INSERT INTO public.craft_timer_windows (job_id, contractor_id, window_start, window_end)
    VALUES (NEW.id, NEW.contractor_id, now(), now() + INTERVAL '90 days')
    ON CONFLICT (job_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_job_complete_start_craft_timer
  AFTER UPDATE ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.start_craft_timer_window();
