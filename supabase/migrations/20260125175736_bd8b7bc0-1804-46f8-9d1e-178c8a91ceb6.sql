-- Create issued_quotes table for contractors to send quotes to clients
CREATE TABLE public.issued_quotes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contractor_id UUID NOT NULL,
  quote_number TEXT UNIQUE,
  
  -- Client details
  client_type TEXT NOT NULL DEFAULT 'personal', -- 'personal' or 'business'
  client_name TEXT NOT NULL,
  business_name TEXT, -- For business clients
  client_email TEXT NOT NULL,
  client_phone TEXT,
  client_address TEXT,
  
  -- Quote details
  title TEXT NOT NULL,
  description TEXT,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  subtotal NUMERIC NOT NULL DEFAULT 0,
  tax_rate NUMERIC NOT NULL DEFAULT 0,
  tax_amount NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  
  -- Status and dates
  status TEXT NOT NULL DEFAULT 'draft', -- draft, sent, accepted, rejected, expired
  valid_until DATE NOT NULL,
  sent_at TIMESTAMP WITH TIME ZONE,
  responded_at TIMESTAMP WITH TIME ZONE,
  
  -- Terms and notes
  terms TEXT,
  notes TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.issued_quotes ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Contractors can view their own issued quotes"
ON public.issued_quotes FOR SELECT
USING (contractor_id = auth.uid());

CREATE POLICY "Contractors can insert their own issued quotes"
ON public.issued_quotes FOR INSERT
WITH CHECK (contractor_id = auth.uid());

CREATE POLICY "Contractors can update their own issued quotes"
ON public.issued_quotes FOR UPDATE
USING (contractor_id = auth.uid());

CREATE POLICY "Contractors can delete their own issued quotes"
ON public.issued_quotes FOR DELETE
USING (contractor_id = auth.uid());

-- Function to generate quote number (QTE-{TS_CODE}-00001)
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
  
  -- If no TS code found, use a fallback
  IF ts_code IS NULL THEN
    ts_code := 'UNKNOWN';
  END IF;
  
  -- Count existing issued quotes for this contractor and get next sequence
  SELECT COALESCE(MAX(
    CAST(
      NULLIF(REGEXP_REPLACE(quote_number, '^QTE-[A-Z0-9]+-', ''), '') 
      AS INTEGER
    )
  ), 0) + 1 INTO next_seq
  FROM public.issued_quotes
  WHERE contractor_id = NEW.contractor_id;
  
  -- Generate the quote number: QTE-{TS_CODE}-{SEQUENCE}
  new_quote_number := 'QTE-' || ts_code || '-' || LPAD(next_seq::TEXT, 5, '0');
  
  NEW.quote_number := new_quote_number;
  RETURN NEW;
END;
$$;

-- Trigger to auto-generate quote number on insert
CREATE TRIGGER generate_quote_number_trigger
BEFORE INSERT ON public.issued_quotes
FOR EACH ROW
EXECUTE FUNCTION public.generate_quote_number();

-- Trigger for updated_at
CREATE TRIGGER update_issued_quotes_updated_at
BEFORE UPDATE ON public.issued_quotes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();