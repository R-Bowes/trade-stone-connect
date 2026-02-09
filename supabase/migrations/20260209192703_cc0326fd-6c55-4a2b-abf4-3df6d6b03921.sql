
-- CRM Clients table
CREATE TABLE public.crm_clients (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contractor_id uuid NOT NULL,
  full_name text NOT NULL,
  email text,
  phone text,
  company_name text,
  address text,
  notes text,
  status text NOT NULL DEFAULT 'active',
  source text DEFAULT 'manual',
  total_revenue numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Contractors can manage their own clients"
ON public.crm_clients FOR ALL
USING (contractor_id = auth.uid());

CREATE TRIGGER update_crm_clients_updated_at
BEFORE UPDATE ON public.crm_clients
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- CRM Activities / Communication history
CREATE TABLE public.crm_activities (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contractor_id uuid NOT NULL,
  client_id uuid NOT NULL REFERENCES public.crm_clients(id) ON DELETE CASCADE,
  activity_type text NOT NULL DEFAULT 'note',
  title text NOT NULL,
  description text,
  activity_date timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Contractors can manage their own activities"
ON public.crm_activities FOR ALL
USING (contractor_id = auth.uid());

-- Index for fast lookups
CREATE INDEX idx_crm_clients_contractor ON public.crm_clients(contractor_id);
CREATE INDEX idx_crm_activities_client ON public.crm_activities(client_id);
CREATE INDEX idx_crm_clients_status ON public.crm_clients(contractor_id, status);
