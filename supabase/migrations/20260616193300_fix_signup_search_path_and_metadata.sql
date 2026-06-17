-- Fix: signup failed with `type "user_type" does not exist`.
-- Root cause: trigger functions ran without `public` in search_path, so the
-- unqualified user_type enum cast couldn't resolve. Add explicit search_path to
-- the signup-path functions and qualify the enum. Also fix handle_new_user to
-- read the `user_type` metadata key the app actually sends (was `account_type`),
-- and persist company_name.

CREATE OR REPLACE FUNCTION public.generate_ts_code(user_type_val text)
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
  prefix text;
  code text;
  exists boolean;
BEGIN
  prefix := CASE user_type_val
    WHEN 'contractor' THEN 'TS-C-'
    WHEN 'business' THEN 'TS-B-'
    ELSE 'TS-P-'
  END;
  LOOP
    code := prefix || upper(substring(md5(random()::text) from 1 for 6));
    SELECT EXISTS (
      SELECT 1 FROM profiles WHERE ts_profile_code = code
    ) INTO exists;
    EXIT WHEN NOT exists;
  END LOOP;
  RETURN code;
END;
$function$;

CREATE OR REPLACE FUNCTION public.assign_ts_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  IF NEW.ts_profile_code IS NULL OR NEW.ts_profile_code = '' THEN
    NEW.ts_profile_code := generate_ts_code(NEW.user_type::text);
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF (NEW.raw_user_meta_data->>'is_tradestone_admin') = 'true' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.profiles (
    id,
    user_id,
    full_name,
    email,
    user_type,
    company_name
  )
  VALUES (
    NEW.id,
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.email,
    COALESCE(
      (NEW.raw_user_meta_data->>'user_type')::public.user_type,
      'personal'::public.user_type
    ),
    NEW.raw_user_meta_data->>'company_name'
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$function$;
