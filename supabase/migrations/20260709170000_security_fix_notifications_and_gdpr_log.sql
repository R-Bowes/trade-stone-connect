-- Security fix for two overly-permissive policies found during the baseline
-- audit (supabase/archive/baseline_extraction/4b_policies.csv). This is a real
-- change to live behaviour, not a no-op baseline capture.
--
-- job_message_notifications: "System can insert notifications" was
-- WITH CHECK (true), roles={public} — no trigger populates this table
-- (confirmed against supabase/archive/baseline_extraction/5_triggers.csv,
-- which has no entry for job_message_notifications or job_messages), so any
-- caller — including unauthenticated anon — could insert a notification row
-- for any recipient_id. Replaced with TO authenticated plus a check that the
-- caller is the sender of the referenced message.
--
-- gdpr_erasure_log: "Only admins can view erasure log" was named for an admin
-- check but the expression was actually `auth.uid() = performed_by` — any
-- user matching performed_by could read it, not specifically an admin.
-- Replaced with the real admin check, public.is_platform_admin() (already
-- versioned in 20260430130000_admin_rls_bypass_policies.sql).

DROP POLICY IF EXISTS "System can insert notifications" ON public.job_message_notifications;
CREATE POLICY "System can insert notifications" ON public.job_message_notifications FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.job_messages m
    JOIN public.profiles p ON p.id = m.sender_id
    WHERE m.id = job_message_notifications.message_id
      AND p.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Only admins can view erasure log" ON public.gdpr_erasure_log;
CREATE POLICY "Only admins can view erasure log" ON public.gdpr_erasure_log FOR SELECT
  USING (public.is_platform_admin());
