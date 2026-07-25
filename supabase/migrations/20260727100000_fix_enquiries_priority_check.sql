-- enquiries_priority_check only allowed 'p1'/'p2'/'p3'/'p4', but
-- QuoteRequestDialog.tsx and send-quote-notification both write
-- 'low'/'medium'/'high'/'emergency' — every enquiry submitted with a
-- priority selected has been silently failing the enquiries insert (caught
-- non-fatally by the edge function, so the quote-request toast still says
-- success while no enquiry row is ever created). Found during the site
-- visit RLS audit 2026-07-27.
-- One legacy row (id a32d5745-ca4f-429b-b46c-e7ec529ff7d1) holds priority='p3'
-- from before the low/medium/high/emergency UI existed. Nothing in the
-- codebase has ever read or displayed the p1-p4 values, and there is no
-- reliable p-number -> low/medium/high/emergency mapping to infer, so this
-- clears it to NULL rather than guessing.
UPDATE enquiries SET priority = NULL
WHERE priority IS NOT NULL AND priority NOT IN ('low', 'medium', 'high', 'emergency');

ALTER TABLE enquiries DROP CONSTRAINT IF EXISTS enquiries_priority_check;
ALTER TABLE enquiries ADD CONSTRAINT enquiries_priority_check
  CHECK (priority IS NULL OR priority IN ('low', 'medium', 'high', 'emergency'));
