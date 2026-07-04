-- 20260704150000_quote_context_conversations.sql
-- Consolidates messaging on job_conversations/job_messages: adds quote
-- context so pre-job threads (scheduling dead-end, quote discussion)
-- live in the system the inboxes actually read. Legacy
-- conversations/messages tables have writers but no readers; writers
-- are repointed in the companion frontend commit, table retirement in
-- a later drop migration.
-- Also fixes a latent RLS hole: all four policies authorised via
-- job_id only, making enquiry-context threads invisible and quote
-- threads impossible. Policies become context-aware (job/enquiry/quote).

ALTER TABLE public.job_conversations
  ADD COLUMN issued_quote_id uuid REFERENCES public.issued_quotes(id);

ALTER TABLE public.job_conversations
  ADD CONSTRAINT job_conversations_single_context CHECK (
    (job_id IS NOT NULL)::int
    + (enquiry_id IS NOT NULL)::int
    + (issued_quote_id IS NOT NULL)::int = 1
  );

-- Party test for an EXISTING conversation, any context.
CREATE OR REPLACE FUNCTION public.is_conversation_party(p_conversation_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.job_conversations jc
    LEFT JOIN public.jobs j ON j.id = jc.job_id
    LEFT JOIN public.enquiries e ON e.id = jc.enquiry_id
    LEFT JOIN public.issued_quotes q ON q.id = jc.issued_quote_id
    JOIN public.profiles p ON p.user_id = auth.uid()
    WHERE jc.id = p_conversation_id
      AND (
        p.id IN (j.contractor_id, j.customer_id)
        OR p.id IN (e.contractor_id, e.customer_id)
        OR p.id IN (q.contractor_id, q.recipient_id)
      )
  );
$$;

-- SELECT / UPDATE: context-aware via the helper.
DROP POLICY "Participants can view their job conversations" ON public.job_conversations;
CREATE POLICY "Participants can view their conversations"
  ON public.job_conversations FOR SELECT
  USING (public.is_conversation_party(id));

DROP POLICY "Participants can update their job conversations" ON public.job_conversations;
CREATE POLICY "Participants can update their conversations"
  ON public.job_conversations FOR UPDATE
  USING (public.is_conversation_party(id));

DROP POLICY "Participants can view messages in their conversations" ON public.job_messages;
CREATE POLICY "Participants can view messages in their conversations"
  ON public.job_messages FOR SELECT
  USING (public.is_conversation_party(conversation_id));

DROP POLICY "Participants can mark messages as read" ON public.job_messages;
CREATE POLICY "Participants can mark messages as read"
  ON public.job_messages FOR UPDATE
  USING (public.is_conversation_party(conversation_id));

-- Conversation INSERT: inline check on the NEW row's context columns
-- (helper can't see a row that doesn't exist yet).
DROP POLICY "Participants can insert job conversations" ON public.job_conversations;
CREATE POLICY "Participants can insert conversations"
  ON public.job_conversations FOR INSERT
  WITH CHECK (
    (job_id IS NOT NULL AND job_id IN (
      SELECT j.id FROM public.jobs j
      JOIN public.profiles p ON p.id IN (j.contractor_id, j.customer_id)
      WHERE p.user_id = auth.uid()))
    OR (enquiry_id IS NOT NULL AND enquiry_id IN (
      SELECT e.id FROM public.enquiries e
      JOIN public.profiles p ON p.id IN (e.contractor_id, e.customer_id)
      WHERE p.user_id = auth.uid()))
    OR (issued_quote_id IS NOT NULL AND issued_quote_id IN (
      SELECT q.id FROM public.issued_quotes q
      JOIN public.profiles p ON p.id IN (q.contractor_id, q.recipient_id)
      WHERE p.user_id = auth.uid()))
  );

-- Message INSERT: sender identity + party to the (existing) conversation.
DROP POLICY "Participants can send messages" ON public.job_messages;
CREATE POLICY "Participants can send messages"
  ON public.job_messages FOR INSERT
  WITH CHECK (
    sender_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    AND public.is_conversation_party(conversation_id)
  );