-- Found while implementing readiness-audit R3-2 (auth on sla-clock /
-- mark-overdue-invoices) — not itself an R3-2 item, but directly adjacent
-- and worth fixing in the same pass rather than filing away.
--
-- mint_job_from_quote (20260717120000_offer_with_slots_accept_flow.sql,
-- 2026-07-17) is the canonical, sole job-minting path for the quote
-- acceptance flow — the most common way a job gets created in the whole
-- app. Its SLA-clock kickoff still reads
-- current_setting('app.settings.supabase_url'/'service_role_key', true),
-- the GUC approach 20260712130000_cron_secrets_to_vault.sql confirmed
-- live and non-functional (ALTER DATABASE ... SET app.settings.* fails
-- permission-denied on this project) five days BEFORE this function was
-- created — every sibling caller (create_callout_job, both cron bodies)
-- was repointed to get_secret('service_role_key')/supabase_project_url()
-- in that migration, but this one, written after, was never updated to
-- match and shipped with the already-known-broken pattern.
--
-- Effect: v_supabase_url/v_service_key are always NULL, so every job
-- minted through the normal quote-acceptance flow hits the
-- RAISE WARNING branch and never starts its SLA clock — sla_response_due/
-- sla_completion_due/sla_status stay NULL forever, silently (a WARNING,
-- not surfaced anywhere a human would see it). Fixed by repointing to the
-- same Vault-based helpers its siblings already use. No other logic in
-- this function changes.

CREATE OR REPLACE FUNCTION public.mint_job_from_quote(p_quote_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quote           public.issued_quotes%ROWTYPE;
  v_enquiry         public.enquiries%ROWTYPE;
  v_confirmed_event public.schedule_events%ROWTYPE;
  v_job_id          uuid;
  v_service_key     text;
BEGIN
  SELECT * INTO v_quote FROM public.issued_quotes WHERE id = p_quote_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'mint_job_from_quote: quote % not found', p_quote_id;
  END IF;

  -- Idempotent: an existing job for this quote is returned as-is (backed by
  -- the partial unique index added above).
  SELECT id INTO v_job_id FROM public.jobs WHERE issued_quote_id = p_quote_id;
  IF v_job_id IS NOT NULL THEN
    RETURN v_job_id;
  END IF;

  IF v_quote.recipient_response IS DISTINCT FROM 'accepted' THEN
    RAISE EXCEPTION 'mint_job_from_quote: quote % has not been accepted (recipient_response=%)', p_quote_id, v_quote.recipient_response;
  END IF;

  IF COALESCE(v_quote.deposit_required, false) AND NOT COALESCE(v_quote.deposit_paid, false) THEN
    RAISE EXCEPTION 'mint_job_from_quote: quote % requires a deposit that has not been paid', p_quote_id;
  END IF;

  SELECT * INTO v_confirmed_event
  FROM public.schedule_events
  WHERE quote_id = p_quote_id
    AND event_type = 'quote_proposal'
    AND (status = 'accepted' OR is_confirmed = true)
  ORDER BY start_time ASC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'mint_job_from_quote: quote % has no confirmed schedule proposal', p_quote_id;
  END IF;

  IF v_quote.enquiry_id IS NOT NULL THEN
    SELECT * INTO v_enquiry FROM public.enquiries WHERE id = v_quote.enquiry_id;
  END IF;

  INSERT INTO public.jobs (
    contractor_id, customer_id, issued_quote_id, title, description, location,
    status, contract_value, start_date, scheduled_start,
    company_id, site_id, asset_id
  ) VALUES (
    v_quote.contractor_id, v_quote.recipient_id, p_quote_id,
    v_quote.title, v_quote.description, v_quote.client_address,
    'scheduled', v_quote.total,
    v_confirmed_event.start_time::date, v_confirmed_event.start_time,
    v_enquiry.company_id, v_enquiry.site_id, v_enquiry.asset_id
  )
  RETURNING id INTO v_job_id;

  UPDATE public.schedule_events SET job_id = v_job_id WHERE id = v_confirmed_event.id;

  -- Fire-and-forget SLA-clock start -- mirrors create_callout_job
  -- (20260711130000, repointed to Vault in 20260712130000): missing
  -- secret or a failed net.http_post call are caught and RAISE WARNING'd,
  -- never allowed to roll back job creation.
  v_service_key := public.get_secret('service_role_key');

  IF v_service_key IS NULL THEN
    RAISE WARNING 'mint_job_from_quote: service_role_key secret not found in Vault; SLA clock not started for job %', v_job_id;
  ELSE
    BEGIN
      PERFORM net.http_post(
        url := public.supabase_project_url() || '/functions/v1/sla-clock',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_service_key),
        body := jsonb_build_object('action', 'start', 'job_id', v_job_id)
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'mint_job_from_quote: sla-clock invocation failed for job % : %', v_job_id, SQLERRM;
    END;
  END IF;

  -- Silent handoff notice for the contractor, mirroring createJobFromQuote.ts's
  -- own comment: job creation happens on the recipient's confirm/pay-deposit
  -- action (or the webhook, for deposit quotes), so the contractor has no
  -- other signal it happened until they next load the dashboard.
  INSERT INTO public.notifications (user_id, title, message, type, reference_type, reference_id, is_read)
  VALUES (
    v_quote.contractor_id,
    'Job confirmed',
    COALESCE(v_quote.client_name, 'Your client') || ' confirmed the job for "' || v_quote.title || '"',
    'job_confirmed', 'job', v_job_id, false
  );

  RETURN v_job_id;
END;
$$;
