-- 20260717120000_offer_with_slots_accept_flow.sql
-- BUILD SLICE: Offer-with-slots — atomic accept -> deposit -> job.
--
-- LOCKED DECISIONS (Phase A resolution, restated for anyone reading this
-- migration in isolation):
-- 1. Deposit-bearing acceptance does NOT mint the job. The stripe-webhook
--    mints the job on payment success (payment_intent.succeeded, Phase C).
--    No-deposit acceptance mints immediately via accept_quote_with_slot.
--    Invariant: a scheduled job means money has moved (or none was due).
-- 2. Site visits are schedule_events rows (event_type='site_visit') hanging
--    off a new enquiry_id FK, same propose/confirm mechanic, no payment leg,
--    no availability auto-block.
-- 3. HYBRID scheduling model (re-scope of the original slice after Phase A
--    found the live useQuoteScheduling.ts negotiation system -- turn caps,
--    cycles, backout, post-exhaustion -- already fully built and NOT part
--    of the original spec's assumptions):
--      (a) the slots a contractor sends with a quote are simply the cycle-1
--          proposal batch (Phase D, SendQuoteDialog) -- no new mechanic;
--      (b) accept_quote_with_slot (below) is the ONE atomic confirmation
--          exit from negotiation, usable at ANY cycle, not just cycle 1;
--      (c) client-side job minting (createJobFromQuote.ts) is retired in
--          Phase D -- all minting goes through mint_job_from_quote (below),
--          called either by accept_quote_with_slot (no-deposit path) or by
--          the stripe-webhook (deposit-paid path).
--    useQuoteScheduling.ts's rules themselves (turn caps, cycles, backout,
--    post-exhaustion) are UNCHANGED by this migration -- only the
--    confirmation exit point moves server-side.
--
-- job_scheduling_proposals remains DEPRECATED-PENDING-DROP (confirmed
-- unreferenced by any application or edge-function code in Phase A) -- see
-- the COMMENT ON TABLE below. Not dropped in this migration.
--
-- NOTE on B4's quote-status validation (judgment call, flagged for review):
-- the original spec text said to reject a quote unless status='sent'. But
-- the same spec explicitly allows recipient_response='accepted' (so a
-- cycle-2+ confirmation can succeed) -- and respondToQuote
-- (useReceivedQuotes.ts) always sets status='accepted' in the SAME write as
-- recipient_response='accepted'. Requiring status='sent' would therefore
-- make every confirmation after the very first cycle impossible, which
-- directly contradicts "any cycle" in decision 3(b). Resolved by accepting
-- status IN ('sent','accepted') -- rejecting draft/rejected/expired/
-- lapsed/superseded exactly as intended, without blocking cycle 2+.
--
-- NOTE for Phase D (flagged here so it isn't lost): B6's new
-- notify_on_schedule_proposal trigger fires on every quote_proposal batch
-- insert. useQuoteScheduling.ts's submitProposals/submitPostExhaustionProposal
-- ALSO call notifyOtherParty client-side today (only for the customer->
-- contractor direction). Once this trigger exists, that client-side call
-- must be removed in Phase D or the customer->contractor direction will be
-- notified twice.

-- =============================================================================
-- B1. Enquiry time windows (additive)
-- =============================================================================

ALTER TABLE public.enquiries
  ADD COLUMN preferred_window_start date NULL,
  ADD COLUMN preferred_window_end   date NULL,
  ADD COLUMN preferred_time_of_day  text NULL
    CHECK (preferred_time_of_day IN ('am', 'pm', 'any'));

-- preferred_timeline (free-text fallback) is untouched.

-- =============================================================================
-- B2. Enquiry status vocabulary
-- Verified via (run in the Supabase SQL editor, read-only):
--   SELECT DISTINCT status FROM public.enquiries;
-- Live values confirmed as only 'new' and 'converted' -- safe to constrain.
-- =============================================================================

ALTER TABLE public.enquiries
  ADD CONSTRAINT enquiries_status_check
  CHECK (status IN ('new', 'declined', 'converted'));

-- =============================================================================
-- B3. schedule_events.enquiry_id -- site-visit support
-- =============================================================================

ALTER TABLE public.schedule_events
  ADD COLUMN enquiry_id uuid NULL REFERENCES public.enquiries(id) ON DELETE SET NULL;

CREATE INDEX idx_schedule_events_enquiry_id
  ON public.schedule_events(enquiry_id) WHERE enquiry_id IS NOT NULL;

-- event_type keeps multiple live values (no CHECK on the column itself);
-- the only new rule is that a site_visit row must carry its enquiry_id.
ALTER TABLE public.schedule_events
  ADD CONSTRAINT schedule_events_site_visit_enquiry_check
  CHECK (event_type <> 'site_visit' OR enquiry_id IS NOT NULL);

-- =============================================================================
-- Safety net for B5's idempotency claim: mint_job_from_quote's "idempotent
-- via the UNIQUE constraint on issued_quote_id" backstop assumes that
-- constraint exists. It does not appear in any migration (jobs was
-- dashboard-authored pre-migration-history per CLAUDE.md's B2B section) and
-- is not visible in the live types.ts relationships list either. Added here
-- defensively as a partial unique index (nullable column, many jobs have no
-- quote at all -- e.g. term-engagement call-outs) so the idempotency
-- guarantee mint_job_from_quote relies on is actually enforced, not just
-- assumed.
-- =============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS jobs_issued_quote_id_key
  ON public.jobs (issued_quote_id)
  WHERE issued_quote_id IS NOT NULL;

-- =============================================================================
-- B5 (written first since B4 calls it). mint_job_from_quote -- the sole
-- job-minting path, server-side, replacing client-side createJobFromQuote.ts.
-- Ports createJobFromQuote.ts's enrichment (company_id/site_id/asset_id off
-- the source enquiry, confirmed event's job_id link-back) and its sla-clock
-- invocation (moved server-side, following create_callout_job's
-- fire-and-forget-with-guard pattern from 20260711130000).
-- =============================================================================

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
  v_supabase_url    text;
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
  -- (20260711130000): missing settings or a failed net.http_post call are
  -- caught and RAISE WARNING'd, never allowed to roll back job creation.
  v_supabase_url := current_setting('app.settings.supabase_url', true);
  v_service_key  := current_setting('app.settings.service_role_key', true);

  IF v_supabase_url IS NULL OR v_service_key IS NULL THEN
    RAISE WARNING 'mint_job_from_quote: app.settings.supabase_url/service_role_key not configured; SLA clock not started for job %', v_job_id;
  ELSE
    BEGIN
      PERFORM net.http_post(
        url := v_supabase_url || '/functions/v1/sla-clock',
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

REVOKE ALL ON FUNCTION public.mint_job_from_quote(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mint_job_from_quote(uuid) TO service_role;

-- =============================================================================
-- B4. accept_quote_with_slot -- the single atomic confirmation exit from
-- negotiation, usable at any cycle (Phase A hybrid resolution, decision 3b).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.accept_quote_with_slot(p_quote_id uuid, p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quote              public.issued_quotes%ROWTYPE;
  v_event              public.schedule_events%ROWTYPE;
  v_caller_profile_id  uuid;
  v_job_id             uuid;
  v_deposit_due        boolean;
BEGIN
  SELECT id INTO v_caller_profile_id FROM public.profiles WHERE user_id = auth.uid();
  IF v_caller_profile_id IS NULL THEN
    RAISE EXCEPTION 'accept_quote_with_slot: no profile found for caller';
  END IF;

  SELECT * INTO v_quote FROM public.issued_quotes WHERE id = p_quote_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'accept_quote_with_slot: quote % not found', p_quote_id;
  END IF;

  IF v_quote.recipient_id IS DISTINCT FROM v_caller_profile_id THEN
    RAISE EXCEPTION 'accept_quote_with_slot: not authorised to accept quote %', p_quote_id;
  END IF;

  -- See top-of-file NOTE: status IN ('sent','accepted') rather than the
  -- original 'sent'-only text -- required so cycle 2+ confirmations (where
  -- respondToQuote has already flipped status to 'accepted') can succeed.
  IF v_quote.status NOT IN ('sent', 'accepted') THEN
    RAISE EXCEPTION 'accept_quote_with_slot: quote % is not open to acceptance (status=%)', p_quote_id, v_quote.status;
  END IF;

  IF v_quote.valid_until < CURRENT_DATE THEN
    RAISE EXCEPTION 'accept_quote_with_slot: quote % has expired (valid_until=%)', p_quote_id, v_quote.valid_until;
  END IF;

  IF v_quote.recipient_response IS NOT NULL AND v_quote.recipient_response <> 'accepted' THEN
    RAISE EXCEPTION 'accept_quote_with_slot: quote % has already been responded to (%)', p_quote_id, v_quote.recipient_response;
  END IF;

  SELECT * INTO v_event FROM public.schedule_events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'accept_quote_with_slot: schedule proposal % not found', p_event_id;
  END IF;

  IF v_event.quote_id IS DISTINCT FROM p_quote_id THEN
    RAISE EXCEPTION 'accept_quote_with_slot: proposal % does not belong to quote %', p_event_id, p_quote_id;
  END IF;

  IF v_event.event_type <> 'quote_proposal' THEN
    RAISE EXCEPTION 'accept_quote_with_slot: proposal % is not a quote scheduling proposal', p_event_id;
  END IF;

  IF v_event.status <> 'proposed' THEN
    RAISE EXCEPTION 'accept_quote_with_slot: proposal % is no longer available (status=%)', p_event_id, v_event.status;
  END IF;

  -- 1. Confirm the chosen event.
  UPDATE public.schedule_events
  SET status = 'accepted', is_confirmed = true
  WHERE id = p_event_id;

  -- 2. Decline every other still-open proposal for this quote (matches the
  -- negotiation's own vocabulary -- see useQuoteScheduling.ts's acceptProposal).
  UPDATE public.schedule_events
  SET status = 'declined', is_confirmed = false
  WHERE quote_id = p_quote_id
    AND event_type = 'quote_proposal'
    AND status = 'proposed'
    AND id <> p_event_id;

  -- 3. Mark the quote accepted (idempotent if respondToQuote already did this).
  UPDATE public.issued_quotes
  SET recipient_response = 'accepted',
      accepted_at        = COALESCE(accepted_at, now()),
      responded_at       = COALESCE(responded_at, now()),
      status              = CASE WHEN status = 'sent' THEN 'accepted' ELSE status END
  WHERE id = p_quote_id;

  v_deposit_due := COALESCE(v_quote.deposit_required, false) AND COALESCE(v_quote.deposit_amount, 0) > 0;

  -- 4. No deposit due -> mint the job immediately. Deposit due -> the caller
  -- (accept-quote edge function) takes the payment and the stripe-webhook
  -- mints the job on payment success (LOCKED DECISION 1).
  IF NOT v_deposit_due THEN
    v_job_id := public.mint_job_from_quote(p_quote_id);
  END IF;

  RETURN jsonb_build_object(
    'deposit_required', v_deposit_due,
    'deposit_amount',   v_quote.deposit_amount,
    'job_id',           v_job_id,
    'confirmed_start',  v_event.start_time
  );
END;
$$;

REVOKE ALL ON FUNCTION public.accept_quote_with_slot(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_quote_with_slot(uuid, uuid) TO authenticated;

-- =============================================================================
-- B6. Notify trigger on schedule_events proposal batches (quote_proposal and
-- site_visit alike) -- one notification per batch_id, not per row.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.notify_on_schedule_proposal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quote     public.issued_quotes%ROWTYPE;
  v_enquiry   public.enquiries%ROWTYPE;
  v_recipient uuid;
BEGIN
  IF NEW.status <> 'proposed' OR NEW.event_type NOT IN ('quote_proposal', 'site_visit') THEN
    RETURN NEW;
  END IF;

  -- One notification per batch: skip if an earlier row in this batch already
  -- fired one (NULL batch_id rows are treated as their own singleton batch).
  IF NEW.batch_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.schedule_events
    WHERE batch_id = NEW.batch_id AND id <> NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  IF NEW.event_type = 'quote_proposal' THEN
    IF NEW.quote_id IS NULL THEN
      RETURN NEW;
    END IF;

    SELECT * INTO v_quote FROM public.issued_quotes WHERE id = NEW.quote_id;
    IF NOT FOUND THEN
      RETURN NEW;
    END IF;

    v_recipient := CASE WHEN NEW.proposed_by = v_quote.contractor_id THEN v_quote.recipient_id ELSE v_quote.contractor_id END;
    IF v_recipient IS NULL THEN
      RETURN NEW;
    END IF;

    INSERT INTO public.notifications (user_id, title, message, type, reference_type, reference_id)
    VALUES (
      v_recipient, 'New schedule proposal',
      'New date(s) proposed for "' || v_quote.title || '"',
      'slots_proposed', 'issued_quote', v_quote.id
    );
  ELSE
    IF NEW.enquiry_id IS NULL THEN
      RETURN NEW;
    END IF;

    SELECT * INTO v_enquiry FROM public.enquiries WHERE id = NEW.enquiry_id;
    IF NOT FOUND THEN
      RETURN NEW;
    END IF;

    v_recipient := CASE WHEN NEW.proposed_by = v_enquiry.contractor_id THEN v_enquiry.customer_id ELSE v_enquiry.contractor_id END;
    IF v_recipient IS NULL THEN
      RETURN NEW;
    END IF;

    INSERT INTO public.notifications (user_id, title, message, type, reference_type, reference_id)
    VALUES (
      v_recipient, 'Site visit proposed',
      'New site visit date(s) proposed for "' || COALESCE(v_enquiry.title, v_enquiry.job_description) || '"',
      'slots_proposed', 'enquiry', v_enquiry.id
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_schedule_proposal ON public.schedule_events;
CREATE TRIGGER trg_notify_on_schedule_proposal
  AFTER INSERT ON public.schedule_events
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_schedule_proposal();

-- =============================================================================
-- B7. job_scheduling_proposals -- deprecated, pending drop. Confirmed
-- unreferenced by src/ or supabase/functions/ (Phase A grep). Not dropped
-- here -- flagged only.
-- =============================================================================

COMMENT ON TABLE public.job_scheduling_proposals IS
  'DEPRECATED, pending drop. Empty in production; superseded entirely by '
  'schedule_events (event_type = quote_proposal / site_visit). Confirmed '
  'unreferenced by any application or edge-function code as of 2026-07-17. '
  'Do not write new code against this table.';
