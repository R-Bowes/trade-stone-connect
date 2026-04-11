-- Insert a notification for the recipient when a contractor issues a new quote.
-- This complements notify_quote_response (which fires on UPDATE) by covering INSERT.
CREATE OR REPLACE FUNCTION public.notify_quote_issued()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  contractor_name_val text;
BEGIN
  IF NEW.recipient_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(company_name, full_name, 'Your contractor')
  INTO contractor_name_val
  FROM public.profiles
  WHERE user_id = NEW.contractor_id;

  INSERT INTO public.notifications (user_id, title, message, type, reference_type, reference_id)
  VALUES (
    NEW.recipient_id,
    'New Quote Received',
    COALESCE(contractor_name_val, 'A contractor') || ' has sent you a quote for "' || NEW.title || '"',
    'quote_received',
    'issued_quote',
    NEW.id
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_quote_issued
  AFTER INSERT ON public.issued_quotes
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_quote_issued();
