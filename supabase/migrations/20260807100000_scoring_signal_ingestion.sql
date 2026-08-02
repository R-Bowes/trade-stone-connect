-- Scoring Signal Ingestion — auto-populating the score engine.
--
-- Pre-check findings (live schema, not assumed from the brief):
--
-- 1. calculate_contractor_scores(uuid), recency_decay_weight(timestamptz),
--    value_variance_to_score(numeric), check_review_anomalies(uuid) ALL
--    already exist and are correctly implemented (calculate_contractor_scores
--    does its own UPSERT into contractor_scores + contractor_score_history).
--    Step 4's "create if missing" is a no-op — nothing created.
-- 2. trade_averages already exists (different column name than the brief's
--    snippet: `calculated_at`, not `updated_at`) with exactly one row
--    (trade='_default'). Seeded below with the named trades; the seed
--    INSERT omits the timestamp column entirely rather than referencing a
--    column that doesn't exist.
-- 3. craft_signals.signal_type has a CHECK constraint allowlisting exactly
--    10 values (from 20260730190000_craft_signals.sql) — 'job_completed',
--    'rams_completed', 'certificates_attached', 'certificate_verified' (all
--    used by the brief's trigger bodies) are NOT in it and every INSERT
--    using them would fail outright. Extended below.
-- 4. craft_timer_windows creation on job completion ALREADY EXISTS
--    (start_craft_timer_window(), trigger on_job_complete_start_craft_timer,
--    90-day window per SCORING.md, ON CONFLICT (job_id) DO NOTHING) — the
--    brief's Trigger 1 duplicates this with a 30-day window. Dropped from
--    the version built here; the existing 90-day window is kept as-is.
-- 5. craft_timer_windows -> craft_signals resolution ALREADY EXISTS
--    (record_craft_timer_signal(), trigger on_craft_timer_outcome_set,
--    fires 'callback_clear_90d'/'callback_fault' when
--    evaluate-craft-timers resolves a window's outcome). The brief's
--    Trigger 4 (job_callbacks INSERT -> immediately mark the timer window
--    resolved + insert an unconditional negative signal) is NOT built:
--    it would (a) write an invalid craft_signals.signal_type
--    ('callback_raised' isn't in the CHECK list), (b) write an invalid
--    craft_timer_windows.outcome ('callback' isn't 'callback_raised'), and
--    (c) contradict SCORING.md's actual rule that a callback's effect on
--    Craft is only realised once fault_classification is resolved AND the
--    90-day window is evaluated (unrelated/wear-and-tear callbacks must
--    NOT count against the contractor — the existing evaluate-craft-timers
--    edge function already gets this right by checking
--    fault_classification live at evaluation time; reacting to every
--    job_callbacks INSERT unconditionally would double-count and get it
--    wrong). No gap here — left alone.
-- 6. The existing evaluate-craft-timers cron (20260730220000) is silently
--    BROKEN: it posts to the edge function via
--    current_setting('app.settings.supabase_url'/'service_role_key'),
--    which was already confirmed dead in this project (ALTER DATABASE ...
--    SET app.settings.* fails permission-denied — see
--    20260712130000_cron_secrets_to_vault.sql). The brief's Step 1 asks for
--    a brand-new evaluate_expired_timer_windows() SQL function + cron, but
--    that would be an inferior duplicate of the edge function (no
--    fault-classification awareness — see point 5). Fixed the ACTUAL gap
--    instead: re-registered the existing 'evaluate-craft-timers' cron under
--    the same job name using the correct get_secret()/supabase_project_url()
--    pattern, so it finally fires for the first time.

-- =============================================================================
-- 1. craft_signals.signal_type — extend the CHECK constraint.
-- =============================================================================

ALTER TABLE public.craft_signals DROP CONSTRAINT craft_signals_signal_type_check;
ALTER TABLE public.craft_signals ADD CONSTRAINT craft_signals_signal_type_check
  CHECK (signal_type = ANY (ARRAY[
    'inspection_pass', 'inspection_remediation', 'inspection_fail',
    'callback_clear_90d', 'callback_fault', 'callback_unrelated',
    'warranty_honoured', 'warranty_ghosted', 'warranty_charged',
    'photo_documentation',
    'job_completed', 'rams_completed', 'certificates_attached', 'certificate_verified'
  ]::text[]));

-- =============================================================================
-- 2. Job completion -> craft signals (+ score recalc). Timer window creation
--    is intentionally NOT duplicated here — see finding 4 above.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.ingest_craft_signals_on_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_has_photos boolean;
  v_photo_stages integer;
  v_has_rams boolean;
  v_cert_count integer;
  v_complexity numeric;
BEGIN
  IF NEW.status = 'complete' AND (OLD.status IS NULL OR OLD.status != 'complete') THEN

    v_complexity := CASE
      WHEN NEW.contract_value IS NULL THEN 1.0
      WHEN NEW.contract_value < 500 THEN 0.8
      WHEN NEW.contract_value < 2000 THEN 1.0
      WHEN NEW.contract_value < 10000 THEN 1.3
      ELSE 1.5
    END;

    -- Signal: Photo documentation quality
    SELECT EXISTS (SELECT 1 FROM job_photos WHERE job_id = NEW.id) INTO v_has_photos;

    SELECT COUNT(DISTINCT CASE
      WHEN tags && ARRAY['before'] THEN 'before'
      WHEN tags && ARRAY['during'] THEN 'during'
      WHEN tags && ARRAY['after'] THEN 'after'
      END) INTO v_photo_stages
    FROM job_photos WHERE job_id = NEW.id AND tags IS NOT NULL;

    IF v_has_photos THEN
      INSERT INTO craft_signals (contractor_id, job_id, signal_type, signal_value,
        job_complexity, decay_anchor, raw_data)
      VALUES (NEW.contractor_id, NEW.id, 'photo_documentation',
        CASE
          WHEN v_photo_stages >= 3 THEN 9.0
          WHEN v_photo_stages >= 2 THEN 7.0
          WHEN v_photo_stages >= 1 THEN 5.0
          ELSE 4.0
        END,
        v_complexity, COALESCE(NEW.completed_at, now()),
        jsonb_build_object('photo_stages', v_photo_stages));
    END IF;

    -- Signal: RAMS completed
    SELECT EXISTS (
      SELECT 1 FROM job_rams WHERE job_id = NEW.id AND status IN ('tailored', 'signed')
    ) INTO v_has_rams;

    IF v_has_rams THEN
      INSERT INTO craft_signals (contractor_id, job_id, signal_type, signal_value,
        job_complexity, decay_anchor)
      VALUES (NEW.contractor_id, NEW.id, 'rams_completed', 7.5,
        v_complexity, COALESCE(NEW.completed_at, now()));
    END IF;

    -- Signal: Certificates attached
    SELECT COUNT(*) INTO v_cert_count FROM job_certificates WHERE job_id = NEW.id;

    IF v_cert_count > 0 THEN
      INSERT INTO craft_signals (contractor_id, job_id, signal_type, signal_value,
        job_complexity, decay_anchor, raw_data)
      VALUES (NEW.contractor_id, NEW.id, 'certificates_attached',
        LEAST(10.0, 6.0 + (v_cert_count * 1.0)),
        v_complexity, COALESCE(NEW.completed_at, now()),
        jsonb_build_object('certificate_count', v_cert_count));
    END IF;

    -- Signal: Job completion itself (baseline craft signal)
    INSERT INTO craft_signals (contractor_id, job_id, signal_type, signal_value,
      job_complexity, decay_anchor)
    VALUES (NEW.contractor_id, NEW.id, 'job_completed', 6.0,
      v_complexity, COALESCE(NEW.completed_at, now()));

    PERFORM calculate_contractor_scores(NEW.contractor_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS job_completion_craft_signals ON public.jobs;
CREATE TRIGGER job_completion_craft_signals
  AFTER UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.ingest_craft_signals_on_completion();

-- =============================================================================
-- 3. Service review -> recalculate scores.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.recalc_scores_on_review()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM calculate_contractor_scores(NEW.contractor_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS review_triggers_score_recalc ON public.service_reviews;
CREATE TRIGGER review_triggers_score_recalc
  AFTER INSERT ON public.service_reviews
  FOR EACH ROW EXECUTE FUNCTION public.recalc_scores_on_review();

-- =============================================================================
-- 4. Invoice paid -> recalculate value score.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.recalc_scores_on_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_contractor_id uuid;
BEGIN
  IF NEW.status = 'paid' AND (OLD.status IS NULL OR OLD.status != 'paid') THEN
    IF NEW.job_id IS NOT NULL THEN
      SELECT contractor_id INTO v_contractor_id FROM jobs WHERE id = NEW.job_id;
    END IF;
    v_contractor_id := COALESCE(v_contractor_id, NEW.contractor_id);

    IF v_contractor_id IS NOT NULL THEN
      PERFORM calculate_contractor_scores(v_contractor_id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payment_triggers_score_recalc ON public.invoices;
CREATE TRIGGER payment_triggers_score_recalc
  AFTER UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.recalc_scores_on_payment();

-- =============================================================================
-- 5. Certificate verified -> craft signal boost. (job_callbacks trigger
--    intentionally not built — see finding 5 above.)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.verified_cert_craft_signal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.verified = true AND (OLD.verified IS NULL OR OLD.verified = false) THEN
    INSERT INTO craft_signals (contractor_id, job_id, signal_type, signal_value,
      job_complexity, decay_anchor, raw_data)
    VALUES (NEW.contractor_id, NEW.job_id, 'certificate_verified', 8.5,
      1.0, now(),
      jsonb_build_object('certificate_type', NEW.certificate_type));

    PERFORM calculate_contractor_scores(NEW.contractor_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cert_verified_craft_signal ON public.job_certificates;
CREATE TRIGGER cert_verified_craft_signal
  AFTER UPDATE ON public.job_certificates
  FOR EACH ROW EXECUTE FUNCTION public.verified_cert_craft_signal();

-- =============================================================================
-- 6. Fix the existing evaluate-craft-timers cron (see finding 6 above) —
--    same unschedule-then-schedule idiom, corrected auth.
-- =============================================================================

SELECT cron.unschedule('evaluate-craft-timers')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'evaluate-craft-timers');

SELECT cron.schedule(
  'evaluate-craft-timers',
  '30 8 * * *',
  $$
  SELECT net.http_post(
    url := public.supabase_project_url() || '/functions/v1/evaluate-craft-timers',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || public.get_secret('service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- =============================================================================
-- 7. Seed trade_averages — table already exists (finding 2), just seeding
--    the named trades. `_default` row left as-is.
-- =============================================================================

INSERT INTO public.trade_averages (trade, region, avg_craft, avg_service, avg_value, sample_size)
VALUES
  ('Plumbing', NULL, 5.0, 5.0, 5.0, 0),
  ('Electrical', NULL, 5.0, 5.0, 5.0, 0),
  ('General Building', NULL, 5.0, 5.0, 5.0, 0),
  ('Carpentry', NULL, 5.0, 5.0, 5.0, 0),
  ('Roofing', NULL, 5.0, 5.0, 5.0, 0),
  ('Painting & Decorating', NULL, 5.0, 5.0, 5.0, 0),
  ('Landscaping', NULL, 5.0, 5.0, 5.0, 0),
  ('Gas & Heating', NULL, 5.0, 5.0, 5.0, 0),
  ('Handyman', NULL, 5.0, 5.0, 5.0, 0),
  ('Joinery', NULL, 5.0, 5.0, 5.0, 0),
  ('Tiling', NULL, 5.0, 5.0, 5.0, 0),
  ('Plastering', NULL, 5.0, 5.0, 5.0, 0),
  ('Flooring', NULL, 5.0, 5.0, 5.0, 0),
  ('Kitchen Fitting', NULL, 5.0, 5.0, 5.0, 0),
  ('Bathroom Fitting', NULL, 5.0, 5.0, 5.0, 0),
  ('Air Conditioning & Refrigeration', NULL, 5.0, 5.0, 5.0, 0),
  ('Fire Protection', NULL, 5.0, 5.0, 5.0, 0),
  ('Locksmiths', NULL, 5.0, 5.0, 5.0, 0),
  ('Drainage', NULL, 5.0, 5.0, 5.0, 0),
  ('Security Systems', NULL, 5.0, 5.0, 5.0, 0)
ON CONFLICT (trade, region) DO NOTHING;

-- =============================================================================
-- 8. One-time backfill for existing completed jobs — same signal logic as
--    the trigger, run once, then dropped.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.backfill_craft_signals_v1()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_job record;
  v_complexity numeric;
  v_has_photos boolean;
  v_photo_stages integer;
  v_has_rams boolean;
  v_cert_count integer;
  v_count integer := 0;
  v_contractor uuid;
BEGIN
  FOR v_job IN
    SELECT id, contractor_id, contract_value, completed_at
    FROM jobs
    WHERE status = 'complete'
    AND id NOT IN (SELECT job_id FROM craft_signals WHERE signal_type = 'job_completed')
  LOOP
    v_complexity := CASE
      WHEN v_job.contract_value IS NULL THEN 1.0
      WHEN v_job.contract_value < 500 THEN 0.8
      WHEN v_job.contract_value < 2000 THEN 1.0
      WHEN v_job.contract_value < 10000 THEN 1.3
      ELSE 1.5
    END;

    SELECT EXISTS (SELECT 1 FROM job_photos WHERE job_id = v_job.id) INTO v_has_photos;
    SELECT COUNT(DISTINCT CASE
      WHEN tags && ARRAY['before'] THEN 'before'
      WHEN tags && ARRAY['during'] THEN 'during'
      WHEN tags && ARRAY['after'] THEN 'after'
      END) INTO v_photo_stages
    FROM job_photos WHERE job_id = v_job.id AND tags IS NOT NULL;

    IF v_has_photos THEN
      INSERT INTO craft_signals (contractor_id, job_id, signal_type, signal_value,
        job_complexity, decay_anchor, raw_data)
      VALUES (v_job.contractor_id, v_job.id, 'photo_documentation',
        CASE
          WHEN v_photo_stages >= 3 THEN 9.0
          WHEN v_photo_stages >= 2 THEN 7.0
          WHEN v_photo_stages >= 1 THEN 5.0
          ELSE 4.0
        END,
        v_complexity, COALESCE(v_job.completed_at, now()),
        jsonb_build_object('photo_stages', v_photo_stages, 'backfilled', true));
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM job_rams WHERE job_id = v_job.id AND status IN ('tailored', 'signed')
    ) INTO v_has_rams;

    IF v_has_rams THEN
      INSERT INTO craft_signals (contractor_id, job_id, signal_type, signal_value,
        job_complexity, decay_anchor, raw_data)
      VALUES (v_job.contractor_id, v_job.id, 'rams_completed', 7.5,
        v_complexity, COALESCE(v_job.completed_at, now()),
        jsonb_build_object('backfilled', true));
    END IF;

    SELECT COUNT(*) INTO v_cert_count FROM job_certificates WHERE job_id = v_job.id;

    IF v_cert_count > 0 THEN
      INSERT INTO craft_signals (contractor_id, job_id, signal_type, signal_value,
        job_complexity, decay_anchor, raw_data)
      VALUES (v_job.contractor_id, v_job.id, 'certificates_attached',
        LEAST(10.0, 6.0 + (v_cert_count * 1.0)),
        v_complexity, COALESCE(v_job.completed_at, now()),
        jsonb_build_object('certificate_count', v_cert_count, 'backfilled', true));
    END IF;

    INSERT INTO craft_signals (contractor_id, job_id, signal_type, signal_value,
      job_complexity, decay_anchor, raw_data)
    VALUES (v_job.contractor_id, v_job.id, 'job_completed', 6.0,
      v_complexity, COALESCE(v_job.completed_at, now()), jsonb_build_object('backfilled', true));

    v_count := v_count + 1;
  END LOOP;

  -- Recalculate scores for every contractor who now has at least one signal.
  FOR v_contractor IN SELECT DISTINCT contractor_id FROM craft_signals
  LOOP
    PERFORM calculate_contractor_scores(v_contractor);
  END LOOP;

  RETURN v_count;
END;
$$;

SELECT public.backfill_craft_signals_v1();

DROP FUNCTION public.backfill_craft_signals_v1();
