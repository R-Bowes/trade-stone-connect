-- Profile sections: a real published snapshot, atomic save/publish, and public
-- reads limited to published + enabled sections.
--
-- Before this migration profile_widgets had is_published / published_order
-- columns and the public profile preferred is_published rows, but nothing ever
-- wrote them: saveToDb() deleted and re-inserted every row (resetting
-- is_published to false) so the public page always fell back to the live rows,
-- and every edit — including hiding a section — went live at Save, and hidden
-- sections' rows were returned to every visitor and filtered in the browser.
--
-- Model from here on:
--   draft rows     is_published = false   what the editor loads and saves
--   snapshot rows  is_published = true    what visitors read; only ever
--                                         enabled sections, written only by
--                                         publish_profile_sections()
--
-- Sections only. Edits to profiles columns (bio, social links, cover, ...) are
-- not snapshotted and still go live at Save; a profiles snapshot is later work.

-- =============================================================================
-- 1. Pre-flight — assumptions this migration relies on. RAISE, never delete.
-- =============================================================================

DO $$
DECLARE
  existing_snapshot_rows integer;
BEGIN
  -- Nothing in the app has ever written is_published = true. If any exist,
  -- the backfill below would duplicate them; stop and let a human look.
  SELECT count(*) INTO existing_snapshot_rows
  FROM public.profile_widgets
  WHERE is_published = true;

  IF existing_snapshot_rows > 0 THEN
    RAISE EXCEPTION
      'Cannot backfill the published snapshot: % profile_widgets rows already have is_published = true. Resolve manually before applying.',
      existing_snapshot_rows;
  END IF;
END $$;

-- =============================================================================
-- 2. Backfill — every profile that is published today gets a snapshot built
--    from its current enabled rows, so no live profile goes blank when the
--    public policy below stops exposing draft rows. Never-published profiles get
--    none (visitors cannot reach them anyway: public_pro_profiles only returns
--    published profiles or the owner's own row).
-- =============================================================================

INSERT INTO public.profile_widgets (
  contractor_id, widget_key, is_enabled, display_order, label,
  section_ref_id, meta, is_published, published_order
)
SELECT
  w.contractor_id, w.widget_key, true, w.display_order, w.label,
  w.section_ref_id, COALESCE(w.meta, '{}'::jsonb), true, w.display_order
FROM public.profile_widgets w
JOIN public.profiles p ON p.id = w.contractor_id
WHERE p.profile_is_published = true
  AND w.is_enabled = true
  AND w.is_published = false;

-- =============================================================================
-- 3. RLS. Direct auth.uid() form (profiles.id = auth.uid()).
--
--    Visitors: published AND enabled rows only — a hidden section is absent
--    from the response, not fetched and filtered.
--    Owners: read all of their own rows (draft and snapshot, for the editor's
--    Draft/Published comparison and their own preview), but write DRAFT rows
--    only. The old "Contractors manage own widgets" FOR ALL policy let any
--    client delete every row including the snapshot, so a stale editor bundle
--    saving after this migration would have wiped the snapshot and blanked the
--    public page until the next Publish. Snapshot rows now change only through
--    publish_profile_sections().
-- =============================================================================

DROP POLICY IF EXISTS "Anyone can read profile widgets" ON public.profile_widgets;
DROP POLICY IF EXISTS "Contractors manage own widgets" ON public.profile_widgets;

CREATE POLICY "Public can read published enabled widgets"
ON public.profile_widgets FOR SELECT TO anon, authenticated
USING (is_published = true AND is_enabled = true);

CREATE POLICY "Owners can read own widgets"
ON public.profile_widgets FOR SELECT TO authenticated
USING (contractor_id = auth.uid());

CREATE POLICY "Owners can insert draft widgets"
ON public.profile_widgets FOR INSERT TO authenticated
WITH CHECK (contractor_id = auth.uid() AND is_published = false);

CREATE POLICY "Owners can update draft widgets"
ON public.profile_widgets FOR UPDATE TO authenticated
USING (contractor_id = auth.uid() AND is_published = false)
WITH CHECK (contractor_id = auth.uid() AND is_published = false);

CREATE POLICY "Owners can delete draft widgets"
ON public.profile_widgets FOR DELETE TO authenticated
USING (contractor_id = auth.uid() AND is_published = false);

-- =============================================================================
-- 4. save_profile_sections — replaces the caller's DRAFT rows in one
--    transaction. If the insert fails the delete rolls back with it, so a
--    profile can no longer be left with no sections.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.save_profile_sections(p_sections jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid := auth.uid();
BEGIN
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_owner) THEN
    RAISE EXCEPTION 'No profile found for this user';
  END IF;

  IF p_sections IS NULL OR jsonb_typeof(p_sections) <> 'array' THEN
    RAISE EXCEPTION 'p_sections must be a JSON array';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_sections) AS s(widget_key text, is_enabled boolean, display_order integer)
    WHERE s.widget_key IS NULL OR btrim(s.widget_key) = ''
       OR s.is_enabled IS NULL OR s.display_order IS NULL
  ) THEN
    RAISE EXCEPTION 'Every section needs a widget_key, is_enabled and display_order';
  END IF;

  DELETE FROM public.profile_widgets
  WHERE contractor_id = v_owner AND is_published = false;

  INSERT INTO public.profile_widgets (
    contractor_id, widget_key, is_enabled, display_order, label,
    section_ref_id, meta, is_published
  )
  SELECT
    v_owner, s.widget_key, s.is_enabled, s.display_order, s.label,
    s.section_ref_id, COALESCE(s.meta, '{}'::jsonb), false
  FROM jsonb_to_recordset(p_sections) AS s(
    widget_key text, is_enabled boolean, display_order integer, label text,
    section_ref_id uuid, meta jsonb
  );
END;
$$;

-- =============================================================================
-- 5. publish_profile_sections — replaces the snapshot with copies of the
--    caller's ENABLED draft rows, and marks the profile published, in one
--    transaction. A section hidden in the draft is simply absent from the
--    snapshot, so it disappears from the public profile at this point and not
--    before.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.publish_profile_sections()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid := auth.uid();
BEGIN
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_owner) THEN
    RAISE EXCEPTION 'No profile found for this user';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profile_widgets
    WHERE contractor_id = v_owner AND is_published = false
  ) THEN
    RAISE EXCEPTION 'There are no saved sections to publish';
  END IF;

  DELETE FROM public.profile_widgets
  WHERE contractor_id = v_owner AND is_published = true;

  INSERT INTO public.profile_widgets (
    contractor_id, widget_key, is_enabled, display_order, label,
    section_ref_id, meta, is_published, published_order
  )
  SELECT
    w.contractor_id, w.widget_key, true, w.display_order, w.label,
    w.section_ref_id, COALESCE(w.meta, '{}'::jsonb), true, w.display_order
  FROM public.profile_widgets w
  WHERE w.contractor_id = v_owner
    AND w.is_published = false
    AND w.is_enabled = true;

  UPDATE public.profiles
  SET profile_is_published = true,
      profile_published_at = now()
  WHERE id = v_owner;
END;
$$;

REVOKE ALL ON FUNCTION public.save_profile_sections(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.publish_profile_sections() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_profile_sections(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_profile_sections() TO authenticated;
