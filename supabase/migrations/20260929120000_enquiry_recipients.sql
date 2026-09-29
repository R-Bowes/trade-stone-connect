-- enquiry_recipients: per-contractor status on an enquiry, replacing
-- enquiries.status as contractor-write surface. Today every enquiry has
-- exactly one contractor (enquiries.contractor_id, unchanged, stays as-is)
-- — this migration is a structural move with NO user-visible behaviour
-- change, not the fan-out feature itself. Fan-out (up to 5 recipients,
-- disclosure, structured decline reasons, accept-one-decline-rest) is a
-- later, separate migration.
--
-- Live facts this was written against (queried directly, not from
-- migration files, per CLAUDE.md): 20 live enquiries, all 20 with
-- contractor_id set (zero null), all 20 currently status='converted'.
-- enquiries_status_check CHECK allows ('new','replied','archived',
-- 'declined','converted'); 'archived' has never been written by any code
-- path (grepped) — dead value, carried through below only as a safe
-- fallback branch, never actually hit. No live trigger, function, view,
-- or cron body reads enquiries.status (checked pg_trigger/pg_proc/
-- pg_views directly) — the two triggers added below are the first SQL-
-- level logic ever attached to this column.
--
-- Value sets, deliberately not identical:
--   enquiries.status        (unchanged): new | replied | archived | declined | converted
--   enquiry_recipients.status (new):     invited | viewed | replied | converted | declined
-- 'new'<->'invited' is the only renamed pair; every other value is kept
-- verbatim on purpose (per explicit instruction — renaming 'converted' to
-- 'quoted' at the recipient level is deferred to the fan-out pass, so a
-- structural move and a vocabulary rename aren't both landing in one
-- diff). 'viewed' has no enquiries-side equivalent — nothing writes it
-- yet (no "contractor opened this" tracking exists), it exists on the
-- recipient CHECK purely so the fan-out pass doesn't need a second ALTER
-- to add it. The mirror-up direction maps 'viewed' to enquiries 'new'
-- (never reachable today, since nothing produces a 'viewed' recipient row
-- yet — documented for when something does).
--
-- Mirroring, not aggregating: with exactly one recipient per enquiry
-- (enforced structurally today — nothing creates a second), a "highest-
-- precedence status across this enquiry's recipients" derivation and a
-- "copy the one recipient's status" derivation produce IDENTICAL results.
-- The precedence form is used below so it doesn't need rewriting the
-- day a second recipient exists — but the actual multi-recipient
-- semantics (do you show "quoted" the moment any ONE of five quotes, or
-- only once the homeowner has enough to compare?) is a fan-out design
-- question, not decided here. This migration's derivation is a mirror
-- that happens to be precedence-shaped, not a considered aggregate.
--
-- SendQuoteDialog.tsx is a documented do-not-touch drift file and cannot
-- be edited to write enquiry_recipients directly. It keeps writing
-- enquiries.status = 'converted' exactly as today. A SECOND trigger
-- (enquiries -> enquiry_recipients, "mirror down") exists specifically to
-- carry that write onto the recipient row without touching the file.
-- RejectDialog.tsx and RespondDialog.tsx are NOT drift files (confirmed —
-- not on the do-not-touch list, not mentioned anywhere in CLAUDE.md) and
-- are edited in this same pass to write enquiry_recipients directly.
--
-- RECURSION: two triggers now point at each other —
--   A: enquiries         AFTER INSERT OR UPDATE OF status, contractor_id
--      -> upserts the matching enquiry_recipients row ("mirror down",
--      carries SendQuoteDialog.tsx's write, and also creates the initial
--      recipient row for a newly-inserted enquiry).
--   B: enquiry_recipients AFTER INSERT OR UPDATE OF status
--      -> recomputes and writes enquiries.status ("mirror up", carries
--      RejectDialog.tsx/RespondDialog.tsx's writes).
-- Self-terminating by construction, no session-level guard needed, traced
-- by hand for the SendQuoteDialog case (the two-hop case that matters):
--   1. UPDATE enquiries SET status='converted' fires A (WHEN sees
--      OLD.status IS DISTINCT FROM NEW.status = true).
--   2. A upserts enquiry_recipients; ON CONFLICT DO UPDATE ... WHERE
--      status IS DISTINCT FROM 'converted' — if the recipient's status
--      was anything else, this is a real change, so it fires B.
--   3. B recomputes the derived status from ALL of that enquiry's
--      recipient rows. With one recipient, this is exactly 'converted'
--      -- the same value step 1 already wrote to enquiries.status. B's
--      own UPDATE carries `WHERE status IS DISTINCT FROM v_derived` —
--      enquiries.status is ALREADY 'converted' at this point (set by the
--      original statement in step 1, before either trigger fired), so
--      this WHERE clause matches zero rows. Zero rows changed means no
--      OLD/NEW delta on enquiries, so A's own WHEN clause never
--      re-evaluates true — the chain terminates at depth 2.
-- Both trigger functions ALSO carry a pg_trigger_depth() > 2 guard as a
-- hard backstop — pure defense-in-depth, the natural termination above
-- should never let depth exceed 2, but a future change to the derivation
-- logic (e.g. at fan-out) could accidentally break the "WHERE IS DISTINCT
-- FROM" self-cancellation without anyone noticing until it loops.
--
-- The RECIPIENT-FIRST direction (RejectDialog.tsx/RespondDialog.tsx,
-- which write enquiry_recipients directly) was traced separately, not
-- assumed symmetric with the enquiry-first case above, because A and B
-- are different functions cancelling for different reasons:
--   1. UPDATE enquiry_recipients SET status='declined' fires B (depth 1).
--   2. B derives 'declined' (one recipient, now declined) and writes
--      enquiries.status='declined' — a real change from whatever it was
--      before — firing A (depth 2).
--   3. A computes v_mapped='declined' from NEW.status and tries to write
--      it back onto the SAME recipient row — but that row already holds
--      'declined' (set by the original statement in step 1, before B
--      even ran), so A's own WHERE IS DISTINCT FROM is false here, not
--      B's. Terminates at depth 2 by a different mechanism than the
--      enquiry-first trace, confirmed rather than assumed. Checked all
--      four terminal values (replied/declined/converted map 1:1 in both
--      directions, confirmed clean) except:
--   'new' is NOT 1:1 — it's the mirror of BOTH 'invited' and 'viewed' (no
--   enquiries-side equivalent of 'viewed' exists), so mapping it back
--   down always lands on 'invited'. Without the extra guard on A's
--   ON CONFLICT clause below, a recipient row already at 'viewed' would
--   get silently downgraded to 'invited' the moment anything re-mirrors
--   through 'new' — a real bug, not just an asymmetry, caught by this
--   trace and fixed with a dedicated WHERE clause rather than left as a
--   documented gap. Unreachable today (nothing writes 'viewed' yet).

