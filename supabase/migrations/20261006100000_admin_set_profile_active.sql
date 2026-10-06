-- ROLLBACK:
--   drop function public.admin_set_profile_active(uuid, boolean);
--
-- Profiles exposure, stage 2, migration 1 of 2 (additive only).
--
-- Admin suspend / reinstate, replacing AdminDashboard.tsx's direct browser
-- writes to profiles.user_type ('suspended' was never a valid user_type
-- value, so suspend failed silently; reinstate forced every user to
-- 'contractor'). Migration 2 (20261006110000) removes client UPDATE on
-- is_active, so this RPC becomes its only client-reachable writer.
--
-- What is_active = false does today (checked 6 Oct 2026): public_pro_profiles
-- filters on it, so the user disappears from the directory and their public
-- profile page. Nothing else reads profiles.is_active — no RLS policy, no
-- other function, no edge function. It does NOT block sign-in or any
-- dashboard action.

CREATE FUNCTION public.admin_set_profile_active(p_profile_id uuid, p_active boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Only a platform admin can change whether an account is active.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_active IS NULL THEN
    RAISE EXCEPTION 'p_active must be true or false.' USING ERRCODE = 'null_value_not_allowed';
  END IF;

  UPDATE public.profiles SET is_active = p_active WHERE id = p_profile_id;

  -- A zero-row UPDATE is otherwise silent (CLAUDE.md failure modes).
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile % not found.', p_profile_id USING ERRCODE = 'no_data_found';
  END IF;
END;
$$;

REVOKE ALL     ON FUNCTION public.admin_set_profile_active(uuid, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_set_profile_active(uuid, boolean) TO authenticated;
