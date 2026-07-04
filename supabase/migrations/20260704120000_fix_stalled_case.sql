-- notify_quote_response's CASE checked recipient_response = 'stall', but the
-- app writes 'stalled' (see useReceivedQuotes.ts respondToQuote). That branch
-- never matched, so stalled-quote notifications fell through to the ELSE arm
-- and rendered the raw, lowercase 'stalled' value instead of 'Stalled'.
-- Body copied verbatim from 20260702150000_quote_numbering_correction.sql
-- with only the CASE value corrected.

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
      WHEN 'stalled' THEN response_label := 'Stalled';
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
