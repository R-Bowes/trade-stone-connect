-- Tier 2 ("ID Verified") previously depended on contractor_verification's
-- identity_verified AND phone_verified — identity_verified was set once by
-- a migration checking only that profiles.stripe_account_id IS NOT NULL
-- (Connect onboarding had started, not that Stripe's own verification
-- completed), and phone_verified has no verification mechanism anywhere in
-- the codebase at all (confirmed by repo-wide search — no OTP/SMS provider
-- exists). Both are admin-checkbox-only with no evidence attached.
--
-- profiles.stripe_payouts_enabled is a real, continuously-maintained signal
-- instead: it is written by supabase/functions/stripe-webhook/index.ts's
-- handleAccountUpdated() off live Stripe account.updated events, and Stripe
-- only sets payouts_enabled=true once its own Connect requirements
-- (including identity verification) are satisfied. This migration switches
-- Tier 2 to depend on that column.
--
-- identity_verified and phone_verified are NOT dropped — they stay in the
-- table, now vestigial (recalculate_contractor_tier no longer reads them
-- for Tier 2). Tiers 3 and 4's conditions are unchanged; only the Tier 2
-- gate changes.

-- =============================================================================
-- 1. recalculate_contractor_tier — Tier 2 condition now reads
--    profiles.stripe_payouts_enabled instead of
--    identity_verified AND phone_verified. Full function restated per this
--    repo's convention for functions patched more than once (see
--    CLAUDE.md's document-reference-system note on the same pattern).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.recalculate_contractor_tier(p_contractor_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_verification public.contractor_verification%ROWTYPE;
  v_stripe_payouts_enabled boolean;
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

  SELECT stripe_payouts_enabled INTO v_stripe_payouts_enabled
  FROM public.profiles
  WHERE id = p_contractor_id;

  SELECT count(*) INTO v_verified_credential_count
  FROM public.contractor_credentials
  WHERE contractor_id = p_contractor_id
  AND verified = true
  AND (expires_at IS NULL OR expires_at >= CURRENT_DATE);

  -- Tier 2: real Stripe Connect signal, not the vestigial
  -- identity_verified/phone_verified pair (kept in the table, unused here).
  IF COALESCE(v_stripe_payouts_enabled, false) THEN
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

  -- Two-way sync, not a one-way flag: stripe_payouts_enabled can go back to
  -- false (Stripe disables an account for failed requirements), which drops
  -- v_new_tier back to 1 — is_verified must follow it down, or the badge
  -- disappears (tier-driven) while this column keeps asserting verified
  -- (exactly the stale-claim problem this migration exists to remove).
  -- IS DISTINCT FROM guards both branches so a no-op recalculation never
  -- writes profiles at all — see the trigger note below for why that guard
  -- matters, not just tidiness.
  --
  -- NOTE: AdminDashboard.tsx:415 (handleVerifyContractor) writes
  -- profiles.is_verified directly via a plain Verify/Unverify button, with
  -- no relationship to contractor_verification or this function at all.
  -- That second writer is NOT addressed by this migration — an admin can
  -- still put this column out of step with current_tier with one click.
  -- Documented here so the next person touching either writer knows the
  -- column has two independent sources of truth.
  IF v_new_tier >= 2 THEN
    UPDATE public.profiles SET is_verified = true
    WHERE id = p_contractor_id AND is_verified IS DISTINCT FROM true;
  ELSE
    UPDATE public.profiles SET is_verified = false
    WHERE id = p_contractor_id AND is_verified IS DISTINCT FROM false;
  END IF;

  RETURN v_new_tier;
END;
$$;

-- =============================================================================
-- 2. Recalculate every existing contractor under the new rule. Without this,
--    the fix is a no-op until an admin next touches each row.
-- =============================================================================

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT contractor_id FROM public.contractor_verification LOOP
    PERFORM public.recalculate_contractor_tier(r.contractor_id);
  END LOOP;
END $$;

-- =============================================================================
-- 3. Trigger — keep current_tier live as stripe_payouts_enabled changes,
--    instead of only recalculating on the next admin action.
--
-- Safety:
-- - Row-level, AFTER UPDATE, gated by a WHEN clause comparing OLD vs NEW
--   stripe_payouts_enabled — fires only when that column's value actually
--   changes, not on every profiles UPDATE.
-- - recalculate_contractor_tier() self-heals a missing contractor_verification
--   row (INSERT ... RETURNING, see above) — safe to call even if one doesn't
--   exist yet for this profile.
-- - No recursion: recalculate_contractor_tier now has TWO branches that
--   write profiles.is_verified (true when v_new_tier >= 2, false
--   otherwise — added so the flag tracks the tier both ways, not just
--   up). Each is itself an UPDATE on this same table, which does
--   re-evaluate this trigger's WHEN clause — but neither branch's SET
--   list contains stripe_payouts_enabled, only is_verified, so OLD and
--   NEW are identical for the guarded column on that statement regardless
--   of which branch ran, and WHEN evaluates false either way. The trigger
--   body never re-enters. This is the CLAUDE.md-documented risk category
--   (a function's write looping back into what triggered it) but the
--   WHEN clause is exactly what breaks the cycle here, not an assumption
--   — verified by tracing both branches' column lists against the WHEN
--   condition's column, not just the one branch that existed before.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.sync_tier_on_stripe_payouts_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.user_type = 'contractor' THEN
    PERFORM public.recalculate_contractor_tier(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_tier_on_stripe_payouts_change_trigger ON public.profiles;
CREATE TRIGGER sync_tier_on_stripe_payouts_change_trigger
  AFTER UPDATE ON public.profiles
  FOR EACH ROW
  WHEN (OLD.stripe_payouts_enabled IS DISTINCT FROM NEW.stripe_payouts_enabled)
  EXECUTE FUNCTION public.sync_tier_on_stripe_payouts_change();
