-- =============================================================================
-- 20260712160000_publish_tender_notification_fix.sql
-- Fixes publish_tender() (20260712150000, already pushed): the invite
-- notification insert used tender_invitations.contractor_id directly as
-- notifications.user_id. That relies on profiles.id == profiles.user_id
-- holding today (true, CHECK-enforced per CLAUDE.md) but is exactly the
-- fragile shortcut CLAUDE.md warns against taking a dependency on -- every
-- other notification insert in the codebase resolves user_id via a join to
-- profiles instead of assuming the two columns are interchangeable at the
-- call site. Matches the cron-era pattern established in
-- run_compliance_watcher() / run_expiry_radar() / create_callout_job()
-- (20260711130000, 20260712120000): "INSERT ... SELECT p.user_id ... FROM
-- public.profiles p WHERE p.id = <profile_id>".
--
-- CREATE OR REPLACE, not an edit to the prior migration file: applied
-- migrations are immutable per TENDERING-SCHEMA.md's locked conventions.
-- Only the notification INSERT changed; every precondition check, the
-- status guard, and the UPDATE are unchanged from 20260712150000.
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
      p.user_id,
      'New tender invitation',
      'You''ve been invited to bid on "' || v_tender.title || '" (' || v_tender.tender_number || ')',
      'tender_invitation',
      'tender',
      p_tender_id,
      false
    FROM public.tender_invitations ti
    JOIN public.profiles p ON p.id = ti.contractor_id
    WHERE ti.tender_id = p_tender_id;
  END IF;
END;
$$;

REVOKE ALL     ON FUNCTION public.publish_tender(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.publish_tender(uuid) TO authenticated;
