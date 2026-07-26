-- profile view tracking (logged-in clicks only)
CREATE TABLE profile_view_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  viewer_id uuid NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'marketplace'
    CHECK (source IN ('marketplace', 'direct', 'panel')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_profile_views_profile_id ON profile_view_events(profile_id);
CREATE INDEX idx_profile_views_created_at ON profile_view_events(created_at);

ALTER TABLE profile_view_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Contractors can read own profile views"
  ON profile_view_events FOR SELECT
  USING (
    profile_id IN (
      SELECT id FROM profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Authenticated users can log profile views"
  ON profile_view_events FOR INSERT
  WITH CHECK (
    viewer_id IN (
      SELECT id FROM profiles WHERE user_id = auth.uid()
    )
  );

-- search appearance daily aggregates
CREATE TABLE search_appearance_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  appearance_date date NOT NULL DEFAULT CURRENT_DATE,
  appearance_count int NOT NULL DEFAULT 1,
  UNIQUE (profile_id, appearance_date)
);

CREATE INDEX idx_search_appearances_profile ON search_appearance_daily(profile_id);

ALTER TABLE search_appearance_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Contractors can read own search appearances"
  ON search_appearance_daily FOR SELECT
  USING (
    profile_id IN (
      SELECT id FROM profiles WHERE user_id = auth.uid()
    )
  );

-- Insert/update via SECURITY DEFINER so marketplace search can log without exposing writes
CREATE OR REPLACE FUNCTION log_search_appearance(p_profile_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO search_appearance_daily (profile_id, appearance_date, appearance_count)
  SELECT unnest(p_profile_ids), CURRENT_DATE, 1
  ON CONFLICT (profile_id, appearance_date)
  DO UPDATE SET appearance_count = search_appearance_daily.appearance_count + 1;
END;
$$;

-- enquiry source tracking
ALTER TABLE enquiries
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'marketplace'
    CHECK (source IN ('marketplace', 'direct', 'panel'));