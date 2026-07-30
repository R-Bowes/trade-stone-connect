-- SCORING.md Phase 1: Verification Tiers & Compliance Gate
-- Step 0 schema report confirmed contractor_verification and
-- contractor_register_checks do not exist live — no collision.
-- (contractor_credentials DOES already exist live with a different shape;
-- handled separately in 20260730110000_extend_contractor_credentials.sql —
-- extended in place rather than duplicated, per review.)

-- =============================================================================
-- 1. CONTRACTOR_VERIFICATION — one row per contractor, tracks tier + gate state
-- =============================================================================

CREATE TABLE public.contractor_verification (
  contractor_id             uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  current_tier              integer NOT NULL DEFAULT 1 CHECK (current_tier BETWEEN 1 AND 4),
  tier_2_achieved_at        timestamptz,
  tier_3_achieved_at        timestamptz,
  tier_4_achieved_at        timestamptz,
  identity_verified         boolean NOT NULL DEFAULT false,
  phone_verified            boolean NOT NULL DEFAULT false,
  insurance_expires_at      date,
  insurance_verified        boolean NOT NULL DEFAULT false,
  dbs_expires_at            date,
  dbs_verified              boolean NOT NULL DEFAULT false,
  companies_house_status    text, -- 'active', 'dissolved', etc.
  companies_house_checked_at timestamptz,
  last_register_check_at    timestamptz,
  suspended                 boolean NOT NULL DEFAULT false,
  suspended_reason          text,
  suspended_at              timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.contractor_verification ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Contractors select own verification row"
  ON public.contractor_verification FOR SELECT
  TO authenticated
  USING (contractor_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

-- Contractors may update only their own self-declared columns (phone
-- verification handoff, nothing that affects tier/suspension/verified
-- flags). USING gates row ownership; WITH CHECK re-asserts it on the new
-- row. Column-level restriction to a narrow allowlist is enforced by
-- REVOKE + targeted GRANT below, since RLS alone cannot restrict columns.
CREATE POLICY "Contractors update own verification row"
  ON public.contractor_verification FOR UPDATE
  TO authenticated
  USING (contractor_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()))
  WITH CHECK (contractor_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

REVOKE UPDATE ON public.contractor_verification FROM authenticated;
GRANT UPDATE (updated_at) ON public.contractor_verification TO authenticated;
-- No self-serve column currently exists for contractors to edit directly
-- (identity/insurance/dbs/companies-house/tier/suspension are all
-- system-or-admin-verified). This grant exists so the UPDATE policy has at
-- least one legal column and is ready if a genuinely self-declared field
-- (e.g. a "renewal requested" flag) is added later — add its GRANT here
-- alongside, never widen to current_tier/suspended/*_verified/*_achieved_at.

CREATE POLICY "Service role full access to verification"
  ON public.contractor_verification FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE TRIGGER contractor_verification_updated_at
  BEFORE UPDATE ON public.contractor_verification
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX idx_contractor_verification_insurance_expiry
  ON public.contractor_verification(insurance_expires_at)
  WHERE insurance_expires_at IS NOT NULL;

-- =============================================================================
-- 2. CONTRACTOR_REGISTER_CHECKS — Gas Safe / NICEIC / NAPIT / FGAS lookups
-- =============================================================================

CREATE TABLE public.contractor_register_checks (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  register_name       text NOT NULL, -- 'gas_safe', 'niceic', 'napit', 'fgas'
  registration_number text,
  status               text NOT NULL, -- 'verified', 'not_found', 'expired', 'revoked'
  checked_at          timestamptz NOT NULL DEFAULT now(),
  expires_at          date,
  raw_response        jsonb
);

ALTER TABLE public.contractor_register_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Contractors select own register checks"
  ON public.contractor_register_checks FOR SELECT
  TO authenticated
  USING (contractor_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

-- Register checks are system-initiated (admin tooling / a future register
-- API integration), never contractor-submitted — INSERT/UPDATE restricted
-- to service_role only, no authenticated write policy at all.
CREATE POLICY "Service role full access to register checks"
  ON public.contractor_register_checks FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_contractor_register_checks_contractor
  ON public.contractor_register_checks(contractor_id);
