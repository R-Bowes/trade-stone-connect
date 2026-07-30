-- SCORING.md Phase 3 Step 8: basic v1 anomaly detection on service_reviews.
-- Called from calculate_contractor_scores() before the Service score
-- calculation, so suppressed rows are excluded from that run's average.
-- Deliberately blunt (Section 7) — sophisticated detection is a later phase.

CREATE OR REPLACE FUNCTION public.check_review_anomalies(p_contractor_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- ── Review burst: more than 3 reviews for this contractor within a
  -- trailing 7-day window. Flags the 4th-and-later review in any such
  -- window (the newest ones causing the burst), earlier ones stay clean.
  WITH windowed AS (
    SELECT id,
           count(*) OVER (
             ORDER BY created_at
             RANGE BETWEEN INTERVAL '7 days' PRECEDING AND CURRENT ROW
           ) AS trailing_count
    FROM public.service_reviews
    WHERE contractor_id = p_contractor_id AND suppressed = false
  )
  UPDATE public.service_reviews sr
  SET suppressed = true, suppressed_reason = 'review_burst'
  FROM windowed w
  WHERE sr.id = w.id AND w.trailing_count > 3;

  -- ── Fast review: submitted less than 2 hours after the job was marked
  -- complete.
  UPDATE public.service_reviews sr
  SET suppressed = true, suppressed_reason = 'suspiciously_fast'
  FROM public.jobs j
  WHERE sr.job_id = j.id
    AND sr.contractor_id = p_contractor_id
    AND sr.suppressed = false
    AND j.completed_at IS NOT NULL
    AND sr.created_at < j.completed_at + INTERVAL '2 hours';

  -- ── Single-contractor reviewer: this reviewer has only ever reviewed
  -- p_contractor_id (never anyone else) and has done so more than once.
  UPDATE public.service_reviews sr
  SET suppressed = true, suppressed_reason = 'single_contractor_reviewer'
  WHERE sr.contractor_id = p_contractor_id
    AND sr.suppressed = false
    AND (
      SELECT count(DISTINCT r2.contractor_id)
      FROM public.service_reviews r2
      WHERE r2.reviewer_id = sr.reviewer_id
    ) = 1
    AND (
      SELECT count(*)
      FROM public.service_reviews r3
      WHERE r3.reviewer_id = sr.reviewer_id AND r3.contractor_id = p_contractor_id
    ) > 1;
END;
$$;
