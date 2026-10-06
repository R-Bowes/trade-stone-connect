-- ROLLBACK (restores the exact pre-lock table grants, verified live 6 Oct
-- 2026 — and with them the self-editing exposure this migration closes):
--   revoke update on public.profiles from authenticated;  -- clears the column grants
--   grant insert, update, delete, truncate, references, trigger on public.profiles to authenticated;
--   grant truncate, references, trigger on public.profiles to anon;
--
-- Profiles exposure, stage 2, migration 2 of 2: the write lock.
--
-- Before this, authenticated held table-wide INSERT/UPDATE on profiles, and
-- "Users can update their own profile" (USING auth.uid() = user_id, no column
-- limit) let any user rewrite their own user_type, is_verified, rating,
-- review_count, completed_jobs, ts_profile_code, email, is_active and every
-- stripe_* column. Setting stripe_payouts_enabled = true on a contractor row
-- also fired sync_tier_on_stripe_payouts_change -> recalculate_contractor_tier
-- -> Tier 2 + is_verified = true: a self-granted "Stripe Verified" badge.
--
-- After this, authenticated can UPDATE only the WRITABLE columns below, and
-- neither authenticated nor anon can INSERT, DELETE, TRUNCATE, or hold
-- REFERENCES / TRIGGER on profiles. RLS policies are unchanged: own-row
-- UPDATE still requires auth.uid() = user_id, and the admin UPDATE policies
-- still apply — but admins are authenticated too, so their browser writes
-- are limited to the same WRITABLE columns. Admin-only changes go through
-- SECURITY DEFINER RPCs (admin_set_profile_active, anonymise_user).
-- SELECT grants (20261004110000) are untouched.
--
-- Unaffected server-side writers (they do not run as anon/authenticated):
--   SECURITY DEFINER, owned by postgres (the table owner):
--     handle_new_user, publish_profile_sections, recalculate_contractor_tier
--     (via sync_tier_on_stripe_payouts_change), anonymise_user,
--     admin_set_profile_active.
--   BEFORE triggers that only modify NEW (column privileges are checked
--   against the statement's target columns, not trigger-set ones):
--     assign_ts_code (ts_profile_code on insert),
--     update_profiles_updated_at (updated_at on update).
--   Edge functions on the service key (role service_role, grants untouched):
--     create-connect-account (stripe_account_id),
--     stripe-webhook account.updated (stripe_* capability columns).
--
-- WRITABLE (43): full_name, company_name, phone, website, address, location,
--   postcode, trades, hourly_rate, years_experience, bio, is_available,
--   avatar_url, logo_url, cover_url, service_area_center_lat,
--   service_area_center_lng, service_area_radius_miles, working_radius,
--   vanity_slug, seo_title, seo_description, visibility_public, cta_label,
--   social_links, onboarding_completed, onboarding_completed_at, updated_at,
--   addr_* (9), *_heading (6).
-- NOT CLIENT-WRITABLE (30): id, user_id, email, user_type, ts_profile_code,
--   is_verified, rating, review_count, completed_jobs, stripe_* (8),
--   profile_is_published, profile_published_at, is_active, created_at,
--   country_code, coverage_type, vat_number, vat_registered,
--   vat_registration_date, profile_seo_title, profile_seo_description,
--   profile_vanity_slug, profile_visibility_public.
--
-- "Users can insert their own profile" (INSERT policy) is left in place but
-- is inert once INSERT is revoked. Profiles are created only by
-- handle_new_user.

-- ── 0. Pre-flight: the two lists must cover profiles exactly ────────────────
-- A column added since these lists were written would otherwise silently
-- become non-writable — fail instead and force a decision.
DO $$
DECLARE
  v_expected text[] := ARRAY[
    -- writable
    'full_name', 'company_name', 'phone', 'website', 'address', 'location',
    'postcode', 'trades', 'hourly_rate', 'years_experience', 'bio',
    'is_available', 'avatar_url', 'logo_url', 'cover_url',
    'service_area_center_lat', 'service_area_center_lng',
    'service_area_radius_miles', 'working_radius', 'vanity_slug', 'seo_title',
    'seo_description', 'visibility_public', 'cta_label', 'social_links',
    'onboarding_completed', 'onboarding_completed_at', 'updated_at',
    'addr_line1', 'addr_line2', 'addr_city', 'addr_region', 'addr_postcode',
    'addr_country', 'addr_lat', 'addr_lng', 'addr_place_id',
    'availability_heading', 'bio_heading', 'credentials_heading',
    'reviews_heading', 'services_heading', 'team_heading',
    -- not client-writable
    'id', 'user_id', 'email', 'user_type', 'ts_profile_code', 'is_verified',
    'rating', 'review_count', 'completed_jobs',
    'stripe_account_id', 'stripe_charges_enabled', 'stripe_payouts_enabled',
    'stripe_transfers_capability', 'stripe_disabled_reason',
    'stripe_requirements_currently_due', 'stripe_capabilities_updated_at',
    'stripe_capabilities_event_created',
    'profile_is_published', 'profile_published_at', 'is_active', 'created_at',
    'country_code', 'coverage_type', 'vat_number', 'vat_registered',
    'vat_registration_date', 'profile_seo_title', 'profile_seo_description',
    'profile_vanity_slug', 'profile_visibility_public'
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

  -- admin_set_profile_active (20261006100000) must already exist, or
  -- suspend/reinstate has no path once is_active is locked.
  IF to_regprocedure('public.admin_set_profile_active(uuid, boolean)') IS NULL THEN
    RAISE EXCEPTION 'public.admin_set_profile_active(uuid, boolean) not found. Apply 20261006100000 first.';
  END IF;
END $$;

-- ── 1. Revoke every write-side privilege ─────────────────────────────────────
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.profiles FROM authenticated, anon;

-- ── 2. Grant UPDATE on the writable columns only ─────────────────────────────
GRANT UPDATE (
  full_name,
  company_name,
  phone,
  website,
  address,
  location,
  postcode,
  trades,
  hourly_rate,
  years_experience,
  bio,
  is_available,
  avatar_url,
  logo_url,
  cover_url,
  service_area_center_lat,
  service_area_center_lng,
  service_area_radius_miles,
  working_radius,
  vanity_slug,
  seo_title,
  seo_description,
  visibility_public,
  cta_label,
  social_links,
  onboarding_completed,
  onboarding_completed_at,
  updated_at,
  addr_line1,
  addr_line2,
  addr_city,
  addr_region,
  addr_postcode,
  addr_country,
  addr_lat,
  addr_lng,
  addr_place_id,
  availability_heading,
  bio_heading,
  credentials_heading,
  reviews_heading,
  services_heading,
  team_heading
) ON public.profiles TO authenticated;
