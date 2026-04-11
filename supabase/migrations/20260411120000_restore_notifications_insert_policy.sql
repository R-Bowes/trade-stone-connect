-- Restore INSERT access to notifications for authenticated users.
--
-- The 20260318120000 migration removed the broad INSERT policy under the
-- assumption that all notifications would flow through SECURITY DEFINER
-- triggers. However several client-side paths also need to write
-- notifications directly (e.g. ContractorMessageDialog enquiry alerts).
-- The SECURITY DEFINER triggers continue to handle system-generated
-- notifications; this policy additionally allows authenticated clients to
-- insert notifications for any user_id (e.g. to notify a counterparty).
CREATE POLICY "Authenticated users can insert notifications"
  ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (true);
