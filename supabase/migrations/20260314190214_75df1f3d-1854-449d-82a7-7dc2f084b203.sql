
CREATE OR REPLACE FUNCTION public.notify_invoice_response()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  response_label text;
  client_name_val text;
  inv_number text;
BEGIN
  IF OLD.recipient_response IS DISTINCT FROM NEW.recipient_response AND NEW.recipient_response IS NOT NULL THEN
    inv_number := COALESCE(NEW.invoice_number, NEW.id::text);
    client_name_val := NEW.client_name;

    CASE NEW.recipient_response
      WHEN 'paid' THEN response_label := 'Paid';
      WHEN 'stalled' THEN response_label := 'Stalled';
      WHEN 'queried' THEN response_label := 'Queried';
      ELSE response_label := NEW.recipient_response;
    END CASE;

    -- Notify the contractor
    INSERT INTO public.notifications (user_id, title, message, type, reference_type, reference_id)
    VALUES (
      NEW.contractor_id,
      'Invoice ' || response_label,
      client_name_val || ' has ' || LOWER(response_label) || ' invoice ' || inv_number,
      'invoice_response',
      'invoice',
      NEW.id
    );

    -- Notify the recipient (confirmation)
    IF NEW.recipient_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, title, message, type, reference_type, reference_id)
      VALUES (
        NEW.recipient_id,
        'Invoice ' || response_label,
        'You have ' || LOWER(response_label) || ' invoice ' || inv_number,
        'invoice_response',
        'invoice',
        NEW.id
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_invoice_response
  AFTER UPDATE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_invoice_response();
