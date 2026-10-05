-- ROLLBACK (run in this order if the lock must be undone):
--   grant select on public.profiles to anon, authenticated;
--   -- and, to restore exact public_pro_profiles values, re-run the view
--   -- body from 20260813100000_add_country_code_to_public_pro_profiles.sql.
--
-- Profiles exposure, stage 1, migration 2 of 2: the column lock.
--
-- After this, anon and authenticated can no longer SELECT the sensitive
-- columns of public.profiles (contact details, address, VAT, Stripe) for
-- ANY row, including their own. Own-row reads go through public.my_profile
-- (20261004100000); cross-user reads that genuinely need a locked column go
-- through the SECURITY DEFINER functions added in that same migration.
-- Row access (RLS) is unchanged. UPDATE / INSERT privileges are unchanged:
-- a user can still write their own phone, address, VAT fields, etc.
--
-- LOCKED (26): email, phone, address, addr_line1, addr_line2, addr_city,
--   addr_region, addr_postcode, addr_country, addr_lat, addr_lng,
--   addr_place_id, postcode, service_area_center_lat, service_area_center_lng,
--   vat_number, vat_registered, vat_registration_date, stripe_account_id,
--   stripe_charges_enabled, stripe_payouts_enabled, stripe_transfers_capability,
--   stripe_disabled_reason, stripe_requirements_currently_due,
--   stripe_capabilities_updated_at, stripe_capabilities_event_created
-- READABLE (47): every other column, granted explicitly below.

-- ── 0. Pre-flight: the two lists must cover profiles exactly ────────────────
-- A column added since these lists were written would otherwise be silently
-- locked (never granted) — fail instead and force a decision.
DO $$
DECLARE
  v_expected text[] := ARRAY[
    -- readable
    'availability_heading', 'avatar_url', 'bio', 'bio_heading', 'company_name',
    'completed_jobs', 'country_code', 'cover_url', 'coverage_type', 'created_at',
    'credentials_heading', 'cta_label', 'full_name', 'hourly_rate', 'id',
    'is_active', 'is_available', 'is_verified', 'location', 'logo_url',
    'onboarding_completed', 'onboarding_completed_at', 'profile_is_published',
    'profile_published_at', 'profile_seo_description', 'profile_seo_title',
    'profile_vanity_slug', 'profile_visibility_public', 'rating', 'review_count',
    'reviews_heading', 'seo_description', 'seo_title', 'service_area_radius_miles',
    'services_heading', 'social_links', 'team_heading', 'trades', 'ts_profile_code',
    'updated_at', 'user_id', 'user_type', 'vanity_slug', 'visibility_public',
    'website', 'working_radius', 'years_experience',
    -- locked
    'email', 'phone', 'address', 'addr_line1', 'addr_line2', 'addr_city',
    'addr_region', 'addr_postcode', 'addr_country', 'addr_lat', 'addr_lng',
    'addr_place_id', 'postcode', 'service_area_center_lat', 'service_area_center_lng',
    'vat_number', 'vat_registered', 'vat_registration_date', 'stripe_account_id',
    'stripe_charges_enabled', 'stripe_payouts_enabled', 'stripe_transfers_capability',
    'stripe_disabled_reason', 'stripe_requirements_currently_due',
    'stripe_capabilities_updated_at', 'stripe_capabilities_event_created'
  ];
  v_unlisted text;
  v_missing text;
BEGIN
  SELECT string_agg(column_name, ', ' ORDER BY column_name) INTO v_unlisted
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'profiles'
    AND column_name <> ALL (v_expected);

  SELECT string_agg(c, ', ' ORDER BY c) INTO v_missing
  FROM unnest(v_expected) AS c
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = c
  );

  IF v_unlisted IS NOT NULL OR v_missing IS NOT NULL THEN
    RAISE EXCEPTION
      'profiles column lists out of date. Not in either list: [%]. Listed but not on the table: [%]. Classify them before applying.',
      coalesce(v_unlisted, ''), coalesce(v_missing, '');
  END IF;
END $$;

-- ── 1. Revoke table-wide SELECT ──────────────────────────────────────────────
revoke select on public.profiles from anon, authenticated;

-- ── 2. Grant SELECT on the readable columns only ─────────────────────────────
-- anon included because anon held table-level SELECT before this migration
-- (grant query 1, 4 Oct 2026: anon=rDxtm) — keeps public/logged-out reads of
-- these columns working exactly as before.
grant select (
  availability_heading,
  avatar_url,
  bio,
  bio_heading,
  company_name,
  completed_jobs,
  country_code,
  cover_url,
  coverage_type,
  created_at,
  credentials_heading,
  cta_label,
  full_name,
  hourly_rate,
  id,
  is_active,
  is_available,
  is_verified,
  location,
  logo_url,
  onboarding_completed,
  onboarding_completed_at,
  profile_is_published,
  profile_published_at,
  profile_seo_description,
  profile_seo_title,
  profile_vanity_slug,
  profile_visibility_public,
  rating,
  review_count,
  reviews_heading,
  seo_description,
  seo_title,
  service_area_radius_miles,
  services_heading,
  social_links,
  team_heading,
  trades,
  ts_profile_code,
  updated_at,
  user_id,
  user_type,
  vanity_slug,
  visibility_public,
  website,
  working_radius,
  years_experience
) on public.profiles to anon, authenticated;

-- ── 3. public_pro_profiles: coarsen location precision ──────────────────────
-- Owner-run view (unchanged idiom), so it still reads the locked columns;
-- what it exposes is coarsened instead:
--   postcode                 -> outward code only. "SW1A 1AA" -> "SW1A".
--                               A UK postcode stored without its space has
--                               the 3-character inward code stripped instead
--                               ("SW1A1AA" -> "SW1A"), so it can't leak whole.
--   service_area_center_lat/lng -> rounded to 2 dp (~1 km). The directory's
--                               radius search tolerates this (agreed 4 Oct).
-- Same columns, same order, same filter. Grants on the view are preserved
-- by CREATE OR REPLACE.
CREATE OR REPLACE VIEW public.public_pro_profiles AS
 SELECT id,
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
    round(service_area_center_lat, 2) AS service_area_center_lat,
    round(service_area_center_lng, 2) AS service_area_center_lng,
    service_area_radius_miles,
    CASE
      WHEN postcode IS NULL OR btrim(postcode) = '' THEN NULL
      WHEN position(' ' IN btrim(postcode)) > 0 THEN split_part(btrim(postcode), ' ', 1)
      WHEN coalesce(country_code, 'GB') = 'GB' AND length(btrim(postcode)) > 4
        THEN left(btrim(postcode), length(btrim(postcode)) - 3)
      ELSE btrim(postcode)
    END AS postcode,
    coverage_type,
    country_code
   FROM profiles p
  WHERE is_active = true
    AND (user_type = 'contractor'::user_type AND profile_is_published = true
         OR user_id = auth.uid());
