-- Revoke anon's default PostgREST table grants (SELECT ALL, INSERT/UPDATE/
-- DELETE ALL) from tables that should never be readable or writable
-- without authentication. Confirmed live: zero RLS policies target the
-- `anon` role specifically anywhere in `public` (checked pg_policies), so
-- every one of these tables was relying entirely on RLS USING/WITH CHECK
-- clauses to keep anon out — fine where a policy is genuinely restrictive,
-- but a real gap wherever a policy is `USING (true)` or a table has no
-- policies (RLS-enabled-zero-policy tables, e.g. the ones fixed in the
-- prior project-tables-RLS migration, still block anon by default-deny,
-- but this removes the underlying privilege too, as defense in depth).
--
-- All confirmed to exist in the live schema before writing this (grepped
-- information_schema.tables for every name in both lists below).

REVOKE SELECT ON public.expenses FROM anon;
REVOKE SELECT ON public.invoices FROM anon;
REVOKE SELECT ON public.payments FROM anon;
REVOKE SELECT ON public.finance_settings FROM anon;
REVOKE SELECT ON public.mileage_trips FROM anon;
REVOKE SELECT ON public.contractor_vehicles FROM anon;
REVOKE SELECT ON public.cooling_off_records FROM anon;
REVOKE SELECT ON public.payment_schedules FROM anon;
REVOKE SELECT ON public.payment_stages FROM anon;
REVOKE SELECT ON public.job_variations FROM anon;
REVOKE SELECT ON public.job_rams FROM anon;
REVOKE SELECT ON public.job_certificates FROM anon;
REVOKE SELECT ON public.work_orders FROM anon;
REVOKE SELECT ON public.service_requests FROM anon;
REVOKE SELECT ON public.site_contacts FROM anon;
REVOKE SELECT ON public.site_autonomy_config FROM anon;
REVOKE SELECT ON public.admin_users FROM anon;
REVOKE SELECT ON public.admin_activity_log FROM anon;
REVOKE SELECT ON public.platform_settings FROM anon;
REVOKE SELECT ON public.broadcast_emails FROM anon;
REVOKE SELECT ON public.gdpr_erasure_log FROM anon;
REVOKE SELECT ON public.contractor_verification FROM anon;
REVOKE SELECT ON public.craft_signals FROM anon;
REVOKE SELECT ON public.craft_timer_windows FROM anon;
REVOKE SELECT ON public.job_callbacks FROM anon;
REVOKE SELECT ON public.score_calculation_runs FROM anon;
REVOKE SELECT ON public.rate_limits FROM anon;
REVOKE SELECT ON public.disputes FROM anon;
REVOKE SELECT ON public.notifications FROM anon;
REVOKE SELECT ON public.crm_activities FROM anon;
REVOKE SELECT ON public.crm_clients FROM anon;

-- anon never writes to any table directly — every guest-facing action
-- (quote requests, etc.) goes through an edge function using the
-- service-role key, which bypasses grants entirely. Confirmed no
-- anon-targeted RLS policy exists for any INSERT/UPDATE/DELETE, so this
-- costs nothing for legitimate use.
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM anon', t);
  END LOOP;
END;
$$;

-- Left untouched (anon SELECT intentionally retained — public
-- directory / marketing content): profiles, contractor_photos,
-- contractor_photo_galleries, contractor_projects, profile_videos,
-- profile_before_after, profile_widgets, contractor_scores,
-- contractor_score_history, peer_endorsements, trade_averages,
-- hmrc_mileage_rates, expense_categories, availability_slots,
-- contractor_credentials, marketplace_listings, quote_form_templates,
-- feature_announcements, job_reviews, contractor_documents.
