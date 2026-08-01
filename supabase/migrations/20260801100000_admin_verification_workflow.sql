-- Verification display + admin verification workflow.
--
-- contractor_verification and contractor_credentials already exist (see
-- 20260730100000_verification_tiers_schema.sql, 20260730110000_extend_contractor_credentials.sql).
-- This migration: backfills rows, auto-creates rows for new contractors,
-- adds a narrow public-read view for the tier badge (pattern 1 from
-- CLAUDE.md's "View idioms" — contractor_verification's own RLS is
-- own-row + service_role only, so a wider public slice needs its own view
-- rather than a blanket authenticated SELECT policy that would also expose
-- suspended_reason / dbs_expires_at / companies_house_status to anyone),
-- gives admins read/write access, and centralises tier recalculation in one
-- SECURITY DEFINER function so every write path (credential verify/reject,
-- manual field edits) stays consistent.

-- =============================================================================
-- 1. Backfill contractor_verification for existing contractors
-- =============================================================================

INSERT INTO public.contractor_verification (contractor_id, current_tier)
SELECT id, 1 FROM public.profiles
WHERE user_type = 'contractor'
AND id NOT IN (SELECT contractor_id FROM public.contractor_verification);

UPDATE public.contractor_verification cv
SET current_tier = 2, identity_verified = true,
    tier_2_achieved_at = COALESCE(cv.tier_2_achieved_at, now())
FROM public.profiles p
WHERE cv.contractor_id = p.id
AND p.stripe_account_id IS NOT NULL
AND cv.current_tier < 2;

-- =============================================================================
-- 2. Auto-create a verification row for every new contractor profile
-- =============================================================================

