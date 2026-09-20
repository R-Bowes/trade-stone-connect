-- Direct engagement site coverage.
--
-- create_direct_engagement never populated engagement_sites, so a
-- direct-origin engagement covers no sites. fetchAvailableContractors
-- (src/hooks/useWorkOrders.ts) inner-joins term_engagements to
-- engagement_sites when resolving who can be dispatched to for a given
-- site, so an engagement with zero engagement_sites rows is invisible to
-- dispatch for every site, silently, with no error — the business only
-- discovers this later as "No panel contractors cover this site".
--
-- The tender path already handles this: convert_awarded_agreement_to_
-- term_engagement (20260711130000_term_engagements_and_watchers.sql:394-397)
-- copies engagement_sites from tender_sites, commented there as "live
-- copy... operational, not contractual". This migration gives the direct
-- path the same operational data, supplied explicitly by the business at
-- creation instead of copied from a tender.
--
-- engagement_sites schema (public.engagement_sites, unchanged, confirmed
-- from 20260711130000_term_engagements_and_watchers.sql:222-241):
--   id            uuid PRIMARY KEY DEFAULT gen_random_uuid()
--   engagement_id uuid NOT NULL REFERENCES term_engagements(id) ON DELETE CASCADE
--   site_id       uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE
--   CONSTRAINT engagement_sites_engagement_site_key UNIQUE (engagement_id, site_id)
-- RLS: "engagement_sites_business_all" (ALL, is_company_member via
-- engagement_company_id) and "engagement_sites_contractor_select" — both
-- irrelevant here since this INSERT happens inside a SECURITY DEFINER
-- function and bypasses RLS entirely, same as every other INSERT
-- create_direct_engagement already performs into term_engagements itself.
-- No FK or CHECK constraint on engagement_sites ties site_id to any
-- particular company — that check has to be done by the function, which
-- is exactly what p_site_ids validation below does.

CREATE OR REPLACE FUNCTION public.create_direct_engagement(
  p_company_id uuid,
  p_contractor_id uuid,
  p_start_date date,
  p_expiry_date date,
  p_billing_period text,
  p_site_ids uuid[],
  p_billing_anchor_day integer DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_engagement_id uuid;
  v_valid_site_count integer;
BEGIN
  IF NOT is_company_member(p_company_id) THEN
    RAISE EXCEPTION 'Not authorised to create an engagement for this company';
  END IF;

  -- An engagement covering no sites can never be dispatched to (see header
  -- note) — reject at creation, loudly, rather than let the business
  -- discover this later as an empty dispatch candidate list with no
  -- indication why.
  IF p_site_ids IS NULL OR array_length(p_site_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'An engagement must cover at least one site';
  END IF;

  -- Every site id must belong to p_company_id — a company must not be able
  -- to attach another company's site to its own engagement. Compares the
  -- count of matching, deduplicated site ids against the count of
  -- deduplicated ids supplied, so both an unowned site id and a
  -- non-existent site id are caught the same way (each fails to find a
  -- match and pulls the matched count below the supplied count).
  SELECT count(DISTINCT s.id) INTO v_valid_site_count
  FROM public.sites s
  WHERE s.id = ANY (p_site_ids)
    AND s.company_id = p_company_id;

  IF v_valid_site_count <> cardinality(ARRAY(SELECT DISTINCT unnest(p_site_ids))) THEN
    RAISE EXCEPTION 'One or more sites do not belong to this company';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.contractor_panel
    WHERE company_id = p_company_id
      AND contractor_id = p_contractor_id
      AND status = 'approved'
      AND can_receive_jobs = true
  ) THEN
    RAISE EXCEPTION 'Contractor is not an active, job-eligible member of this company''s panel';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.term_engagements
    WHERE company_id = p_company_id
      AND contractor_id = p_contractor_id
      AND status IN ('active', 'suspended', 'notice_given')
  ) THEN
    RAISE EXCEPTION 'This contractor already has an active term engagement with this company';
  END IF;

  INSERT INTO public.term_engagements (
    origin, company_id, contractor_id, start_date, expiry_date,
    billing_period, billing_anchor_day
  ) VALUES (
    'direct', p_company_id, p_contractor_id, p_start_date, p_expiry_date,
    p_billing_period, p_billing_anchor_day
  )
  RETURNING id INTO v_engagement_id;

  INSERT INTO public.engagement_sites (engagement_id, site_id)
  SELECT v_engagement_id, site_id FROM unnest(p_site_ids) AS site_id;

  RETURN v_engagement_id;
END;
$$;

-- The previous six-argument signature (...p_billing_period text,
-- p_billing_anchor_day integer DEFAULT NULL) is a distinct overload in
-- Postgres and is not replaced by the CREATE OR REPLACE above, which adds
-- p_site_ids as a new required parameter — it must be dropped explicitly,
-- otherwise both signatures would coexist live with no caller left using
-- the old one.
DROP FUNCTION IF EXISTS public.create_direct_engagement(uuid, uuid, date, date, text, integer);

REVOKE ALL     ON FUNCTION public.create_direct_engagement(uuid, uuid, date, date, text, uuid[], integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.create_direct_engagement(uuid, uuid, date, date, text, uuid[], integer) TO authenticated;
