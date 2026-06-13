-- =============================================================================
-- b2b_invite_accept_modes.sql
--
-- (1) Two-mode accept_business_invite:
--     Mode token    — no-account invite-link path; links the previously
--                     unlinked row (profile_id NULL) to the accepting caller.
--     Mode invite_id — has-account path; admin pre-linked the row to the
--                     invitee's profile_id (resolved from ts_profile_code).
--                     Acceptance verifies the invite is addressed to the caller.
--     Exactly one of p_token / p_invite_id must be supplied.
-- (2) Last-owner protection trigger: blocks removing/demoting the final active
--     owner of a company. DB-enforced (not app-level) for the same reason the
--     owner-escalation guard is — app checks are bypassable via PostgREST.
-- =============================================================================

-- Signature changes (adds p_invite_id), so the old 1-arg function must be DROPPED
-- first — CREATE OR REPLACE will not replace across differing argument lists.
-- No frontend caller exists yet (grep: zero results), so the drop is safe.
-- GRANTs drop with the function and are re-applied below.
DROP FUNCTION IF EXISTS public.accept_business_invite(uuid);

CREATE OR REPLACE FUNCTION public.accept_business_invite(
  p_token     uuid DEFAULT NULL,
  p_invite_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member  public.business_members%ROWTYPE;
  v_profile uuid;
BEGIN
  -- Exactly one selector required (XOR)
  IF (p_token IS NULL) = (p_invite_id IS NULL) THEN
    RAISE EXCEPTION 'Provide exactly one of p_token or p_invite_id';
  END IF;

  -- Canonical lookup: profiles.id = auth.uid() by construction (CLAUDE.md RLS section)
  SELECT id INTO v_profile
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_profile IS NULL THEN
    RAISE EXCEPTION 'No profile found for the current user';
  END IF;

  -- Locate + lock the invite row against concurrent acceptance
  IF p_token IS NOT NULL THEN
    SELECT * INTO v_member
    FROM public.business_members
    WHERE invite_token = p_token
    LIMIT 1
    FOR UPDATE;
  ELSE
    SELECT * INTO v_member
    FROM public.business_members
    WHERE id = p_invite_id
    LIMIT 1
    FOR UPDATE;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite not found';
  END IF;

  -- invite_id mode: the invite must be addressed to the caller.
  -- (IS DISTINCT FROM also rejects accepting a link-path row, profile_id NULL, via id mode.)
  IF p_invite_id IS NOT NULL AND v_member.profile_id IS DISTINCT FROM v_profile THEN
    RAISE EXCEPTION 'This invite is not addressed to you';
  END IF;

  IF v_member.status <> 'invited' THEN
    RAISE EXCEPTION 'Invite is no longer valid (status: %)', v_member.status;
  END IF;

  IF v_member.invite_expires_at IS NOT NULL AND v_member.invite_expires_at < now() THEN
    RAISE EXCEPTION 'Invite has expired';
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

REVOKE ALL     ON FUNCTION public.accept_business_invite(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.accept_business_invite(uuid, uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- (2) Last-owner protection. SECURITY DEFINER so the owner count is accurate
-- regardless of caller RLS. TABLE ALLOWLIST: business_members only.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_last_owner_removal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_other_owners integer;
BEGIN
  -- Only protect rows that ARE currently active owners
  IF NOT (OLD.role = 'owner' AND OLD.status = 'active') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- UPDATE that keeps the row an active owner is fine
  IF TG_OP = 'UPDATE' AND NEW.role = 'owner' AND NEW.status = 'active' THEN
    RETURN NEW;
  END IF;

  -- Row is leaving active-owner state (delete / demote / deactivate):
  -- require at least one OTHER active owner of the same company.
  SELECT count(*) INTO v_other_owners
  FROM public.business_members
  WHERE company_id = OLD.company_id
    AND id        <> OLD.id
    AND role       = 'owner'
    AND status     = 'active';

  IF v_other_owners = 0 THEN
    RAISE EXCEPTION 'Cannot remove or demote the last active owner of the company';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_last_owner_removal ON public.business_members;
CREATE TRIGGER trg_prevent_last_owner_removal
  BEFORE UPDATE OR DELETE ON public.business_members
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_last_owner_removal();