CREATE OR REPLACE FUNCTION public.auto_create_verification_row()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.user_type = 'contractor' THEN
    INSERT INTO public.contractor_verification (contractor_id, current_tier)
    VALUES (NEW.id, 1)
    ON CONFLICT (contractor_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auto_create_verification_row_trigger ON public.profiles;
CREATE TRIGGER auto_create_verification_row_trigger
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.auto_create_verification_row();

-- =============================================================================
-- 3. Public tier-only view (pattern 1: plain view, RLS-bypass — see
--    CLAUDE.md "View idioms"). Exposes ONLY contractor_id + current_tier,
--    nothing from the sensitive columns (suspended_reason, dbs_expires_at,
--    companies_house_status etc. stay behind the owner/admin/service_role
--    policies on the base table).
-- =============================================================================

CREATE OR REPLACE VIEW public.contractor_verification_public AS
SELECT contractor_id, current_tier
FROM public.contractor_verification;

GRANT SELECT ON public.contractor_verification_public TO anon, authenticated;

-- =============================================================================
-- 4. contractor_credentials — rejection reason (no notes/reason column existed)
-- =============================================================================

ALTER TABLE public.contractor_credentials
  ADD COLUMN IF NOT EXISTS rejection_reason text;

-- =============================================================================
-- 5. Admin RLS — read/write for contractor_verification and
--    contractor_credentials via is_platform_admin() (20260430130000).
--    Table-level UPDATE grants stay as-is (service_role-only for the
--    system-verified columns); admin writes go through the SECURITY
--    DEFINER RPCs below instead of direct table UPDATEs, so column-level
--    GRANT restrictions never need to be reopened for the `authenticated`
--    role just because some authenticated users are admins.
-- =============================================================================

CREATE POLICY "admin_select_contractor_verification"
  ON public.contractor_verification FOR SELECT
  USING (public.is_platform_admin());

CREATE POLICY "admin_select_contractor_credentials"
  ON public.contractor_credentials FOR SELECT
  USING (public.is_platform_admin());

-- Admin read access to compliance documents in storage (contractors and
-- service_role already covered by 20260730110000's policies).
CREATE POLICY "contractor_compliance_docs_admin_read"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'contractor-compliance-documents' AND public.is_platform_admin());

-- =============================================================================
-- 6. Tier recalculation — single source of truth, mirrors CLAUDE.md's tier
--    definitions:
--      Tier 2: identity_verified (Stripe Connect KYC) + phone_verified
--      Tier 3: Tier 2 + >=1 verified credential + insurance_verified and current
--      Tier 4: Tier 3 + dbs_verified + companies_house_status = 'active'
--              + >=3 verified credentials
-- =============================================================================

CREATE OR REPLACE FUNCTION public.recalculate_contractor_tier(p_contractor_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_verification public.contractor_verification%ROWTYPE;
  v_verified_credential_count integer;
  v_new_tier integer := 1;
BEGIN
  SELECT * INTO v_verification
  FROM public.contractor_verification
  WHERE contractor_id = p_contractor_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.contractor_verification (contractor_id, current_tier)
    VALUES (p_contractor_id, 1)
    RETURNING * INTO v_verification;
  END IF;

  SELECT count(*) INTO v_verified_credential_count
  FROM public.contractor_credentials
  WHERE contractor_id = p_contractor_id
  AND verified = true
  AND (expires_at IS NULL OR expires_at >= CURRENT_DATE);

  IF v_verification.identity_verified AND v_verification.phone_verified THEN
    v_new_tier := 2;
  END IF;

  IF v_new_tier >= 2
    AND v_verified_credential_count >= 1
    AND v_verification.insurance_verified
    AND v_verification.insurance_expires_at IS NOT NULL
    AND v_verification.insurance_expires_at >= CURRENT_DATE
  THEN
    v_new_tier := 3;
  END IF;

  IF v_new_tier >= 3
    AND v_verification.dbs_verified
    AND v_verification.companies_house_status = 'active'
    AND v_verified_credential_count >= 3
  THEN
    v_new_tier := 4;
  END IF;

  UPDATE public.contractor_verification
  SET current_tier = v_new_tier,
      tier_2_achieved_at = CASE WHEN v_new_tier >= 2 THEN COALESCE(tier_2_achieved_at, now()) ELSE tier_2_achieved_at END,
      tier_3_achieved_at = CASE WHEN v_new_tier >= 3 THEN COALESCE(tier_3_achieved_at, now()) ELSE tier_3_achieved_at END,
      tier_4_achieved_at = CASE WHEN v_new_tier >= 4 THEN COALESCE(tier_4_achieved_at, now()) ELSE tier_4_achieved_at END
  WHERE contractor_id = p_contractor_id;

  IF v_new_tier >= 2 THEN
    UPDATE public.profiles SET is_verified = true WHERE id = p_contractor_id AND is_verified IS DISTINCT FROM true;
  END IF;

  RETURN v_new_tier;
END;
$$;

-- =============================================================================
-- 7. Admin RPC — verify or reject a credential, then recalculate tier.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_verify_credential(
  p_credential_id uuid,
  p_approve boolean,
  p_rejection_reason text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_contractor_id uuid;
  v_new_tier integer;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  SELECT contractor_id INTO v_contractor_id
  FROM public.contractor_credentials
  WHERE id = p_credential_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Credential not found';
  END IF;

  IF p_approve THEN
    UPDATE public.contractor_credentials
    SET verified = true, verified_at = now(), rejection_reason = NULL
    WHERE id = p_credential_id;
  ELSE
    UPDATE public.contractor_credentials
    SET verified = false, verified_at = NULL, rejection_reason = p_rejection_reason
    WHERE id = p_credential_id;
  END IF;

  v_new_tier := public.recalculate_contractor_tier(v_contractor_id);

  RETURN json_build_object('contractor_id', v_contractor_id, 'current_tier', v_new_tier);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_verify_credential(uuid, boolean, text) TO authenticated;

-- =============================================================================
-- 8. Admin RPC — manual field edits (identity, phone, DBS, Companies House,
--    suspension), then recalculate tier. Every parameter is optional so the
--    admin UI can send only the field(s) being changed.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_update_verification(
  p_contractor_id uuid,
  p_identity_verified boolean DEFAULT NULL,
  p_phone_verified boolean DEFAULT NULL,
  p_insurance_verified boolean DEFAULT NULL,
  p_insurance_expires_at date DEFAULT NULL,
  p_dbs_verified boolean DEFAULT NULL,
  p_dbs_expires_at date DEFAULT NULL,
  p_companies_house_status text DEFAULT NULL,
  p_suspended boolean DEFAULT NULL,
  p_suspended_reason text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_new_tier integer;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  UPDATE public.contractor_verification
  SET
    identity_verified = COALESCE(p_identity_verified, identity_verified),
    phone_verified = COALESCE(p_phone_verified, phone_verified),
    insurance_verified = COALESCE(p_insurance_verified, insurance_verified),
    insurance_expires_at = COALESCE(p_insurance_expires_at, insurance_expires_at),
    dbs_verified = COALESCE(p_dbs_verified, dbs_verified),
    dbs_expires_at = COALESCE(p_dbs_expires_at, dbs_expires_at),
    companies_house_status = COALESCE(p_companies_house_status, companies_house_status),
    companies_house_checked_at = CASE WHEN p_companies_house_status IS NOT NULL THEN now() ELSE companies_house_checked_at END,
    suspended = COALESCE(p_suspended, suspended),
    suspended_reason = CASE WHEN p_suspended IS TRUE THEN p_suspended_reason WHEN p_suspended IS FALSE THEN NULL ELSE suspended_reason END,
    suspended_at = CASE WHEN p_suspended IS TRUE THEN now() WHEN p_suspended IS FALSE THEN NULL ELSE suspended_at END
  WHERE contractor_id = p_contractor_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Verification row not found for contractor';
  END IF;

  v_new_tier := public.recalculate_contractor_tier(p_contractor_id);

  RETURN json_build_object('contractor_id', p_contractor_id, 'current_tier', v_new_tier);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_verification(
  uuid, boolean, boolean, boolean, date, boolean, date, text, boolean, text
) TO authenticated;
