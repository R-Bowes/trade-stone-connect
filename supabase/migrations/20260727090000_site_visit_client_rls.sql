-- schedule_events' existing SELECT/UPDATE policies only cover the
-- quote_id -> issued_quotes -> recipient_id path (quote scheduling
-- negotiation). Site visits (event_type='site_visit') hang off enquiry_id
-- instead and are proposed before any quote exists, so customers had no
-- read or write access to their own site visit proposals at all.
--
-- Uses the two-step profiles lookup (id IN (SELECT id FROM profiles WHERE
-- user_id = auth.uid())) to match every other policy already on this table
-- (schedule_events_contractor_select/insert/delete, "Recipients can view/
-- insert schedule events for their quotes") rather than a direct auth.uid()
-- comparison — consistency within this table over the general house
-- pattern documented in CLAUDE.md for other tables.
CREATE POLICY "Customers can view site visit proposals for their enquiries"
ON schedule_events
FOR SELECT
TO authenticated
USING (
  event_type = 'site_visit'
  AND enquiry_id IN (
    SELECT id FROM enquiries
    WHERE customer_id IN (
      SELECT id FROM profiles WHERE user_id = auth.uid()
    )
  )
);

CREATE POLICY "Customers can respond to site visit proposals"
ON schedule_events
FOR UPDATE
TO authenticated
USING (
  event_type = 'site_visit'
  AND enquiry_id IN (
    SELECT id FROM enquiries
    WHERE customer_id IN (
      SELECT id FROM profiles WHERE user_id = auth.uid()
    )
  )
)
WITH CHECK (
  event_type = 'site_visit'
  AND enquiry_id IN (
    SELECT id FROM enquiries
    WHERE customer_id IN (
      SELECT id FROM profiles WHERE user_id = auth.uid()
    )
  )
);
