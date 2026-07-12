-- =============================================================================
-- 20260712130000_cron_secrets_to_vault.sql
-- Moves cron/HTTP secrets from the non-functional app.settings.* GUC
-- approach to Supabase Vault. Confirmed live (read-only introspection,
-- 2026-07-12): ALTER DATABASE ... SET app.settings.* fails permission-denied
-- on this project, so app.settings.supabase_url/service_role_key were never
-- actually set — all three cron jobs (invoice-overdue-check, sla-clock-check,
-- tendering-scheduled-runner via create_callout_job) have been silently
-- hitting their graceful-degradation warning path since they were created.
--
-- ACTION REQUIRED AFTER THIS MIGRATION IS PUSHED (read this before you
-- forget): this migration creates the `service_role_key` Vault secret with
-- the PLACEHOLDER value 'REPLACE_VIA_VAULT_UPDATE' — the real key must
-- never enter git history. Set the real value by running THIS in the
-- Supabase SQL editor (not a migration — see CLAUDE.md's schema-change
-- discipline rule; this one write is an explicit, deliberate exception
-- because the value cannot be committed):
--
--   SELECT vault.update_secret(
--     (SELECT id FROM vault.decrypted_secrets WHERE name = 'service_role_key'),
--     '<the real service_role key, from Project Settings -> API>'
--   );
--
-- Until that's run, get_secret('service_role_key') returns the literal
-- placeholder string, not NULL — the NULL-guard in create_callout_job
-- (and the direct calls in the two cron bodies) will NOT catch this: a
-- placeholder is a value, so net.http_post still fires (fire-and-forget,
-- pg_net queues it async) with a bogus Authorization header, which fails
-- at the HTTP layer outside this transaction, unlogged at the SQL level.
-- This is an accepted, short, self-inflicted gap between push and running
-- the update above — not a silent-forever failure mode like the GUC one
-- was, since you're about to run the fix yourself.
--
-- Two rulings this migration follows:
-- 1. Only the service-role key goes in Vault. The project URL is not a
--    secret (it ships in the frontend bundle via VITE_SUPABASE_URL) — it's
--    a single-source constant function, supabase_project_url(), not
--    Vault-stored. Confirmed the literal value from the local .env
--    (VITE_SUPABASE_URL), not guessed from the project ref pattern.
-- 2. vault.create_secret is guarded (IF NOT EXISTS) so re-running this
--    migration (or a fresh environment already carrying the real secret
--    from a prior push) never clobbers an already-set real value with the
--    placeholder again.
-- =============================================================================

-- 1. Vault secret, placeholder value, guarded against re-creation.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'service_role_key') THEN
    PERFORM vault.create_secret(
      'REPLACE_VIA_VAULT_UPDATE',
      'service_role_key',
      'TradeStone service-role key for cron/HTTP calls (create_callout_job, invoice-overdue-check, sla-clock-check). Placeholder on creation -- see 20260712130000 migration header for the vault.update_secret step to set the real value.'
    );
  END IF;
END $$;

-- 2. get_secret(name): the ONLY sanctioned read path into Vault. Never
-- grant this to authenticated/anon -- it's callable only from other
-- SECURITY DEFINER contexts (create_callout_job, cron job bodies, both of
-- which run postgres-owned/postgres-as, confirmed against the live
-- vault.decrypted_secrets grants: SELECT is granted to postgres and
-- service_role only). Same allowlist-function discipline as every other
-- helper in this build.
CREATE OR REPLACE FUNCTION public.get_secret(p_name text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- WARNING: never GRANT EXECUTE on this function to authenticated or
  -- anon. This is the codebase's one hard-secret reader -- it exists to be
  -- reachable ONLY from other postgres-owned SECURITY DEFINER contexts
  -- (create_callout_job, the cron job bodies). Granting it to any
  -- client-facing role turns "SELECT get_secret('service_role_key')" into
  -- an RPC any logged-in user could call to exfiltrate the service-role
  -- key. If a future migration needs a different secret name exposed
  -- client-side, that is a NEW, narrowly-scoped function -- never widen
  -- this one's grants.
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = p_name;
$$;

REVOKE ALL ON FUNCTION public.get_secret(text) FROM PUBLIC, anon, authenticated;

-- 3. supabase_project_url(): not secret, just a single-source constant so
-- the literal string lives in exactly one place instead of being copied
-- into three call sites.
CREATE OR REPLACE FUNCTION public.supabase_project_url()
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 'https://tnvxfzmdjpsswjszwbvf.supabase.co'::text;
$$;

-- 4. Repoint create_callout_job. Behaviour is otherwise identical:
-- fire-and-forget with a guard, never an exception past this point.
CREATE OR REPLACE FUNCTION public.create_callout_job(
  p_engagement_id uuid,
  p_title text,
  p_description text,
  p_site_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_engagement   public.term_engagements%ROWTYPE;
  v_owner_id     uuid;
  v_job_id       uuid;
  v_service_key  text;
BEGIN
  SELECT * INTO v_engagement FROM public.term_engagements WHERE id = p_engagement_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Engagement not found';
  END IF;

  IF v_engagement.status <> 'active' THEN
    RAISE EXCEPTION 'Engagement is not active (status: %); new call-outs are blocked', v_engagement.status;
  END IF;

  SELECT owner_id INTO v_owner_id FROM public.companies WHERE id = v_engagement.company_id;

  INSERT INTO public.jobs (
    contractor_id, customer_id, title, description, status,
    company_id, site_id, engagement_id, sla_rule_id
  ) VALUES (
    v_engagement.contractor_id, v_owner_id, p_title, p_description, 'scheduled',
    v_engagement.company_id, p_site_id, p_engagement_id, v_engagement.sla_rule_set_id
  )
  RETURNING id INTO v_job_id;

  -- Fire-and-forget SLA-clock start. Vault-sourced now, was app.settings.
  v_service_key := get_secret('service_role_key');

  IF v_service_key IS NULL THEN
    RAISE WARNING 'create_callout_job: service_role_key secret not found in Vault; SLA clock not started for job %', v_job_id;
  ELSE
    BEGIN
      PERFORM net.http_post(
        url := supabase_project_url() || '/functions/v1/sla-clock',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_service_key),
        body := jsonb_build_object('action', 'start', 'job_id', v_job_id)
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'create_callout_job: sla-clock invocation failed for job % : %', v_job_id, SQLERRM;
    END;
  END IF;

  INSERT INTO public.notifications (user_id, title, message, type, reference_type, reference_id)
  SELECT p.user_id, 'New call-out', p_title, 'callout_raised', 'job', v_job_id
  FROM public.profiles p WHERE p.id = v_engagement.contractor_id;

  RETURN v_job_id;
END;
$$;

-- 5. Repoint the two HTTP-dependent cron bodies. Same
-- unschedule-then-schedule idiom as every prior cron migration in this
-- codebase. tendering-scheduled-runner's own command body never referenced
-- app.settings directly (only indirectly via create_callout_job, already
-- fixed above) so it does not need re-scheduling.
SELECT cron.unschedule('invoice-overdue-check')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'invoice-overdue-check');

SELECT cron.schedule(
  'invoice-overdue-check',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url := public.supabase_project_url() || '/functions/v1/mark-overdue-invoices',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || public.get_secret('service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);

SELECT cron.unschedule('sla-clock-check')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sla-clock-check');

SELECT cron.schedule(
  'sla-clock-check',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := public.supabase_project_url() || '/functions/v1/sla-clock',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || public.get_secret('service_role_key')
    ),
    body := jsonb_build_object('action', 'check')
  );
  $$
);