CREATE TABLE public.enquiry_recipients (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enquiry_id           uuid NOT NULL REFERENCES public.enquiries(id),
  contractor_id        uuid NOT NULL REFERENCES public.profiles(id),
  status               text NOT NULL DEFAULT 'invited'
                         CHECK (status IN ('invited', 'viewed', 'replied', 'converted', 'declined')),
  -- Unused until the fan-out feature lands (structured decline reasons).
  -- No CHECK on decline_reason_code yet — the category set isn't decided.
  decline_reason_code  text,
  decline_reason_note  text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  responded_at         timestamptz,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (enquiry_id, contractor_id)
);

CREATE TRIGGER update_enquiry_recipients_updated_at
  BEFORE UPDATE ON public.enquiry_recipients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── RLS — canonical direct auth.uid() form, matching the enquiries
-- consolidation (20260929100000). No INSERT policy for anyone: rows are
-- only ever created by the SECURITY DEFINER mirror-down trigger or this
-- migration's own backfill, both of which bypass RLS as the function/
-- migration owner — no client-side path creates a row in this phase.
-- No DELETE policy for anyone, matching enquiries.
ALTER TABLE public.enquiry_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY enquiry_recipients_select_contractor ON public.enquiry_recipients
  FOR SELECT
  USING (auth.uid() = contractor_id);

CREATE POLICY enquiry_recipients_select_customer ON public.enquiry_recipients
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.enquiries e
    WHERE e.id = enquiry_recipients.enquiry_id AND e.customer_id = auth.uid()
  ));

