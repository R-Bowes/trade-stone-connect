-- Migration: fix job_conversations RLS + add missing policies
-- File: supabase/migrations/20260628120000_fix_job_conversations_rls.sql

-- ============================================
-- INSERT policy — contractor or customer on the job can create a conversation
-- ============================================
CREATE POLICY "Participants can insert job conversations"
  ON job_conversations
  FOR INSERT
  WITH CHECK (
    job_id IN (
      SELECT j.id
      FROM jobs j
      JOIN profiles p ON (p.id = j.contractor_id OR p.id = j.customer_id)
      WHERE p.user_id = auth.uid()
    )
  );

-- ============================================
-- UPDATE policy — participants can update (e.g. last_message_at)
-- ============================================
CREATE POLICY "Participants can update their job conversations"
  ON job_conversations
  FOR UPDATE
  USING (
    job_id IN (
      SELECT j.id
      FROM jobs j
      JOIN profiles p ON (p.id = j.contractor_id OR p.id = j.customer_id)
      WHERE p.user_id = auth.uid()
    )
  );