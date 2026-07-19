-- Readiness audit R2-1: public_pro_profiles's WHERE clause was
-- `is_active = true` only — no user_type or profile_is_published
-- predicate at all. Since this is a plain RLS-bypass view (owner
-- privileges, no security_invoker — see CLAUDE.md's view-idioms
-- section), that WHERE clause was 100% of the access gate, and it let
-- ANY profile (personal/business/contractor, published or not) be read
-- by anon/authenticated requests directly against the view. The shipped
-- directory UI (useContractors.ts) already applies its own
-- user_type='contractor' filter, but nothing stopped a direct query —
-- confirmed live: personal/business test rows and an unpublished draft
-- contractor were all returned. Restricting the view itself closes that
-- for every current and future caller, not just the ones that remember
-- to filter client-side.
--
-- DEVIATION from the literal `user_type='contractor' AND
-- profile_is_published=true` spec: that alone breaks
-- ContractorProfile.tsx's own-preview path. That page fetches by
-- ts_profile_code/vanity_slug through THIS view regardless of who's
-- asking, then decides isOwner vs not; a plain published-only WHERE
-- would return zero rows for the owner's own unpublished draft before
-- that ownership check ever runs, 404ing a contractor previewing their
-- own in-progress profile. Added `OR user_id = auth.uid()` so the
-- owner can always read their own row via this view — auth.uid() is
-- NULL for anon, so this adds no exposure for anyone else; every other
-- viewer still requires published=true AND user_type='contractor'.
-- Get the OR structure right here — see CLAUDE.md's documented
-- tender_clarifications_for_contractor incident for what happens when
-- an own-row exception isn't applied to every arm correctly.
--
-- Known, accepted side effect: useMarketplaceListings.ts's seller
-- lookup also reads this view (for a listing's seller full_name/
-- company_name) and doesn't restrict seller_type to contractor. A
-- listing from a non-contractor or not-yet-published-contractor seller
-- will now show no seller name — the hook already handles a null
-- match gracefully (.maybeSingle()), so this degrades rather than
-- breaks. Not fixed here; flagged for whoever picks up the marketplace
-- schema work in LATER.md.

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
  cta_label
FROM profiles p
WHERE is_active = true
  AND (
    (user_type = 'contractor' AND profile_is_published = true)
    OR user_id = auth.uid()
  );
