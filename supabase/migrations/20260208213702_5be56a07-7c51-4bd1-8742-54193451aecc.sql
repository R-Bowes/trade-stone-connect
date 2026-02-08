
-- Create schedule_events table for contractor job calendar
CREATE TABLE public.schedule_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contractor_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  event_type TEXT NOT NULL DEFAULT 'job',
  client_name TEXT,
  client_phone TEXT,
  location TEXT,
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE NOT NULL,
  all_day BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'scheduled',
  color TEXT DEFAULT '#e87722',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create availability_slots table for working hours
CREATE TABLE public.availability_slots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contractor_id UUID NOT NULL,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TIME NOT NULL DEFAULT '08:00',
  end_time TIME NOT NULL DEFAULT '17:00',
  is_available BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(contractor_id, day_of_week)
);

-- Enable RLS
ALTER TABLE public.schedule_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.availability_slots ENABLE ROW LEVEL SECURITY;

-- RLS for schedule_events
CREATE POLICY "Contractors can view their own events"
  ON public.schedule_events FOR SELECT
  USING (contractor_id = auth.uid());

CREATE POLICY "Contractors can insert their own events"
  ON public.schedule_events FOR INSERT
  WITH CHECK (contractor_id = auth.uid());

CREATE POLICY "Contractors can update their own events"
  ON public.schedule_events FOR UPDATE
  USING (contractor_id = auth.uid());

CREATE POLICY "Contractors can delete their own events"
  ON public.schedule_events FOR DELETE
  USING (contractor_id = auth.uid());

-- RLS for availability_slots
CREATE POLICY "Contractors can view their own availability"
  ON public.availability_slots FOR SELECT
  USING (contractor_id = auth.uid());

CREATE POLICY "Contractors can insert their own availability"
  ON public.availability_slots FOR INSERT
  WITH CHECK (contractor_id = auth.uid());

CREATE POLICY "Contractors can update their own availability"
  ON public.availability_slots FOR UPDATE
  USING (contractor_id = auth.uid());

CREATE POLICY "Contractors can delete their own availability"
  ON public.availability_slots FOR DELETE
  USING (contractor_id = auth.uid());

-- Triggers for updated_at
CREATE TRIGGER update_schedule_events_updated_at
  BEFORE UPDATE ON public.schedule_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_availability_slots_updated_at
  BEFORE UPDATE ON public.availability_slots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
