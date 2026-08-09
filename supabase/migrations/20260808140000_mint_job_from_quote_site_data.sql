-- =============================================================================
-- mint_job_from_quote_site_data.sql — carry real site address and a
-- meaningful title into jobs minted from a quote.
--
-- Confirmed live (Step 0, field tab-structure brief): 11 of 12
-- quote-originated jobs have location IS NULL; 9 of those 11 have a real
-- enquiries.location value sitting unused because SendQuoteDialog.tsx never
-- copied it into issued_quotes.client_address (fixed alongside this
-- migration, same commit). The 2 remaining rows have no enquiry_id at all —
-- genuinely no location data exists upstream for those; NOT invented here.
--
-- title previously copied v_quote.title verbatim — the exact source of
-- "Quote for Test Customer" / "TEST.2" style placeholders. Precedence
-- reversed from the original proposal: the COMPOSED value (client name +
-- job description snippet) is preferred, quote.title is only the fallback,
-- since quote.title is populated-but-useless on exactly the rows this fix
-- targets. Guarded so a composed value collapsing to a bare " — " (both
-- parts empty) does not win over a real quote.title, and 'Job' is the
-- final never-null/never-empty fallback.
--
-- No consumer of jobs.title assumes a format/prefix — confirmed by reading
-- every read site (JobManagement.tsx, ClientJobsView.tsx,
-- ThreadJobSection.tsx, generateJobRecordPdf.ts, toast copy): all render it
-- as an opaque string. Purely a value-quality change, no breaking impact.
--
-- Existing rows are NOT backfilled (13 of 14 live jobs have location IS
-- NULL as of this migration — reported, not silently fixed here).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.mint_job_from_quote(p_quote_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_quote               public.issued_quotes%ROWTYPE;
  v_enquiry              public.enquiries%ROWTYPE;
  v_confirmed_event      public.schedule_events%ROWTYPE;
  v_job_id               uuid;
  v_service_key          text;
  v_consumer_user_type   text;
  v_schedule_id          uuid;
  v_stage                jsonb;
  v_stage_percentage     numeric;
  v_stage_fixed          numeric;
  v_stage_amount         numeric;
  v_stage_trigger        text;
  v_location             text;
  v_title                text;
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

  -- Site address: prefer the quote's own client_address (now written at
  -- quote-send time by SendQuoteDialog.tsx), fall back to the source
  -- enquiry's location for quotes issued before that fix. NULL only when
  -- neither exists (no enquiry at all) — genuinely no data upstream.
  v_location := COALESCE(v_quote.client_address, v_enquiry.location);

  -- Title: composed value preferred over the quote's own title — quote.title
  -- is exactly what produces "Quote for X" / "TEST.2" style placeholders
  -- (populated, but not useful on site). NULLIF against a bare " — "
  -- catches the case where both the client name and the description
  -- snippet are empty, so that never silently wins over a real quote.title.
  v_title := COALESCE(
    NULLIF(trim(COALESCE(v_quote.client_name, '') || ' — ' || left(COALESCE(v_enquiry.job_description, v_quote.description, ''), 60)), '—'),
    NULLIF(trim(v_quote.title), ''),
    'Job'
  );

  INSERT INTO public.jobs (
    contractor_id, customer_id, issued_quote_id, title, description, location,
    status, contract_value, start_date, scheduled_start,
    company_id, site_id, asset_id
  ) VALUES (
    v_quote.contractor_id, v_quote.recipient_id, p_quote_id,
    v_title, v_quote.description, v_location,
    'scheduled', v_quote.total,
    v_confirmed_event.start_time::date, v_confirmed_event.start_time,
    v_enquiry.company_id, v_enquiry.site_id, v_enquiry.asset_id
  )
  RETURNING id INTO v_job_id;

  UPDATE public.schedule_events SET job_id = v_job_id WHERE id = v_confirmed_event.id;

  -- Back-reference the minted job onto its invoice (raised at quote
  -- acceptance for deposit-required quotes -- see accept-quote/index.ts).
  -- Guarded on job_id IS NULL for the same reason the job lookup above is:
  -- this function is re-entrant and an existing job is returned early
  -- (see the RETURN v_job_id above), so in the normal path this statement
  -- always finds job_id NULL. The guard exists purely for defensive
  -- re-runs, matching the idempotency posture of the rest of the function.
  UPDATE public.invoices SET job_id = v_job_id WHERE quote_id = p_quote_id AND job_id IS NULL;

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

  -- Consumer Contracts Regulations 2013: 14-day cooling-off for homeowner
  -- jobs only. company_id IS NULL on the source enquiry (no enquiry at all
  -- also reads as NULL here, which is correct — no enquiry means no B2B
  -- company context) AND the recipient is a personal-tier profile.
  SELECT user_type::text INTO v_consumer_user_type
  FROM public.profiles WHERE id = v_quote.recipient_id;

  IF v_enquiry.company_id IS NULL AND v_consumer_user_type = 'personal' THEN
    INSERT INTO public.cooling_off_records (
      job_id, quote_id, consumer_id, contractor_id,
      cooling_off_start, cooling_off_end, prescribed_info_sent_at
    ) VALUES (
      v_job_id, p_quote_id, v_quote.recipient_id, v_quote.contractor_id,
      now(), now() + interval '14 days', now()
    )
    ON CONFLICT (job_id) DO NOTHING;

    INSERT INTO public.notifications (user_id, title, message, type, reference_type, reference_id, is_read)
    VALUES (
      v_quote.contractor_id,
      'Consumer cooling-off period applies',
      'This is a consumer job. The customer has 14 days to cancel under the Consumer Contracts Regulations 2013. Do not begin work until the cooling-off period ends, unless the customer consents to early commencement.',
      'cooling_off_started', 'job', v_job_id, false
    );

    -- Fire-and-forget prescribed-info email — same guard as the SLA-clock
    -- call above; a failed send never rolls back job creation. The dialog
    -- (CoolingOffNotice.tsx) is the primary durable-medium-independent
    -- delivery; this email satisfies the "durable medium" requirement
    -- even if the consumer never opens the in-app dialog.
    IF v_service_key IS NOT NULL THEN
      BEGIN
        PERFORM net.http_post(
          url := public.supabase_project_url() || '/functions/v1/send-cooling-off-notice',
          headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_service_key),
          body := jsonb_build_object('job_id', v_job_id)
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'mint_job_from_quote: send-cooling-off-notice invocation failed for job % : %', v_job_id, SQLERRM;
      END;
    END IF;
  END IF;

  -- Staged payments: materialise the quote's draft payment_schedule (set by
  -- PaymentScheduleBuilder.tsx at quote-send time) into the real
  -- payment_schedules/payment_stages rows now that a job exists.
  IF v_quote.payment_schedule IS NOT NULL AND jsonb_typeof(v_quote.payment_schedule -> 'stages') = 'array' THEN
    INSERT INTO public.payment_schedules (job_id, quote_id, contractor_id, customer_id, schedule_type, total_contract_value)
    VALUES (
      v_job_id, p_quote_id, v_quote.contractor_id, v_quote.recipient_id,
      COALESCE(v_quote.payment_schedule ->> 'type', 'milestone'),
      v_quote.total
    )
    ON CONFLICT (job_id) DO NOTHING
    RETURNING id INTO v_schedule_id;

    IF v_schedule_id IS NOT NULL THEN
      FOR v_stage IN SELECT * FROM jsonb_array_elements(v_quote.payment_schedule -> 'stages')
      LOOP
        v_stage_percentage := NULLIF(v_stage ->> 'percentage', '')::numeric;
        v_stage_fixed := NULLIF(v_stage ->> 'fixed_amount', '')::numeric;
        v_stage_trigger := COALESCE(v_stage ->> 'trigger_type', 'milestone');
        v_stage_amount := COALESCE(v_stage_fixed, ROUND(v_quote.total * COALESCE(v_stage_percentage, 0) / 100, 2));

        INSERT INTO public.payment_stages (
          schedule_id, stage_number, title, description,
          percentage, fixed_amount, calculated_amount,
          trigger_type, trigger_date, milestone_description,
          status, marked_ready_at, marked_ready_by
        ) VALUES (
          v_schedule_id,
          (v_stage ->> 'stage_number')::integer,
          v_stage ->> 'title',
          v_stage ->> 'description',
          v_stage_percentage, v_stage_fixed, v_stage_amount,
          v_stage_trigger,
          NULLIF(v_stage ->> 'trigger_date', '')::date,
          v_stage ->> 'milestone_description',
          -- The on_acceptance stage is the deposit — already paid (deposit
          -- gate above guarantees this) by the time we reach this point.
          CASE WHEN v_stage_trigger = 'on_acceptance' THEN 'paid' ELSE 'pending' END,
          CASE WHEN v_stage_trigger = 'on_acceptance' THEN now() ELSE NULL END,
          CASE WHEN v_stage_trigger = 'on_acceptance' THEN v_quote.contractor_id ELSE NULL END
        );
      END LOOP;
    END IF;
  END IF;

  RETURN v_job_id;
END;
$function$;
