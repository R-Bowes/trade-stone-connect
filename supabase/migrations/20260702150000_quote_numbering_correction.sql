-- Correction: 20260702120000 applied quote numbering to the legacy empty `quotes`
-- table. The live quotes table is `issued_quotes`. This migration moves the
-- numbering there, converts quote_number text -> integer, retires the legacy
-- QTE- generator, and fixes notify_quote_response for the integer type.
-- Revision tracking uses the existing issued_quotes.version column.

-- 1. Undo the additions to the legacy quotes table
DROP TRIGGER assign_quote_number_trigger ON public.quotes;
ALTER TABLE public.quotes
  DROP COLUMN quote_number,
  DROP COLUMN revision;
-- assign_quote_number() is table-agnostic (NEW.quote_number / NEW.contractor_id);
-- it is kept and re-attached to issued_quotes below.

-- 2. Retire the legacy QTE- generator on issued_quotes
DROP TRIGGER generate_quote_number_trigger ON public.issued_quotes;
DROP FUNCTION public.generate_quote_number();

-- 3. Convert quote_number text -> integer, preserving existing sequence
ALTER TABLE public.issued_quotes
  ALTER COLUMN quote_number TYPE integer
  USING NULLIF(REGEXP_REPLACE(quote_number, '^.*-', ''), '')::integer;

-- Safety net for any rows the regex could not convert (none expected)
WITH numbered AS (
  SELECT id, row_number() OVER (PARTITION BY contractor_id ORDER BY created_at, id) AS rn
  FROM public.issued_quotes
  WHERE quote_number IS NULL
)
UPDATE public.issued_quotes q
SET quote_number = n.rn
FROM numbered n
WHERE q.id = n.id;

-- 4. Seed the quote counter from existing data
INSERT INTO public.contractor_counters (contractor_id, entity, next_value)
SELECT contractor_id, 'quote', MAX(quote_number) + 1
FROM public.issued_quotes
GROUP BY contractor_id
ON CONFLICT (contractor_id, entity)
DO UPDATE SET next_value = EXCLUDED.next_value;

-- 5. Attach the counters-based assignment trigger
CREATE TRIGGER assign_quote_number_trigger
  BEFORE INSERT ON public.issued_quotes
  FOR EACH ROW EXECUTE FUNCTION public.assign_quote_number();

ALTER TABLE public.issued_quotes
  ALTER COLUMN quote_number SET NOT NULL,
  ADD CONSTRAINT issued_quotes_contractor_quote_number_key UNIQUE (contractor_id, quote_number);

-- 6. Recreate notify_quote_response for integer quote_number
--    (COALESCE(int, text) would otherwise fail at runtime on every response)
CREATE OR REPLACE FUNCTION public.notify_quote_response()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  response_label text;
  client_name_val text;
  quote_num text;
BEGIN
  IF OLD.recipient_response IS DISTINCT FROM NEW.recipient_response AND NEW.recipient_response IS NOT NULL THEN
    quote_num := COALESCE('Q-' || LPAD(NEW.quote_number::text, 4, '0'), NEW.id::text);
    client_name_val := NEW.client_name;

    CASE NEW.recipient_response
      WHEN 'accepted' THEN response_label := 'Accepted';
      WHEN 'rejected' THEN response_label := 'Rejected';
      WHEN 'stall' THEN response_label := 'Stalled';
      ELSE response_label := NEW.recipient_response;
    END CASE;

    INSERT INTO public.notifications (user_id, title, message, type, reference_type, reference_id)
    VALUES (
      NEW.contractor_id,
      'Quote ' || response_label,
      client_name_val || ' has ' || LOWER(response_label) || ' quote ' || quote_num,
      'quote_response',
      'issued_quote',
      NEW.id
    );

    IF NEW.recipient_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, title, message, type, reference_type, reference_id)
      VALUES (
        NEW.recipient_id,
        'Quote ' || response_label,
        'You have ' || LOWER(response_label) || ' quote ' || quote_num,
        'quote_response',
        'issued_quote',
        NEW.id
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;