CREATE POLICY enquiry_recipients_select_company_member ON public.enquiry_recipients
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.enquiries e
    WHERE e.id = enquiry_recipients.enquiry_id
      AND e.company_id IS NOT NULL
      AND is_company_member(e.company_id)
  ));

CREATE POLICY enquiry_recipients_select_admin ON public.enquiry_recipients
  FOR SELECT
  USING (is_platform_admin());

CREATE POLICY enquiry_recipients_update_contractor ON public.enquiry_recipients
  FOR UPDATE
  USING (auth.uid() = contractor_id)
  WITH CHECK (auth.uid() = contractor_id);

-- ── Backfill — one row per existing enquiry that has a contractor_id,
-- carrying its current status across verbatim (new->invited, everything
-- else unchanged). Pre-flight: table must be empty (this migration has
-- never run before); fail loudly rather than risk duplicate rows on some
-- replay scenario this wasn't written against.
DO $$
DECLARE
  v_existing integer;
  v_null_contractor integer;
BEGIN
  SELECT count(*) INTO v_existing FROM public.enquiry_recipients;
  IF v_existing <> 0 THEN
    RAISE EXCEPTION
      'enquiry_recipients backfill: table already has % row(s) — refusing to backfill a non-empty table.',
      v_existing;
  END IF;

  SELECT count(*) INTO v_null_contractor FROM public.enquiries WHERE contractor_id IS NULL;
  RAISE NOTICE
    'enquiry_recipients backfill: % enquiries have a null contractor_id and will get NO recipient row (nothing to have a recipient for). Audited 2026-09-29 at 0.',
    v_null_contractor;
END $$;

INSERT INTO public.enquiry_recipients (enquiry_id, contractor_id, status, created_at, responded_at)
SELECT
  id,
  contractor_id,
  CASE status
    WHEN 'new' THEN 'invited'
    WHEN 'replied' THEN 'replied'
    WHEN 'declined' THEN 'declined'
    WHEN 'converted' THEN 'converted'
    ELSE 'invited' -- 'archived' or any other unforeseen value — never live-written, safe fallback
  END,
  created_at,
  CASE WHEN status IN ('replied', 'declined', 'converted') THEN updated_at ELSE NULL END
FROM public.enquiries
WHERE contractor_id IS NOT NULL;

DO $$
DECLARE
  v_expected integer;
  v_actual integer;
  v_mismatched integer;
BEGIN
  SELECT count(*) INTO v_expected FROM public.enquiries WHERE contractor_id IS NOT NULL;
  SELECT count(*) INTO v_actual FROM public.enquiry_recipients;
  IF v_actual <> v_expected THEN
    RAISE EXCEPTION
      'enquiry_recipients backfill: expected % rows (one per enquiry with a contractor_id), got %.',
      v_expected, v_actual;
  END IF;

  SELECT count(*) INTO v_mismatched
  FROM public.enquiries e
  JOIN public.enquiry_recipients r ON r.enquiry_id = e.id AND r.contractor_id = e.contractor_id
  WHERE r.status <> CASE e.status
    WHEN 'new' THEN 'invited'
    WHEN 'replied' THEN 'replied'
    WHEN 'declined' THEN 'declined'
    WHEN 'converted' THEN 'converted'
    ELSE 'invited'
  END;
  IF v_mismatched <> 0 THEN
    RAISE EXCEPTION
      'enquiry_recipients backfill: % row(s) have a status that does not match their source enquiry.',
      v_mismatched;
  END IF;
END $$;

