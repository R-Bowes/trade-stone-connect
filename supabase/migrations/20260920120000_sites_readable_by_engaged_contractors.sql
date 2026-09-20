-- Sites readable by contractors party to an engagement that covers them.
--
-- The only sites SELECT policies are sites_select (can_access_site: company
-- owner / covered members) and sites_readable_by_invited_tender_contractors
-- (tender-invited contractors, via tender_sites). A contractor on a DIRECT
-- engagement matches neither, so any embed of sites from their side — the
-- site name on an engagement card, on a dispatched work order — comes back
-- null with no error (the silent-empty embed failure mode in CLAUDE.md).
--
-- Mirrors the tender precedent: a SECURITY DEFINER predicate over the
-- coverage table (engagement_sites), one-directional (sites policy reads
-- engagement_sites/term_engagements; neither of their policies reads sites
-- back), so no policy cycle.
--
-- Scoped to live engagements — active, suspended, notice_given — the same
-- three-status set create_direct_engagement's duplicate guard treats as live,
-- so a contractor keeps the site name mid-job when the business gives notice
-- or suspends. Access lapses once the engagement is ended or expired. Exposes the full site row
-- (including address) to the engaged contractor, who needs it to attend the
-- site. Does NOT extend to assets.

CREATE OR REPLACE FUNCTION public.contractor_covers_site(p_site_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.engagement_sites es
    JOIN public.term_engagements te ON te.id = es.engagement_id
    WHERE es.site_id = p_site_id
      AND te.contractor_id = auth.uid()
      AND te.status IN ('active', 'suspended', 'notice_given')
  );
$$;

REVOKE ALL     ON FUNCTION public.contractor_covers_site(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.contractor_covers_site(uuid) TO authenticated;

DROP POLICY IF EXISTS "sites_readable_by_engaged_contractors" ON public.sites;
CREATE POLICY "sites_readable_by_engaged_contractors"
ON public.sites FOR SELECT TO authenticated
USING (public.contractor_covers_site(id));
