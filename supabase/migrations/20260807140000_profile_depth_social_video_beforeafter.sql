-- Contractor profile depth: social links, video showcase, before/after,
-- service area config. Purely additive.
--
-- DEVIATION (flagged, not implemented as spec'd): the brief's "Add pinned
-- review flag" step (job_reviews.pinned column + togglePinReview hook
-- function) is NOT added here. Reviewing the live editor found pinning
-- already fully implemented via a different, already-shipped mechanism:
-- profile_widgets rows for the 'reviews' section carry
-- meta.pinnedReviewIds (string[], max 3 enforced client-side in
-- CanvasEditor.tsx's ReviewsPanelContent), and ContractorProfile.tsx
-- already reads it, marks matching reviews `pinned: true`, and sorts them
-- first (see its needsReviews fetch). A second, DB-column-backed pinning
-- mechanism would just be a competing source of truth for the same
-- concept. This migration leaves job_reviews untouched; the "Featured
-- Testimonials" ask is satisfied by giving the already-pinned reviews
-- distinct styling in ReviewsBlock instead (see this feature's own
-- report for the ContractorProfile.tsx change).

-- =========================================================================
-- 1. Social links
-- =========================================================================

ALTER TABLE public.profiles
  ADD COLUMN social_links jsonb DEFAULT '{}'::jsonb;

-- =========================================================================
-- 2. Video showcase
-- =========================================================================

CREATE TABLE public.profile_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id uuid NOT NULL REFERENCES public.profiles(id),
  url text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('youtube', 'tiktok', 'vimeo', 'other')),
  title text,
  description text,
  thumbnail_url text,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profile_videos ENABLE ROW LEVEL SECURITY;

-- Public profile content — same broad SELECT shape as
-- contractor_credentials / profile_widgets (CLAUDE.md's "deliberately
-- public" RLS section), scoped to authenticated per spec.
CREATE POLICY "Anyone can read profile videos"
  ON public.profile_videos FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Contractor can insert own profile videos"
  ON public.profile_videos FOR INSERT
  TO authenticated
  WITH CHECK (contractor_id = auth.uid());

CREATE POLICY "Contractor can update own profile videos"
  ON public.profile_videos FOR UPDATE
  TO authenticated
  USING (contractor_id = auth.uid())
  WITH CHECK (contractor_id = auth.uid());

CREATE POLICY "Contractor can delete own profile videos"
  ON public.profile_videos FOR DELETE
  TO authenticated
  USING (contractor_id = auth.uid());

CREATE INDEX idx_profile_videos_contractor ON public.profile_videos(contractor_id);

-- =========================================================================
-- 3. Before / after pairs
-- =========================================================================

CREATE TABLE public.profile_before_after (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id uuid NOT NULL REFERENCES public.profiles(id),
  before_photo_url text NOT NULL,
  after_photo_url text NOT NULL,
  title text,
  description text,
  job_id uuid REFERENCES public.jobs(id),
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profile_before_after ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read profile before/after pairs"
  ON public.profile_before_after FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Contractor can insert own before/after pairs"
  ON public.profile_before_after FOR INSERT
  TO authenticated
  WITH CHECK (contractor_id = auth.uid());

CREATE POLICY "Contractor can update own before/after pairs"
  ON public.profile_before_after FOR UPDATE
  TO authenticated
  USING (contractor_id = auth.uid())
  WITH CHECK (contractor_id = auth.uid());

CREATE POLICY "Contractor can delete own before/after pairs"
  ON public.profile_before_after FOR DELETE
  TO authenticated
  USING (contractor_id = auth.uid());

CREATE INDEX idx_profile_before_after_contractor ON public.profile_before_after(contractor_id);

-- =========================================================================
-- 4. Service area geocoordinates (working_radius text column is unchanged)
-- =========================================================================

ALTER TABLE public.profiles
  ADD COLUMN service_area_center_lat numeric,
  ADD COLUMN service_area_center_lng numeric,
  ADD COLUMN service_area_radius_miles integer;

-- =========================================================================
-- 5. public_pro_profiles — expose the new public-facing columns.
-- Full restatement of 20260718110000's body: same WHERE clause verbatim
-- (own-row OR published-contractor gate — this is a plain RLS-bypass view,
-- see CLAUDE.md's view-idioms section, so the WHERE is 100% of the access
-- gate), SELECT list extended with social_links and the service-area
-- columns. contractor_id-keyed profile_videos/profile_before_after don't
-- need to be in this view — the public profile page queries those tables
-- directly by id, same as it already does for contractor_photos/
-- contractor_projects/team_members etc.
-- =========================================================================

CREATE OR REPLACE VIEW public_pro_profiles AS
SELECT
  id,
  user_id,
  full_name,
  company_name,
  ts_profile_code,
  user_type,
  location,
  working_radius,
  bio,
  trades,
  avatar_url,
  logo_url,
  is_verified,
  is_available,
  hourly_rate,
  years_experience,
  rating,
  review_count,
  completed_jobs,
  is_active,
  created_at,
  updated_at,
  profile_is_published,
  cover_url,
  cta_label,
  social_links,
  service_area_center_lat,
  service_area_center_lng,
  service_area_radius_miles
FROM profiles p
WHERE is_active = true
  AND (
    (user_type = 'contractor' AND profile_is_published = true)
    OR user_id = auth.uid()
  );
