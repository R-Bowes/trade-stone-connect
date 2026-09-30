-- Step 1 of the compare-quotes feature: fan-out support for
-- enquiry_recipients. The cap and the "nothing accepted yet" rule are
-- enforced at the database, not just in the UI that calls this — any
-- insert path (the new multi-recipient edge function, a future
-- add-one-more RPC, a script) goes through the same trigger.
--
-- No new RLS INSERT policy is added. enquiry_recipients already has zero
-- INSERT policies for any party (by design, see the original migration) —
-- every row is created either by the mirror-down trigger (SECURITY
-- DEFINER, single-recipient path) or, as of this migration, by
-- SECURITY DEFINER functions (add_enquiry_recipient, called from the new
-- edge function and from any future "add one more" UI). Neither needs a
-- client-facing INSERT policy since neither is ever called as a raw
-- client insert.

-- ── Cap + "nothing accepted" guard, enforced on every insert ──────────
-- "Accepted" is read from issued_quotes.recipient_response = 'accepted'
-- (the existing, already-live acceptance signal) rather than
-- enquiry_recipients.status — Step 2 (accept/decline) hasn't landed yet,
-- and recipient status alone can't yet distinguish "sent a quote" from
-- "had that quote accepted". This trigger will keep working unchanged
-- once Step 2 adds the SECURITY DEFINER accept function, since that
-- function's job is precisely to set recipient_response = 'accepted'.
CREATE OR REPLACE FUNCTION public.enforce_enquiry_recipient_limits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_existing integer;
  v_accepted integer;
BEGIN
  SELECT count(*) INTO v_existing
  FROM public.enquiry_recipients
  WHERE enquiry_id = NEW.enquiry_id;

  IF v_existing >= 5 THEN
    RAISE EXCEPTION 'enquiry_recipients: enquiry % already has 5 recipients (the hard cap) — cannot add another.', NEW.enquiry_id
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO v_accepted
  FROM public.issued_quotes q
  WHERE q.enquiry_id = NEW.enquiry_id AND q.recipient_response = 'accepted';

  IF v_accepted > 0 THEN
    RAISE EXCEPTION 'enquiry_recipients: enquiry % already has an accepted quote — cannot add another recipient.', NEW.enquiry_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER enquiry_recipients_enforce_limits
  BEFORE INSERT ON public.enquiry_recipients
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_enquiry_recipient_limits();

-- ── add_enquiry_recipient — the only path (besides the mirror-down
-- trigger and this migration's own absence of a backfill, since fan-out
-- enquiries are created fresh) that ever inserts an enquiry_recipients
-- row. Used by the new multi-recipient edge function for initial
-- creation AND by any future "add one more while nothing's accepted" UI
-- — same function, same guarantees, called with a different recipient
-- count context. SECURITY DEFINER so it can insert regardless of the
-- caller's own RLS grants (there are none for enquiry_recipients INSERT
-- by design), but it re-derives the caller's right to act on this
-- enquiry itself rather than trusting the caller blindly: only the
-- enquiry's own customer_id, or a company member when the enquiry is a
-- company enquiry, may add a recipient.
CREATE OR REPLACE FUNCTION public.add_enquiry_recipient(p_enquiry_id uuid, p_contractor_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_customer_id uuid;
  v_company_id uuid;
  v_recipient_id uuid;
BEGIN
  SELECT customer_id, company_id INTO v_customer_id, v_company_id
  FROM public.enquiries WHERE id = p_enquiry_id;

  IF v_customer_id IS NULL AND v_company_id IS NULL THEN
    RAISE EXCEPTION 'add_enquiry_recipient: enquiry % not found', p_enquiry_id;
  END IF;

  IF NOT (
    auth.uid() = v_customer_id
    OR (v_company_id IS NOT NULL AND is_company_member(v_company_id))
  ) THEN
    RAISE EXCEPTION 'add_enquiry_recipient: not authorised to add a recipient to enquiry %', p_enquiry_id;
  END IF;

  INSERT INTO public.enquiry_recipients (enquiry_id, contractor_id, status)
  VALUES (p_enquiry_id, p_contractor_id, 'invited')
  RETURNING id INTO v_recipient_id;

  RETURN v_recipient_id;
END;
$$;

REVOKE ALL ON FUNCTION public.add_enquiry_recipient(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_enquiry_recipient(uuid, uuid) TO authenticated;

-- ── Disclosure — "this job is being quoted by others", never a count.
-- A boolean-returning SECURITY DEFINER function is the same technique
-- TENDERING-SCHEMA.md's "4 of 6 received" counter uses to keep a number
-- out of client reach — here even more conservative: not a count, a
-- boolean, so there is nothing to subtract or compare across two reads
-- to infer a delta. Safe to expose to any authenticated caller (it reads
-- no PII, names no one, and returning true/false for an enquiry the
-- caller has no relationship to leaks nothing they don't already not-know) —
-- but every real call site only ever calls it for an enquiry the caller
-- is already a recipient of.
CREATE OR REPLACE FUNCTION public.enquiry_has_multiple_recipients(p_enquiry_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT count(*) > 1 FROM public.enquiry_recipients WHERE enquiry_id = p_enquiry_id;
$$;

REVOKE ALL ON FUNCTION public.enquiry_has_multiple_recipients(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enquiry_has_multiple_recipients(uuid) TO authenticated;
