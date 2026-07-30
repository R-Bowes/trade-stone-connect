-- SCORING.md Phase 3 Step 1: contractor_scores — materialised, recalculated
-- periodically by the daily cron (recalculate_all_scores), not on read.

CREATE TABLE public.contractor_scores (
  contractor_id         uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  craft_score           numeric(3,1) CHECK (craft_score BETWEEN 0.0 AND 10.0),
  craft_confidence      text CHECK (craft_confidence IN ('building', 'provisional', 'established')),
  craft_signal_count    integer NOT NULL DEFAULT 0,
  service_score         numeric(3,1) CHECK (service_score BETWEEN 0.0 AND 10.0),
  service_confidence    text CHECK (service_confidence IN ('building', 'provisional', 'established')),
  service_review_count  integer NOT NULL DEFAULT 0,
  value_score            numeric(3,1) CHECK (value_score BETWEEN 0.0 AND 10.0),
  value_confidence       text CHECK (value_confidence IN ('building', 'provisional', 'established')),
  value_signal_count      integer NOT NULL DEFAULT 0,
  composite_score        numeric(3,1), -- internal ranking use only, never displayed
  last_calculated_at     timestamptz NOT NULL DEFAULT now(),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.contractor_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Contractor selects own scores"
  ON public.contractor_scores FOR SELECT
  TO authenticated
  USING (contractor_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

-- Scores are public information per spec — Phase 4 controls what the UI
-- actually surfaces, this is just the read grant.
CREATE POLICY "Public reads all scores"
  ON public.contractor_scores FOR SELECT
  USING (true);

-- No INSERT/UPDATE/DELETE policy for any non-service role at all —
-- service role only, matching "No INSERT/UPDATE/DELETE from any user".
CREATE POLICY "Service role full access to contractor scores"
  ON public.contractor_scores FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE TRIGGER contractor_scores_updated_at
  BEFORE UPDATE ON public.contractor_scores
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
