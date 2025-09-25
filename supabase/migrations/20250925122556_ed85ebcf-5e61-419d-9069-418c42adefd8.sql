-- Add TS profile number to profiles table
ALTER TABLE public.profiles ADD COLUMN ts_profile_code TEXT UNIQUE;

-- Create function to generate unique TS profile codes
CREATE OR REPLACE FUNCTION generate_ts_profile_code()
RETURNS TEXT AS $$
DECLARE
    code TEXT;
    exists_count INT;
BEGIN
    LOOP
        -- Generate random 6-character alphanumeric code
        code := UPPER(
            SUBSTRING(MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT) FROM 1 FOR 6)
        );
        
        -- Check if code already exists
        SELECT COUNT(*) INTO exists_count 
        FROM public.profiles 
        WHERE ts_profile_code = code;
        
        -- Exit loop if code is unique
        EXIT WHEN exists_count = 0;
    END LOOP;
    
    RETURN code;
END;
$$ LANGUAGE plpgsql;

-- Update existing profiles to have TS codes
UPDATE public.profiles 
SET ts_profile_code = generate_ts_profile_code() 
WHERE ts_profile_code IS NULL;

-- Create quotes table
CREATE TABLE public.quotes (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    contractor_id UUID NOT NULL REFERENCES public.profiles(user_id),
    customer_name TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    customer_phone TEXT,
    project_title TEXT NOT NULL,
    project_description TEXT NOT NULL,
    project_location TEXT,
    budget_range TEXT,
    timeline TEXT,
    additional_details JSONB DEFAULT '{}',
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'viewed', 'responded', 'accepted', 'declined')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on quotes table
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for quotes
CREATE POLICY "Contractors can view their own quotes" 
ON public.quotes 
FOR SELECT 
USING (contractor_id = auth.uid());

CREATE POLICY "Anyone can create quotes" 
ON public.quotes 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Contractors can update their own quotes" 
ON public.quotes 
FOR UPDATE 
USING (contractor_id = auth.uid());

-- Create quote form templates table for customizable forms
CREATE TABLE public.quote_form_templates (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    contractor_id UUID NOT NULL REFERENCES public.profiles(user_id),
    template_name TEXT NOT NULL DEFAULT 'Default Quote Form',
    fields JSONB NOT NULL DEFAULT '[
        {"name": "project_title", "label": "Project Title", "type": "text", "required": true},
        {"name": "project_description", "label": "Project Description", "type": "textarea", "required": true},
        {"name": "project_location", "label": "Project Location", "type": "text", "required": false},
        {"name": "budget_range", "label": "Budget Range", "type": "select", "options": ["Under £1,000", "£1,000-£5,000", "£5,000-£10,000", "£10,000-£25,000", "£25,000+"], "required": false},
        {"name": "timeline", "label": "Preferred Timeline", "type": "select", "options": ["ASAP", "Within 1 month", "1-3 months", "3-6 months", "6+ months"], "required": false}
    ]',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on quote form templates
ALTER TABLE public.quote_form_templates ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for quote form templates
CREATE POLICY "Contractors can manage their own quote form templates" 
ON public.quote_form_templates 
FOR ALL 
USING (contractor_id = auth.uid());

CREATE POLICY "Anyone can view active quote form templates" 
ON public.quote_form_templates 
FOR SELECT 
USING (is_active = true);

-- Create trigger to update updated_at columns
CREATE TRIGGER update_quotes_updated_at
    BEFORE UPDATE ON public.quotes
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_quote_form_templates_updated_at
    BEFORE UPDATE ON public.quote_form_templates
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Update handle_new_user function to assign TS profile code
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, email, full_name, user_type, ts_profile_code)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data ->> 'full_name', ''),
    COALESCE((new.raw_user_meta_data ->> 'user_type')::user_type, 'standard'),
    generate_ts_profile_code()
  );
  
  -- Create default quote form template for new users
  INSERT INTO public.quote_form_templates (contractor_id, template_name, fields)
  VALUES (
    new.id,
    'Default Quote Form',
    '[
        {"name": "project_title", "label": "Project Title", "type": "text", "required": true},
        {"name": "project_description", "label": "Project Description", "type": "textarea", "required": true},
        {"name": "project_location", "label": "Project Location", "type": "text", "required": false},
        {"name": "budget_range", "label": "Budget Range", "type": "select", "options": ["Under £1,000", "£1,000-£5,000", "£5,000-£10,000", "£10,000-£25,000", "£25,000+"], "required": false},
        {"name": "timeline", "label": "Preferred Timeline", "type": "select", "options": ["ASAP", "Within 1 month", "1-3 months", "3-6 months", "6+ months"], "required": false}
    ]'::jsonb
  );
  
  RETURN new;
END;
$function$;