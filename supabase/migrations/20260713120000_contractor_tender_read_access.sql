-- =============================================================================
-- 20260713120000_contractor_tender_read_access.sql
-- Contractor tender experience, Stage 2 slice 1 (pipeline + brief, read-only).
--
-- PART 1 — three RLS gaps found while tracing what the brief needs to read.
-- companies, sla_rules, and sites are pre-existing (non-tendering) tables
-- whose only contractor-facing SELECT policy is scoped to approved
-- contractor_panel membership:
--   - "Companies readable by panel contractors" (20260709140000)
--   - "SLA rules visible to panel contractors" (20260709140000)
--   - sites_select -> can_access_site(id) (20260614174850, coverage/membership only)
-- None of these cover a contractor who is merely invited to bid on a tender
-- via tender_invitations -- exactly the audience tendering exists to reach
-- (bidding is explicitly meant to work before any panel relationship
-- exists). Without a fix, the brief's company header, SLA/coverage facts,
-- and site names all render silently blank for any non-panel invitee.
--
-- Fix: one additional permissive SELECT policy per table, each scoped
-- through contractor_can_view_tender (the same helper every tender-native
-- satellite already uses -- tender_sites_contractor_select,
-- tender_documents_contractor_select, etc., 20260710150000). Additive only:
-- existing policies (business member / panel contractor) are untouched:
-- PostgreSQL ORs multiple permissive policies for the same command.
--
-- PART 2 — tender_invitations.viewed_at has no write path. The only
-- contractor UPDATE policy (tender_invitations_contractor_decline,
-- 20260710150000) has WITH CHECK (contractor_id = auth.uid() AND
-- status = 'declined') -- a plain client UPDATE setting viewed_at while
-- leaving status='invited' satisfies USING but fails WITH CHECK, so
-- PostgREST would report success with zero rows changed (the silent-UPDATE
-- failure mode CLAUDE.md documents). mark_tender_invitation_viewed() is a
-- narrow SECURITY DEFINER transition (invited -> viewed once, viewed_at
-- stamped once), matching the convention every other consequential
-- transition in tendering already follows.
-- =============================================================================

CREATE POLICY "companies_readable_by_invited_tender_contractors"
ON public.companies FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.tenders t
    WHERE t.company_id = companies.id AND contractor_can_view_tender(t.id)
  )
);

CREATE POLICY "sla_rules_readable_by_invited_tender_contractors"
ON public.sla_rules FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.tenders t
    WHERE t.sla_rule_set_id = sla_rules.id AND contractor_can_view_tender(t.id)
  )
);

CREATE POLICY "sites_readable_by_invited_tender_contractors"
ON public.sites FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.tender_sites ts
    WHERE ts.site_id = sites.id AND contractor_can_view_tender(ts.tender_id)
  )
);

CREATE OR REPLACE FUNCTION public.mark_tender_invitation_viewed(p_invitation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invitation public.tender_invitations%ROWTYPE;
BEGIN
  SELECT * INTO v_invitation FROM public.tender_invitations WHERE id = p_invitation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found';
  END IF;

  IF v_invitation.contractor_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not authorised to update this invitation';
  END IF;

  UPDATE public.tender_invitations
  SET
    status = CASE WHEN status = 'invited' THEN 'viewed' ELSE status END,
    viewed_at = COALESCE(viewed_at, now())
  WHERE id = p_invitation_id;
END;
$$;

REVOKE ALL     ON FUNCTION public.mark_tender_invitation_viewed(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.mark_tender_invitation_viewed(uuid) TO authenticated;
