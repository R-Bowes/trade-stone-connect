-- Tendering chunk 1a: companies.company_code.
--
-- Backfill source verified in Phase 1 (see conversation): companies has no
-- code column of its own. The TS-B code lives on profiles.ts_profile_code
-- for the owning profile (companies.owner_id -> profiles.id), format
-- 'TS-B-XXXXXX'. Confirmed live example from 20260606120000 line 9:
-- companies: 1 row, owner_id clean (7ed6c8e1 -> TS-B-57B38C).
--
-- Same regexp idiom as the quote_number text->integer backfill
-- (20260702150000): strip everything up to and including the last '-'.

ALTER TABLE public.companies ADD COLUMN company_code text;

UPDATE public.companies c
SET company_code = REGEXP_REPLACE(p.ts_profile_code, '^.*-', '')
FROM public.profiles p
WHERE c.owner_id = p.id
  AND c.company_code IS NULL;

ALTER TABLE public.companies
  ALTER COLUMN company_code SET NOT NULL,
  ADD CONSTRAINT companies_company_code_key UNIQUE (company_code);

-- Stamp at creation, alongside profile code generation. Mirrors the
-- ensure-company insert paths (PanelManagement.tsx, BusinessSettings.tsx),
-- both of which insert owner_id but never a code today.
CREATE OR REPLACE FUNCTION public.assign_company_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.company_code IS NULL THEN
    SELECT REGEXP_REPLACE(ts_profile_code, '^.*-', '')
    INTO NEW.company_code
    FROM public.profiles
    WHERE id = NEW.owner_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER assign_company_code_trigger
  BEFORE INSERT ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.assign_company_code();
