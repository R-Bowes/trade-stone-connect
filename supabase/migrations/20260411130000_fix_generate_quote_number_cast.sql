-- Fix generate_quote_number: the previous regex '^QTE-[A-Z0-9]+-' did not match
-- TS profile codes that contain hyphens (e.g. "C-4AE203"), leaving a non-integer
-- suffix and causing a CAST failure (22P02). Replace with a pattern that strips
-- everything up to and including the LAST hyphen, leaving only the numeric sequence.
CREATE OR REPLACE FUNCTION public.generate_quote_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ts_code TEXT;
  next_seq INT;
  new_quote_number TEXT;
BEGIN
  -- Get the contractor's TS profile code
  SELECT ts_profile_code INTO ts_code
  FROM public.profiles
  WHERE user_id = NEW.contractor_id;

  IF ts_code IS NULL THEN
    ts_code := 'UNKNOWN';
  END IF;

  -- Extract the trailing numeric sequence from existing quote numbers for this
  -- contractor. Use REGEXP_REPLACE to strip everything up to and including the
  -- last '-', which isolates the zero-padded sequence regardless of how many
  -- hyphens appear in the TS code (e.g. "QTE-C-4AE203-00002" → "00002").
  SELECT COALESCE(MAX(
    CAST(
      NULLIF(REGEXP_REPLACE(quote_number, '^.*-', ''), '')
      AS INTEGER
    )
  ), 0) + 1 INTO next_seq
  FROM public.issued_quotes
  WHERE contractor_id = NEW.contractor_id;

  new_quote_number := 'QTE-' || ts_code || '-' || LPAD(next_seq::TEXT, 5, '0');

  NEW.quote_number := new_quote_number;
  RETURN NEW;
END;
$$;
