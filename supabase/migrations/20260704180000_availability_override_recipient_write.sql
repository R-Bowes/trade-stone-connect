-- 20260704180000_availability_override_recipient_write.sql
-- Recipient-confirms case: when a customer confirms a contractor's
-- proposed date, the client-side block upsert runs as the customer.
-- Grants recipients insert/update on a contractor's overrides ONLY
-- where a confirmed quote_proposal schedule event links them to that
-- contractor for that date. Mirrors 20260704170000's party logic but
-- scoped tight — customers must not gain general write access to a
-- contractor's calendar.

CREATE POLICY "Recipients can block dates for confirmed proposals"
  ON public.contractor_availability_overrides FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.schedule_events se
      JOIN public.issued_quotes q ON q.id = se.quote_id
      WHERE se.contractor_id = contractor_availability_overrides.contractor_id
        AND se.start_time::date = contractor_availability_overrides.date
        AND se.event_type = 'quote_proposal'
        AND se.is_confirmed = true
        AND q.recipient_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Recipients can update blocks for confirmed proposals"
  ON public.contractor_availability_overrides FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.schedule_events se
      JOIN public.issued_quotes q ON q.id = se.quote_id
      WHERE se.contractor_id = contractor_availability_overrides.contractor_id
        AND se.start_time::date = contractor_availability_overrides.date
        AND se.event_type = 'quote_proposal'
        AND se.is_confirmed = true
        AND q.recipient_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    )
  );