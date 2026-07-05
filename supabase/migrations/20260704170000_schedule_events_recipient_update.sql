-- 20260704170000_schedule_events_recipient_update.sql
-- Root-cause fix: schedule_events had a contractor-only UPDATE policy,
-- silently no-opping every recipient-side write (counter-declines,
-- un-confirms, cancels). Replaces it with a party-based policy:
-- contractor, or recipient of the linked quote. Also normalises the
-- recipient SELECT policy's direct auth.uid() comparison to the
-- standard two-step profiles pattern.

DROP POLICY "schedule_events_contractor_update" ON public.schedule_events;
CREATE POLICY "Parties can update schedule events"
  ON public.schedule_events FOR UPDATE
  USING (
    contractor_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    OR quote_id IN (
      SELECT id FROM public.issued_quotes
      WHERE recipient_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    )
  );

DROP POLICY "Recipients can view schedule events for their quotes" ON public.schedule_events;
CREATE POLICY "Recipients can view schedule events for their quotes"
  ON public.schedule_events FOR SELECT
  USING (
    quote_id IN (
      SELECT id FROM public.issued_quotes
      WHERE recipient_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    )
    OR contractor_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  );