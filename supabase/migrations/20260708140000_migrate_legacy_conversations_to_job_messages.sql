-- Defect-4 Step A: port legacy conversations/messages rows that carry a
-- structured issued_quote_id onto job_conversations/job_messages. Rows with
-- no issued_quote_id have no other FK to hook into job_conversations (the
-- legacy table has no enquiry_id column) and are intentionally left
-- untouched here — reviewed and exported separately as a paper trail
-- (supabase/archive/legacy_conversations_orphans_20260708.json) ahead of
-- Step D dropping the legacy tables.
--
-- Once a job exists for a quote, its job_conversations row is re-keyed to
-- job_id (issued_quote_id goes NULL on that row — see engagementConversation.ts,
-- "one thread per engagement, resolve by furthest artefact"). So resolution
-- here follows the job first, falling back to a direct issued_quote_id match
-- only when no job exists yet for that quote — the same governing-precedence
-- pattern used for Defects 1-3, applied to the migration target instead of
-- the pipeline.
--
-- sender_role is resolved via profiles.user_type (not conversations.initiator_id/
-- recipient_id position — a contractor-to-contractor legacy row proved that
-- inference isn't reliably binary). message_type has no legacy equivalent and
-- is hardcoded 'message', the only value in live use.
--
-- job_messages.id carries the source messages.id through directly (accepts
-- an explicit value; DEFAULT gen_random_uuid() just doesn't fire) rather
-- than generating a fresh one. That makes the idempotency guard below keyed
-- on the source primary key, not on (content, sender_id, created_at) — this
-- data includes literal "hello"/"TEST" bodies elsewhere, so a business-data
-- key isn't collision-proof. job_messages_pkey backs this with a hard DB
-- constraint too, not just an app-level check.
WITH target_conversation AS (
  SELECT
    c.id AS legacy_conversation_id,
    COALESCE(jc_by_job.id, jc_by_quote.id) AS job_conversation_id
  FROM conversations c
  LEFT JOIN jobs j ON j.issued_quote_id = c.issued_quote_id
  LEFT JOIN job_conversations jc_by_job ON jc_by_job.job_id = j.id
  LEFT JOIN job_conversations jc_by_quote ON jc_by_quote.issued_quote_id = c.issued_quote_id
  WHERE c.issued_quote_id IS NOT NULL
)
INSERT INTO job_messages (id, conversation_id, sender_id, sender_role, content, message_type, read_at, created_at)
SELECT
  m.id,
  tc.job_conversation_id,
  m.sender_id,
  p.user_type::text,
  m.content,
  'message',
  m.read_at,
  m.created_at
FROM messages m
JOIN target_conversation tc ON tc.legacy_conversation_id = m.conversation_id
JOIN profiles p ON p.id = m.sender_id
WHERE tc.job_conversation_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM job_messages jm WHERE jm.id = m.id);
