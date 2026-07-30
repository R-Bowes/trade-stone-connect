-- SCORING.md Phase 3 Step 5: calculate_trade_averages(). Must run BEFORE
-- calculate_contractor_scores() so priors are current for that run — enforced
-- by recalculate_all_scores() calling this first.
--
-- Step 0 finding: grouping key is trades[1] (contractor's first/primary
-- trade — profiles.trades is a text[]) and profiles.location (free-text
-- city) as region, same simplification as calculate_contractor_scores().

CREATE OR REPLACE FUNCTION public.calculate_trade_averages()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Regional (trade, location) buckets, only for contractors with
  -- established-confidence scores.
  INSERT INTO public.trade_averages (trade, region, avg_craft, avg_service, avg_value, sample_size, calculated_at)
  SELECT
    p.trades[1],
    p.location,
    AVG(cs.craft_score),
    AVG(cs.service_score),
    AVG(cs.value_score),
    count(*),
    now()
  FROM public.contractor_scores cs
  JOIN public.profiles p ON p.id = cs.contractor_id
  WHERE p.trades[1] IS NOT NULL
    AND p.location IS NOT NULL
    AND (cs.craft_confidence = 'established' OR cs.service_confidence = 'established' OR cs.value_confidence = 'established')
  GROUP BY p.trades[1], p.location
  ON CONFLICT (trade, region) DO UPDATE SET
    avg_craft = EXCLUDED.avg_craft,
    avg_service = EXCLUDED.avg_service,
    avg_value = EXCLUDED.avg_value,
    sample_size = EXCLUDED.sample_size,
    calculated_at = EXCLUDED.calculated_at;

  -- National (region IS NULL) buckets — the fallback whenever a regional
  -- bucket has fewer than 5 established contractors (checked by
  -- calculate_contractor_scores at read time, not filtered out here).
  INSERT INTO public.trade_averages (trade, region, avg_craft, avg_service, avg_value, sample_size, calculated_at)
  SELECT
    p.trades[1],
    NULL,
    AVG(cs.craft_score),
    AVG(cs.service_score),
    AVG(cs.value_score),
    count(*),
    now()
  FROM public.contractor_scores cs
  JOIN public.profiles p ON p.id = cs.contractor_id
  WHERE p.trades[1] IS NOT NULL
    AND (cs.craft_confidence = 'established' OR cs.service_confidence = 'established' OR cs.value_confidence = 'established')
  GROUP BY p.trades[1]
  ON CONFLICT (trade, region) DO UPDATE SET
    avg_craft = EXCLUDED.avg_craft,
    avg_service = EXCLUDED.avg_service,
    avg_value = EXCLUDED.avg_value,
    sample_size = EXCLUDED.sample_size,
    calculated_at = EXCLUDED.calculated_at;

  -- Platform-wide default (trade = '_default', region NULL): used only when
  -- calculate_contractor_scores can't find ANY row for a contractor's trade
  -- at all (brand new trade with zero established contractors) — its
  -- COALESCE chain falls through to the hardcoded 5.0 literal in that case,
  -- so this row isn't strictly read today, but keeps a documented reference
  -- point rather than leaving "platform too new" undefined.
  INSERT INTO public.trade_averages (trade, region, avg_craft, avg_service, avg_value, sample_size, calculated_at)
  VALUES ('_default', NULL, 5.0, 5.0, 5.0, 0, now())
  ON CONFLICT (trade, region) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.calculate_trade_averages() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calculate_trade_averages() TO service_role;
