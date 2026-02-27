-- Allow quote recipients to participate in schedule negotiation linked to accepted quotes
CREATE POLICY "Recipients can view quote schedule proposals"
ON public.schedule_events FOR SELECT
USING (
  quote_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.issued_quotes q
    WHERE q.id = schedule_events.quote_id
      AND q.recipient_id = auth.uid()
      AND q.recipient_response = 'accepted'
  )
);

CREATE POLICY "Recipients can propose quote schedule alternatives"
ON public.schedule_events FOR INSERT
WITH CHECK (
  quote_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.issued_quotes q
    WHERE q.id = schedule_events.quote_id
      AND q.recipient_id = auth.uid()
      AND q.contractor_id = schedule_events.contractor_id
      AND q.recipient_response = 'accepted'
  )
);

CREATE POLICY "Recipients can update quote schedule proposals"
ON public.schedule_events FOR UPDATE
USING (
  quote_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.issued_quotes q
    WHERE q.id = schedule_events.quote_id
      AND q.recipient_id = auth.uid()
      AND q.recipient_response = 'accepted'
  )
);

-- Recipients can view contractor availability when they have an accepted quote with that contractor
CREATE POLICY "Recipients can view contractor availability for accepted quotes"
ON public.availability_slots FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.issued_quotes q
    WHERE q.contractor_id = availability_slots.contractor_id
      AND q.recipient_id = auth.uid()
      AND q.recipient_response = 'accepted'
  )
);
