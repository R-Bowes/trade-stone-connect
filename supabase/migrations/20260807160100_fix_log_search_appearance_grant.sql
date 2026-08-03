-- Correction to 20260807160000: REVOKE ... FROM anon was a no-op because
-- anon never had an explicit grant — EXECUTE was reaching it via the
-- PUBLIC pseudo-role grant every function gets by default at creation
-- (confirmed via pg_proc.proacl: "=X/postgres" with no explicit "anon="
-- entry). Revoking from PUBLIC is what actually removes anon's access;
-- authenticated keeps it via its own explicit grant.

REVOKE EXECUTE ON FUNCTION log_search_appearance(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION log_search_appearance(uuid[]) TO authenticated;
