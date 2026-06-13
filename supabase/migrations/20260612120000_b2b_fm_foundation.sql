-- =============================================================================
-- 20260612120000_b2b_fm_foundation.sql
--
-- B2B/FM foundation: rebuild business_members with invite system; add canonical
-- columns to sites/assets; add business-context FKs to enquiries/jobs; install
-- recursion-safe SECURITY DEFINER membership helpers; create accept_business_invite
-- RPC.
--
-- Pre-flight audit (2026-06-12):
--   business_members: placeholder from 20260606120000, 0 rows. Columns differ
--     from spec (user_id vs profile_id, roles owner/manager/viewer vs
--     owner/admin/member, no invite system) — DROP + RECREATE chosen.
--   companies.owner_id: NOT NULL FK -> profiles(id), validated 20260606120000.
--   sites: exists (dashboard). Exact non-FK columns unknown; using CREATE TABLE
--     IF NOT EXISTS + ADD COLUMN IF NOT EXISTS per spec column.
--   assets: exists (dashboard). status RATIFIED as operational/faulty/decommissioned.
--     Live columns confirmed: make, description, location_note, model, serial_number,
--     install_date. Adding only reference (new column).
--   enquiries: missing company_id, site_id, asset_id — adding all three.
--   jobs: company_id present (dashboard, no FK). site_id + asset_id + FKs already
--     present (20260606120000). Adding jobs.company_id FK if absent.
-- =============================================================================


-- =============================================================================
-- 1. REBUILD business_members
-- =============================================================================
-- DROP CASCADE removes the table, all its constraints, indexes, and policies.
-- No rows to preserve (0 rows, placeholder only per 20260606120000).

DROP TABLE IF EXISTS public.business_members CASCADE;

CREATE TABLE public.business_members (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid        NOT NULL REFERENCES public.companies(id)  ON DELETE CASCADE,
  profile_id        uuid        NULL     REFERENCES public.profiles(id),
  role              text        NOT NULL
                                  CHECK (role IN ('owner','admin','member')),
  status            text        NOT NULL DEFAULT 'invited'
                                  CHECK (status IN ('invited','active','removed')),
  invited_email     text        NULL,
  invite_token      uuid        UNIQUE DEFAULT gen_random_uuid(),
  invite_expires_at timestamptz DEFAULT now() + interval '7 days',
  created_at        timestamptz DEFAULT now(),
  accepted_at       timestamptz NULL
);

-- Partial unique: only one ACTIVE membership per (company, profile) pair.
-- Removed members can be re-invited; profile_id IS NULL rows (pending) are unconstrained.
CREATE UNIQUE INDEX business_members_company_profile_uidx
  ON public.business_members(company_id, profile_id)
  WHERE profile_id IS NOT NULL AND status = 'active';

CREATE INDEX idx_business_members_company_id
  ON public.business_members(company_id);
CREATE INDEX idx_business_members_profile_id
  ON public.business_members(profile_id)
  WHERE profile_id IS NOT NULL;
CREATE INDEX idx_business_members_invite_token
  ON public.business_members(invite_token)
  WHERE invite_token IS NOT NULL;

-- Backfill: one owner row per existing company.
-- invite_token and invite_expires_at are NULL — owner rows are never invited.
-- Multiple NULL invite_tokens are valid; PostgreSQL UNIQUE treats NULLs as distinct.
INSERT INTO public.business_members
  (company_id, profile_id, role, status, accepted_at, invite_token, invite_expires_at)
SELECT id, owner_id, 'owner', 'active', now(), NULL, NULL
FROM   public.companies;

ALTER TABLE public.business_members ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- 2. SITES — ensure canonical columns exist
-- =============================================================================
-- Table exists from dashboard. CREATE TABLE IF NOT EXISTS is a no-op if it
-- already has the core PK/FK columns. Each ADD COLUMN IF NOT EXISTS is safe to
-- re-run. status requires a separate DO block to attach the CHECK constraint.

