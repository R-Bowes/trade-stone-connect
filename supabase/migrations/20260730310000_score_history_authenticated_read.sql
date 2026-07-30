-- SCORING.md Phase 4 Step 3: the B2B/FM scorecard needs a 6-month trend for
-- any contractor being viewed, not just the logged-in contractor's own
-- history. Phase 3's contractor_score_history RLS ("No public access —
-- contractor-facing only") only granted a contractor their own row, which
-- blocks this. Not a new table, not a change to the calculation engine —
-- an access-control addition matching Step 3's "visible to all logged-in
-- users" scope: authenticated only, not anon (mirrors the homeowner/B2B
-- distinction — the compact homeowner view never needs raw trend data,
-- only the expandable detailed scorecard does, and that's gated to
-- authenticated viewers in the frontend).

CREATE POLICY "Authenticated users read all score history"
  ON public.contractor_score_history FOR SELECT
  TO authenticated
  USING (true);
