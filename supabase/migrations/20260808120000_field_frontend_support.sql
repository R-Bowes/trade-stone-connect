-- =============================================================================
-- field_frontend_support.sql — DB support for the team-member field frontend
-- (invite email preview, distinct accept-invite errors, checklist item INSERT
-- for team members, and owner-side named checklist templates).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Part 6 — job_checklist_items INSERT for team members, scoped identically to
-- the existing team SELECT policy from 20260808110000.
-- -----------------------------------------------------------------------------

CREATE POLICY "Team members can insert their contractor's checklist items"
  ON public.job_checklist_items
  FOR INSERT
  WITH CHECK (
    job_id IN (
      SELECT id FROM public.jobs
      WHERE contractor_id IN (SELECT public.acting_contractor_ids())
    )
  );

-- -----------------------------------------------------------------------------
-- Part 5 — job_checklist_templates: named, contractor-owned templates.
--
-- The live table had no grouping/name concept and no contractor_id — it was
-- shaped for a global/company template library (company_id nullable = global).
-- Adding `name` + `contractor_id` so a solo contractor can own a set of named
-- templates (rows sharing contractor_id + name = one template, item order via
-- sort_order), without touching the existing company_id/global path.
--
-- Team members get NO access here — no acting_contractor_ids() anywhere in
-- this section, per the brief. Owner-only, direct auth.uid() comparison
-- (profiles.id == user_id == auth.uid() by construction, per CLAUDE.md).
-- -----------------------------------------------------------------------------

ALTER TABLE public.job_checklist_templates
  ADD COLUMN name text,
  ADD COLUMN contractor_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE;

-- The original SELECT policy's `company_id IS NULL` branch was meant to mean
-- "global template" — but with contractor_id now available, a contractor's
-- own private template (company_id NULL, contractor_id set) would otherwise
-- satisfy that branch too and become world-readable. Tightened to require
-- contractor_id IS NULL for the global branch, and added an explicit
-- owner-of-their-own-row branch.
DROP POLICY "Contractors can view checklist templates" ON public.job_checklist_templates;

CREATE POLICY "Contractors can view checklist templates"
  ON public.job_checklist_templates
  FOR SELECT
  USING (
    (company_id IS NULL AND contractor_id IS NULL)
    OR contractor_id = auth.uid()
    OR (company_id IN (
      SELECT j.company_id FROM public.jobs j
      JOIN public.profiles p ON p.id = j.contractor_id
      WHERE p.user_id = auth.uid()
    ))
  );

CREATE POLICY "Contractors can insert their own checklist templates"
  ON public.job_checklist_templates
  FOR INSERT
  WITH CHECK (contractor_id = auth.uid());

CREATE POLICY "Contractors can update their own checklist templates"
  ON public.job_checklist_templates
  FOR UPDATE
  USING (contractor_id = auth.uid());

CREATE POLICY "Contractors can delete their own checklist templates"
  ON public.job_checklist_templates
  FOR DELETE
  USING (contractor_id = auth.uid());

-- -----------------------------------------------------------------------------
-- Part 2 — public invite preview RPC. Returns ONLY the invitation's email and
-- the contractor's trading name — never the full team_invitations/profiles
-- row. Callable pre-auth (anon), so the accept page can pre-fill the signup
-- form before the user has a session.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_team_invitation_preview(p_token text)
RETURNS TABLE(email text, contractor_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT ti.email, COALESCE(p.company_name, p.full_name, 'TradeStone contractor')
  FROM public.team_invitations ti
  JOIN public.profiles p ON p.id = ti.contractor_id
  WHERE ti.token = p_token
    AND ti.status = 'pending'
    AND ti.expires_at > now();
$function$;

GRANT EXECUTE ON FUNCTION public.get_team_invitation_preview(text) TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- Part 2 — accept_team_invitation rebuilt to raise DISTINCT, UI-matchable
-- errors for each failure mode (expired / already accepted / wrong email /
-- already bound), instead of a single lumped "not found" message. Same
-- transactional shape and locking as the original (20260808110000).
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.accept_team_invitation(p_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_invitation public.team_invitations%ROWTYPE;
  v_user_email text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated to accept an invitation';
  END IF;

  -- Locate + lock the invitation row against concurrent acceptance. No
  -- status/expiry filter here (unlike the original) — that's what let a
  -- stale/used/revoked invite ever return a real row, which is required to
  -- distinguish WHY it's invalid below.
  SELECT * INTO v_invitation
  FROM public.team_invitations
  WHERE token = p_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found';
  END IF;

  IF v_invitation.status = 'accepted' THEN
    RAISE EXCEPTION 'This invitation has already been accepted';
  END IF;

  IF v_invitation.status = 'revoked' THEN
    RAISE EXCEPTION 'This invitation has been revoked';
  END IF;

  IF v_invitation.status = 'expired' OR v_invitation.expires_at <= now() THEN
    RAISE EXCEPTION 'This invitation has expired';
  END IF;

  SELECT email INTO v_user_email
  FROM auth.users
  WHERE id = auth.uid();

  IF v_user_email IS NULL OR lower(v_user_email) <> lower(v_invitation.email) THEN
    RAISE EXCEPTION 'This invitation was issued to a different email address';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.team_members
    WHERE id = v_invitation.team_member_id
      AND profile_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'This invitation has already been bound to an account';
  END IF;

  UPDATE public.team_members
  SET profile_id = auth.uid()
  WHERE id = v_invitation.team_member_id;

  UPDATE public.team_invitations
  SET status = 'accepted',
      accepted_at = now(),
      accepted_by = auth.uid()
  WHERE id = v_invitation.id;

  RETURN v_invitation.contractor_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.accept_team_invitation(text) TO authenticated;
