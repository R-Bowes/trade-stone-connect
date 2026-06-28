-- Migration: add 'personal' to job_messages sender_role constraint
ALTER TABLE job_messages
  DROP CONSTRAINT job_messages_sender_role_check;

ALTER TABLE job_messages
  ADD CONSTRAINT job_messages_sender_role_check
  CHECK (sender_role = ANY (ARRAY['business'::text, 'contractor'::text, 'personal'::text]));