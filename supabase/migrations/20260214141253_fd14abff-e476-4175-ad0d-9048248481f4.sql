
-- Add recipient_id to invoices so recipients can view and respond
ALTER TABLE public.invoices ADD COLUMN recipient_id uuid REFERENCES public.profiles(user_id);
ALTER TABLE public.invoices ADD COLUMN recipient_response text; -- 'paid', 'stalled', 'queried'
ALTER TABLE public.invoices ADD COLUMN responded_at timestamp with time zone;

-- Add recipient_id to issued_quotes so recipients can view and respond
ALTER TABLE public.issued_quotes ADD COLUMN recipient_id uuid REFERENCES public.profiles(user_id);
ALTER TABLE public.issued_quotes ADD COLUMN recipient_response text; -- 'accepted', 'rejected', 'stalled'

-- RLS: Recipients can VIEW invoices addressed to them
CREATE POLICY "Recipients can view their invoices"
ON public.invoices FOR SELECT
USING (recipient_id = auth.uid());

-- RLS: Recipients can UPDATE their response on invoices addressed to them
CREATE POLICY "Recipients can respond to their invoices"
ON public.invoices FOR UPDATE
USING (recipient_id = auth.uid());

-- RLS: Recipients can VIEW issued quotes addressed to them
CREATE POLICY "Recipients can view their quotes"
ON public.issued_quotes FOR SELECT
USING (recipient_id = auth.uid());

-- RLS: Recipients can UPDATE their response on issued quotes addressed to them
CREATE POLICY "Recipients can respond to their quotes"
ON public.issued_quotes FOR UPDATE
USING (recipient_id = auth.uid());

-- Add quote_id to schedule_events for linking accepted quotes to scheduled events
ALTER TABLE public.schedule_events ADD COLUMN quote_id uuid REFERENCES public.issued_quotes(id);
-- Add proposed_date fields for schedule negotiation
ALTER TABLE public.schedule_events ADD COLUMN proposed_by uuid;
ALTER TABLE public.schedule_events ADD COLUMN is_confirmed boolean DEFAULT false;
