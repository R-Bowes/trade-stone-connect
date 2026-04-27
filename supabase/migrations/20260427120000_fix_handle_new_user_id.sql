-- Fix handle_new_user: include id = new.id so that profiles.id matches
-- auth.users.id, satisfying the profiles_id_fkey_auth_users FK constraint
-- added in 20260328110000_align_tradestone_core_schema.sql.
--
-- Also scope the quote_form_templates insert to contractor signups only,
-- since personal/business users don't need a quote form template.

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

  INSERT INTO public.profiles (id, user_id, email, full_name, user_type, ts_profile_code)
  VALUES (
    new.id,
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data ->> 'full_name', ''),
    v_user_type::user_type,
    generate_ts_profile_code(v_user_type)
  );

  IF v_user_type = 'contractor' THEN
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
  END IF;

  RETURN new;
END;
$function$;
