-- Step 1: Create new enum type with all 3 account types
CREATE TYPE public.user_type_new AS ENUM ('personal', 'business', 'contractor');

-- Step 2: Update the profiles table to use the new enum
ALTER TABLE public.profiles 
  ALTER COLUMN user_type DROP DEFAULT;

ALTER TABLE public.profiles 
  ALTER COLUMN user_type TYPE public.user_type_new 
  USING (
    CASE user_type::text
      WHEN 'pro' THEN 'contractor'::public.user_type_new
      WHEN 'standard' THEN 'personal'::public.user_type_new
      ELSE 'personal'::public.user_type_new
    END
  );

ALTER TABLE public.profiles 
  ALTER COLUMN user_type SET DEFAULT 'personal'::public.user_type_new;

-- Step 3: Drop old enum and rename new one
DROP TYPE public.user_type;
ALTER TYPE public.user_type_new RENAME TO user_type;

-- Step 4: Update the handle_new_user function to use new enum values
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
    COALESCE((new.raw_user_meta_data ->> 'user_type')::user_type, 'personal'),
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