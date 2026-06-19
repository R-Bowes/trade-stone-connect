-- Canvas editor: new profile columns
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS vanity_slug         text,
  ADD COLUMN IF NOT EXISTS seo_title           text,
  ADD COLUMN IF NOT EXISTS seo_description     text,
  ADD COLUMN IF NOT EXISTS visibility_public   boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS cta_label           text,
  ADD COLUMN IF NOT EXISTS bio_heading         text,
  ADD COLUMN IF NOT EXISTS services_heading    text,
  ADD COLUMN IF NOT EXISTS reviews_heading     text,
  ADD COLUMN IF NOT EXISTS credentials_heading text,
  ADD COLUMN IF NOT EXISTS availability_heading text,
  ADD COLUMN IF NOT EXISTS team_heading        text,
  ADD COLUMN IF NOT EXISTS profile_is_published boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS profile_published_at timestamptz;

-- Vanity slugs must be globally unique (NULLs are excluded from the index)
CREATE UNIQUE INDEX IF NOT EXISTS profiles_vanity_slug_idx
  ON profiles (vanity_slug)
  WHERE vanity_slug IS NOT NULL;

-- profile_widgets: add label so repeatable sections can carry custom titles
ALTER TABLE profile_widgets
  ADD COLUMN IF NOT EXISTS label text;

-- contractor_projects
-- Portfolio showcases (max 3 enforced in app). contractor_id -> profiles(id).
CREATE TABLE IF NOT EXISTS contractor_projects (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id  uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title          text        NOT NULL,
  description    text,
  trade          text,
  location       text,
  completion_date date,
  photo_urls     text[]      NOT NULL DEFAULT '{}',
  display_order  int         NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE contractor_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contractor_projects: public read"
  ON contractor_projects FOR SELECT USING (true);

CREATE POLICY "contractor_projects: owner write"
  ON contractor_projects FOR ALL
  USING     (contractor_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()))
  WITH CHECK (contractor_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

GRANT SELECT ON contractor_projects TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON contractor_projects TO authenticated;
GRANT ALL ON contractor_projects TO service_role;

-- contractor_photo_galleries
-- Named photo galleries (max 3 enforced in app). contractor_id -> profiles(id).
CREATE TABLE IF NOT EXISTS contractor_photo_galleries (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id  uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title          text        NOT NULL,
  display_order  int         NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE contractor_photo_galleries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contractor_photo_galleries: public read"
  ON contractor_photo_galleries FOR SELECT USING (true);

CREATE POLICY "contractor_photo_galleries: owner write"
  ON contractor_photo_galleries FOR ALL
  USING     (contractor_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()))
  WITH CHECK (contractor_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

GRANT SELECT ON contractor_photo_galleries TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON contractor_photo_galleries TO authenticated;
GRANT ALL ON contractor_photo_galleries TO service_role;

-- contractor_photos: add gallery_id
-- ON DELETE SET NULL: deleting a gallery orphans its photos rather than
-- cascade-deleting them, so the contractor doesn't lose uploaded files.
ALTER TABLE contractor_photos
  ADD COLUMN IF NOT EXISTS gallery_id uuid
    REFERENCES contractor_photo_galleries(id) ON DELETE SET NULL;
