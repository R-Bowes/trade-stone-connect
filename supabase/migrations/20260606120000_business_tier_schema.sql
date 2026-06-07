-- =============================================================================
-- 20260606120000_business_tier_schema.sql
--
-- Formalises and secures the business-tier tables that were created via the
-- Supabase dashboard. ADDITIVE ONLY — no existing table, column, policy, or
-- FK is altered or removed. The contractor/homeowner job flow is untouched.
--
-- Pre-flight audit (run 2026-06-06):
--   companies: 1 row, owner_id clean (7ed6c8e1 → TS-B-57B38C). No orphans.
--   RLS disabled on companies; 4 policies already exist.
--   sla_rules: missing UPDATE policy.
--   Missing FK indexes on sites/assets/sla_rules company_id and assets.site_id.
-- =============================================================================


-- =============================================================================
-- A. companies.owner_id — FK, NOT NULL, index, enable RLS
-- =============================================================================

-- Add FK NOT VALID first (fast, non-blocking), then validate (verifies data
-- without locking writers). Data is confirmed clean so VALIDATE will succeed.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'companies_owner_id_fkey'
      AND conrelid = 'public.companies'::regclass
  ) THEN
    ALTER TABLE public.companies
      ADD CONSTRAINT companies_owner_id_fkey
      FOREIGN KEY (owner_id) REFERENCES public.profiles(id) ON DELETE CASCADE
      NOT VALID;
  END IF;
END $$;

ALTER TABLE public.companies
  VALIDATE CONSTRAINT companies_owner_id_fkey;

-- All existing rows have a clean owner_id; set NOT NULL.
ALTER TABLE public.companies
  ALTER COLUMN owner_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_companies_owner_id
  ON public.companies(owner_id);

-- Enable RLS — surfaces the four pre-existing policies.
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- B. sla_rules — add missing UPDATE policy
--    (SELECT x2, INSERT, DELETE already exist; UPDATE was absent)
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'sla_rules'
      AND policyname = 'SLA rules updatable by company owner'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "SLA rules updatable by company owner"
      ON public.sla_rules FOR UPDATE TO authenticated
      USING (company_id IN (
        SELECT c.id
        FROM public.companies c
        JOIN public.profiles p ON p.id = c.owner_id
        WHERE p.user_id = auth.uid()
      ))
      WITH CHECK (company_id IN (
        SELECT c.id
        FROM public.companies c
        JOIN public.profiles p ON p.id = c.owner_id
        WHERE p.user_id = auth.uid()
      ))
    $p$;
  END IF;
END $$;


-- =============================================================================
-- C. assets — additive columns (category enum untouched)
-- =============================================================================

ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS location_note    text,
  ADD COLUMN IF NOT EXISTS warranty_expiry  date,
  ADD COLUMN IF NOT EXISTS last_serviced    date,
  ADD COLUMN IF NOT EXISTS next_service_due date,
  ADD COLUMN IF NOT EXISTS status           text NOT NULL DEFAULT 'operational';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'assets_status_check'
      AND conrelid = 'public.assets'::regclass
  ) THEN
    ALTER TABLE public.assets
      ADD CONSTRAINT assets_status_check
      CHECK (status IN ('operational', 'faulty', 'decommissioned'));
  END IF;
END $$;


-- =============================================================================
-- D. jobs — add site_id and asset_id (both nullable; existing flow unaffected)
--    priority, company_id, sla_rule_id already exist — not touched.
-- =============================================================================

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS site_id  uuid REFERENCES public.sites(id)  ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS asset_id uuid REFERENCES public.assets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_site_id  ON public.jobs(site_id);
CREATE INDEX IF NOT EXISTS idx_jobs_asset_id ON public.jobs(asset_id);


-- =============================================================================
-- E. business_members — new forward-compatible placeholder table
--    No trigger, no backfill, no owner auto-population; handle_new_user untouched.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.business_members (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES public.profiles(id)  ON DELETE CASCADE,
  role       text        NOT NULL DEFAULT 'owner'
               CHECK (role IN ('owner', 'manager', 'viewer')),
  site_scope uuid        REFERENCES public.sites(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, user_id)
);

ALTER TABLE public.business_members ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_business_members_company_id
  ON public.business_members(company_id);
CREATE INDEX IF NOT EXISTS idx_business_members_user_id
  ON public.business_members(user_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'business_members'
      AND policyname = 'business_members_select'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "business_members_select"
      ON public.business_members FOR SELECT TO authenticated
      USING (
        company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid())
        OR user_id = auth.uid()
      )
    $p$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'business_members'
      AND policyname = 'business_members_insert'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "business_members_insert"
      ON public.business_members FOR INSERT TO authenticated
      WITH CHECK (
        company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid())
      )
    $p$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'business_members'
      AND policyname = 'business_members_update'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "business_members_update"
      ON public.business_members FOR UPDATE TO authenticated
      USING (
        company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid())
      )
      WITH CHECK (
        company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid())
      )
    $p$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'business_members'
      AND policyname = 'business_members_delete'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "business_members_delete"
      ON public.business_members FOR DELETE TO authenticated
      USING (
        company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid())
      )
    $p$;
  END IF;
END $$;


-- =============================================================================
-- F. Indexes on existing FK columns where missing
--    contractor_panel.company_id: already covered by UNIQUE(company_id, contractor_id)
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_sites_company_id
  ON public.sites(company_id);
CREATE INDEX IF NOT EXISTS idx_assets_company_id
  ON public.assets(company_id);
CREATE INDEX IF NOT EXISTS idx_assets_site_id
  ON public.assets(site_id);
CREATE INDEX IF NOT EXISTS idx_sla_rules_company_id
  ON public.sla_rules(company_id);
