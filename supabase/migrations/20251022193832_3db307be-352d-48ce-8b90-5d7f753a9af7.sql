-- Create table for contractor team members
CREATE TABLE public.team_members (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contractor_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text NOT NULL,
  phone text,
  role text NOT NULL,
  hourly_rate numeric(10, 2),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create table for timesheets
CREATE TABLE public.timesheets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contractor_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  team_member_id uuid REFERENCES public.team_members(id) ON DELETE SET NULL,
  project_name text NOT NULL,
  date date NOT NULL,
  hours_worked numeric(5, 2) NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create table for contracts
CREATE TABLE public.contracts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contractor_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  client_name text NOT NULL,
  client_email text NOT NULL,
  client_phone text,
  project_title text NOT NULL,
  project_description text NOT NULL,
  contract_value numeric(10, 2) NOT NULL,
  start_date date NOT NULL,
  end_date date,
  status text NOT NULL DEFAULT 'draft',
  terms text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create table for contractor photos/gallery
CREATE TABLE public.contractor_photos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contractor_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  photo_url text NOT NULL,
  title text,
  description text,
  project_name text,
  is_featured boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timesheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_photos ENABLE ROW LEVEL SECURITY;

-- RLS Policies for team_members
CREATE POLICY "Contractors can manage their own team members"
ON public.team_members
FOR ALL
USING (contractor_id = auth.uid());

-- RLS Policies for timesheets
CREATE POLICY "Contractors can manage their own timesheets"
ON public.timesheets
FOR ALL
USING (contractor_id = auth.uid());

-- RLS Policies for contracts
CREATE POLICY "Contractors can manage their own contracts"
ON public.contracts
FOR ALL
USING (contractor_id = auth.uid());

-- RLS Policies for contractor_photos
CREATE POLICY "Contractors can manage their own photos"
ON public.contractor_photos
FOR ALL
USING (contractor_id = auth.uid());

CREATE POLICY "Anyone can view contractor photos"
ON public.contractor_photos
FOR SELECT
USING (true);

-- Create triggers for updated_at columns
CREATE TRIGGER update_team_members_updated_at
BEFORE UPDATE ON public.team_members
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_timesheets_updated_at
BEFORE UPDATE ON public.timesheets
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_contracts_updated_at
BEFORE UPDATE ON public.contracts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_contractor_photos_updated_at
BEFORE UPDATE ON public.contractor_photos
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();