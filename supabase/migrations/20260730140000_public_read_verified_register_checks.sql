-- SCORING.md Phase 1 step 5 needs the public contractor profile to display
-- verified register checks (Gas Safe, NICEIC etc.) by register name +
-- registration number. 20260730100000 only granted the owning contractor
-- and service_role SELECT — add a public policy scoped to verified rows
-- only, mirroring the pattern used for contractor_credentials
-- (20260730110000's "Public can read verified credentials").

CREATE POLICY "Public can read verified register checks"
  ON public.contractor_register_checks FOR SELECT
  USING (status = 'verified');
