-- Direct quote follow-ups (browser test, 21 Oct 2026).
--
-- 1. A quote declined as 'not_requested' ("I didn't ask for this") is closed
--    to its contractor:
--    a. It cannot be revised. Two gates, because a revision exists as a
--       draft before it is sent: issued_quotes_binding_guard refuses
--       creating the revision; send_quote refuses sending a draft revision
--       whose parent was declined that way after the draft was made.
--       Revisions skip the daily limit, so this is enforced here, not in
--       the UI alone.
--    b. Only the customer may start a quote-context conversation for it, or
--       post in one, or move an existing conversation onto it (job_conversations
--       contractor UPDATE has no column limit). Client writes only
--       (current_user authenticated/anon); server paths are unaffected. A
--       not_requested quote has no enquiry and no job, so its thread is
--       always the issued_quote_id one.
--    c. No further quotes without an enquiry from that contractor to that
--       customer (issued_quotes_direct_recipient_guard), until the customer
--       has a relationship with them (_customer_relationship: e.g. they
--       send an enquiry). Keyed on the quote's contractor_id. Without this,
--       a new no-enquiry quote to someone already quoted today used no slot.
-- 2. mint_job_from_quote: a quote with no enquiry and no description gave
--    the job the title "Test Customer —" (J-0022). One change: the quote's
--    title joins the description fallback, so the title reads
--    "<client> — <quote title>". No other line of the function changes;
--    no money logic is touched.
--
-- Live checks, 21 Oct 2026: no triggers on job_conversations or
-- job_messages; 1 quote declined 'not_requested'; md5 of the four replaced
-- function bodies recorded in the pre-flight.
--
-- ROLLBACK (in this order):
--   drop trigger job_messages_not_requested_guard_trigger on public.job_messages;
--   drop trigger job_conversations_not_requested_guard_trigger on public.job_conversations;
--   drop function public.job_messages_not_requested_guard();
--   drop function public.job_conversations_not_requested_guard();
--   drop function public._conversation_not_requested_recipient(uuid);
--   drop function public._not_requested_quote_recipient(uuid);
--   re-run issued_quotes_direct_recipient_guard from 20261021120000_direct_quote_by_ts_code.sql (section 5);
--   re-run send_quote from 20261020130000_quote_send_checks.sql (section 2);
--   re-run issued_quotes_binding_guard from 20261021120000_direct_quote_by_ts_code.sql (section 6);
--   recreate mint_job_from_quote with left(COALESCE(v_enquiry.job_description, v_quote.description, ''), 60).

-- ── 0. Pre-flight ────────────────────────────────────────────────────────────
DO $$
BEGIN
  -- The bodies being replaced are exactly the ones this was written against.
  IF (SELECT md5(prosrc) FROM pg_proc WHERE proname = 'send_quote' AND pronamespace = 'public'::regnamespace)
       IS DISTINCT FROM 'fc73cbc544f0f8f0090c258e9f69fbb4'
     OR (SELECT md5(prosrc) FROM pg_proc WHERE proname = 'issued_quotes_binding_guard' AND pronamespace = 'public'::regnamespace)
       IS DISTINCT FROM 'a31b9c5aa7e3f0dbebe1e49bb58f564e'
     OR (SELECT md5(prosrc) FROM pg_proc WHERE proname = 'mint_job_from_quote' AND pronamespace = 'public'::regnamespace)
       IS DISTINCT FROM '41903792284c884e040e2250b2b8dcbd'
     OR (SELECT md5(prosrc) FROM pg_proc WHERE proname = 'issued_quotes_direct_recipient_guard' AND pronamespace = 'public'::regnamespace)
       IS DISTINCT FROM '903ba11c7e5f50b593cd54a4cc654cfe' THEN
    RAISE EXCEPTION 'send_quote / issued_quotes_binding_guard / mint_job_from_quote / issued_quotes_direct_recipient_guard differ from the 21 Oct live bodies; review drift';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid IN ('public.job_conversations'::regclass, 'public.job_messages'::regclass)
             AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'job_conversations / job_messages have triggers this migration did not expect';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
                 AND table_name = 'issued_quotes' AND column_name = 'decline_reason_code') THEN
    RAISE EXCEPTION 'issued_quotes.decline_reason_code missing; apply 20261021120000 first';
  END IF;
