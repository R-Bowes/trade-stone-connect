ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS ts_site_code text;
CREATE OR REPLACE FUNCTION public.generate_site_ts_code(p_company_id uuid)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  owner_code     text;
  code           text;
  exists_already boolean;
BEGIN
  SELECT p.ts_profile_code
  INTO   owner_code
  FROM   public.companies c
  JOIN   public.profiles  p ON p.id = c.owner_id
  WHERE  c.id = p_company_id;

  IF owner_code IS NULL OR owner_code = '' THEN
    RAISE EXCEPTION 'Owning company % has no business TS code; cannot derive site code', p_company_id;
  END IF;

  LOOP
    code := owner_code || '-S' || upper(substring(md5(random()::text) from 1 for 6));
    SELECT EXISTS (SELECT 1 FROM public.sites WHERE ts_site_code = code) INTO exists_already;
    EXIT WHEN NOT exists_already;
  END LOOP;

  RETURN code;
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_site_ts_code()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.ts_site_code IS NULL OR NEW.ts_site_code = '' THEN
    NEW.ts_site_code := public.generate_site_ts_code(NEW.company_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_assign_site_ts_code ON public.sites;
CREATE TRIGGER trigger_assign_site_ts_code
  BEFORE INSERT ON public.sites
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_site_ts_code();

  UPDATE public.sites
SET ts_site_code = public.generate_site_ts_code(company_id)
WHERE ts_site_code IS NULL OR ts_site_code = '';

ALTER TABLE public.sites ALTER COLUMN ts_site_code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS sites_ts_site_code_uidx
  ON public.sites(ts_site_code);

  CREATE TABLE IF NOT EXISTS public.site_groups (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name        text NOT NULL,
  group_type  text NOT NULL CHECK (group_type IN ('area','region')),
  created_at  timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_site_groups_company_id ON public.site_groups(company_id);
ALTER TABLE public.site_groups ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.site_group_members (
  group_id uuid NOT NULL REFERENCES public.site_groups(id) ON DELETE CASCADE,
  site_id  uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, site_id)
);
CREATE INDEX IF NOT EXISTS idx_site_group_members_site_id ON public.site_group_members(site_id);
ALTER TABLE public.site_group_members ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS sourcing_policy text NOT NULL DEFAULT 'approved';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'companies_sourcing_policy_check') THEN
    ALTER TABLE public.companies
      ADD CONSTRAINT companies_sourcing_policy_check
      CHECK (sourcing_policy IN ('approved','one_off','unrestricted'));
  END IF;
END $$;