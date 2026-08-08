-- =============================================================================
-- field_completion_and_notes.sql — status/signature/notes support for the
-- team-member field completion flow.
--
-- Tier A only. No policy touches profiles or team_members (acting_contractor_ids()
-- / my_team_member_ids() never appear on either, per the standing rule).
-- jobs itself needs NO new policy — team members already have row-level
-- UPDATE via 20260808110000's Tier A grant, and the trigger
-- enforce_job_status_transition() is the actual authority on validity
-- regardless of who writes. See the LATER.md note added alongside this
-- migration for the column-level gap that leaves open (contractor_signed_off_*
-- writable by a team member) — not fixed here, flagged for a follow-up brief.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Part 2 — site signature columns. Deliberately NOT signed_off_at/signed_off_by
-- (those record the CUSTOMER's own attested act from their authenticated
-- session in ClientJobsView.tsx) and NOT contractor_signed_off_at/name
-- (the CONTRACTOR's own counter-signature). A team member capturing a
-- signature on site is evidentially a third, distinct act: the contractor
-- (via their employee) ASSERTING that someone signed — not that person's own
-- attested act. Collapsing this into signed_off_by/signed_off_at would also
-- have been impossible cleanly: signed_off_by FKs to profiles, so a site
-- contact who isn't a registered customer profile (e.g. a site manager)
-- could only ever be NULL there. A job may legitimately carry a customer
-- sign-off AND a site signature — they corroborate, not conflict.
-- -----------------------------------------------------------------------------

ALTER TABLE public.jobs
  ADD COLUMN site_signed_off_at timestamptz,
  ADD COLUMN site_signed_off_name text,
  ADD COLUMN site_signed_off_by uuid REFERENCES public.profiles(id);

COMMENT ON COLUMN public.jobs.site_signed_off_at IS
  'When a signature was captured on site (phone/tablet canvas). Distinct from signed_off_at (the customer''s own attested act from their authenticated session) and contractor_signed_off_at (the contractor''s own counter-signature).';
COMMENT ON COLUMN public.jobs.site_signed_off_name IS
  'Free-text name of whoever signed on site — may not match a registered profile (e.g. a site manager, not the account holder).';
COMMENT ON COLUMN public.jobs.site_signed_off_by IS
  'profiles.id of the TEAM MEMBER who captured the signature (attribution of the act of capture, not of the signature itself).';

-- -----------------------------------------------------------------------------
-- Part 3 — engagement_notes.author_id. Additive, nullable — existing rows
-- (all pre-team-member, written by the contractor themselves) are
-- unaffected. job_notes is NOT used for field notes: it is the CUSTOMER's
-- own notes channel (RLS lets customer_id read/write; ThreadWorknotesSection.tsx
-- labels it "Client notes"). engagement_notes is already contractor-private,
-- never client-visible — the correct existing pattern for internal-only
-- field notes, per its own code comment.
-- -----------------------------------------------------------------------------

ALTER TABLE public.engagement_notes
  ADD COLUMN author_id uuid REFERENCES public.profiles(id);

COMMENT ON COLUMN public.engagement_notes.author_id IS
  'Who wrote this note — the contractor themselves, or a team member acting on their behalf. Nullable: pre-existing rows and any future contractor-authored write via the existing UI leave this NULL.';

CREATE POLICY "Team members can view their contractor's engagement notes"
  ON public.engagement_notes
  FOR SELECT
  USING (contractor_id IN (SELECT public.acting_contractor_ids()));

-- author_id, if set, must be the caller's own identity — a team member
-- cannot write a note attributed to someone else.
CREATE POLICY "Team members can add their contractor's engagement notes"
  ON public.engagement_notes
  FOR INSERT
  WITH CHECK (
    contractor_id IN (SELECT public.acting_contractor_ids())
    AND (author_id IS NULL OR author_id = auth.uid())
  );
