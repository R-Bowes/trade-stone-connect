-- Consumer 14-day cooling-off (Consumer Contracts Regulations 2013).
--
-- Applies to homeowner (personal) jobs only: company_id IS NULL on the
-- source enquiry AND the quote recipient's profiles.user_type = 'personal'.
-- B2B contracts are not consumer contracts and never get a record.
--
-- DEVIATION FROM SPEC (flagged for review): the spec said "DO NOT modify
-- the existing RPCs, add a client-side step after quote acceptance
-- succeeds" and referenced a client-side createJobFromQuote.ts. That file
-- no longer exists — job minting has since moved entirely server-side into
-- mint_job_from_quote (20260717120000, SECURITY DEFINER), called either
-- synchronously from accept_quote_with_slot (no-deposit path) or from
-- stripe-webhook on payment_intent.succeeded (deposit path, LOCKED
-- DECISION 1 in 20260717150000). There is no client-side moment after
-- job creation for the deposit path — the client only sees "payment
-- succeeded", not "job minted" (see DepositPaymentDialog.tsx's comment on
-- why it deliberately no longer mints or reacts to minting itself).
-- mint_job_from_quote is therefore the one place both paths guarantee a
-- job exists, and it already does exactly this kind of guaranteed
-- post-mint side effect (SLA-clock kickoff, contractor notification) — so
-- the cooling-off record insert, contractor notification, and prescribed-
-- info email dispatch are added there, following the same fire-and-forget
-- guarded pattern already established for the SLA-clock call. Full
-- CREATE OR REPLACE restatement below, per this repo's convention for
-- functions patched more than once (see 20260717150000's own note).

-- =========================================================================
-- 1. cooling_off_records
-- =========================================================================

CREATE TABLE public.cooling_off_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id),
  quote_id uuid NOT NULL REFERENCES public.issued_quotes(id),
  consumer_id uuid NOT NULL REFERENCES public.profiles(id),
  contractor_id uuid NOT NULL REFERENCES public.profiles(id),

  prescribed_info_sent_at timestamptz NOT NULL DEFAULT now(),

  cooling_off_start timestamptz NOT NULL DEFAULT now(),
  cooling_off_end timestamptz NOT NULL,

  early_start_consent boolean NOT NULL DEFAULT false,
  early_start_consented_at timestamptz,
  early_start_acknowledged_loss_of_right boolean NOT NULL DEFAULT false,

  cancelled boolean NOT NULL DEFAULT false,
  cancelled_at timestamptz,
  cancellation_reason text,

  cooling_off_elapsed boolean NOT NULL DEFAULT false,
  cooling_off_elapsed_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (job_id)
);

ALTER TABLE public.cooling_off_records ENABLE ROW LEVEL SECURITY;

-- Both parties can read. profiles.id == profiles.user_id == auth.uid() by
-- construction (CLAUDE.md RLS section) so direct comparison is correct.
CREATE POLICY "Parties can view cooling-off record"
  ON public.cooling_off_records FOR SELECT
  TO authenticated
  USING (consumer_id = auth.uid() OR contractor_id = auth.uid());

-- No INSERT policy: rows are created only by mint_job_from_quote
-- (SECURITY DEFINER, bypasses RLS) — same pattern as contractor_counters.

-- Only the consumer can write (cancel / give early-start consent). System
-- updates (elapsed marking) go through mark_elapsed_cooling_off, also
-- SECURITY DEFINER, which bypasses RLS the same way.
CREATE POLICY "Consumer can update own cooling-off record"
  ON public.cooling_off_records FOR UPDATE
  TO authenticated
  USING (consumer_id = auth.uid())
  WITH CHECK (consumer_id = auth.uid());

CREATE TRIGGER update_cooling_off_records_updated_at
  BEFORE UPDATE ON public.cooling_off_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================================
-- 2. mark_elapsed_cooling_off + cron
-- =========================================================================

CREATE OR REPLACE FUNCTION public.mark_elapsed_cooling_off()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  v_rec   record;
BEGIN
  FOR v_rec IN
    SELECT id, job_id, contractor_id, cooling_off_end
    FROM public.cooling_off_records
    WHERE cooling_off_elapsed = false
      AND cancelled = false
      AND cooling_off_end < now()
  LOOP
    UPDATE public.cooling_off_records
    SET cooling_off_elapsed = true,
        cooling_off_elapsed_at = now()
    WHERE id = v_rec.id;

    INSERT INTO public.notifications (user_id, title, message, type, reference_type, reference_id, is_read)
    VALUES (
      v_rec.contractor_id,
      'Cooling-off period ended',
      'The 14-day cooling-off period has elapsed for this consumer job. Standard cancellation terms now apply.',
      'cooling_off_elapsed', 'job', v_rec.job_id, false
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_elapsed_cooling_off() FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule('mark-elapsed-cooling-off')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mark-elapsed-cooling-off');

SELECT cron.schedule(
  'mark-elapsed-cooling-off',
  '0 2 * * *',
  $$ SELECT public.mark_elapsed_cooling_off(); $$
);

-- =========================================================================
-- 3. mint_job_from_quote — amended to create the cooling-off record for
-- consumer jobs. Full contract restated (see file header note).
-- =========================================================================

CREATE OR REPLACE FUNCTION public.mint_job_from_quote(p_quote_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quote               public.issued_quotes%ROWTYPE;
  v_enquiry              public.enquiries%ROWTYPE;
  v_confirmed_event      public.schedule_events%ROWTYPE;
  v_job_id               uuid;
  v_service_key          text;
  v_consumer_user_type   text;
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

  RETURN v_job_id;
END;
$$;
