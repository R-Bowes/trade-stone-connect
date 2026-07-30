-- SCORING.md Phase 3 Step 3: trade_averages — Bayesian prior baseline.
--
-- Step 0 finding: profiles.trades is a text[] (contractors have multiple
-- trades, e.g. ["Roofing","Electrical","Carpentry"]), no canonical enum.
-- trade_averages.trade is a single TEXT per spec's own schema, so this
-- deliberately groups on trades[1] (the contractor's first/primary trade)
-- — a documented v1 simplification, not an oversight. profiles.location is
-- free-text city, no structured region column; used verbatim as `region`.

CREATE TABLE public.trade_averages (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade          text NOT NULL,
  region         text,
  avg_craft      numeric(3,1),
  avg_service    numeric(3,1),
  avg_value      numeric(3,1),
  sample_size    integer,
  calculated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trade, region)
);

ALTER TABLE public.trade_averages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public reads trade averages"
  ON public.trade_averages FOR SELECT
  USING (true);

-- No INSERT/UPDATE/DELETE from any user — reference data, service role only.
CREATE POLICY "Service role full access to trade averages"
  ON public.trade_averages FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
