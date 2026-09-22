-- Public listing of contractor-stated credentials, without exposing
-- unsafe columns to anonymous visitors.
--
-- Since 20260730110000 the only public read on contractor_credentials is
-- "Public can read verified credentials" (USING verified = true), and nothing
-- outside admin/service-role tooling ever sets verified = true, so a
-- contractor-added credential was permanently invisible on the public
-- profile. Decision: a contractor may list their credentials publicly,
-- shown as contractor-stated, never as checked by TradeStone. RLS is
-- row-level only and cannot restrict columns, so a plain, RLS-bypassing
-- view (CLAUDE.md pattern 1, same shape as public_pro_profiles) is used
-- instead of widening the base table's public policy: the view's column
-- list is the entire access gate, hand-written, exposing every row
-- (deliberately unfiltered by verified — any contractor-listed credential
-- is publicly listable) but only id, contractor_id, name, issuer,
-- display_order. document_path, reference_number, credential_type,
-- verified, verified_at and rejection_reason are not in it.
--
-- The base table's own "Public can read verified credentials" policy is
-- UNCHANGED — the verified-badge strip (ContractorProfile.tsx:1264) depends
-- on it and keeps its distinct treatment for a genuinely verified row.

CREATE VIEW public.public_contractor_credentials AS
SELECT id, contractor_id, name, issuer, display_order
FROM public.contractor_credentials;

GRANT SELECT ON public.public_contractor_credentials TO anon, authenticated;

-- =============================================================================
-- Fold in a related, pre-existing gap: anon (and authenticated) hold SELECT on
-- every column of contractor_credentials, including document_path and
-- reference_number. Grants are role-level and evaluated before RLS, so any
-- row a policy lets an anonymous visitor see (today: verified = true rows)
-- can have every column pulled via a raw `select=*`, not just the columns the
-- app's own queries request.
--
-- Narrowing this to the columns the badge strip actually needs closes it for
-- anonymous visitors. It does NOT touch `authenticated` — see LATER.md for why
-- that side needs a different fix, not folded into this migration.
-- =============================================================================

REVOKE SELECT ON public.contractor_credentials FROM anon;
GRANT SELECT (id, contractor_id, name, issuer, verified) ON public.contractor_credentials TO anon;
