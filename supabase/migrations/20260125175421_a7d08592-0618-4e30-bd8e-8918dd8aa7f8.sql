-- Create invoices table
CREATE TABLE public.invoices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contractor_id UUID NOT NULL,
  invoice_number TEXT UNIQUE,
  client_name TEXT NOT NULL,
  client_email TEXT NOT NULL,
  client_phone TEXT,
  client_address TEXT,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  subtotal NUMERIC NOT NULL DEFAULT 0,
  tax_rate NUMERIC NOT NULL DEFAULT 0,
  tax_amount NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  issued_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  paid_date DATE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Contractors can view their own invoices"
ON public.invoices FOR SELECT
USING (contractor_id = auth.uid());

CREATE POLICY "Contractors can insert their own invoices"
ON public.invoices FOR INSERT
WITH CHECK (contractor_id = auth.uid());

CREATE POLICY "Contractors can update their own invoices"
ON public.invoices FOR UPDATE
USING (contractor_id = auth.uid());

CREATE POLICY "Contractors can delete their own invoices"
ON public.invoices FOR DELETE
USING (contractor_id = auth.uid());

-- Function to generate invoice number
CREATE OR REPLACE FUNCTION public.generate_invoice_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ts_code TEXT;
  next_seq INT;
  new_invoice_number TEXT;
BEGIN
  -- Get the contractor's TS profile code
  SELECT ts_profile_code INTO ts_code
  FROM public.profiles
  WHERE user_id = NEW.contractor_id;
  
  -- If no TS code found, use a fallback
  IF ts_code IS NULL THEN
    ts_code := 'UNKNOWN';
  END IF;
  
  -- Count existing invoices for this contractor and get next sequence
  SELECT COALESCE(MAX(
    CAST(
      NULLIF(REGEXP_REPLACE(invoice_number, '^INV-[A-Z0-9]+-', ''), '') 
      AS INTEGER
    )
  ), 0) + 1 INTO next_seq
  FROM public.invoices
  WHERE contractor_id = NEW.contractor_id;
  
  -- Generate the invoice number: INV-{TS_CODE}-{SEQUENCE}
  new_invoice_number := 'INV-' || ts_code || '-' || LPAD(next_seq::TEXT, 5, '0');
  
  NEW.invoice_number := new_invoice_number;
  RETURN NEW;
END;
$$;

-- Trigger to auto-generate invoice number on insert
CREATE TRIGGER generate_invoice_number_trigger
BEFORE INSERT ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.generate_invoice_number();

-- Trigger for updated_at
CREATE TRIGGER update_invoices_updated_at
BEFORE UPDATE ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();