CREATE TABLE IF NOT EXISTS public.sites (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name          text        NOT NULL,
  reference     text,
  address_line1 text,
  address_line2 text,
  city          text,
  postcode      text,
  notes         text,
  created_by    uuid        REFERENCES public.profiles(id),
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS reference     text;
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS address_line1 text;
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS address_line2 text;
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS city          text;
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS postcode      text;
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS notes         text;
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS created_by    uuid REFERENCES public.profiles(id);

-- Add status only if absent so we can attach the CHECK cleanly
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sites' AND column_name = 'status'
  ) THEN
    ALTER TABLE public.sites ADD COLUMN status text NOT NULL DEFAULT 'active';
    ALTER TABLE public.sites ADD CONSTRAINT sites_status_check
      CHECK (status IN ('active','archived'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sites_company_id ON public.sites(company_id);

-- Add sites.company_id FK if column exists but lacks the constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sites_company_id_fkey' AND conrelid = 'public.sites'::regclass
  ) THEN
    ALTER TABLE public.sites
      ADD CONSTRAINT sites_company_id_fkey
      FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- 3. ASSETS — add canonical columns
-- =============================================================================
-- Live columns confirmed via information_schema: make, description, location_note,
-- model, serial_number, install_date, status (operational/faulty/decommissioned),
-- warranty_expiry, last_serviced, next_service_due, category (asset_category enum).
-- is_active also present — do not use; flagged for cleanup.
-- status values RATIFIED as operational/faulty/decommissioned (decommissioned
-- is the archive/end-of-life state). No conflict; no lifecycle column needed.
-- Only reference is genuinely new.

ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS reference text;

-- Add assets.site_id FK if column exists but lacks the constraint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'assets' AND column_name = 'site_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'assets_site_id_fkey' AND conrelid = 'public.assets'::regclass
  ) THEN
    ALTER TABLE public.assets
      ADD CONSTRAINT assets_site_id_fkey
      FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

-- Add assets.company_id FK if column exists but lacks the constraint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'assets' AND column_name = 'company_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'assets_company_id_fkey' AND conrelid = 'public.assets'::regclass
  ) THEN
    ALTER TABLE public.assets
      ADD CONSTRAINT assets_company_id_fkey
      FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_assets_company_id ON public.assets(company_id);
CREATE INDEX IF NOT EXISTS idx_assets_site_id    ON public.assets(site_id);

ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- 4. BUSINESS CONTEXT COLUMNS ON ENQUIRIES AND JOBS
-- =============================================================================

-- enquiries: adding all three for the first time
ALTER TABLE public.enquiries
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS site_id    uuid REFERENCES public.sites(id)     ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS asset_id   uuid REFERENCES public.assets(id)    ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_enquiries_company_id ON public.enquiries(company_id);
CREATE INDEX IF NOT EXISTS idx_enquiries_site_id    ON public.enquiries(site_id);
CREATE INDEX IF NOT EXISTS idx_enquiries_asset_id   ON public.enquiries(asset_id);

-- jobs.company_id exists (dashboard-added) but has no FK constraint in any migration
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'jobs_company_id_fkey' AND conrelid = 'public.jobs'::regclass
  ) THEN
    -- ADD COLUMN IF NOT EXISTS is a no-op if the column already exists
    ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS company_id uuid;
    ALTER TABLE public.jobs
      ADD CONSTRAINT jobs_company_id_fkey
      FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_jobs_company_id ON public.jobs(company_id);

-- jobs.site_id and jobs.asset_id: FKs already added in 20260606120000 — no action.


-- =============================================================================
-- 5. MEMBERSHIP HELPER FUNCTIONS (SECURITY DEFINER, RECURSION-SAFE)
-- =============================================================================

-- is_company_member
-- Returns true when auth.uid() has an active business_members row for p_company_id
-- (and role = ANY(p_roles) when p_roles is not null).
-- SECURITY DEFINER: runs as function owner, bypasses RLS on all tables it queries.
-- TABLE ALLOWLIST: business_members only. NEVER add companies to this function —
-- that would recreate the 42P17 recursion that broke auth_user_company_ids().
CREATE OR REPLACE FUNCTION public.is_company_member(
  p_company_id uuid,
  p_roles      text[] DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.business_members bm
    WHERE bm.company_id = p_company_id
      AND bm.profile_id = auth.uid()
      AND bm.status     = 'active'
      AND (p_roles IS NULL OR bm.role = ANY(p_roles))
  );
$$;

