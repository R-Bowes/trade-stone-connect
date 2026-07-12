-- =============================================================================
-- 20260712150000_publish_tender.sql
-- Tendering sub-step 3c: draft -> published transition.
--
-- No publish_tender (or any tender status-transition) function existed
-- before this migration -- confirmed via grep across every migration file,
-- and functions in this codebase are schema-change-discipline-only (never
-- dashboard-created, per CLAUDE.md), so migration history is authoritative
-- for functions unlike some of the dashboard-created business-tier tables.
-- The only trigger on tenders is update_tenders_updated_at (timestamp bump
-- only) -- nothing today stops a raw client UPDATE from setting status to
-- ANY of the seven CHECK-allowed values from any starting state.
--
-- TENDERING-SCHEMA.md's locked convention: "State transitions with
-- consequences run through SECURITY DEFINER functions, not raw UPDATEs."
-- Publish flips contractor-facing visibility (contractor_can_view_tender
-- keys off status <> 'draft') and fires invite notifications -- exactly
-- this class of transition, built the same shape as
-- suspend_term_engagement / give_notice_on_term_engagement (row lock ->
-- auth check -> status guard -> the UPDATE), with publish-specific
-- precondition validation added ahead of the UPDATE.
--
-- Preconditions enforced here (none are DB-enforced today -- see Phase 1
-- report): title non-blank (already NOT NULL, re-checked for completeness),
-- at least one trade, at least one site, response_deadline set AND in the
-- future (response_deadline is nullable in tenders -- "enforced NOT NULL at
-- publish, in function not schema" per TENDERING-SCHEMA.md chunk 2), and
-- for distribution='invite', at least one tender_invitations row.
--
-- Notifications: no trigger exists on tender_invitations or tenders for
-- this. Inserted here, atomically with the status flip, one row per
-- invited contractor (invite-mode only -- open tenders rely on the
-- query-layer relevance filter per the locked Option B decision, no
-- targeted push). tender_invitations.contractor_id is used directly as
-- notifications.user_id: profiles.id == profiles.user_id == auth.uid() by
-- construction (CLAUDE.md CHECK-enforced invariant), so no extra profile
-- lookup is needed the way some older call sites (e.g. PanelManagement)
-- redundantly do.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.publish_tender(p_tender_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tender      public.tenders%ROWTYPE;
  v_site_count  int;
  v_invite_count int;
BEGIN
  SELECT * INTO v_tender FROM public.tenders WHERE id = p_tender_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tender not found';
  END IF;

  IF NOT is_company_member(v_tender.company_id) THEN
    RAISE EXCEPTION 'Not authorised to publish this tender';
  END IF;

  IF v_tender.status <> 'draft' THEN
    RAISE EXCEPTION 'Tender must be in draft to publish (current status: %)', v_tender.status;
  END IF;

  IF v_tender.title IS NULL OR btrim(v_tender.title) = '' THEN
    RAISE EXCEPTION 'Title is required before publishing';
  END IF;

  IF v_tender.trade_categories IS NULL OR array_length(v_tender.trade_categories, 1) IS NULL THEN
    RAISE EXCEPTION 'At least one trade is required before publishing';
  END IF;

  SELECT count(*) INTO v_site_count FROM public.tender_sites WHERE tender_id = p_tender_id;
  IF v_site_count = 0 THEN
    RAISE EXCEPTION 'At least one site is required before publishing';
  END IF;

  IF v_tender.response_deadline IS NULL THEN
    RAISE EXCEPTION 'A response deadline is required before publishing';
  END IF;

  IF v_tender.response_deadline <= now() THEN
    RAISE EXCEPTION 'The response deadline must be in the future';
  END IF;

  IF v_tender.distribution = 'invite' THEN
    SELECT count(*) INTO v_invite_count FROM public.tender_invitations WHERE tender_id = p_tender_id;
    IF v_invite_count = 0 THEN
      RAISE EXCEPTION 'At least one invited contractor is required for an invite-only tender';
    END IF;
  END IF;

  UPDATE public.tenders
  SET status = 'published', published_at = now()
  WHERE id = p_tender_id;

  IF v_tender.distribution = 'invite' THEN
    INSERT INTO public.notifications (user_id, title, message, type, reference_type, reference_id, is_read)
    SELECT
      ti.contractor_id,
      'New tender invitation',
      'You''ve been invited to bid on "' || v_tender.title || '" (' || v_tender.tender_number || ')',
      'tender_invitation',
      'tender',
      p_tender_id,
      false
    FROM public.tender_invitations ti
    WHERE ti.tender_id = p_tender_id;
  END IF;
END;
$$;

REVOKE ALL     ON FUNCTION public.publish_tender(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.publish_tender(uuid) TO authenticated;
