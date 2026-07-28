-- Finance Tier 1, Slice 3: mileage tracking

CREATE TABLE public.mileage_trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id uuid NOT NULL REFERENCES public.profiles(id),
  vehicle_id uuid NOT NULL REFERENCES public.contractor_vehicles(id),
  trip_date date NOT NULL DEFAULT CURRENT_DATE,
  from_location text NOT NULL,
  to_location text NOT NULL,
  miles numeric NOT NULL CHECK (miles > 0),
  purpose text,
  job_id uuid REFERENCES public.jobs(id),
  project_id uuid REFERENCES public.projects(id),
  claim_amount numeric NOT NULL DEFAULT 0,
  tax_year text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mileage_trips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Contractors select own mileage trips"
  ON public.mileage_trips FOR SELECT
  USING (contractor_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Contractors insert own mileage trips"
  ON public.mileage_trips FOR INSERT
  WITH CHECK (contractor_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Contractors update own mileage trips"
  ON public.mileage_trips FOR UPDATE
  USING (contractor_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Contractors delete own mileage trips"
  ON public.mileage_trips FOR DELETE
  USING (contractor_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE TRIGGER mileage_trips_updated_at
  BEFORE UPDATE ON public.mileage_trips
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