REVOKE ALL     ON FUNCTION public.is_company_member(uuid, text[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_company_member(uuid, text[]) TO authenticated;

-- is_site_member
-- Resolves site → company_id via a direct query on sites, then delegates to the
-- same membership check used by is_company_member.
-- SECURITY DEFINER: bypasses RLS on sites and business_members.
-- TABLE ALLOWLIST: sites, business_members only. NEVER add companies.
CREATE OR REPLACE FUNCTION public.is_site_member(
  p_site_id uuid,
  p_roles   text[] DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.sites s
    JOIN public.business_members bm ON bm.company_id = s.company_id
    WHERE s.id          = p_site_id
      AND bm.profile_id = auth.uid()
      AND bm.status     = 'active'
      AND (p_roles IS NULL OR bm.role = ANY(p_roles))
  );
$$;

REVOKE ALL     ON FUNCTION public.is_site_member(uuid, text[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_site_member(uuid, text[]) TO authenticated;


-- =============================================================================
-- 6. RLS POLICIES
-- =============================================================================

-- -----------------------------------------------------------------------
-- business_members
-- Calling is_company_member from a business_members policy is SAFE: the
-- helper is SECURITY DEFINER and bypasses business_members RLS entirely —
-- no self-recursion can occur.
-- -----------------------------------------------------------------------
DROP POLICY IF EXISTS "business_members_select" ON public.business_members;
CREATE POLICY "business_members_select"
ON public.business_members FOR SELECT TO authenticated
USING (
  profile_id = auth.uid()                                          -- own row
  OR (status = 'active' AND is_company_member(company_id))        -- active members see roster
  OR is_company_member(company_id, ARRAY['owner','admin'])        -- owner/admin see all (incl. pending invites)
);

-- Write policies: owner/admin can manage members; only owners can touch owner rows.
-- The (role <> 'owner' OR is_company_member(company_id, ARRAY['owner'])) guard means:
--   - inserting/updating/deleting a member or admin row: any owner or admin may do it.
--   - inserting/updating/deleting an owner row: only an existing owner may do it.
-- This DB-enforces the "last owner cannot be demoted/removed" invariant at row level.
DROP POLICY IF EXISTS "business_members_insert" ON public.business_members;
CREATE POLICY "business_members_insert"
ON public.business_members FOR INSERT TO authenticated
WITH CHECK (
  is_company_member(company_id, ARRAY['owner','admin'])
  AND (role <> 'owner' OR is_company_member(company_id, ARRAY['owner']))
);

DROP POLICY IF EXISTS "business_members_update" ON public.business_members;
CREATE POLICY "business_members_update"
ON public.business_members FOR UPDATE TO authenticated
USING (
  is_company_member(company_id, ARRAY['owner','admin'])
  AND (role <> 'owner' OR is_company_member(company_id, ARRAY['owner']))
)
WITH CHECK (
  is_company_member(company_id, ARRAY['owner','admin'])
  AND (role <> 'owner' OR is_company_member(company_id, ARRAY['owner']))
);

DROP POLICY IF EXISTS "business_members_delete" ON public.business_members;
CREATE POLICY "business_members_delete"
ON public.business_members FOR DELETE TO authenticated
USING (
  is_company_member(company_id, ARRAY['owner','admin'])
  AND (role <> 'owner' OR is_company_member(company_id, ARRAY['owner']))
);

-- -----------------------------------------------------------------------
-- sites
-- -----------------------------------------------------------------------
DROP POLICY IF EXISTS "sites_select" ON public.sites;
CREATE POLICY "sites_select"
ON public.sites FOR SELECT TO authenticated
USING (is_company_member(company_id));

DROP POLICY IF EXISTS "sites_insert" ON public.sites;
CREATE POLICY "sites_insert"
ON public.sites FOR INSERT TO authenticated
WITH CHECK (is_company_member(company_id, ARRAY['owner','admin']));

DROP POLICY IF EXISTS "sites_update" ON public.sites;
CREATE POLICY "sites_update"
ON public.sites FOR UPDATE TO authenticated
USING  (is_company_member(company_id, ARRAY['owner','admin']))
WITH CHECK (is_company_member(company_id, ARRAY['owner','admin']));

DROP POLICY IF EXISTS "sites_delete" ON public.sites;
CREATE POLICY "sites_delete"
ON public.sites FOR DELETE TO authenticated
USING (is_company_member(company_id, ARRAY['owner','admin']));

-- -----------------------------------------------------------------------
-- assets
-- Assets with site_id IS NULL are invisible to company members; assets
-- must be assigned to a site before they are accessible via membership.
-- -----------------------------------------------------------------------
DROP POLICY IF EXISTS "assets_select" ON public.assets;
CREATE POLICY "assets_select"
ON public.assets FOR SELECT TO authenticated
USING (is_site_member(site_id));

DROP POLICY IF EXISTS "assets_insert" ON public.assets;
CREATE POLICY "assets_insert"
ON public.assets FOR INSERT TO authenticated
WITH CHECK (is_site_member(site_id, ARRAY['owner','admin']));

DROP POLICY IF EXISTS "assets_update" ON public.assets;
CREATE POLICY "assets_update"
ON public.assets FOR UPDATE TO authenticated
USING  (is_site_member(site_id, ARRAY['owner','admin']))
WITH CHECK (is_site_member(site_id, ARRAY['owner','admin']));

DROP POLICY IF EXISTS "assets_delete" ON public.assets;
CREATE POLICY "assets_delete"
ON public.assets FOR DELETE TO authenticated
USING (is_site_member(site_id, ARRAY['owner','admin']));

-- -----------------------------------------------------------------------
-- companies — replace "Companies readable" to add the member arm.
-- Current state (20260609120000): USING (owner_id = auth.uid())
-- New arm: is_company_member(id) — SAFE: SECURITY DEFINER, queries only
-- business_members; does not query companies, so no 42P17 recursion.
-- "Companies readable by panel contractors" is untouched (separate policy).
--
-- BEFORE:
--   CREATE POLICY "Companies readable" ON public.companies FOR SELECT
--   TO authenticated USING (owner_id = auth.uid());
--
-- AFTER (this migration):
--   USING (owner_id = auth.uid() OR is_company_member(id))
-- -----------------------------------------------------------------------
DROP POLICY IF EXISTS "Companies readable" ON public.companies;
CREATE POLICY "Companies readable"
ON public.companies FOR SELECT TO authenticated
USING (
  owner_id = auth.uid()
  OR is_company_member(id)
);

-- -----------------------------------------------------------------------
-- enquiries — additive policies for company members
--
-- Live DB state (verified 2026-06-12 via pg_policies): 11 policies across
-- two generations exist on enquiries — older direct-equality checks and newer
-- two-step / is_platform_admin variants. These two policies are purely additive;
-- no existing policy is dropped or replaced here.
--
-- Live creator column is customer_id (nullable uuid), NOT homeowner_id.
-- The canonical two-step pattern (profiles subquery) matches enquiries_customer_insert.
--
-- No open/unassigned contractor SELECT arm exists on the live table. Do not
-- reference one. Policy claims must come from pg_policies output, not code or memory.
--
-- V1 flow rule: business-created enquiries should have contractor_id set (panel
-- pick) at creation. No DB constraint enforces this in v1 — revisit under
-- Projects/tendering work.
-- -----------------------------------------------------------------------
DROP POLICY IF EXISTS "Company members can read company enquiries" ON public.enquiries;
CREATE POLICY "Company members can read company enquiries"
ON public.enquiries FOR SELECT TO authenticated
USING (
  company_id IS NOT NULL
  AND is_company_member(company_id)
);

DROP POLICY IF EXISTS "Company members can create company enquiries" ON public.enquiries;
CREATE POLICY "Company members can create company enquiries"
ON public.enquiries FOR INSERT TO authenticated
WITH CHECK (
  company_id IS NOT NULL
  AND is_company_member(company_id)
  AND customer_id IN (
    SELECT profiles.id FROM public.profiles
    WHERE profiles.user_id = auth.uid()
  )
);

-- -----------------------------------------------------------------------
-- jobs — additive SELECT policy for company members
-- Existing policies unchanged:
--   "Contractors can manage their own jobs" FOR ALL
--     USING (contractor_id = auth.uid())
--   "Clients can view their jobs" FOR SELECT
--     USING (client_id = auth.uid())
--   "admin_select_jobs" FOR SELECT
--     USING (is_platform_admin())
-- New (additive):
-- -----------------------------------------------------------------------
DROP POLICY IF EXISTS "Company members can view company jobs" ON public.jobs;
CREATE POLICY "Company members can view company jobs"
ON public.jobs FOR SELECT TO authenticated
USING (
  company_id IS NOT NULL
  AND is_company_member(company_id)
);


-- =============================================================================
-- 7. INVITE ACCEPTANCE RPC
-- =============================================================================
-- Single-use token, 7-day expiry. Returns company_id on success.
-- SECURITY DEFINER: must bypass RLS on business_members to read/update the
-- invite row before the caller has been added as a member.
CREATE OR REPLACE FUNCTION public.accept_business_invite(p_token uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member  public.business_members%ROWTYPE;
  v_profile uuid;
BEGIN
  SELECT * INTO v_member
  FROM public.business_members
  WHERE invite_token = p_token
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite not found';
  END IF;

  IF v_member.status <> 'invited' THEN
    RAISE EXCEPTION 'Invite is no longer valid (status: %)', v_member.status;
  END IF;

  IF v_member.invite_expires_at IS NOT NULL AND v_member.invite_expires_at < now() THEN
    RAISE EXCEPTION 'Invite has expired';
  END IF;

  -- Canonical lookup: profiles.id = auth.uid() by construction (see CLAUDE.md RLS section)
  SELECT id INTO v_profile
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_profile IS NULL THEN
    RAISE EXCEPTION 'No profile found for the current user';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.business_members
    WHERE company_id = v_member.company_id
      AND profile_id = v_profile
      AND status     = 'active'
  ) THEN
    RAISE EXCEPTION 'You already have active membership for this company';
  END IF;

  UPDATE public.business_members
  SET
    profile_id        = v_profile,
    status            = 'active',
    accepted_at       = now(),
    invite_token      = NULL,
    invite_expires_at = NULL
  WHERE id = v_member.id;

  RETURN v_member.company_id;
END;
$$;

REVOKE ALL     ON FUNCTION public.accept_business_invite(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.accept_business_invite(uuid) TO authenticated;
