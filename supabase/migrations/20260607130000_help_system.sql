-- A. onboarding_completed_at on profiles (existing user RLS covers it)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz NULL;

-- B. feature_announcements — service-role writes, authenticated reads
CREATE TABLE IF NOT EXISTS public.feature_announcements (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text        NOT NULL,
  description text,
  applies_to  text[]      NOT NULL,
  released_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.feature_announcements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated read" ON public.feature_announcements;
CREATE POLICY "authenticated read"
  ON public.feature_announcements
  FOR SELECT
  TO authenticated
  USING (true);

-- C. user_seen_announcements — user owns their own rows
CREATE TABLE IF NOT EXISTS public.user_seen_announcements (
  user_id         uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  announcement_id uuid        NOT NULL REFERENCES public.feature_announcements(id) ON DELETE CASCADE,
  seen_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, announcement_id)
);
ALTER TABLE public.user_seen_announcements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner select" ON public.user_seen_announcements;
CREATE POLICY "owner select"
  ON public.user_seen_announcements
  FOR SELECT
  USING (user_id = auth.uid());
DROP POLICY IF EXISTS "owner insert" ON public.user_seen_announcements;
CREATE POLICY "owner insert"
  ON public.user_seen_announcements
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- D. Indexes
CREATE INDEX IF NOT EXISTS fa_released_at_idx
  ON public.feature_announcements(released_at);
CREATE INDEX IF NOT EXISTS usa_user_id_idx
  ON public.user_seen_announcements(user_id);

-- E. Seed announcement (visible to all three roles) — skip if already present
INSERT INTO public.feature_announcements (title, description, applies_to)
VALUES (
  'Your new dashboard has arrived',
  'Everything you need is now in the sidebar, with a clearer overview and faster access to your jobs.',
  ARRAY['personal','contractor','business']
)
ON CONFLICT DO NOTHING;