END $$;

-- ── 1. Helpers ───────────────────────────────────────────────────────────────
-- The customer of a quote declined as 'not_requested'; NULL for any other quote.
CREATE FUNCTION public._not_requested_quote_recipient(p_quote_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT q.recipient_id FROM public.issued_quotes q
  WHERE q.id = p_quote_id AND q.decline_reason_code = 'not_requested';
$function$;

-- The same, for the quote a conversation is about.
CREATE FUNCTION public._conversation_not_requested_recipient(p_conversation_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT q.recipient_id
  FROM public.job_conversations jc
  JOIN public.issued_quotes q ON q.id = jc.issued_quote_id
  WHERE jc.id = p_conversation_id AND q.decline_reason_code = 'not_requested';
$function$;

-- ── 2. Conversations and messages on a not_requested quote ──────────────────
-- SECURITY INVOKER, as the other guards: current_user tells a client write
-- from the service role or SECURITY DEFINER code.
CREATE FUNCTION public.job_conversations_not_requested_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_customer uuid;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') OR NEW.issued_quote_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.issued_quote_id IS NOT DISTINCT FROM OLD.issued_quote_id THEN
    RETURN NEW;
  END IF;
  v_customer := public._not_requested_quote_recipient(NEW.issued_quote_id);
  IF v_customer IS NOT NULL AND auth.uid() IS DISTINCT FROM v_customer THEN
    RAISE EXCEPTION 'The customer said they didn''t ask for this quote, so you can''t message them about it.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER job_conversations_not_requested_guard_trigger
  BEFORE INSERT OR UPDATE OF issued_quote_id ON public.job_conversations
  FOR EACH ROW EXECUTE FUNCTION public.job_conversations_not_requested_guard();

CREATE FUNCTION public.job_messages_not_requested_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_customer uuid;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  v_customer := public._conversation_not_requested_recipient(NEW.conversation_id);
  -- The INSERT policy already ties sender_id to the caller's own profile.
  IF v_customer IS NOT NULL AND NEW.sender_id IS DISTINCT FROM v_customer THEN
    RAISE EXCEPTION 'The customer said they didn''t ask for this quote, so you can''t message them about it.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER job_messages_not_requested_guard_trigger
  BEFORE INSERT ON public.job_messages
  FOR EACH ROW EXECUTE FUNCTION public.job_messages_not_requested_guard();

-- ── 3. No revision of a not_requested quote ─────────────────────────────────
-- Binding guard: unchanged from 20261021120000 except the parent's decline
-- reason is read and 'not_requested' refused.
CREATE OR REPLACE FUNCTION public.issued_quotes_binding_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_parent_recipient uuid;
  v_parent_enquiry   uuid;
  v_parent_reason    text;
  v_enq_contractor   uuid;
  v_enq_customer     uuid;
BEGIN
  IF NEW.parent_quote_id IS NOT NULL THEN
    SELECT q.recipient_id, q.enquiry_id, q.decline_reason_code INTO v_parent_recipient, v_parent_enquiry, v_parent_reason
    FROM public.issued_quotes q WHERE q.id = NEW.parent_quote_id;
    -- A missing parent is refused by the lock guard.
    IF FOUND AND v_parent_reason = 'not_requested' THEN
      RAISE EXCEPTION 'The customer said they didn''t ask for this quote, so it can''t be revised and resent.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF FOUND AND (NEW.recipient_id IS DISTINCT FROM v_parent_recipient
                  OR NEW.enquiry_id IS DISTINCT FROM v_parent_enquiry) THEN
      RAISE EXCEPTION 'A revision goes to the same customer, for the same enquiry, as the quote it revises.'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  SELECT e.contractor_id, e.customer_id INTO v_enq_contractor, v_enq_customer
  FROM public.enquiries e WHERE e.id = NEW.enquiry_id;
  -- Sent to this contractor: named on the enquiry (single-contractor flow)
  -- or on an enquiry_recipients row (compare flow, contractor_id NULL).
  IF NOT FOUND OR (
       v_enq_contractor IS DISTINCT FROM NEW.contractor_id
       AND NOT EXISTS (SELECT 1 FROM public.enquiry_recipients er
                       WHERE er.enquiry_id = NEW.enquiry_id AND er.contractor_id = NEW.contractor_id)
     ) THEN
    RAISE EXCEPTION 'That enquiry wasn''t sent to you.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_enq_customer IS NOT NULL AND NEW.recipient_id IS DISTINCT FROM v_enq_customer THEN
    RAISE EXCEPTION 'A quote on an enquiry goes to the customer who sent it.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;

-- No-enquiry guard: unchanged from 20261021120000 except the
-- not_requested check, placed after the relationship check (a
-- relationship lifts it) and before the daily-limit checks.
CREATE OR REPLACE FUNCTION public.issued_quotes_direct_recipient_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_type  text;
  v_active     boolean;
  v_day_start  timestamptz;
  v_recipients integer;
BEGIN
  -- One no-enquiry insert per contractor at a time, so two at once can't
  -- both pass the count below.
  PERFORM pg_advisory_xact_lock(hashtextextended('issued_quotes_direct_recipient:' || NEW.contractor_id::text, 0));

  IF NEW.recipient_id IS NULL THEN
    RAISE EXCEPTION 'A quote without an enquiry needs a customer. Enter their TS-P code.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT p.user_type::text, coalesce(p.is_active, true) INTO v_user_type, v_active
  FROM public.profiles p WHERE p.id = NEW.recipient_id;

  IF v_user_type IS DISTINCT FROM 'personal' THEN
    RAISE EXCEPTION 'Only a personal TradeStone account (a TS-P code) can be sent a quote without an enquiry. Business accounts can''t be quoted this way yet.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT v_active OR EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.profile_id = NEW.recipient_id) THEN
    RAISE EXCEPTION 'That account can''t be sent a quote.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF public._customer_relationship(NEW.contractor_id, NEW.recipient_id) THEN
    RETURN NEW;
  END IF;

  -- The customer has said "I didn't ask for this" to one of this
  -- contractor's quotes: no more quotes without an enquiry until they take
  -- part themselves (an enquiry, an accepted quote; the check above).
  IF EXISTS (
    SELECT 1 FROM public.issued_quotes q
    WHERE q.contractor_id = NEW.contractor_id AND q.recipient_id = NEW.recipient_id
      AND q.decline_reason_code = 'not_requested'
  ) THEN
    RAISE EXCEPTION 'This customer has said they didn''t request your quotes. They can contact you through TradeStone if they''d like one.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_day_start := date_trunc('day', now() AT TIME ZONE 'Europe/London') AT TIME ZONE 'Europe/London';

  IF EXISTS (
    SELECT 1 FROM public.issued_quotes q
    WHERE q.contractor_id = NEW.contractor_id AND q.recipient_id = NEW.recipient_id
      AND q.enquiry_id IS NULL AND q.parent_quote_id IS NULL AND q.created_at >= v_day_start
  ) THEN
    RETURN NEW;
  END IF;

  -- Slots used today: distinct no-enquiry recipients with no relationship
  -- (as of now: one who has since accepted a quote frees their slot).
  SELECT count(*) INTO v_recipients
  FROM (
    SELECT DISTINCT q.recipient_id
    FROM public.issued_quotes q
    WHERE q.contractor_id = NEW.contractor_id
      AND q.enquiry_id IS NULL AND q.parent_quote_id IS NULL
      AND q.recipient_id IS NOT NULL AND q.created_at >= v_day_start
  ) r
  WHERE NOT public._customer_relationship(NEW.contractor_id, r.recipient_id);

  IF v_recipients >= 10 THEN
    RAISE EXCEPTION 'You''ve quoted 10 new customers without an enquiry today, which is the daily limit. Customers who have already worked with you aren''t limited; anyone else can be quoted tomorrow.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

-- send_quote: unchanged from 20261020130000 except a draft revision whose
-- parent has since been declined as 'not_requested' is refused.
CREATE OR REPLACE FUNCTION public.send_quote(p_quote_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_quote   public.issued_quotes%ROWTYPE;
  v_parent  public.issued_quotes%ROWTYPE;
  v_problem text;
BEGIN
  SELECT * INTO v_quote FROM public.issued_quotes WHERE id = p_quote_id FOR UPDATE;
  IF NOT FOUND OR v_quote.contractor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Quote not found.' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_quote.status <> 'draft' THEN
    RAISE EXCEPTION 'Only a draft quote can be sent (this one is %).', v_quote.status USING ERRCODE = 'check_violation';
  END IF;

  -- An accepted original is the first thing to tell the contractor; then
  -- the figures. Nothing is changed until both pass.
  IF v_quote.parent_quote_id IS NOT NULL THEN
    SELECT * INTO v_parent FROM public.issued_quotes WHERE id = v_quote.parent_quote_id FOR UPDATE;
    IF v_parent.status = 'accepted' OR v_parent.recipient_response = 'accepted' THEN
      RAISE EXCEPTION 'The original quote was accepted while this revision was in draft.' USING ERRCODE = 'check_violation';
    END IF;
    IF v_parent.decline_reason_code = 'not_requested' THEN
      RAISE EXCEPTION 'The customer said they didn''t ask for this quote, so it can''t be revised and resent.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  v_problem := public._quote_figures_problem(v_quote.contractor_id, v_quote.items, v_quote.subtotal, v_quote.tax_rate,
    v_quote.tax_amount, v_quote.total, v_quote.deposit_required, v_quote.deposit_percentage, v_quote.deposit_amount);
  IF v_problem IS NOT NULL THEN
    RAISE EXCEPTION '%', v_problem USING ERRCODE = 'check_violation';
  END IF;

  IF v_quote.parent_quote_id IS NOT NULL THEN
    UPDATE public.issued_quotes SET status = 'superseded'
    WHERE id = v_parent.id AND status IN ('sent', 'rejected');

    -- The dates the customer was offered on the parent stay on offer.
    IF NOT EXISTS (SELECT 1 FROM public.schedule_events
                   WHERE quote_id = p_quote_id AND event_type = 'quote_proposal') THEN
      UPDATE public.schedule_events SET quote_id = p_quote_id
      WHERE quote_id = v_parent.id AND event_type = 'quote_proposal' AND status = 'proposed';
    END IF;
  END IF;

  -- on_quote_sent (sent_at NULL → set) notifies the recipient, as before.
  UPDATE public.issued_quotes SET status = 'sent', sent_at = now() WHERE id = p_quote_id;
END;
$function$;

-- ── 4. mint_job_from_quote: job title for a quote with no enquiry ───────────
-- Live body (21 Oct) with one change, in the v_title description fallback:
--   - left(COALESCE(v_enquiry.job_description, v_quote.description, ''), 60)
--   + left(COALESCE(v_enquiry.job_description, v_quote.description, v_quote.title, ''), 60)
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
    NULLIF(trim(COALESCE(v_quote.client_name, '') || ' — ' || left(COALESCE(v_enquiry.job_description, v_quote.description, v_quote.title, ''), 60)), '—'),
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

-- ── 5. Function grants ───────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public._not_requested_quote_recipient(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._conversation_not_requested_recipient(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.job_conversations_not_requested_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.job_messages_not_requested_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.issued_quotes_binding_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.issued_quotes_direct_recipient_guard() FROM PUBLIC, anon, authenticated;

-- ── 6. Post-flight ───────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'job_conversations_not_requested_guard_trigger')
     OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'job_messages_not_requested_guard_trigger') THEN
    RAISE EXCEPTION 'not_requested guards missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'send_quote' AND position('not_requested' IN prosrc) > 0)
     OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'issued_quotes_binding_guard' AND position('not_requested' IN prosrc) > 0)
     OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'issued_quotes_direct_recipient_guard' AND position('not_requested' IN prosrc) > 0)
     OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'mint_job_from_quote'
                    AND position('v_quote.description, v_quote.title, ''''' IN prosrc) > 0) THEN
    RAISE EXCEPTION 'function bodies not as intended';
  END IF;
  IF has_function_privilege('authenticated', 'public._not_requested_quote_recipient(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.send_quote(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'function grants not as intended';
  END IF;
END $$;
