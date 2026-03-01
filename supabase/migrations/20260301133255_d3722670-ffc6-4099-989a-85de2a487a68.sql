-- Drop overly permissive rate_limits policies
DROP POLICY IF EXISTS "Allow rate limit inserts" ON public.rate_limits;
DROP POLICY IF EXISTS "Allow rate limit reads" ON public.rate_limits;

-- Add CHECK constraints for recipient_response on invoices
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_recipient_response_valid
  CHECK (recipient_response IS NULL OR recipient_response IN ('paid', 'stalled', 'queried'));

-- Add CHECK constraints for recipient_response on issued_quotes
ALTER TABLE public.issued_quotes
  ADD CONSTRAINT issued_quotes_recipient_response_valid
  CHECK (recipient_response IS NULL OR recipient_response IN ('accepted', 'rejected', 'stalled'));