-- Security audit deep-dive — 3 fixes.
--
-- Fix 1's function turned out to be LANGUAGE sql (not plpgsql as the audit
-- brief assumed) and returns the engagement_rates row type directly, so
-- it's rewritten to plpgsql rather than patched in place. It's also called
-- from SitePortal.tsx by *site contacts* (src/pages/SitePortal.tsx:180) —
-- a distinct identity in the `site_contacts` table, not a `business_members`
-- company member and not covered by is_company_member(). A literal copy of
-- the brief's auth check (company member OR contractor only) would have
-- broken that legitimate, currently-working call path (SitePortal's
-- spend-limit check). Added a third allowed party: an active site contact
-- for the engagement's company.

-- ═══════════════════════════════════════════════════════════════════════
-- FIX 1 — effective_engagement_rates: auth check inside the function
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.effective_engagement_rates(
  p_engagement_id uuid, p_on_date date DEFAULT CURRENT_DATE
)
RETURNS engagement_rates
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_engagement term_engagements%ROWTYPE;
  v_result engagement_rates%ROWTYPE;
BEGIN
  SELECT * INTO v_engagement FROM term_engagements WHERE id = p_engagement_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Engagement not found';
  END IF;

  IF NOT is_company_member(v_engagement.company_id)
     AND auth.uid() != v_engagement.contractor_id
     AND NOT EXISTS (
       SELECT 1 FROM site_contacts sc
       WHERE sc.company_id = v_engagement.company_id
       AND sc.user_id = auth.uid()
       AND sc.is_active = true
     )
  THEN
    RAISE EXCEPTION 'Not authorised to view engagement rates';
  END IF;

  SELECT *
  INTO v_result
  FROM engagement_rates
  WHERE engagement_id = p_engagement_id
    AND agreed_by_business_at IS NOT NULL
    AND agreed_by_contractor_at IS NOT NULL
    AND effective_from <= p_on_date
  ORDER BY version DESC
  LIMIT 1;

  RETURN v_result;
END;
$function$;

-- ═══════════════════════════════════════════════════════════════════════
-- FIX 2 — log_search_appearance: revoke from anon (confirmed live: anon
-- currently has EXECUTE). authenticated keeps it — ContractorDirectory.tsx
-- calls it on every directory search.
-- ═══════════════════════════════════════════════════════════════════════

REVOKE EXECUTE ON FUNCTION log_search_appearance(uuid[]) FROM anon;

-- ═══════════════════════════════════════════════════════════════════════
-- FIX 3 — contractor_documents: scope SELECT to owner or published profile
-- ═══════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Anyone can view contractor documents" ON contractor_documents;

CREATE POLICY "contractor_documents_select" ON contractor_documents
  FOR SELECT USING (
    contractor_id = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = contractor_documents.contractor_id
      AND profile_is_published = true
    )
  );
