DROP POLICY IF EXISTS "assets_select" ON public.assets;
DROP POLICY IF EXISTS "assets_insert" ON public.assets;
DROP POLICY IF EXISTS "assets_update" ON public.assets;
DROP POLICY IF EXISTS "assets_delete" ON public.assets;

DROP POLICY IF EXISTS "business_members_select" ON public.business_members;
DROP POLICY IF EXISTS "business_members_insert" ON public.business_members;
DROP POLICY IF EXISTS "business_members_update" ON public.business_members;
DROP POLICY IF EXISTS "business_members_delete" ON public.business_members;

DROP POLICY IF EXISTS "Companies readable" ON public.companies;

DROP POLICY IF EXISTS "Company members can read company enquiries" ON public.enquiries;
DROP POLICY IF EXISTS "Company members can create company enquiries" ON public.enquiries;

DROP POLICY IF EXISTS "Company members can view company jobs" ON public.jobs;

DROP POLICY IF EXISTS "sites_select" ON public.sites;
DROP POLICY IF EXISTS "sites_insert" ON public.sites;
DROP POLICY IF EXISTS "sites_update" ON public.sites;
DROP POLICY IF EXISTS "sites_delete" ON public.sites;
DROP POLICY IF EXISTS "Sites accessible by company owner" ON public.sites;

DROP FUNCTION IF EXISTS public.is_company_member(uuid, text[]);
DROP FUNCTION IF EXISTS public.is_site_member(uuid, text[]);

-- Last-owner protection guarded role='owner' rows that no longer exist;
-- the owner is now companies.owner_id (NOT NULL). Drop before deleting owner rows.
DROP TRIGGER IF EXISTS trg_prevent_last_owner_removal ON public.business_members;
DROP FUNCTION IF EXISTS public.prevent_last_owner_removal();

-- Owner is companies.owner_id; their business_members row is redundant.
DELETE FROM public.business_members bm
USING public.companies c
WHERE bm.company_id = c.id AND bm.profile_id = c.owner_id;

-- Coverage columns replace role
ALTER TABLE public.business_members ADD COLUMN IF NOT EXISTS coverage_kind text NOT NULL DEFAULT 'national';
ALTER TABLE public.business_members ADD COLUMN IF NOT EXISTS coverage_group_id uuid REFERENCES public.site_groups(id) ON DELETE CASCADE;
ALTER TABLE public.business_members ADD COLUMN IF NOT EXISTS coverage_site_id  uuid REFERENCES public.sites(id) ON DELETE CASCADE;

-- New invites must state coverage explicitly
ALTER TABLE public.business_members ALTER COLUMN coverage_kind DROP DEFAULT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'business_members_coverage_check') THEN
    ALTER TABLE public.business_members
      ADD CONSTRAINT business_members_coverage_check CHECK (
        (coverage_kind = 'national' AND coverage_group_id IS NULL AND coverage_site_id IS NULL)
        OR (coverage_kind = 'group' AND coverage_group_id IS NOT NULL AND coverage_site_id IS NULL)
        OR (coverage_kind = 'site'  AND coverage_site_id  IS NOT NULL AND coverage_group_id IS NULL)
      );
  END IF;
END $$;

ALTER TABLE public.business_members DROP COLUMN IF EXISTS role;

CREATE OR REPLACE FUNCTION public.is_company_owner(p_company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.companies c
    JOIN public.profiles p ON p.id = c.owner_id
    WHERE c.id = p_company_id AND p.user_id = auth.uid()
  );
