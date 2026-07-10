-- =============================================================================
-- 20260710160000_tender_clarifications_and_addenda.sql
-- Tendering chunk 3 (remainder): tender_clarifications + tender_addenda,
-- plus the tender_documents.addendum_id FK deferred from chunk 2.
-- Source of truth: TENDERING-SCHEMA.md CHUNK 3. tender_invitations already
-- shipped in 20260710150000 (chunk 2).
--
-- Two additions beyond the doc's literal column list, both flagged here:
--
-- 1. tender_addenda.sequence is per-tender, server-assigned, never
--    client-supplied (per the Conventions header). The doc gives no
--    allocator for it (it isn't one of the T-/TA-/TE- document families),
--    so a dedicated business_counters-style table would be overkill for a
--    low-frequency, single-party-writes field. Instead: a BEFORE INSERT
--    trigger takes `SELECT ... FOR UPDATE` on the parent tenders row (the
--    row every addendum-issuing business member already has UPDATE rights
--    on via tenders_business_all), serializing concurrent addendum inserts
--    for the same tender, then computes MAX(sequence)+1. The
--    UNIQUE(tender_id, sequence) constraint is the backstop if that ever
--    fails to serialize.
--
-- 2. The new_deadline -> tenders.response_deadline propagation and the
--    submitted -> reconfirm_requested flip are both implemented now, in one
--    AFTER INSERT trigger, rather than deferring either to chunk 4.
--    Reasoning: the new_deadline propagation has no forward dependency and
--    is needed as soon as addenda exist. The reconfirm_requested arm is
--    guarded with `to_regclass('public.tender_applications') IS NOT NULL`
--    and reaches the table only via dynamic SQL (EXECUTE ... USING) so the
--    static function body never references a table that doesn't exist yet
--    (plpgsql's compile-time check would otherwise fail CREATE FUNCTION
--    outright, since check_function_bodies is on by default). This means
--    chunk 4 activates the arm simply by creating tender_applications — no
--    second migration needs to touch this trigger.
--
-- Both trigger functions are SECURITY DEFINER, per the Conventions header
-- ("State transitions with consequences run through SECURITY DEFINER
-- functions, not raw UPDATEs") — the addendum-triggered status flip must
-- succeed regardless of the inserting business member's own row-level
-- write permissions on tender_applications, whatever chunk 4's RLS on that
-- table turns out to require.
-- =============================================================================


-- =============================================================================
-- 1. TENDER_CLARIFICATIONS
-- =============================================================================

CREATE TABLE public.tender_clarifications (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id    uuid        NOT NULL REFERENCES public.tenders(id)  ON DELETE CASCADE,
  asked_by     uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  question     text        NOT NULL,
  answer       text        NULL,
  answered_by  uuid        NULL     REFERENCES public.profiles(id) ON DELETE SET NULL,
  answered_at  timestamptz NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tender_clarifications_tender_id ON public.tender_clarifications(tender_id);
CREATE INDEX idx_tender_clarifications_asked_by  ON public.tender_clarifications(asked_by);

ALTER TABLE public.tender_clarifications ENABLE ROW LEVEL SECURITY;

-- Business: see every clarification for their tenders.
CREATE POLICY "tender_clarifications_business_select"
ON public.tender_clarifications FOR SELECT TO authenticated
USING (is_company_member(tender_company_id(tender_id)));

-- Business: answer transition only. USING requires the row to be
-- currently unanswered; WITH CHECK requires the resulting row to be
-- answered. Same non-column-level idiom as the rest of this build (RLS
-- constrains which state transitions are legal, not which columns moved
-- within the row) — UI supplies answer/answered_by/answered_at together.
CREATE POLICY "tender_clarifications_business_answer"
ON public.tender_clarifications FOR UPDATE TO authenticated
USING       (is_company_member(tender_company_id(tender_id)) AND answer IS NULL)
WITH CHECK  (is_company_member(tender_company_id(tender_id)) AND answer IS NOT NULL);

-- Contractor: ask a question on any tender they can see.
CREATE POLICY "tender_clarifications_contractor_insert"
ON public.tender_clarifications FOR INSERT TO authenticated
WITH CHECK (contractor_can_view_tender(tender_id) AND asked_by = auth.uid());

-- Contractor: own questions always; other bidders' questions only once
-- answered (sealed principle — an unanswered pool would leak who's
-- bidding). NOTE: this is row visibility, not column redaction — see the
-- header note on asker anonymisation below.
CREATE POLICY "tender_clarifications_contractor_select"
ON public.tender_clarifications FOR SELECT TO authenticated
USING (
  contractor_can_view_tender(tender_id)
  AND (asked_by = auth.uid() OR answer IS NOT NULL)
);

-- No DELETE policy for anyone, on either role: append-only by omission,
-- matching the doc ("No edits post-answer; corrections are new
-- clarifications or addenda").

-- -----------------------------------------------------------------------
-- Asker anonymisation: RLS controls which ROWS a contractor can read, not
-- which COLUMNS within an allowed row are visible — Postgres RLS has no
-- column-level masking. Once "tender_clarifications_contractor_select"
-- lets a contractor read another bidder's answered row, asked_by is present
-- in that row at the SQL/PostgREST level like any other column. The doc
-- already accounts for this ("UI anonymises; business sees asker") — this
-- is a deliberate soft (client-trust) boundary, not a DB-enforced one, and
-- this migration does not change that. The frontend must never render
-- asked_by (or resolve it to a name) for a row where asked_by != the
-- viewing contractor's own id. If a hard DB-enforced boundary is ever
-- required, the fix is a SECURITY DEFINER view/RPC that nulls asked_by
-- server-side for the "other bidders' answered" arm — not needed now.
-- -----------------------------------------------------------------------


-- =============================================================================
-- 2. TENDER_ADDENDA
-- =============================================================================

CREATE TABLE public.tender_addenda (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id     uuid        NOT NULL REFERENCES public.tenders(id)  ON DELETE CASCADE,
  sequence      int         NOT NULL,
  summary       text        NOT NULL,
  detail        text        NULL,
  new_deadline  timestamptz NULL,
  issued_by     uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tender_addenda_tender_sequence_key UNIQUE (tender_id, sequence)
);

CREATE INDEX idx_tender_addenda_tender_id  ON public.tender_addenda(tender_id);
CREATE INDEX idx_tender_addenda_issued_by  ON public.tender_addenda(issued_by);

ALTER TABLE public.tender_addenda ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tender_addenda_business_select"
ON public.tender_addenda FOR SELECT TO authenticated
USING (is_company_member(tender_company_id(tender_id)));

CREATE POLICY "tender_addenda_business_insert"
ON public.tender_addenda FOR INSERT TO authenticated
WITH CHECK (is_company_member(tender_company_id(tender_id)));

CREATE POLICY "tender_addenda_contractor_select"
ON public.tender_addenda FOR SELECT TO authenticated
USING (contractor_can_view_tender(tender_id));

-- No UPDATE, no DELETE policy for anyone: immutable by absence, per the
-- doc ("Immutable once issued: NO update policy exists. Mistakes -> next
-- addendum.").

-- Sequence allocation: see header note. Locks the parent tender row for
-- the duration of the inserting transaction, then takes MAX(sequence)+1.
CREATE OR REPLACE FUNCTION public.assign_addendum_sequence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.sequence IS NULL THEN
    PERFORM 1 FROM public.tenders WHERE id = NEW.tender_id FOR UPDATE;

    SELECT COALESCE(MAX(sequence), 0) + 1 INTO NEW.sequence
    FROM public.tender_addenda
    WHERE tender_id = NEW.tender_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER assign_addendum_sequence_trigger
  BEFORE INSERT ON public.tender_addenda
  FOR EACH ROW EXECUTE FUNCTION public.assign_addendum_sequence();

-- Side effects on issue: propagate new_deadline to tenders.response_deadline
-- (unconditional, no forward dependency); flip submitted applications to
-- reconfirm_requested (guarded — see header note; chunk 4 activates this
-- arm by creating tender_applications, no further change needed here).
CREATE OR REPLACE FUNCTION public.apply_addendum_effects()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.new_deadline IS NOT NULL THEN
    UPDATE public.tenders
    SET response_deadline = NEW.new_deadline
    WHERE id = NEW.tender_id;
  END IF;

  IF to_regclass('public.tender_applications') IS NOT NULL THEN
    EXECUTE 'UPDATE public.tender_applications
             SET status = $1
             WHERE tender_id = $2 AND status = $3'
    USING 'reconfirm_requested', NEW.tender_id, 'submitted';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER apply_addendum_effects_trigger
  AFTER INSERT ON public.tender_addenda
  FOR EACH ROW EXECUTE FUNCTION public.apply_addendum_effects();


-- =============================================================================
-- 3. DEFERRED FK: tender_documents.addendum_id -> tender_addenda(id)
-- Per the header note in 20260710150000. ON DELETE SET NULL: an addendum
-- is immutable and never deleted in normal operation, but the attachment
-- link must not block or cascade-destroy the underlying tender_documents
-- row if that ever changes.
-- =============================================================================

ALTER TABLE public.tender_documents
  ADD CONSTRAINT tender_documents_addendum_id_fkey
  FOREIGN KEY (addendum_id) REFERENCES public.tender_addenda(id) ON DELETE SET NULL;

CREATE INDEX idx_tender_documents_addendum_id
  ON public.tender_documents(addendum_id) WHERE addendum_id IS NOT NULL;
