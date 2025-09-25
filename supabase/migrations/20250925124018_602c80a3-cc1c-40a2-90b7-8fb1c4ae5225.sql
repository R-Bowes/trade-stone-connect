-- Fix security warning: Add search_path to function
CREATE OR REPLACE FUNCTION generate_ts_profile_code()
RETURNS TEXT 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;