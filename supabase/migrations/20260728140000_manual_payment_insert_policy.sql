-- Off-platform payment recording: contractors (payees) currently have no
-- INSERT path on payments at all — the only existing policy is
-- "Payments insertable by payer" (WITH CHECK auth.uid() = payer_id), which
-- is correct for the Stripe checkout flow (the customer/payer initiates
-- that insert) but blocks a contractor from recording a manual off-platform
-- payment (BACS/cash/cheque) on the customer's behalf. Two-party tables
-- need write policies for both parties (see CLAUDE.md RLS section) — this
-- adds the missing payee-side path, narrowly scoped to manual payments on
-- invoices the contractor actually owns.

CREATE POLICY "Contractors can record manual payments as payee"
  ON public.payments FOR INSERT
  WITH CHECK (
    payee_id = auth.uid()
    AND type = 'manual'
    AND invoice_id IN (SELECT id FROM public.invoices WHERE contractor_id = auth.uid())
  );
