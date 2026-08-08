-- =============================================================================
-- team_member_access.sql — Team member sub-accounts, Tier A (database layer)
--
-- Team members become sub-accounts under a contractor: ordinary profiles rows
-- via normal signup, employment expressed by team_members.profile_id.
-- Migration 20260808100000 already added acting_contractor_ids(),
-- my_team_member_ids(), and a self-read policy on team_members — not
-- recreated here.
--
-- CRITICAL: acting_contractor_ids() and my_team_member_ids() both read
-- profiles/team_members. Neither may EVER appear in a policy ON profiles or
-- team_members — that is the recursion that retired auth_user_company_ids()
-- (see CLAUDE.md's RLS section). Every policy below targets a DIFFERENT
-- table and reaches team_members/profiles only through the two helper
-- functions, one-directionally.
--
-- All new policies are ADDITIVE (permissive, OR with existing policies) —
-- no existing policy is modified. Tier A only: jobs, job_assignments,
-- job_photos, job_checklist_items, job_snag_items, job_material_usage,
-- schedule_events, timesheets, contractor_materials, contractor_tools.
-- Financial/rate tables (invoices, issued_quotes, enquiries, finance_settings,
-- expenses, mileage_trips, contractor_debts, refunds, chargebacks,
-- contractor_scores, engagement_rates, contractor_vehicles,
-- expense_categories) are deliberately untouched — Tier B.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Task 2 — access_level on team_members. 'operative' is the only level used
-- in this brief; 'manager' is reserved for Tier B and grants nothing yet.
-- The existing `role` column is untouched — it stays descriptive free text.
-- -----------------------------------------------------------------------------

ALTER TABLE public.team_members
  ADD COLUMN access_level text NOT NULL DEFAULT 'operative';

ALTER TABLE public.team_members
  ADD CONSTRAINT team_members_access_level_check
  CHECK (access_level IN ('operative', 'manager'));

-- -----------------------------------------------------------------------------
-- Task 3 — is_conversation_party() made team-aware.
--
-- The previous version inner-joined profiles on auth.uid(), so a team member
-- (whose profile is not the job/enquiry/quote's contractor_id — the
-- contractor's own profile is) never matched. Replaced with
-- acting_contractor_ids(), which resolves to the caller's own id plus, for an
-- active team member, their employer's id. This function itself is safe to
-- call acting_contractor_ids() from: it reads job_conversations/jobs/
-- enquiries/issued_quotes, none of which is profiles or team_members, so no
-- cycle is introduced.
--
-- Also adds the SET search_path the original lacked.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_conversation_party(p_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.job_conversations jc
    LEFT JOIN public.jobs j ON j.id = jc.job_id
    LEFT JOIN public.enquiries e ON e.id = jc.enquiry_id
    LEFT JOIN public.issued_quotes q ON q.id = jc.issued_quote_id
    WHERE jc.id = p_conversation_id
      AND (
        j.contractor_id IN (SELECT public.acting_contractor_ids())
        OR j.customer_id IN (SELECT public.acting_contractor_ids())
        OR e.contractor_id IN (SELECT public.acting_contractor_ids())
        OR e.customer_id IN (SELECT public.acting_contractor_ids())
        OR q.contractor_id IN (SELECT public.acting_contractor_ids())
        OR q.recipient_id IN (SELECT public.acting_contractor_ids())
      )
  );
$function$;

-- -----------------------------------------------------------------------------
-- Task 4 — Tier A policies. Additive only; each substitutes
-- acting_contractor_ids() for the profiles-subquery form an equivalent
-- contractor-only policy already uses elsewhere on the same table.
-- -----------------------------------------------------------------------------

-- jobs — contractor_id
CREATE POLICY "Team members can view their contractor's jobs"
  ON public.jobs
  FOR SELECT
  USING (contractor_id IN (SELECT public.acting_contractor_ids()));

CREATE POLICY "Team members can update their contractor's jobs"
  ON public.jobs
  FOR UPDATE
  USING (contractor_id IN (SELECT public.acting_contractor_ids()));

-- job_assignments — via job_id
CREATE POLICY "Team members can view their contractor's job assignments"
  ON public.job_assignments
  FOR SELECT
  USING (
    job_id IN (
      SELECT id FROM public.jobs
      WHERE contractor_id IN (SELECT public.acting_contractor_ids())
    )
  );

-- job_photos — via job_id
CREATE POLICY "Team members can view their contractor's job photos"
  ON public.job_photos
  FOR SELECT
  USING (
    job_id IN (
      SELECT id FROM public.jobs
      WHERE contractor_id IN (SELECT public.acting_contractor_ids())
    )
  );

CREATE POLICY "Team members can insert their contractor's job photos"
  ON public.job_photos
  FOR INSERT
  WITH CHECK (
    job_id IN (
      SELECT id FROM public.jobs
      WHERE contractor_id IN (SELECT public.acting_contractor_ids())
    )
  );

CREATE POLICY "Team members can update their contractor's job photos"
  ON public.job_photos
  FOR UPDATE
  USING (
    job_id IN (
      SELECT id FROM public.jobs
      WHERE contractor_id IN (SELECT public.acting_contractor_ids())
    )
  );

-- job_checklist_items — via job_id
CREATE POLICY "Team members can view their contractor's checklist items"
  ON public.job_checklist_items
  FOR SELECT
  USING (
    job_id IN (
      SELECT id FROM public.jobs
      WHERE contractor_id IN (SELECT public.acting_contractor_ids())
    )
  );

CREATE POLICY "Team members can update their contractor's checklist items"
  ON public.job_checklist_items
  FOR UPDATE
  USING (
    job_id IN (
      SELECT id FROM public.jobs
      WHERE contractor_id IN (SELECT public.acting_contractor_ids())
    )
  );

-- job_snag_items — via job_id
CREATE POLICY "Team members can view their contractor's snag items"
  ON public.job_snag_items
  FOR SELECT
  USING (
    job_id IN (
      SELECT id FROM public.jobs
      WHERE contractor_id IN (SELECT public.acting_contractor_ids())
    )
  );

CREATE POLICY "Team members can insert their contractor's snag items"
  ON public.job_snag_items
  FOR INSERT
  WITH CHECK (
    job_id IN (
      SELECT id FROM public.jobs
      WHERE contractor_id IN (SELECT public.acting_contractor_ids())
    )
  );

CREATE POLICY "Team members can update their contractor's snag items"
  ON public.job_snag_items
  FOR UPDATE
  USING (
    job_id IN (
      SELECT id FROM public.jobs
      WHERE contractor_id IN (SELECT public.acting_contractor_ids())
    )
  );

-- job_material_usage — via material_id -> contractor_materials
CREATE POLICY "Team members can view their contractor's material usage"
  ON public.job_material_usage
  FOR SELECT
  USING (
    material_id IN (
      SELECT id FROM public.contractor_materials
      WHERE contractor_id IN (SELECT public.acting_contractor_ids())
    )
  );

CREATE POLICY "Team members can insert their contractor's material usage"
  ON public.job_material_usage
  FOR INSERT
  WITH CHECK (
    material_id IN (
      SELECT id FROM public.contractor_materials
      WHERE contractor_id IN (SELECT public.acting_contractor_ids())
    )
  );

-- schedule_events — contractor_id
CREATE POLICY "Team members can view their contractor's schedule events"
  ON public.schedule_events
  FOR SELECT
  USING (contractor_id IN (SELECT public.acting_contractor_ids()));

-- timesheets — contractor_id, with worker_id/self-approval guards
CREATE POLICY "Team members can view their contractor's timesheets"
  ON public.timesheets
  FOR SELECT
  USING (contractor_id IN (SELECT public.acting_contractor_ids()));

-- Team members may only log time against their own team_members row (or
-- leave worker_id null) — they cannot log hours on someone else's behalf.
CREATE POLICY "Team members can insert their contractor's timesheets"
  ON public.timesheets
  FOR INSERT
  WITH CHECK (
    contractor_id IN (SELECT public.acting_contractor_ids())
    AND (worker_id IS NULL OR worker_id IN (SELECT public.my_team_member_ids()))
  );

-- Team members must not be able to self-approve — rows already
-- status = 'approved' are excluded from their UPDATE predicate.
CREATE POLICY "Team members can update their contractor's unapproved timesheets"
  ON public.timesheets
  FOR UPDATE
  USING (
    contractor_id IN (SELECT public.acting_contractor_ids())
    AND status <> 'approved'
  );

-- contractor_materials — SELECT only
CREATE POLICY "Team members can view their contractor's materials"
  ON public.contractor_materials
  FOR SELECT
  USING (contractor_id IN (SELECT public.acting_contractor_ids()));

-- contractor_tools — SELECT only
CREATE POLICY "Team members can view their contractor's tools"
  ON public.contractor_tools
  FOR SELECT
  USING (contractor_id IN (SELECT public.acting_contractor_ids()));

-- -----------------------------------------------------------------------------
-- Task 5 — Invitation table and binding RPC.
--
-- No direct SELECT policy for invitees — an invitee has no profile row yet
-- (or isn't a team member of this contractor yet), so there is nothing to
-- scope a read policy to. Binding goes exclusively through
-- accept_team_invitation(), which is SECURITY DEFINER and validates the
-- token/email/expiry itself.
-- -----------------------------------------------------------------------------

CREATE TABLE public.team_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id uuid NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  contractor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  email text NOT NULL,
  token text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  accepted_at timestamptz,
  accepted_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT team_invitations_status_check
    CHECK (status IN ('pending', 'accepted', 'expired', 'revoked'))
);

ALTER TABLE public.team_invitations ENABLE ROW LEVEL SECURITY;

-- Safe to use acting_contractor_ids() here: team_invitations is neither
-- profiles nor team_members, so this does not recurse.
CREATE POLICY "Contractors can manage their own team invitations"
  ON public.team_invitations
  FOR ALL
  USING (contractor_id IN (SELECT public.acting_contractor_ids()))
  WITH CHECK (contractor_id IN (SELECT public.acting_contractor_ids()));

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

  -- Locate + lock the invitation row against concurrent acceptance.
  SELECT * INTO v_invitation
  FROM public.team_invitations
  WHERE token = p_token
    AND status = 'pending'
    AND expires_at > now()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found, already used, expired, or revoked';
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
