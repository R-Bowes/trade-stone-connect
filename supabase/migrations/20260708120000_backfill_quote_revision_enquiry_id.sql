-- Revisions created via IssuedQuotes.handleRevise() never copied enquiry_id
-- from their parent (fixed in app code separately). Backfill existing NULL
-- rows by walking parent_quote_id to the nearest ancestor that has
-- enquiry_id set. A recursive CTE proves convergence in one statement —
-- chains can be more than one draft deep (draft-of-a-draft), and this
-- resolves any depth rather than assuming 2 levels. Chains rooted at a
-- genuinely enquiry-less quote (standalone quote, no originating enquiry)
-- are never added to `chain` and are correctly left untouched.
WITH RECURSIVE chain AS (
  SELECT id, enquiry_id, parent_quote_id
  FROM issued_quotes
  WHERE enquiry_id IS NOT NULL

  UNION ALL

  SELECT r.id, c.enquiry_id, r.parent_quote_id
  FROM issued_quotes r
  JOIN chain c ON r.parent_quote_id = c.id
  WHERE r.enquiry_id IS NULL
)
UPDATE issued_quotes q
SET enquiry_id = chain.enquiry_id
FROM chain
WHERE q.id = chain.id
  AND q.enquiry_id IS NULL;
