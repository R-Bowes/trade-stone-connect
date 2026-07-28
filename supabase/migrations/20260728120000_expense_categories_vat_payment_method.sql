-- Finance Tier 1, Slice 2: extend expenses with category FK, VAT rate, payment method

ALTER TABLE public.expenses
  ADD COLUMN category_id uuid REFERENCES public.expense_categories(id);

ALTER TABLE public.expenses
  ADD COLUMN payment_method text DEFAULT 'card'
    CHECK (payment_method IN ('cash', 'card', 'bank_transfer', 'other'));

ALTER TABLE public.expenses
  ADD COLUMN vat_rate numeric DEFAULT 0;
