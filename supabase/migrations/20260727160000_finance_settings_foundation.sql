-- Finance Tier 1, Slice 1: Finance Settings + foundation schema
-- finance_settings, contractor_vehicles, hmrc_mileage_rates, expense_categories

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =========================================================================
-- finance_settings
-- =========================================================================

CREATE TABLE public.finance_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id uuid NOT NULL REFERENCES public.profiles(id),
  business_type text NOT NULL DEFAULT 'sole_trader'
    CHECK (business_type IN ('sole_trader', 'limited_company')),
  vat_status text NOT NULL DEFAULT 'not_registered'
    CHECK (vat_status IN ('not_registered', 'standard', 'flat_rate')),
  vat_number text,
  flat_rate_percentage numeric,
  flat_rate_start_date date,
  financial_year_end_month integer CHECK (financial_year_end_month BETWEEN 1 AND 12),
  financial_year_end_day integer CHECK (financial_year_end_day BETWEEN 1 AND 31),
  default_payment_terms_days integer DEFAULT 30,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contractor_id)
);

ALTER TABLE public.finance_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Contractors select own finance settings"
  ON public.finance_settings FOR SELECT
  USING (contractor_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Contractors insert own finance settings"
  ON public.finance_settings FOR INSERT
  WITH CHECK (contractor_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Contractors update own finance settings"
  ON public.finance_settings FOR UPDATE
  USING (contractor_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE TRIGGER finance_settings_updated_at
  BEFORE UPDATE ON public.finance_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- =========================================================================
-- contractor_vehicles
-- =========================================================================

CREATE TABLE public.contractor_vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id uuid NOT NULL REFERENCES public.profiles(id),
  name text NOT NULL,
  registration text,
  vehicle_type text NOT NULL DEFAULT 'car'
    CHECK (vehicle_type IN ('car', 'van', 'motorcycle', 'bicycle')),
  mileage_method text NOT NULL DEFAULT 'simplified'
    CHECK (mileage_method IN ('simplified', 'actual_costs')),
  business_use_percentage numeric DEFAULT 100
    CHECK (business_use_percentage BETWEEN 0 AND 100),
  method_locked_tax_year text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.contractor_vehicles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Contractors select own vehicles"
  ON public.contractor_vehicles FOR SELECT
  USING (contractor_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Contractors insert own vehicles"
  ON public.contractor_vehicles FOR INSERT
  WITH CHECK (contractor_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Contractors update own vehicles"
  ON public.contractor_vehicles FOR UPDATE
  USING (contractor_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE TRIGGER contractor_vehicles_updated_at
  BEFORE UPDATE ON public.contractor_vehicles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- =========================================================================
-- hmrc_mileage_rates (platform-managed config, no client writes)
-- =========================================================================

CREATE TABLE public.hmrc_mileage_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_type text NOT NULL,
  threshold_miles integer,
  rate_per_mile numeric NOT NULL,
  effective_from date NOT NULL,
  effective_to date,
  UNIQUE (vehicle_type, threshold_miles, effective_from)
);

ALTER TABLE public.hmrc_mileage_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users read mileage rates"
  ON public.hmrc_mileage_rates FOR SELECT
  TO authenticated
  USING (true);

INSERT INTO public.hmrc_mileage_rates (vehicle_type, threshold_miles, rate_per_mile, effective_from) VALUES
  ('car', 10000, 0.45, '2011-04-06'),
  ('car', NULL, 0.25, '2011-04-06'),
  ('van', 10000, 0.45, '2011-04-06'),
  ('van', NULL, 0.25, '2011-04-06'),
  ('motorcycle', NULL, 0.24, '2011-04-06'),
  ('bicycle', NULL, 0.20, '2011-04-06');

-- =========================================================================
-- expense_categories
-- =========================================================================

CREATE TABLE public.expense_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_contractor_id uuid REFERENCES public.profiles(id),
  parent_id uuid REFERENCES public.expense_categories(id),
  name text NOT NULL,
  hmrc_category text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users read expense categories"
  ON public.expense_categories FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Contractors insert own expense categories"
  ON public.expense_categories FOR INSERT
  WITH CHECK (owner_contractor_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Contractors update own expense categories"
  ON public.expense_categories FOR UPDATE
  USING (owner_contractor_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Contractors delete own expense categories"
  ON public.expense_categories FOR DELETE
  USING (owner_contractor_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

INSERT INTO public.expense_categories (name, hmrc_category, sort_order) VALUES
  ('Materials & Stock', 'cost_of_goods', 1),
  ('Subcontractor Costs', 'subcontractor', 2),
  ('Vehicle & Travel', 'vehicle_travel', 3),
  ('Tools & Equipment', 'tools_equipment', 4),
  ('Premises & Workspace', 'premises', 5),
  ('Office & Admin', 'office_admin', 6),
  ('Insurance', 'insurance', 7),
  ('Professional Fees', 'professional_fees', 8),
  ('Marketing & Advertising', 'marketing', 9),
  ('Training & Development', 'training', 10),
  ('Clothing & PPE', 'clothing_ppe', 11),
  ('Phone & Internet', 'phone_internet', 12),
  ('Other Allowable Expenses', 'other', 13);
