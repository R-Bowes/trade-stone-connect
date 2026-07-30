-- SCORING.md Phase 3 Step 6: recalculate_all_scores() — the function the
-- daily cron calls. Runs calculate_trade_averages() first so priors are
-- current, then recalculates every contractor with at least one completed
-- job.

CREATE TABLE public.score_calculation_runs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at          timestamptz NOT NULL,
  finished_at         timestamptz NOT NULL DEFAULT now(),
  contractor_count    integer NOT NULL,
  duration_ms         integer NOT NULL
);

ALTER TABLE public.score_calculation_runs ENABLE ROW LEVEL SECURITY;

-- Internal ops log — no public or contractor access, service role only.
CREATE POLICY "Service role full access to score calculation runs"
  ON public.score_calculation_runs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.recalculate_all_scores()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_started_at timestamptz := clock_timestamp();
  v_contractor record;
  v_count      integer := 0;
BEGIN
  PERFORM public.calculate_trade_averages();

  FOR v_contractor IN
    SELECT DISTINCT contractor_id FROM public.jobs WHERE status = 'complete'
  LOOP
    PERFORM public.calculate_contractor_scores(v_contractor.contractor_id);
    v_count := v_count + 1;
  END LOOP;

  INSERT INTO public.score_calculation_runs (started_at, finished_at, contractor_count, duration_ms)
  VALUES (
    v_started_at,
    clock_timestamp(),
    v_count,
    EXTRACT(EPOCH FROM (clock_timestamp() - v_started_at))::integer * 1000
  );

  RAISE NOTICE 'recalculate_all_scores: % contractors in % ms', v_count, EXTRACT(EPOCH FROM (clock_timestamp() - v_started_at))::integer * 1000;
END;
$$;

REVOKE ALL ON FUNCTION public.recalculate_all_scores() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recalculate_all_scores() TO service_role;
