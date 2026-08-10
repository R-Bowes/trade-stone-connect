-- =============================================================================
-- contractor_service_area_coverage.sql — postcode + coverage_type columns,
-- service_area_radius_miles backfilled from working_radius, and
-- public_pro_profiles exposes the new fields.
--
-- Step-0 audit (service areas / job location / directory search) found:
-- working_radius (text, "25 miles"/"Nationwide") collected at onboarding
-- and in ProfileManagement, never referenced by search; a second,
-- competing service_area_radius_miles (integer) written only by the
-- Canvas Editor (useProfileEditor.ts); service_area_center_lat/_lng
-- present but never written; no postcode column at all. This migration
-- makes service_area_radius_miles canonical and adds the columns needed
-- to geocode a contractor's base postcode. working_radius is deprecated
-- IN PLACE, not dropped -- app code stops reading it from Commit 3 onward,
-- the column itself stays until a future cleanup migration.
--
-- coverage_type: 'radius' (default) | 'regional' (schema-only, no UI in
-- this work) | 'national' (admin-set only -- no UI in this build writes
-- 'national'; it exists so an admin path can set it later).
--
-- service_area_center_lat/_lng are deliberately NOT touched here -- they
-- stay NULL until a real postcodes.io geocode call resolves them
-- (Commit 3). Existing contractors are prompted on next login, never
-- auto-geocoded, so there is nothing to backfill for those two columns.
-- =============================================================================

ALTER TABLE public.profiles
  ADD COLUMN postcode text,
  ADD COLUMN coverage_type text NOT NULL DEFAULT 'radius'
    CHECK (coverage_type IN ('radius', 'regional', 'national'));

-- Backfill service_area_radius_miles from the deprecated working_radius
-- text label ("5 miles".."50 miles") where the canonical column is still
-- empty. Only rows with a leading integer are touched -- anything that
-- doesn't match the pattern (e.g. already-blank, or a future unexpected
-- value) is left alone rather than guessed at.
UPDATE public.profiles
SET service_area_radius_miles = (regexp_match(working_radius, '^(\d+)'))[1]::integer
WHERE service_area_radius_miles IS NULL
  AND working_radius IS NOT NULL
  AND working_radius ~ '^\d+';

-- 'Nationwide' rows get coverage_type = 'national' with radius left NULL
-- -- a national contractor has no meaningful radius figure. Matched
-- case-insensitively and trimmed rather than against the exact 'Nationwide'
-- literal: the RADII const in ContractorOnboarding.tsx always supplies that
-- exact casing today, but if the Canvas Editor or any older/future path
-- ever wrote a variant, an exact-match WHERE would leave those rows stuck
-- at coverage_type = 'radius' with a NULL radius -- invisible to radius
-- search and not flagged national either. lower(trim(...)) is cheap
-- insurance against that.
UPDATE public.profiles
SET coverage_type = 'national'
WHERE lower(trim(working_radius)) = 'nationwide';

-- NOTE for Commit 4 (search rewrite): after this backfill, a contractor can
-- still have coverage_type = 'radius' AND service_area_radius_miles IS
-- NULL -- anyone who never set a radius before this migration (their
-- working_radius was NULL or didn't match '^\d+', so nothing was
-- backfilled) lands here, not in an error state. Treat that combination as
-- ILIKE-fallback-only, the same as a NULL postcode/lat/lng contractor --
-- never as "radius zero" (which would wrongly exclude them from every
-- distance match instead of falling back).

-- Bounding-box prefilter index for Commit 4's search rewrite. A plain
-- btree on (lat, lng) mainly helps a query that filters lat with an
-- equality or a leading range -- it won't reliably be chosen by the
-- planner for a two-sided range on both columns at today's table size, and
-- may not even at a larger one without matching query shape. Kept anyway
-- as a harmless, cheap starting point; revisit once Commit 4's actual
-- query exists and there's real row-count/plan data to tune against.
CREATE INDEX IF NOT EXISTS idx_profiles_service_area_center
  ON public.profiles (service_area_center_lat, service_area_center_lng);

-- public_pro_profiles is a Pattern-1 plain view (CLAUDE.md) -- it has no
-- security_invoker, so its own WHERE clause is 100% of the access gate.
-- Reproduced verbatim from the live view definition (pg_get_viewdef,
-- confirmed against the live DB before writing this) with postcode and
-- coverage_type added to the SELECT list. address remains excluded, per
-- CLAUDE.md's existing rule that this view never exposes it.
CREATE OR REPLACE VIEW public.public_pro_profiles AS
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
  service_area_radius_miles,
  postcode,
  coverage_type
FROM public.profiles p
WHERE is_active = true
  AND (
    (user_type = 'contractor'::user_type AND profile_is_published = true)
    OR user_id = auth.uid()
  );
