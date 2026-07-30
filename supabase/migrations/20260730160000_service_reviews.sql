-- SCORING.md Phase 2 Step 1: service_reviews — structured, four-dimension
-- post-job feedback that feeds the future Service score (Section 4) and the
-- Value score's single client input (costs_communicated_clearly, Section 5).
--
-- Distinct from the pre-existing job_reviews table (single 1-5 star rating +
-- contractor reply, shown on the public profile Reviews block). service_reviews
-- is a private structured signal source for Phase 3 scoring, not a
-- replacement — both coexist on the same completed job. See Step 0 report.

CREATE TABLE public.service_reviews (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id                      uuid NOT NULL UNIQUE REFERENCES public.jobs(id) ON DELETE CASCADE,
  contractor_id               uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reviewer_id                 uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  communication               smallint NOT NULL CHECK (communication BETWEEN 1 AND 3),
  reliability                 smallint NOT NULL CHECK (reliability BETWEEN 1 AND 3),
  property_respect            smallint NOT NULL CHECK (property_respect BETWEEN 1 AND 3),
  expectation_management      smallint NOT NULL CHECK (expectation_management BETWEEN 1 AND 3),
  costs_communicated_clearly  boolean,
  free_text                   text,
  suppressed                  boolean NOT NULL DEFAULT false,
  suppressed_reason           text,
  created_at                  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.service_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reviewer inserts own review"
  ON public.service_reviews FOR INSERT
  TO authenticated
  WITH CHECK (reviewer_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Reviewer selects own review"
  ON public.service_reviews FOR SELECT
  TO authenticated
  USING (reviewer_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Contractor selects reviews about them"
  ON public.service_reviews FOR SELECT
  TO authenticated
  USING (contractor_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

-- Reviews are immutable once submitted — deliberately no UPDATE policy for
-- authenticated (client or contractor). Public/anon reads are scoped to
-- non-suppressed rows for the eventual public display of aggregate signals.
CREATE POLICY "Public reads non-suppressed reviews"
  ON public.service_reviews FOR SELECT
  USING (suppressed = false);

CREATE POLICY "Service role full access to service reviews"
  ON public.service_reviews FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_service_reviews_contractor ON public.service_reviews(contractor_id);
