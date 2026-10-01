-- Fixes a real bug surfaced by the single-recipient accept proof (not
-- found by inspection): mirror_enquiry_status_to_recipient always issues
-- an INSERT ... ON CONFLICT DO UPDATE against enquiry_recipients, even
-- when it is re-touching a row that already exists for this
-- (enquiry_id, contractor_id) pair — which is the common case once a
-- recipient row exists at all, not the exception. Postgres fires BEFORE
-- INSERT triggers before it evaluates whether the conflict clause will
-- turn the statement into an update, so enforce_enquiry_recipient_limits
-- (a BEFORE INSERT trigger, correctly guarding genuine new-recipient
-- inserts) saw every one of these re-touches as if it were "adding a
-- recipient" too.
--
-- Once accept_quote_with_slot sets enquiry_recipients.status='accepted',
-- that enquiry permanently has an accepted quote — so the "nothing
-- accepted yet" guard then hard-failed on every subsequent mirror-down
-- upsert for that enquiry, including the one the acceptance chain itself
-- triggers: accepting the sole recipient's quote fires
-- mirror_recipient_status_to_enquiry (writes enquiries.status =
-- 'converted'), which fires mirror_enquiry_status_to_recipient (re-touches
-- the SAME recipient row it just came from via the upsert idiom), which
-- hit the cap trigger, which raised "already has an accepted quote"
-- against the transaction that is itself the acceptance.
--
-- Confirmed NOT reachable on live data as of this migration (checked:
-- zero enquiries exist where a quote is sent/accepted but the enquiry's
-- own status isn't yet 'converted' — the only vulnerable precondition)
-- — SendQuoteDialog.tsx always writes issued_quotes.status='sent' and
-- enquiries.status='converted' together, so in every real acceptance the
-- mirror-up write already finds enquiries.status unchanged and never
-- cascades to the mirror-down trigger at all. Still a real bug: the one
-- reachable route is AdminDashboard.tsx's contractor-reassignment path,
-- which writes enquiries.contractor_id directly and could do so after a
-- quote has already been accepted.
--
-- Fix shape, per explicit instruction: the cap trigger's guard is
-- correct and stays exactly as Step 1 wrote it — the mirror reaching it
-- on a non-insert is what's wrong. mirror_enquiry_status_to_recipient now
-- checks for an existing row first and issues a direct UPDATE for it,
-- never an INSERT — so enforce_enquiry_recipient_limits (BEFORE INSERT)
-- only ever fires for a row that doesn't exist yet, exactly the
-- "genuinely adding a recipient" case it was built to guard.
CREATE OR REPLACE FUNCTION public.mirror_enquiry_status_to_recipient()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_mapped text;
  v_exists boolean;
BEGIN
  IF pg_trigger_depth() > 2 THEN
    RETURN NEW;
  END IF;

  v_mapped := CASE NEW.status
    WHEN 'new' THEN 'invited'
    WHEN 'replied' THEN 'replied'
    WHEN 'declined' THEN 'declined'
    WHEN 'converted' THEN 'converted'
    ELSE 'invited'
  END;

  SELECT EXISTS (
    SELECT 1 FROM public.enquiry_recipients
    WHERE enquiry_id = NEW.id AND contractor_id = NEW.contractor_id
  ) INTO v_exists;

  IF v_exists THEN
    UPDATE public.enquiry_recipients
    SET status = v_mapped,
        responded_at = CASE
          WHEN v_mapped IN ('replied', 'declined', 'converted') THEN COALESCE(responded_at, now())
          ELSE responded_at
        END,
        updated_at = now()
    WHERE enquiry_id = NEW.id
      AND contractor_id = NEW.contractor_id
      AND status IS DISTINCT FROM v_mapped
      AND NOT (v_mapped = 'invited' AND status = 'viewed')
      AND NOT (v_mapped = 'converted' AND status = 'accepted');
  ELSE
    INSERT INTO public.enquiry_recipients (enquiry_id, contractor_id, status, responded_at)
    VALUES (
      NEW.id,
      NEW.contractor_id,
      v_mapped,
      CASE WHEN v_mapped IN ('replied', 'declined', 'converted') THEN now() ELSE NULL END
    );
  END IF;

  RETURN NEW;
END;
$$;
