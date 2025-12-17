-- Create subcontracts table for linking portions of work to platform contractors
CREATE TABLE public.subcontracts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  contractor_id uuid NOT NULL,
  subcontractor_id uuid NOT NULL,
  scope_description text NOT NULL,
  subcontract_value numeric NOT NULL,
  start_date date NOT NULL,
  end_date date,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.subcontracts ENABLE ROW LEVEL SECURITY;

-- Policy: Main contractor can manage their subcontracts
CREATE POLICY "Contractors can manage their own subcontracts"
ON public.subcontracts
FOR ALL
USING (contractor_id = auth.uid());

-- Policy: Subcontractors can view subcontracts assigned to them
CREATE POLICY "Subcontractors can view their assigned work"
ON public.subcontracts
FOR SELECT
USING (subcontractor_id = auth.uid());

-- Create trigger for updated_at
CREATE TRIGGER update_subcontracts_updated_at
BEFORE UPDATE ON public.subcontracts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();