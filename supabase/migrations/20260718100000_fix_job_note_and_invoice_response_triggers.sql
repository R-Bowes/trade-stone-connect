-- Readiness audit R1-3/R1-4: two live-breaking trigger bugs.
--
-- notify_job_note_added() referenced jobs.client_id, which was renamed to
-- customer_id back in the 20260328110000-era profiles/jobs id-unification
-- work. Every INSERT into job_notes raised "column client_id does not
-- exist" and rolled back — job notes were completely non-functional in
-- both directions (contractor<->customer), not just silently unnotified.
--
-- notify_invoice_response() did COALESCE(NEW.invoice_number, NEW.id::text)
-- over an integer and a text — a type PostgreSQL cannot resolve. Every
-- invoice response (paid/stalled/queried) raised a COALESCE type error and
-- rolled back the whole UPDATE. notify_quote_response() hit the identical
-- bug for quote_number and was already fixed with an LPAD-based cast in
-- 20260702150000_quote_numbering_correction.sql; this applies the same
-- pattern here for consistency with the documentRefs.ts INV- convention.

CREATE OR REPLACE FUNCTION public.notify_job_note_added()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  job_record RECORD;
  author_name text;
BEGIN
  SELECT id, title, contractor_id, customer_id INTO job_record
  FROM public.jobs WHERE id = NEW.job_id;

  SELECT COALESCE(full_name, email, 'Someone') INTO author_name
  FROM public.profiles WHERE user_id = NEW.author_id;

  -- Notify the other party
  IF NEW.author_id = job_record.contractor_id THEN
    INSERT INTO public.notifications (user_id, title, message, type, reference_type, reference_id)
    VALUES (
      job_record.customer_id,
      'New Note on Job',
      author_name || ' added a note to "' || job_record.title || '"',
      'job_note',
      'job',
      job_record.id
    );
  ELSE
    INSERT INTO public.notifications (user_id, title, message, type, reference_type, reference_id)
    VALUES (
      job_record.contractor_id,
      'New Note on Job',
      author_name || ' added a note to "' || job_record.title || '"',
      'job_note',
      'job',
      job_record.id
    );
  END IF;

  RETURN NEW;
END;
$$;

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
    inv_number := COALESCE('INV-' || LPAD(NEW.invoice_number::text, 4, '0'), NEW.id::text);
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