$$;
REVOKE ALL     ON FUNCTION public.is_company_owner(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_company_owner(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.is_company_member(p_company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT is_company_owner(p_company_id)
  OR EXISTS (
    SELECT 1 FROM public.business_members bm
    JOIN public.profiles p ON p.id = bm.profile_id
    WHERE bm.company_id = p_company_id AND bm.status = 'active' AND p.user_id = auth.uid()
  );
$$;
REVOKE ALL     ON FUNCTION public.is_company_member(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_company_member(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_access_site(p_site_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_company_id uuid;
BEGIN
  SELECT company_id INTO v_company_id FROM public.sites WHERE id = p_site_id;
  IF v_company_id IS NULL THEN RETURN false; END IF;
  IF is_company_owner(v_company_id) THEN RETURN true; END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.business_members bm
    JOIN public.profiles p ON p.id = bm.profile_id
    WHERE bm.company_id = v_company_id
      AND bm.status = 'active'
      AND p.user_id = auth.uid()
      AND (
        bm.coverage_kind = 'national'
        OR (bm.coverage_kind = 'site' AND bm.coverage_site_id = p_site_id)
        OR (bm.coverage_kind = 'group' AND EXISTS (
              SELECT 1 FROM public.site_group_members sgm
              WHERE sgm.group_id = bm.coverage_group_id AND sgm.site_id = p_site_id
           ))
      )
  );
END;
$$;
REVOKE ALL     ON FUNCTION public.can_access_site(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.can_access_site(uuid) TO authenticated;

-- business_members: owner manages the team; members see only their own row.
CREATE POLICY "business_members_select" ON public.business_members FOR SELECT TO authenticated
USING (
  profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  OR is_company_owner(company_id)
);
CREATE POLICY "business_members_insert" ON public.business_members FOR INSERT TO authenticated
WITH CHECK (is_company_owner(company_id));
CREATE POLICY "business_members_update" ON public.business_members FOR UPDATE TO authenticated
USING (is_company_owner(company_id)) WITH CHECK (is_company_owner(company_id));
CREATE POLICY "business_members_delete" ON public.business_members FOR DELETE TO authenticated
USING (is_company_owner(company_id));

-- sites: coverage accounts see + edit their sites; only the owner adds/removes sites.
CREATE POLICY "sites_select" ON public.sites FOR SELECT TO authenticated
USING (can_access_site(id));
CREATE POLICY "sites_update" ON public.sites FOR UPDATE TO authenticated
USING (can_access_site(id)) WITH CHECK (can_access_site(id));
CREATE POLICY "sites_insert" ON public.sites FOR INSERT TO authenticated
WITH CHECK (is_company_owner(company_id));
CREATE POLICY "sites_delete" ON public.sites FOR DELETE TO authenticated
USING (is_company_owner(company_id));

-- assets: coverage accounts manage assets within their sites.
CREATE POLICY "assets_select" ON public.assets FOR SELECT TO authenticated
USING (can_access_site(site_id));
CREATE POLICY "assets_insert" ON public.assets FOR INSERT TO authenticated
WITH CHECK (can_access_site(site_id));
CREATE POLICY "assets_update" ON public.assets FOR UPDATE TO authenticated
USING (can_access_site(site_id)) WITH CHECK (can_access_site(site_id));
CREATE POLICY "assets_delete" ON public.assets FOR DELETE TO authenticated
USING (can_access_site(site_id));

CREATE POLICY "Companies readable" ON public.companies FOR SELECT TO authenticated
USING (is_company_member(id));

CREATE POLICY "Company members can read company enquiries" ON public.enquiries FOR SELECT TO authenticated
USING (company_id IS NOT NULL AND is_company_member(company_id));

CREATE POLICY "Company members can create company enquiries" ON public.enquiries FOR INSERT TO authenticated
WITH CHECK (
  company_id IS NOT NULL
  AND is_company_member(company_id)
  AND customer_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);

CREATE POLICY "Company members can view company jobs" ON public.jobs FOR SELECT TO authenticated
USING (company_id IS NOT NULL AND is_company_member(company_id));

DROP POLICY IF EXISTS "site_groups_select" ON public.site_groups;
DROP POLICY IF EXISTS "site_groups_insert" ON public.site_groups;
DROP POLICY IF EXISTS "site_groups_update" ON public.site_groups;
DROP POLICY IF EXISTS "site_groups_delete" ON public.site_groups;
DROP POLICY IF EXISTS "site_group_members_select" ON public.site_group_members;
DROP POLICY IF EXISTS "site_group_members_insert" ON public.site_group_members;
DROP POLICY IF EXISTS "site_group_members_delete" ON public.site_group_members;

CREATE POLICY "site_groups_select" ON public.site_groups FOR SELECT TO authenticated
USING (is_company_member(company_id));
CREATE POLICY "site_groups_insert" ON public.site_groups FOR INSERT TO authenticated
WITH CHECK (is_company_owner(company_id));
CREATE POLICY "site_groups_update" ON public.site_groups FOR UPDATE TO authenticated
USING (is_company_owner(company_id)) WITH CHECK (is_company_owner(company_id));
CREATE POLICY "site_groups_delete" ON public.site_groups FOR DELETE TO authenticated
USING (is_company_owner(company_id));

CREATE POLICY "site_group_members_select" ON public.site_group_members FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.site_groups g WHERE g.id = group_id AND is_company_member(g.company_id)));
CREATE POLICY "site_group_members_insert" ON public.site_group_members FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.site_groups g WHERE g.id = group_id AND is_company_owner(g.company_id)));
CREATE POLICY "site_group_members_delete" ON public.site_group_members FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.site_groups g WHERE g.id = group_id AND is_company_owner(g.company_id)));
