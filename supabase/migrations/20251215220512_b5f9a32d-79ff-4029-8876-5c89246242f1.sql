-- Add explicit SELECT policy to contracts table
-- Currently only has "Contractors can manage their own contracts" (FOR ALL) which doesn't cover SELECT in restrictive mode

CREATE POLICY "Contractors can view their own contracts"
ON public.contracts
FOR SELECT
USING (contractor_id = auth.uid());