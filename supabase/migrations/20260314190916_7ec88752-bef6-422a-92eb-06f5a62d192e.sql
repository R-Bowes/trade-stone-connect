
-- Create function to notify on quote response
CREATE OR REPLACE FUNCTION public.notify_quote_response()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  response_label text;
  client_name_val text;
  quote_num text;
BEGIN
  IF OLD.recipient_response IS DISTINCT FROM NEW.recipient_response AND NEW.recipient_response IS NOT NULL THEN
    quote_num := COALESCE(NEW.quote_number, NEW.id::text);
    client_name_val := NEW.client_name;

    CASE NEW.recipient_response
      WHEN 'accepted' THEN response_label := 'Accepted';
      WHEN 'rejected' THEN response_label := 'Rejected';
      WHEN 'stall' THEN response_label := 'Stalled';
      ELSE response_label := NEW.recipient_response;
    END CASE;

    -- Notify the contractor
    INSERT INTO public.notifications (user_id, title, message, type, reference_type, reference_id)
    VALUES (
      NEW.contractor_id,
      'Quote ' || response_label,
      client_name_val || ' has ' || LOWER(response_label) || ' quote ' || quote_num,
      'quote_response',
      'issued_quote',
      NEW.id
    );

    -- Notify the recipient (confirmation)
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
$$;

-- Create trigger on issued_quotes table
CREATE TRIGGER on_quote_response
  AFTER UPDATE ON public.issued_quotes
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_quote_response();
