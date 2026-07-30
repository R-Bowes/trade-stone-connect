-- SCORING.md Phase 3 Step 2: contractor_score_history — trend-line snapshots,
-- appended to (never updated) on every recalculation run.

CREATE TABLE public.contractor_score_history (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  score_type     text NOT NULL CHECK (score_type IN ('craft', 'service', 'value')),
  score_value    numeric(3,1),
  confidence     text CHECK (confidence IN ('building', 'provisional', 'established')),
  signal_count   integer,
  recorded_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_contractor_score_history_trend
  ON public.contractor_score_history (contractor_id, score_type, recorded_at);

ALTER TABLE public.contractor_score_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Contractor selects own score history"
  ON public.contractor_score_history FOR SELECT
  TO authenticated
  USING (contractor_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

-- No public/anon access — trend data is contractor-facing only (Phase 4).

CREATE POLICY "Service role full access to score history"
  ON public.contractor_score_history FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
