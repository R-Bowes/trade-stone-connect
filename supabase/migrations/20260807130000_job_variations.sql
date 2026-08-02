-- Job variations / change orders. Purely additive: one new table, a
-- contract-value-on-approval trigger, and a scoring helper view.

CREATE TABLE public.job_variations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id),
  contractor_id uuid NOT NULL REFERENCES public.profiles(id),
  customer_id uuid NOT NULL REFERENCES public.profiles(id),

  variation_number integer NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  reason text NOT NULL
    CHECK (reason IN (
      'client_request', 'unforeseen_works', 'design_change',
      'regulatory_requirement', 'material_substitution', 'other'
    )),

  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  amount numeric NOT NULL,
  revised_contract_value numeric NOT NULL,

  original_contract_value numeric NOT NULL,

  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn')),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  response_note text,

  supporting_documents jsonb DEFAULT '[]'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (job_id, variation_number)
);

-- Feeds the scoring engine's value-variance calculation: an approved
-- variation's amount offsets the quote-to-invoice gap it accounts for.
-- Only calculate_contractor_scores' consumer job_adjusted_contract_value
-- below — this column itself has no other reader yet.
ALTER TABLE public.job_variations
  ADD COLUMN value_score_adjustment numeric GENERATED ALWAYS AS (
    CASE WHEN status = 'approved' THEN amount ELSE 0 END
  ) STORED;

ALTER TABLE public.job_variations ENABLE ROW LEVEL SECURITY;

-- profiles.id == profiles.user_id == auth.uid() by construction
-- (CLAUDE.md RLS section) — direct comparison is the house pattern.
CREATE POLICY "Parties can view job variations"
  ON public.job_variations FOR SELECT
  TO authenticated
  USING (contractor_id = auth.uid() OR customer_id = auth.uid());

CREATE POLICY "Contractor can raise job variations"
  ON public.job_variations FOR INSERT
  TO authenticated
  WITH CHECK (contractor_id = auth.uid());

-- Contractor may edit/withdraw only while still pending; customer may
-- respond (approve/reject) regardless of who's writing — row-level only,
-- same broad shape as other two-party tables in this codebase (e.g.
-- cooling_off_records' consumer UPDATE policy).
CREATE POLICY "Contractor can edit pending variations"
  ON public.job_variations FOR UPDATE
  TO authenticated
  USING (contractor_id = auth.uid() AND status = 'pending')
  WITH CHECK (contractor_id = auth.uid());

CREATE POLICY "Customer can respond to variations"
  ON public.job_variations FOR UPDATE
  TO authenticated
  USING (customer_id = auth.uid())
  WITH CHECK (customer_id = auth.uid());

-- No DELETE policy — audit records, per spec.

CREATE TRIGGER job_variations_updated_at
  BEFORE UPDATE ON public.job_variations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX idx_job_variations_job ON public.job_variations(job_id);
CREATE INDEX idx_job_variations_contractor ON public.job_variations(contractor_id);

-- =========================================================================
-- Variation numbering — per-job sequential, trigger-assigned (same
-- never-client-supplied convention as quote_number/job_number/
-- invoice_number; see CLAUDE.md's document reference system section).
-- =========================================================================

CREATE OR REPLACE FUNCTION public.assign_variation_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  SELECT COALESCE(MAX(variation_number), 0) + 1 INTO NEW.variation_number
  FROM public.job_variations WHERE job_id = NEW.job_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_variation_number
  BEFORE INSERT ON public.job_variations
  FOR EACH ROW EXECUTE FUNCTION public.assign_variation_number();

-- =========================================================================
-- Approval/rejection side effects: contract value update + notifications.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.variation_approved_update_contract()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
    UPDATE public.jobs
    SET contract_value = NEW.revised_contract_value,
        updated_at = now()
    WHERE id = NEW.job_id;

    INSERT INTO public.notifications (user_id, title, message, type, reference_type, reference_id, is_read)
    VALUES (
      NEW.contractor_id,
      'Variation approved',
      'Variation #' || NEW.variation_number || ' (' || NEW.title || ') has been approved — £' ||
        CASE WHEN NEW.amount >= 0 THEN '+' ELSE '' END || ROUND(NEW.amount, 2)::text,
      'variation_approved', 'job', NEW.job_id, false
    );
  END IF;

  IF NEW.status = 'rejected' AND (OLD.status IS NULL OR OLD.status != 'rejected') THEN
    INSERT INTO public.notifications (user_id, title, message, type, reference_type, reference_id, is_read)
    VALUES (
      NEW.contractor_id,
      'Variation rejected',
      'Variation #' || NEW.variation_number || ' (' || NEW.title || ') was rejected' ||
        CASE WHEN NEW.response_note IS NOT NULL THEN ': ' || NEW.response_note ELSE '' END,
      'variation_rejected', 'job', NEW.job_id, false
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER variation_status_change
  AFTER UPDATE ON public.job_variations
  FOR EACH ROW EXECUTE FUNCTION public.variation_approved_update_contract();

-- =========================================================================
-- Scoring helper: quote total adjusted for approved variations. Consumed
-- by a future calculate_contractor_scores pass — not wired in by this
-- migration (see CLAUDE.md note on this feature's own report for why).
-- security_invoker = true: pure join/aggregate over tables whose own RLS
-- already correctly scopes every consumer (contractor sees their own jobs;
-- no new access boundary needed) — CLAUDE.md view-idiom pattern 2.
-- =========================================================================

CREATE OR REPLACE VIEW public.job_adjusted_contract_value
WITH (security_invoker = true) AS
SELECT
  j.id AS job_id,
  j.contractor_id,
  iq.total AS original_quote_total,
  COALESCE(SUM(CASE WHEN jv.status = 'approved' THEN jv.amount ELSE 0 END), 0)
    AS approved_variation_total,
  iq.total + COALESCE(SUM(CASE WHEN jv.status = 'approved' THEN jv.amount ELSE 0 END), 0)
    AS adjusted_total
FROM public.jobs j
LEFT JOIN public.issued_quotes iq ON iq.id = j.issued_quote_id
LEFT JOIN public.job_variations jv ON jv.job_id = j.id
WHERE j.status = 'complete' AND iq.id IS NOT NULL
GROUP BY j.id, j.contractor_id, iq.total;

-- =========================================================================
-- Storage — existing `documents` bucket, path
-- variations/{contractor_id}/{job_id}/{filename}. Mirrors
-- certificates_path_insert (20260803100000_job_certificates.sql) exactly,
-- including that migration's flagged caveat: this bucket is `public = true`
-- with a pre-existing "Anyone can view uploaded documents" policy with no
-- path restriction, so objects are already fetchable via public URL by
-- unguessable-path obscurity rather than true access control. Not fixed
-- here for the same reason it wasn't fixed there — out of scope for an
-- additive migration, flagged for LATER.md.
-- =========================================================================

CREATE POLICY "variations_path_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] = 'variations'
  AND (storage.foldername(name))[2] = auth.uid()::text
);
