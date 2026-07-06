-- 20260706150000_conversation_select_policy_row_based.sql
-- is_conversation_party(id) re-queries job_conversations; as a STABLE
-- function it cannot see a row inserted in the same statement, so
-- PostgREST's INSERT ... RETURNING failed the SELECT policy on every
-- new conversation ("new row violates row-level security"). Replaced
-- with an inline check on the row's own context columns. The helper
-- remains correct for job_messages (their conversation pre-exists).

DROP POLICY "Participants can view their conversations" ON public.job_conversations;
CREATE POLICY "Participants can view their conversations"
  ON public.job_conversations FOR SELECT
  USING (
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

DROP POLICY "Participants can update their conversations" ON public.job_conversations;
CREATE POLICY "Participants can update their conversations"
  ON public.job_conversations FOR UPDATE
  USING (
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