-- ── Trigger A: enquiries -> enquiry_recipients ("mirror down"). Carries
-- SendQuoteDialog.tsx's still-direct enquiries.status write onto the
-- recipient row, and creates the initial recipient row when a new
-- enquiry is inserted with a contractor_id (the backfill above only
-- covers enquiries that existed before this migration).
CREATE OR REPLACE FUNCTION public.mirror_enquiry_status_to_recipient()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_mapped text;
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

  INSERT INTO public.enquiry_recipients (enquiry_id, contractor_id, status, responded_at)
  VALUES (
    NEW.id,
    NEW.contractor_id,
    v_mapped,
    CASE WHEN v_mapped IN ('replied', 'declined', 'converted') THEN now() ELSE NULL END
  )
  ON CONFLICT (enquiry_id, contractor_id) DO UPDATE
    SET status = EXCLUDED.status,
        responded_at = COALESCE(public.enquiry_recipients.responded_at, EXCLUDED.responded_at),
        updated_at = now()
    -- 'new' is a lossy mirror of BOTH 'invited' and 'viewed' (no
    -- enquiries-side equivalent of 'viewed' exists) — mapping it back
    -- down always produces 'invited', which would silently downgrade an
    -- existing 'viewed' row. Traced by hand (see header): this is the one
    -- transition where A and B's IS DISTINCT FROM guards do NOT cancel
    -- each other by symmetry, so it needs its own guard rather than
    -- relying on the general one below. Unreachable today (nothing writes
    -- 'viewed' yet) but a real data-loss bug the moment something does.
    WHERE public.enquiry_recipients.status IS DISTINCT FROM EXCLUDED.status
      AND NOT (EXCLUDED.status = 'invited' AND public.enquiry_recipients.status = 'viewed');

  RETURN NEW;
END;
$$;

-- Split into two triggers, not one combined "INSERT OR UPDATE" — Postgres
-- rejects a WHEN clause referencing OLD on a trigger that can fire for
-- INSERT (42P17: "INSERT trigger's WHEN condition cannot reference OLD
-- values"), even though OLD would simply read as NULL there. Same
-- function, no behaviour difference from the single-trigger design this
-- was originally written as — the INSERT trigger fires unconditionally
-- (bar the contractor_id NOT NULL guard), which is exactly what "OLD IS
-- NULL, therefore always distinct" would have produced anyway.
CREATE TRIGGER enquiries_mirror_status_to_recipient_ins
  AFTER INSERT ON public.enquiries
  FOR EACH ROW
  WHEN (NEW.contractor_id IS NOT NULL)
  EXECUTE FUNCTION public.mirror_enquiry_status_to_recipient();

CREATE TRIGGER enquiries_mirror_status_to_recipient_upd
  AFTER UPDATE OF status, contractor_id ON public.enquiries
  FOR EACH ROW
  WHEN (
    NEW.contractor_id IS NOT NULL
    AND (OLD.status IS DISTINCT FROM NEW.status OR OLD.contractor_id IS DISTINCT FROM NEW.contractor_id)
  )
  EXECUTE FUNCTION public.mirror_enquiry_status_to_recipient();

-- ── Trigger B: enquiry_recipients -> enquiries ("mirror up"). Carries
-- RejectDialog.tsx/RespondDialog.tsx's new direct writes back onto
-- enquiries.status, which nothing writes directly anymore except
-- SendQuoteDialog.tsx (via trigger A above, not this one).
CREATE OR REPLACE FUNCTION public.mirror_recipient_status_to_enquiry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_derived text;
BEGIN
  IF pg_trigger_depth() > 2 THEN
    RETURN NEW;
  END IF;

  -- Precedence across this enquiry's recipient rows — see header note:
  -- identical to "copy the one recipient" while exactly one exists.
  SELECT CASE
    WHEN bool_or(status = 'converted') THEN 'converted'
    WHEN bool_or(status = 'declined')  THEN 'declined'
    WHEN bool_or(status = 'replied')   THEN 'replied'
    ELSE 'new' -- invited or viewed, both read as "no response yet" from the enquiries side
  END
  INTO v_derived
  FROM public.enquiry_recipients
  WHERE enquiry_id = NEW.enquiry_id;

  UPDATE public.enquiries
  SET status = v_derived
  WHERE id = NEW.enquiry_id
    AND status IS DISTINCT FROM v_derived;

  RETURN NEW;
END;
$$;

-- Same split as trigger A above, same reason (42P17).
CREATE TRIGGER enquiry_recipients_mirror_status_to_enquiry_ins
  AFTER INSERT ON public.enquiry_recipients
  FOR EACH ROW
  EXECUTE FUNCTION public.mirror_recipient_status_to_enquiry();

CREATE TRIGGER enquiry_recipients_mirror_status_to_enquiry_upd
  AFTER UPDATE OF status ON public.enquiry_recipients
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.mirror_recipient_status_to_enquiry();
