-- =============================================================================
-- 20260712140000_sla_rules_member_select.sql
-- Tendering sub-step 3b (SLA expectations section): fixes a stale sla_rules
-- RLS policy found while building it.
--
-- "SLA rules visible to company owner" (20260709140000) still uses the
-- pre-coverage owner-only join (companies.owner_id direct join) -- it was
-- never migrated to is_company_member() like every other business-tier read
-- policy after 20260614174850_coverage_chunk_b_coverage_rls.sql. Any active
-- business_members row that is NOT the owner (e.g. national/site coverage)
-- gets zero rows back from sla_rules, silently -- the exact PostgREST
-- empty-result failure mode CLAUDE.md warns about. BusinessTenderForm is
-- itself gated by is_company_member (tenders_business_all), so a non-owner
-- member can legitimately reach the SLA picker this migration serves.
--
-- Replaces the SELECT policy body only; INSERT/UPDATE/DELETE stay
-- owner-only (unchanged, not in scope here -- member-wide write gating on
-- SLA rules is a separate call, deferred with the rest of the roles/
-- thresholds work per TENDERING-SCHEMA.md DEFERRED #2).
-- =============================================================================

DROP POLICY IF EXISTS "SLA rules visible to company owner" ON public.sla_rules;

CREATE POLICY "SLA rules visible to company members"
ON public.sla_rules FOR SELECT TO authenticated
USING (is_company_member(company_id));
