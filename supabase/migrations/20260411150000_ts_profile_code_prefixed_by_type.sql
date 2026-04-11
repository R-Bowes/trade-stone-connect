-- Update generate_ts_profile_code to accept a user_type and produce
-- correctly-prefixed codes:
--   contractor → TS-C-XXXXXX
--   business   → TS-B-XXXXXX
--   personal   → TS-P-XXXXXX  (default)
--
-- The function retains backwards-compatibility: calling it with no
-- argument defaults to 'personal' so existing call-sites that don't
-- pass user_type continue to work.

CREATE OR REPLACE FUNCTION public.generate_ts_profile_code(
  p_user_type text DEFAULT 'personal'
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prefix     text;
  rand_part  text;
  full_code  text;
  cnt        int;
BEGIN
  prefix := CASE p_user_type
    WHEN 'contractor' THEN 'TS-C-'
    WHEN 'business'   THEN 'TS-B-'
    ELSE                   'TS-P-'
  END;

  LOOP
    rand_part := UPPER(
      SUBSTRING(MD5(RANDOM()::text || CLOCK_TIMESTAMP()::text) FROM 1 FOR 6)
    );
    full_code := prefix || rand_part;

    SELECT COUNT(*) INTO cnt
    FROM public.profiles
    WHERE ts_profile_code = full_code;

    EXIT WHEN cnt = 0;
  END LOOP;

  RETURN full_code;
END;
$$;

-- Update handle_new_user to pass the user_type so new registrations
-- receive the correct prefix immediately.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_type text;
BEGIN
  v_user_type := COALESCE(new.raw_user_meta_data ->> 'user_type', 'personal');

  INSERT INTO public.profiles (user_id, email, full_name, user_type, ts_profile_code)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data ->> 'full_name', ''),
    v_user_type::user_type,
    generate_ts_profile_code(v_user_type)
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

-- Backfill existing profiles that have no ts_profile_code.
-- Profiles that already have a code are left untouched to avoid
-- breaking existing quote numbers.
UPDATE public.profiles
SET ts_profile_code = generate_ts_profile_code(user_type::text)
WHERE ts_profile_code IS NULL;
