-- Canvas editor Pass A, A2: project sections currently share one
-- contractor-wide project list — addSection("project", ...) passes no
-- section_ref_id at all (CanvasEditor.tsx:1649), unlike gallery sections,
-- which genuinely scope their photos via section_ref_id ->
-- contractor_photo_galleries.id (CanvasEditor.tsx:1635-1637). A second or
-- third project section today just duplicates the first.
--
-- NOT APPLIED YET — written for review per the A2 brief ("write the file
-- and report the SQL — do not push"). Do not run `npx supabase db push`
-- until this is confirmed.
--
-- Mirrors contractor_photo_galleries / contractor_photos exactly:
-- one profile_widgets row (widget_key='project') will set section_ref_id
-- to one row here, and contractor_projects.group_id scopes individual
-- projects to that group — same shape, same ON DELETE SET NULL choice
-- (a removed group orphans its projects rather than destroying them,
-- matching 20260618120000_canvas_editor_tables.sql's comment for
-- contractor_photos.gallery_id).
--
-- Chosen over the alternative (a bare section_ref_id-style column added
-- directly to contractor_projects, pointing at the owning profile_widgets
-- row) because profile_widgets rows are NOT stable across saves:
-- useProfileEditor.ts's saveToDb() deletes every one of a contractor's
-- profile_widgets rows and reinserts them fresh on every save, without
-- preserving id (see the insert in saveToDb — no `id` field is sent, so
-- Postgres mints a new one every time). A FK from contractor_projects
-- into profile_widgets.id would silently go stale/orphaned on the next
-- unrelated profile save. A durable table, exactly like
-- contractor_photo_galleries, avoids that entirely — section_ref_id
-- keeps pointing at the same group row across saves, and only the
-- profile_widgets row that references it gets recreated.

CREATE TABLE IF NOT EXISTS contractor_project_groups (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id  uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title          text        NOT NULL,
  display_order  int         NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE contractor_project_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contractor_project_groups: public read"
  ON contractor_project_groups FOR SELECT USING (true);

CREATE POLICY "contractor_project_groups: owner write"
  ON contractor_project_groups FOR ALL
  USING     (contractor_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()))
  WITH CHECK (contractor_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

GRANT SELECT ON contractor_project_groups TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON contractor_project_groups TO authenticated;
GRANT ALL ON contractor_project_groups TO service_role;

-- contractor_projects: add group_id, mirroring contractor_photos.gallery_id
-- (20260618120000_canvas_editor_tables.sql). Nullable and ON DELETE SET
-- NULL: an ungrouped project (group_id IS NULL) is the pre-existing
-- behaviour every current project row already has, so this is additive
-- and does not require a backfill or a NOT NULL constraint.
ALTER TABLE contractor_projects
  ADD COLUMN IF NOT EXISTS group_id uuid
    REFERENCES contractor_project_groups(id) ON DELETE SET NULL;
