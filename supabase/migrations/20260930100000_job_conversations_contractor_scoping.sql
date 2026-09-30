-- Scope job_conversations to (context-key, contractor_id), not job_id/
-- enquiry_id/issued_quote_id alone. The enquiry context is the only one
-- that's actually unsafe today (job_id already carries a UNIQUE
-- constraint; issued_quote_id is safe by construction since each
-- contractor's quote against a shared enquiry gets its own row) — but
-- contractor_id is backfilled onto ALL THREE contexts so every future
-- RLS policy and is_conversation_party() check the contractor party with
-- one direct column comparison instead of three different per-context
-- joins. Job and quote contexts don't change behaviour; they just stop
-- needing a join to prove what was already true.
--
-- Live facts this was written against (queried directly): 16 rows total
-- (3 enquiry, 3 quote, 10 job context). Zero enquiries with more than one
-- conversation row, zero quotes with more than one. Every live row's
-- source (jobs.contractor_id / issued_quotes.contractor_id /
-- enquiries.contractor_id) is non-null and exists — zero orphans, zero
-- rows the backfill can't populate. jobs.contractor_id and
-- issued_quotes.contractor_id are already NOT NULL at the schema level;
-- enquiries.contractor_id is nullable in schema but had zero live nulls
-- among rows with an existing conversation.
--
-- contractor_id is NOT NULL, not nullable-for-now: every conversation in
-- this product is customer-to-contractor. A null here would mean an
-- orphaned conversation with no contractor party at all — the pre-flight
-- check below fails loudly rather than silently allowing that state to
-- exist (per CLAUDE.md's pre-flight-fails-not-silently-proceeds rule).

ALTER TABLE public.job_conversations
  ADD COLUMN contractor_id uuid REFERENCES public.profiles(id);

UPDATE public.job_conversations jc
SET contractor_id = j.contractor_id
FROM public.jobs j
WHERE jc.job_id = j.id AND jc.contractor_id IS NULL;

UPDATE public.job_conversations jc
SET contractor_id = q.contractor_id
FROM public.issued_quotes q
WHERE jc.issued_quote_id = q.id AND jc.contractor_id IS NULL;

UPDATE public.job_conversations jc
SET contractor_id = e.contractor_id
FROM public.enquiries e
WHERE jc.enquiry_id = e.id AND jc.contractor_id IS NULL;

DO $$
DECLARE
  v_unbackfilled integer;
BEGIN
  SELECT count(*) INTO v_unbackfilled FROM public.job_conversations WHERE contractor_id IS NULL;
  IF v_unbackfilled <> 0 THEN
    RAISE EXCEPTION
      'job_conversations contractor_id backfill: % row(s) could not be populated from their context table (orphaned conversation — its job/quote/enquiry has no contractor, or no longer exists). Resolve manually before applying NOT NULL.',
      v_unbackfilled;
  END IF;
END $$;

ALTER TABLE public.job_conversations
  ALTER COLUMN contractor_id SET NOT NULL;

-- The actual fix: a duplicate enquiry-thread-per-contractor becomes
-- structurally impossible, not just conventionally avoided. Partial (not
-- a plain UNIQUE(enquiry_id, contractor_id)) because enquiry_id is null
-- for job/quote-context rows and a plain unique index would otherwise
-- treat every pair of NULLs as non-distinct-enough to matter (it
-- wouldn't actually collide — NULLs are never equal to each other in a
-- unique index — but scoping the index to WHERE enquiry_id IS NOT NULL
-- keeps its purpose explicit and keeps it out of the job/quote contexts'
-- way entirely, which already have their own uniqueness story).
CREATE UNIQUE INDEX job_conversations_enquiry_contractor_key
  ON public.job_conversations (enquiry_id, contractor_id)
  WHERE enquiry_id IS NOT NULL;

-- ── RLS — canonical form, one policy per command per party, matching the
-- enquiries and enquiry_recipients consolidations. The contractor side is
-- now a direct column comparison; the customer side still needs the
-- per-context join (no customer_id column added — every context already
-- has exactly one customer, no analogous ambiguity to fix).
DROP POLICY "Participants can view their conversations" ON public.job_conversations;
DROP POLICY "Participants can insert conversations" ON public.job_conversations;
DROP POLICY "Participants can update their conversations" ON public.job_conversations;
-- admin_select_job_conversations (is_platform_admin()) is already canonical — untouched.

CREATE POLICY job_conversations_select_contractor ON public.job_conversations
  FOR SELECT
  USING (auth.uid() = contractor_id);

CREATE POLICY job_conversations_select_customer ON public.job_conversations
  FOR SELECT
  USING (
    (job_id IS NOT NULL AND job_id IN (SELECT j.id FROM public.jobs j WHERE j.customer_id = auth.uid()))
    OR (enquiry_id IS NOT NULL AND enquiry_id IN (SELECT e.id FROM public.enquiries e WHERE e.customer_id = auth.uid()))
    OR (issued_quote_id IS NOT NULL AND issued_quote_id IN (SELECT q.id FROM public.issued_quotes q WHERE q.recipient_id = auth.uid()))
  );

CREATE POLICY job_conversations_insert_contractor ON public.job_conversations
  FOR INSERT
  WITH CHECK (auth.uid() = contractor_id);

CREATE POLICY job_conversations_insert_customer ON public.job_conversations
  FOR INSERT
  WITH CHECK (
    (job_id IS NOT NULL AND job_id IN (SELECT j.id FROM public.jobs j WHERE j.customer_id = auth.uid()))
    OR (enquiry_id IS NOT NULL AND enquiry_id IN (SELECT e.id FROM public.enquiries e WHERE e.customer_id = auth.uid()))
    OR (issued_quote_id IS NOT NULL AND issued_quote_id IN (SELECT q.id FROM public.issued_quotes q WHERE q.recipient_id = auth.uid()))
  );

CREATE POLICY job_conversations_update_contractor ON public.job_conversations
  FOR UPDATE
  USING (auth.uid() = contractor_id);

CREATE POLICY job_conversations_update_customer ON public.job_conversations
  FOR UPDATE
  USING (
    (job_id IS NOT NULL AND job_id IN (SELECT j.id FROM public.jobs j WHERE j.customer_id = auth.uid()))
    OR (enquiry_id IS NOT NULL AND enquiry_id IN (SELECT e.id FROM public.enquiries e WHERE e.customer_id = auth.uid()))
    OR (issued_quote_id IS NOT NULL AND issued_quote_id IN (SELECT q.id FROM public.issued_quotes q WHERE q.recipient_id = auth.uid()))
  );

-- ── is_conversation_party() — this is the one job_messages RLS actually
-- calls, and it had the SAME root-cause join as job_conversations' own
-- old RLS (checking e.contractor_id, the single legacy scalar). Now a
-- single direct comparison on the conversation row's own contractor_id
-- instead of three per-context joins for the contractor side. Customer
-- side unchanged (still needs the per-context join).
CREATE OR REPLACE FUNCTION public.is_conversation_party(p_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.job_conversations jc
    LEFT JOIN public.jobs j ON j.id = jc.job_id
    LEFT JOIN public.enquiries e ON e.id = jc.enquiry_id
    LEFT JOIN public.issued_quotes q ON q.id = jc.issued_quote_id
    WHERE jc.id = p_conversation_id
      AND (
        jc.contractor_id IN (SELECT public.acting_contractor_ids())
        OR j.customer_id IN (SELECT public.acting_contractor_ids())
        OR e.customer_id IN (SELECT public.acting_contractor_ids())
        OR q.recipient_id IN (SELECT public.acting_contractor_ids())
      )
  );
$function$;

-- ── Post-check
DO $$
DECLARE
  v_select integer;
  v_insert integer;
  v_update integer;
  v_null integer;
  v_dupes integer;
BEGIN
  SELECT count(*) INTO v_select FROM pg_policies WHERE schemaname='public' AND tablename='job_conversations' AND cmd='SELECT';
  SELECT count(*) INTO v_insert FROM pg_policies WHERE schemaname='public' AND tablename='job_conversations' AND cmd='INSERT';
  SELECT count(*) INTO v_update FROM pg_policies WHERE schemaname='public' AND tablename='job_conversations' AND cmd='UPDATE';
  IF v_select <> 3 OR v_insert <> 2 OR v_update <> 2 THEN
    RAISE EXCEPTION
      'job_conversations RLS post-check failed — select=% (expected 3: contractor/customer/admin) insert=% (expected 2) update=% (expected 2)',
      v_select, v_insert, v_update;
  END IF;

  SELECT count(*) INTO v_null FROM public.job_conversations WHERE contractor_id IS NULL;
  IF v_null <> 0 THEN
    RAISE EXCEPTION 'job_conversations post-check: % row(s) with null contractor_id after NOT NULL was set — should be impossible.', v_null;
  END IF;

  SELECT count(*) INTO v_dupes FROM (
    SELECT enquiry_id, contractor_id FROM public.job_conversations
    WHERE enquiry_id IS NOT NULL GROUP BY enquiry_id, contractor_id HAVING count(*) > 1
  ) d;
  IF v_dupes <> 0 THEN
    RAISE EXCEPTION 'job_conversations post-check: % duplicate (enquiry_id, contractor_id) pair(s) survived — UNIQUE index should have prevented this.', v_dupes;
  END IF;
END $$;
