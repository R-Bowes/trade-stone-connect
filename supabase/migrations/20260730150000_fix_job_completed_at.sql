-- SCORING.md Phase 2 Step 0 finding: jobs.completed_at is read in several
-- places (check_sla_breaches, ContractorKPIInsights.tsx, AssetDetail.tsx)
-- but nothing ever writes it — set_job_timestamps() only sets actual_end on
-- the 'complete' transition. The 48-hour post-completion review-prompt delay
-- (Step 6) needs completed_at populated, so this extends the SAME existing
-- trigger function (no new trigger) to also set it. Every current reader
-- already treats NULL as "not completed", so backfilling it going forward
-- is safe and doesn't change existing behaviour for already-complete jobs
-- (their completed_at simply stays NULL, same as today).

CREATE OR REPLACE FUNCTION public.set_job_timestamps()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'in_progress' AND OLD.status != 'in_progress'
     AND NEW.actual_start IS NULL THEN
    NEW.actual_start = now();
  END IF;
  IF NEW.status = 'complete' AND OLD.status != 'complete'
     AND NEW.actual_end IS NULL THEN
    NEW.actual_end = now();
  END IF;
  IF NEW.status = 'complete' AND OLD.status != 'complete'
     AND NEW.completed_at IS NULL THEN
    NEW.completed_at = now();
  END IF;
  RETURN NEW;
END;
$$;
