-- SCORING.md Section 2 "Compliance Gate (Layer 1)": before any score is
-- displayed, a contractor must pass ALL of:
--   - valid public liability insurance on file (not expired)
--   - identity verified (Tier 2+)
--   - at least one verified trade qualification (register check OR credential)
--   - no active suspension
--
-- SECURITY DEFINER so it can read contractor_verification /
-- contractor_register_checks / contractor_credentials regardless of the
-- caller's own RLS visibility (e.g. a homeowner checking gate status for a
-- contractor they're viewing) — this function does not expose row contents,
-- only booleans/derived summary, so it is safe to run for any caller.

CREATE OR REPLACE FUNCTION public.check_contractor_compliance(p_contractor_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_verification         public.contractor_verification%ROWTYPE;
  v_identity_verified     boolean := false;
  v_insurance_valid       boolean := false;
  v_not_suspended         boolean := true;
  v_has_verified_qual     boolean := false;
  v_current_tier          integer := 1;
  v_blocking_reasons      text[] := '{}';
  v_passes_gate           boolean;
BEGIN
  SELECT * INTO v_verification
  FROM public.contractor_verification
  WHERE contractor_id = p_contractor_id;

  IF FOUND THEN
    v_current_tier   := v_verification.current_tier;
    v_not_suspended  := NOT v_verification.suspended;
    v_identity_verified := v_verification.identity_verified AND v_verification.current_tier >= 2;
    v_insurance_valid := v_verification.insurance_verified
      AND v_verification.insurance_expires_at IS NOT NULL
      AND v_verification.insurance_expires_at >= CURRENT_DATE;
  ELSE
    v_not_suspended := true;
  END IF;

  v_has_verified_qual := EXISTS (
    SELECT 1 FROM public.contractor_register_checks
    WHERE contractor_id = p_contractor_id AND status = 'verified'
      AND (expires_at IS NULL OR expires_at >= CURRENT_DATE)
  ) OR EXISTS (
    SELECT 1 FROM public.contractor_credentials
    WHERE contractor_id = p_contractor_id AND verified = true
      AND (expires_at IS NULL OR expires_at >= CURRENT_DATE)
  );

  IF NOT v_identity_verified THEN
    v_blocking_reasons := array_append(v_blocking_reasons, 'Identity not verified (Tier 2+ required)');
  END IF;
  IF NOT v_insurance_valid THEN
    v_blocking_reasons := array_append(v_blocking_reasons, 'No valid, verified public liability insurance on file');
  END IF;
  IF NOT v_has_verified_qual THEN
    v_blocking_reasons := array_append(v_blocking_reasons, 'No verified trade qualification or register check on file');
  END IF;
  IF NOT v_not_suspended THEN
    v_blocking_reasons := array_append(v_blocking_reasons, 'Account is suspended');
  END IF;

  v_passes_gate := v_identity_verified AND v_insurance_valid AND v_has_verified_qual AND v_not_suspended;

  RETURN json_build_object(
    'passes_gate', v_passes_gate,
    'current_tier', v_current_tier,
    'checks', json_build_object(
      'identity_verified', v_identity_verified,
      'insurance_valid', v_insurance_valid,
      'insurance_expires_at', v_verification.insurance_expires_at,
      'has_verified_qualification', v_has_verified_qual,
      'not_suspended', v_not_suspended
    ),
    'blocking_reasons', v_blocking_reasons
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_contractor_compliance(uuid) TO authenticated, anon;
