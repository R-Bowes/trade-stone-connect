-- SCORING.md Phase 2 Step 2: job_callbacks — feeds Craft score's 90-day
-- no-callback window (Section 3.1) and rework/warranty-honour signals.

CREATE TABLE public.job_callbacks (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_job_id     uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  callback_job_id     uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  contractor_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  raised_by           uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  raised_at           timestamptz NOT NULL DEFAULT now(),
  fault_classification text NOT NULL DEFAULT 'pending_assessment'
    CHECK (fault_classification IN ('original_fault', 'unrelated', 'wear_and_tear', 'client_misuse', 'pending_assessment')),
  classified_by       text CHECK (classified_by IN ('system', 'admin', 'contractor_accepted')),
  classified_at       timestamptz,
  resolved            boolean NOT NULL DEFAULT false,
  resolved_at         timestamptz,
  additional_charge   boolean,
  notes               text
);

ALTER TABLE public.job_callbacks ENABLE ROW LEVEL SECURITY;

-- Client raises a callback only on a job where they are the customer, and
-- only names themselves as raised_by — both halves of the ownership check
-- live in WITH CHECK since this is an INSERT policy.
CREATE POLICY "Client inserts callback on own job"
  ON public.job_callbacks FOR INSERT
  TO authenticated
  WITH CHECK (
    raised_by IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    AND original_job_id IN (
      SELECT id FROM public.jobs
      WHERE customer_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Client selects own callbacks"
  ON public.job_callbacks FOR SELECT
  TO authenticated
  USING (raised_by IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Contractor selects callbacks against them"
  ON public.job_callbacks FOR SELECT
  TO authenticated
  USING (contractor_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

-- Contractor may accept fault (fault_classification -> 'contractor_accepted'
-- semantics live in classified_by, per SCORING.md: "they can accept fault
-- but not classify it as anything else — that's admin"). Enforced by
-- WITH CHECK requiring classified_by = 'contractor_accepted' AND
-- fault_classification = 'original_fault' on every contractor-authored
-- update — a contractor can only ever move a callback into "I accept this
-- was my fault", never into unrelated/wear_and_tear/client_misuse.
CREATE POLICY "Contractor accepts fault on own callbacks"
  ON public.job_callbacks FOR UPDATE
  TO authenticated
  USING (contractor_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()))
  WITH CHECK (
    contractor_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    AND fault_classification = 'original_fault'
    AND classified_by = 'contractor_accepted'
  );

-- RLS's WITH CHECK constrains VALUES, not which columns may be touched — a
-- contractor could otherwise also silently edit resolved/notes/etc. through
-- the same UPDATE policy. Brief scope is fault-acceptance only, so lock the
-- column grant down to exactly the three columns that acceptance touches.
REVOKE UPDATE ON public.job_callbacks FROM authenticated;
GRANT UPDATE (fault_classification, classified_by, classified_at) ON public.job_callbacks TO authenticated;

CREATE POLICY "Service role full access to callbacks"
  ON public.job_callbacks FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_job_callbacks_original_job ON public.job_callbacks(original_job_id);
CREATE INDEX idx_job_callbacks_contractor ON public.job_callbacks(contractor_id);
