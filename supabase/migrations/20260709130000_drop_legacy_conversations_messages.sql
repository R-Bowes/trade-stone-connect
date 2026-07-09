-- Step D of legacy messaging retirement. Data ported in 20260708140000;
-- orphans archived in supabase/archive/legacy_conversations_orphans_20260708.json;
-- admin surface repointed in commit 6362d0a.
--
-- Mirror-drops everything created in
-- 20260126174158_cd7590e6-b3f6-426e-8875-64d32f630227.sql:
--   - tables public.messages, public.conversations
--   - indexes idx_conversations_initiator, idx_conversations_recipient,
--     idx_conversations_last_message, idx_messages_conversation,
--     idx_messages_created, idx_messages_unread
--   - policies "Users can view/create/update their own conversations",
--     "Users can view/send/update messages ..." plus the admin bypass
--     policies admin_select_conversations / admin_select_messages added in
--     20260430130000
--   - triggers update_conversation_on_new_message (AFTER INSERT ON messages)
--     and update_conversations_updated_at (BEFORE UPDATE ON conversations)
-- All of the above (indexes, policies, triggers) are attached directly to
-- the two tables and vanish automatically with DROP TABLE ... CASCADE — none
-- are dropped explicitly here.
--
-- public.update_conversation_last_message() (the trigger function backing
-- update_conversation_on_new_message) is dropped explicitly below — grepped
-- the full migration history and it has no other caller.
--
-- public.update_updated_at_column() (the trigger function backing
-- update_conversations_updated_at) is NOT dropped — it is a shared generic
-- trigger function used by updated_at triggers on many other tables.

DROP TABLE IF EXISTS public.messages CASCADE;
DROP TABLE IF EXISTS public.conversations CASCADE;

DROP FUNCTION IF EXISTS public.update_conversation_last_message();
