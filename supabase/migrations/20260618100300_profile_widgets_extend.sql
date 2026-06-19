ALTER TABLE profile_widgets
  ADD COLUMN IF NOT EXISTS section_instance_id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS section_ref_id uuid,        -- for gallery/project: FK to contractor_photo_galleries.id or contractor_projects.id
  ADD COLUMN IF NOT EXISTS meta jsonb DEFAULT '{}',    -- { heading, ctaLabel, etc. }
  ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS published_order integer;    -- snapshot of display_order at last publish

-- Drop old unique constraint that would block multiple rows with same widget_key
ALTER TABLE profile_widgets DROP CONSTRAINT IF EXISTS profile_widgets_contractor_id_widget_key_key;

-- New unique: one row per contractor + instance
CREATE UNIQUE INDEX IF NOT EXISTS profile_widgets_contractor_instance_unique
  ON profile_widgets (contractor_id, section_instance_id);
