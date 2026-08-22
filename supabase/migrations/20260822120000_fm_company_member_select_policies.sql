-- Fix: PPM Compliance and Prequalification pages render silently empty for
-- any active business_members team member who is not the company owner.
--
-- service_contracts, service_schedules, service_visits, and
-- panel_prequalification currently only grant SELECT to the company OWNER
-- (via an `ALL` policy keyed on companies.owner_id) or to the contractor
-- side. There is no is_company_member()-based SELECT policy on any of the
-- four, unlike every other FM business table (work_orders,
-- service_requests, sites, assets, site_contacts, etc.), which already use
-- is_company_member(company_id) for company-wide read access under the
-- coverage model (20260614174850_coverage_chunk_b_coverage_rls.sql).
--
-- This migration ADDS one new SELECT policy per table, additive only:
-- existing owner-only ALL policies and contractor-facing SELECT policies
-- are untouched (Postgres RLS policies are OR'd together), so no existing
-- access is narrowed or removed. Only SELECT is added here, per the
-- reported bug -- write access for non-owner members is out of scope.
--
-- service_contracts and service_visits and panel_prequalification all carry
-- company_id directly. service_schedules does not (it hangs off
-- service_contracts via contract_id), so its policy is derived the same way
-- the existing owner-only ALL policy on service_schedules already does it.

create policy "Service contracts visible to company members"
  on public.service_contracts
  for select
  using (is_company_member(company_id));

create policy "Service schedules visible to company members"
  on public.service_schedules
  for select
  using (
    contract_id in (
      select sc.id from public.service_contracts sc
      where is_company_member(sc.company_id)
    )
  );

create policy "Service visits visible to company members"
  on public.service_visits
  for select
  using (is_company_member(company_id));

create policy "Panel prequalification visible to company members"
  on public.panel_prequalification
  for select
  using (is_company_member(company_id));
