-- SCORING.md Phase 3 Step 4: calculate_contractor_scores(p_contractor_id).
-- SECURITY DEFINER, internal-only (see REVOKE/GRANT at bottom) — invoked by
-- recalculate_all_scores(), never directly by a user.

-- ── Helpers ──────────────────────────────────────────────────────────────

-- 12-month half-life exponential recency decay (Sections 3.2/4.3/5.2).
-- STABLE not IMMUTABLE — depends on now().
CREATE OR REPLACE FUNCTION public.recency_decay_weight(p_timestamp timestamptz)
RETURNS numeric
LANGUAGE sql
STABLE
AS $$
  SELECT power(0.5::numeric, ((EXTRACT(EPOCH FROM (now() - p_timestamp)) / (86400.0 * 30.44)) / 12.0)::numeric);
$$;

-- Quote-to-invoice variance % -> 0-10 score, piecewise-linear through the
-- spec's named points: (0,10) (5,8) (10,6) (20,4) (30+,2).
CREATE OR REPLACE FUNCTION public.value_variance_to_score(p_variance_pct numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_variance_pct IS NULL THEN NULL
    WHEN p_variance_pct <= 0 THEN 10.0
    WHEN p_variance_pct <= 5 THEN 10.0 - (0.4 * p_variance_pct)
    WHEN p_variance_pct <= 10 THEN 8.0 - (0.4 * (p_variance_pct - 5))
    WHEN p_variance_pct <= 20 THEN 6.0 - (0.2 * (p_variance_pct - 10))
    WHEN p_variance_pct <= 30 THEN 4.0 - (0.2 * (p_variance_pct - 20))
    ELSE 2.0
  END::numeric;
$$;

-- ── Main calculation function ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.calculate_contractor_scores(p_contractor_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_trade  text;
  v_region text;

  v_ta_craft   numeric;
  v_ta_service numeric;
  v_ta_value   numeric;

  -- Craft
  v_craft_job_count   integer;
  v_craft_weighted_sum numeric;
  v_craft_weight_sum   numeric;
  v_craft_observed     numeric;
  v_endorsement_bonus  numeric;
  v_craft_confidence   text;
  v_craft_score        numeric;

  -- Service
  v_review_count        integer;
  v_service_weighted_sum numeric;
  v_service_weight_sum   numeric;
  v_reviews_mean          numeric;
  v_jobs_total            integer;
  v_jobs_complete          integer;
  v_jobs_cancelled          integer;
  v_completion_score         numeric;
  v_cancellation_score        numeric;
  v_system_signal               numeric;
  v_system_available             boolean;
  v_service_observed              numeric;
  v_service_confidence             text;
  v_service_score                   numeric;

  -- Value
  v_value_signal_count numeric;
  v_variance_weighted_sum numeric;
  v_variance_weight_sum   numeric;
  v_variance_component     numeric;
  v_transparency_yes         integer;
  v_transparency_total        integer;
  v_transparency_score         numeric;
  v_value_num                   numeric;
  v_value_den                    numeric;
  v_value_observed                 numeric;
  v_value_confidence                text;
  v_value_score                      numeric;

  v_prior_w numeric;
  v_evid_w  numeric;
  v_composite numeric;
BEGIN
  -- ── Trade / region + Bayesian prior lookup ──────────────────────────────
  -- Step 0 finding: profiles.trades is a text[] (contractors hold multiple
  -- trades) — trades[1] (first/primary trade) is used as the grouping key,
  -- a documented v1 simplification. profiles.location is free-text city,
  -- used verbatim as region.
  SELECT trades[1], location INTO v_trade, v_region
  FROM public.profiles WHERE id = p_contractor_id;

  WITH regional AS (
    SELECT avg_craft, avg_service, avg_value, sample_size
    FROM public.trade_averages
    WHERE trade IS NOT DISTINCT FROM v_trade AND region IS NOT DISTINCT FROM v_region AND region IS NOT NULL
  ),
  national AS (
    SELECT avg_craft, avg_service, avg_value
    FROM public.trade_averages
    WHERE trade IS NOT DISTINCT FROM v_trade AND region IS NULL
  )
  SELECT
    COALESCE((SELECT avg_craft FROM regional WHERE sample_size >= 5), (SELECT avg_craft FROM national), 5.0),
    COALESCE((SELECT avg_service FROM regional WHERE sample_size >= 5), (SELECT avg_service FROM national), 5.0),
    COALESCE((SELECT avg_value FROM regional WHERE sample_size >= 5), (SELECT avg_value FROM national), 5.0)
  INTO v_ta_craft, v_ta_service, v_ta_value;

  -- ── Anomaly detection runs before the Service score uses reviews ───────
  PERFORM public.check_review_anomalies(p_contractor_id);

  -- ── Craft score ──────────────────────────────────────────────────────────
  SELECT count(DISTINCT job_id) INTO v_craft_job_count
  FROM public.craft_signals WHERE contractor_id = p_contractor_id;

  v_craft_confidence := CASE
    WHEN v_craft_job_count < 3 THEN 'building'
    WHEN v_craft_job_count < 10 THEN 'provisional'
    ELSE 'established'
  END;

  SELECT
    SUM(signal_value * COALESCE(job_complexity, 1.0) * public.recency_decay_weight(decay_anchor)),
    SUM(COALESCE(job_complexity, 1.0) * public.recency_decay_weight(decay_anchor))
  INTO v_craft_weighted_sum, v_craft_weight_sum
  FROM public.craft_signals WHERE contractor_id = p_contractor_id;

  v_craft_observed := v_craft_weighted_sum / NULLIF(v_craft_weight_sum, 0);

  -- Peer endorsements: fixed +0.5 each, capped at 5, weighted by the
  -- endorser's own craft score at time of endorsement when known (falls
  -- back to full weight — 1.0 multiplier — when not yet populated).
  SELECT COALESCE(SUM(0.5 * COALESCE(endorser_craft_score_at_time / 10.0, 1.0)), 0)
  INTO v_endorsement_bonus
  FROM (
    SELECT endorser_craft_score_at_time FROM public.peer_endorsements
    WHERE endorsed_id = p_contractor_id
    ORDER BY created_at ASC
    LIMIT 5
  ) capped;

  IF v_craft_confidence != 'building' AND v_craft_observed IS NOT NULL THEN
    v_prior_w := 10.0 / (10.0 + v_craft_job_count);
    v_evid_w := v_craft_job_count::numeric / (10.0 + v_craft_job_count);
    v_craft_score := ROUND(LEAST(10.0, GREATEST(0.0,
      ((v_prior_w * v_ta_craft + v_evid_w * v_craft_observed) / (v_prior_w + v_evid_w)) + v_endorsement_bonus
    )), 1);
  ELSE
    v_craft_score := NULL;
  END IF;

  -- ── Service score ────────────────────────────────────────────────────────
  SELECT count(*) INTO v_review_count
  FROM public.service_reviews WHERE contractor_id = p_contractor_id AND suppressed = false;

  v_service_confidence := CASE
    WHEN v_review_count < 3 THEN 'building'
    WHEN v_review_count < 6 THEN 'provisional'
    ELSE 'established'
  END;

  SELECT
    SUM((
      (CASE communication WHEN 1 THEN 2.0 WHEN 2 THEN 6.0 WHEN 3 THEN 10.0 END
       + CASE reliability WHEN 1 THEN 2.0 WHEN 2 THEN 6.0 WHEN 3 THEN 10.0 END
       + CASE property_respect WHEN 1 THEN 2.0 WHEN 2 THEN 6.0 WHEN 3 THEN 10.0 END
       + CASE expectation_management WHEN 1 THEN 2.0 WHEN 2 THEN 6.0 WHEN 3 THEN 10.0 END
      ) / 4.0
    ) * public.recency_decay_weight(created_at)),
    SUM(public.recency_decay_weight(created_at))
  INTO v_service_weighted_sum, v_service_weight_sum
  FROM public.service_reviews WHERE contractor_id = p_contractor_id AND suppressed = false;

  v_reviews_mean := v_service_weighted_sum / NULLIF(v_service_weight_sum, 0);

  -- System validation signals (Section 4.2). Message response time is
  -- skipped for v1 (Step 0 finding: job_messages has no reliable way to
  -- distinguish an auto-ack from a substantive reply) — completion rate and
  -- cancellation rate only.
  SELECT
    count(*) FILTER (WHERE status = 'complete'),
    count(*) FILTER (WHERE status = 'cancelled'),
    count(*)
  INTO v_jobs_complete, v_jobs_cancelled, v_jobs_total
  FROM public.jobs WHERE contractor_id = p_contractor_id;

  IF v_jobs_total > 0 THEN
    v_completion_score := (v_jobs_complete::numeric / v_jobs_total) * 10.0;
    v_cancellation_score := 10.0 - ((v_jobs_cancelled::numeric / v_jobs_total) * 10.0);
    v_system_signal := (v_completion_score + v_cancellation_score) / 2.0;
    v_system_available := true;
  ELSE
    v_system_available := false;
  END IF;

  IF v_reviews_mean IS NOT NULL THEN
    IF v_system_available THEN
      v_service_observed := (v_reviews_mean * 0.7) + (v_system_signal * 0.3);
    ELSE
      v_service_observed := v_reviews_mean;
    END IF;
  END IF;

  IF v_service_confidence != 'building' AND v_service_observed IS NOT NULL THEN
    v_prior_w := 10.0 / (10.0 + v_review_count);
    v_evid_w := v_review_count::numeric / (10.0 + v_review_count);
    v_service_score := ROUND(LEAST(10.0, GREATEST(0.0,
      (v_prior_w * v_ta_service + v_evid_w * v_service_observed) / (v_prior_w + v_evid_w)
    )), 1);
  ELSE
    v_service_score := NULL;
  END IF;

  -- ── Value score ──────────────────────────────────────────────────────────
  -- Step 0 finding: no dispute-tracking mechanism exists anywhere in the
  -- live schema (invoices.status is free text, no CHECK constraint, no
  -- disputes table). The 0.3 dispute-rate weight is excluded rather than
  -- fabricated from a non-existent signal; v_value_num/v_value_den below
  -- redistribute proportionally across whichever of variance/transparency
  -- actually have data. Revisit once a disputes mechanism is built.
  --
  -- Documented scope changes are not trackable in v1 either (Step 0) — raw
  -- variance is used, per the spec's own allowance for this exact gap.
  WITH job_variance AS (
    SELECT
      j.id AS job_id,
      j.completed_at,
      ABS(inv.total - q.total) / NULLIF(q.total, 0) * 100 AS variance_pct
    FROM public.jobs j
    JOIN public.issued_quotes q ON q.id = j.issued_quote_id
    JOIN LATERAL (
      SELECT total FROM public.invoices WHERE job_id = j.id ORDER BY created_at DESC LIMIT 1
    ) inv ON true
    WHERE j.contractor_id = p_contractor_id AND j.status = 'complete'
  )
  SELECT
    count(*),
    SUM(public.value_variance_to_score(variance_pct) * public.recency_decay_weight(COALESCE(completed_at, now()))),
    SUM(public.recency_decay_weight(COALESCE(completed_at, now())))
  INTO v_value_signal_count, v_variance_weighted_sum, v_variance_weight_sum
  FROM job_variance
  WHERE variance_pct IS NOT NULL;

  v_value_signal_count := COALESCE(v_value_signal_count, 0);
  v_variance_component := v_variance_weighted_sum / NULLIF(v_variance_weight_sum, 0);

  SELECT
    count(*) FILTER (WHERE costs_communicated_clearly = true),
    count(*) FILTER (WHERE costs_communicated_clearly IS NOT NULL)
  INTO v_transparency_yes, v_transparency_total
  FROM public.service_reviews WHERE contractor_id = p_contractor_id AND suppressed = false;

  IF v_transparency_total > 0 THEN
    v_transparency_score := (v_transparency_yes::numeric / v_transparency_total) * 10.0;
  END IF;

  v_value_num := 0;
  v_value_den := 0;
  IF v_variance_component IS NOT NULL THEN
    v_value_num := v_value_num + v_variance_component * 0.5;
    v_value_den := v_value_den + 0.5;
  END IF;
  IF v_transparency_score IS NOT NULL THEN
    v_value_num := v_value_num + v_transparency_score * 0.2;
    v_value_den := v_value_den + 0.2;
  END IF;
  IF v_value_den > 0 THEN
    v_value_observed := v_value_num / v_value_den;
  ELSE
    v_value_observed := NULL;
  END IF;

  v_value_confidence := CASE
    WHEN v_value_signal_count < 3 THEN 'building'
    WHEN v_value_signal_count < 10 THEN 'provisional'
    ELSE 'established'
  END;

  IF v_value_confidence != 'building' AND v_value_observed IS NOT NULL THEN
    v_prior_w := 10.0 / (10.0 + v_value_signal_count);
    v_evid_w := v_value_signal_count / (10.0 + v_value_signal_count);
    v_value_score := ROUND(LEAST(10.0, GREATEST(0.0,
      (v_prior_w * v_ta_value + v_evid_w * v_value_observed) / (v_prior_w + v_evid_w)
    )), 1);
  ELSE
    v_value_score := NULL;
  END IF;

  -- ── Composite (internal ranking only, never displayed) ──────────────────
  v_composite := ROUND(LEAST(10.0, GREATEST(0.0,
    COALESCE(v_craft_score, v_ta_craft) * 0.40 +
    COALESCE(v_service_score, v_ta_service) * 0.35 +
    COALESCE(v_value_score, v_ta_value) * 0.25
  )), 1);

  -- ── Persist ──────────────────────────────────────────────────────────────
  INSERT INTO public.contractor_scores (
    contractor_id, craft_score, craft_confidence, craft_signal_count,
    service_score, service_confidence, service_review_count,
    value_score, value_confidence, value_signal_count,
    composite_score, last_calculated_at, updated_at
  ) VALUES (
    p_contractor_id, v_craft_score, v_craft_confidence, v_craft_job_count,
    v_service_score, v_service_confidence, v_review_count,
    v_value_score, v_value_confidence, v_value_signal_count,
    v_composite, now(), now()
  )
  ON CONFLICT (contractor_id) DO UPDATE SET
    craft_score = EXCLUDED.craft_score,
    craft_confidence = EXCLUDED.craft_confidence,
    craft_signal_count = EXCLUDED.craft_signal_count,
    service_score = EXCLUDED.service_score,
    service_confidence = EXCLUDED.service_confidence,
    service_review_count = EXCLUDED.service_review_count,
    value_score = EXCLUDED.value_score,
    value_confidence = EXCLUDED.value_confidence,
    value_signal_count = EXCLUDED.value_signal_count,
    composite_score = EXCLUDED.composite_score,
    last_calculated_at = EXCLUDED.last_calculated_at,
    updated_at = now();

  INSERT INTO public.contractor_score_history (contractor_id, score_type, score_value, confidence, signal_count)
  VALUES
    (p_contractor_id, 'craft', v_craft_score, v_craft_confidence, v_craft_job_count),
    (p_contractor_id, 'service', v_service_score, v_service_confidence, v_review_count),
    (p_contractor_id, 'value', v_value_score, v_value_confidence, v_value_signal_count::integer);
END;
$$;

-- Internal-only: SECURITY DEFINER functions are EXECUTE-granted to PUBLIC
-- by default in Postgres, which would let any authenticated/anon caller
-- force a write to contractor_scores. Lock these down to service_role only
-- — they're invoked exclusively by recalculate_all_scores() via cron.
REVOKE ALL ON FUNCTION public.calculate_contractor_scores(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calculate_contractor_scores(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.check_review_anomalies(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_review_anomalies(uuid) TO service_role;
