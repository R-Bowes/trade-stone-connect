-- Tendering chunk 1b: business_counters + application document numbering.
--
-- Phase 1 verdict (see conversation): business_counters gets its own
-- allocator, next_business_document_number(), rather than extending
-- next_document_number(). Per amendment, business_counters mirrors the
-- entity-row shape of contractor_counters (company_id, entity, next_value)
-- instead of the fixed tender_counter/engagement_counter columns floated
-- in TENDERING-SCHEMA.md — same idiom, same allocator body shape, easier
-- to extend if a third business entity type shows up later.
--
-- Applications (TA-{contractor_code}-NNNN) are contractor-keyed, same FK
-- domain as quote/job/invoice, so they reuse contractor_counters and
-- next_document_number() unchanged — only the entity CHECK is extended.

-- 1. Application counter: extend the existing entity CHECK, no new column,
--    no new function. The constraint was created inline (unnamed) in
--    20260702120000; find it by definition rather than assuming a
--    convention-generated name.
DO $$
DECLARE
  v_conname text;
BEGIN
  SELECT conname INTO v_conname
  FROM pg_constraint
  WHERE conrelid = 'public.contractor_counters'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%entity%';

  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.contractor_counters DROP CONSTRAINT %I', v_conname);
  END IF;
END $$;

ALTER TABLE public.contractor_counters
  ADD CONSTRAINT contractor_counters_entity_check
  CHECK (entity IN ('quote', 'job', 'invoice', 'application'));

-- 2. business_counters: entity-row pattern, same shape as contractor_counters.
CREATE TABLE public.business_counters (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  entity     text NOT NULL CHECK (entity IN ('tender', 'engagement')),
  next_value integer NOT NULL DEFAULT 1,
  PRIMARY KEY (company_id, entity)
);

ALTER TABLE public.business_counters ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies: clients can never read or write counters directly.

-- 3. Sibling allocator, same atomic-upsert idiom as next_document_number().
CREATE OR REPLACE FUNCTION public.next_business_document_number(p_company_id uuid, p_entity text)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO business_counters (company_id, entity, next_value)
  VALUES (p_company_id, p_entity, 2)
  ON CONFLICT (company_id, entity)
  DO UPDATE SET next_value = business_counters.next_value + 1
  RETURNING next_value - 1;
$$;

REVOKE ALL ON FUNCTION public.next_business_document_number(uuid, text) FROM PUBLIC, anon, authenticated;
