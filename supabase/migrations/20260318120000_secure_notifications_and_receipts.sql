-- Remove the overly broad notifications INSERT policy.
-- Notification records are created by SECURITY DEFINER trigger functions, so
-- authenticated end users do not need direct INSERT access.
DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;

-- Tighten UPDATE semantics so rows cannot be reassigned to another user.
DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
CREATE POLICY "Users can update their own notifications"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
