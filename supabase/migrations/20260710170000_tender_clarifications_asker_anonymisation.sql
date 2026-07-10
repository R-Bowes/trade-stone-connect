-- =============================================================================
-- 20260710170000_tender_clarifications_asker_anonymisation.sql
-- Closes the asked_by leak flagged in 20260710160000's header comment.
--
-- Previous state (20260710160000): "tender_clarifications_contractor_select"
-- let a contractor SELECT any row where contractor_can_view_tender(tender_id)
-- AND (asked_by = auth.uid() OR answer IS NOT NULL) — meaning asked_by for
-- OTHER bidders' answered questions was present in the row at the SQL/
-- PostgREST level. That migration's header comment called this a deliberate
-- UI-only trust boundary. It is not anymore: this migration closes it at
-- the data layer. The frontend needs no discipline around asked_by — the
-- value is simply absent from the API response for any row that isn't the
-- viewing contractor's own.
--
-- Mechanism, following the public_pro_profiles precedent (20260210120000 /
-- 20260301100000 / 20260301113000 / 20260627151644): a plain view, owned by
-- the migration role, exposed via GRANT SELECT ... TO authenticated. A
-- Postgres view runs with its owner's table privileges by default (no
-- `security_invoker` set — same as every public_pro_profiles migration), so
-- it reads past tender_clarifications' RLS the same way public_pro_profiles
-- reads past profiles' RLS — the view's own WHERE clause (and, here, a CASE
-- on the returned column) does the real filtering/redaction instead of a
-- base-table RLS policy. auth.uid() resolves to the actual invoking user
-- regardless of the view's owner, same as inside every SECURITY DEFINER
-- helper already in this codebase (is_company_member, contractor_can_view_tender).
--
-- The base-table contractor SELECT policy is narrowed to own rows only —
-- the "other bidders' answered questions" case now goes through the view,
-- not the table. Business's path is unchanged: business policies still read
-- the base table directly (they were never party to the leak — they see
-- asked_by by design, per the doc: "business sees asker").
-- =============================================================================

-- Narrow: contractors can only SELECT their own rows on the base table now.
DROP POLICY IF EXISTS "tender_clarifications_contractor_select" ON public.tender_clarifications;

CREATE POLICY "tender_clarifications_contractor_select"
ON public.tender_clarifications FOR SELECT TO authenticated
USING (contractor_can_view_tender(tender_id) AND asked_by = auth.uid());

-- Contractor read path for the sealed-clarifications channel: own questions
-- complete; other bidders' questions only once answered, with asked_by
-- (the identifying column) stripped to NULL.
CREATE VIEW public.tender_clarifications_for_contractor AS
SELECT
  id,
  tender_id,
  CASE WHEN asked_by = auth.uid() THEN asked_by ELSE NULL END AS asked_by,
  question,
  answer,
  answered_by,
  answered_at,
  created_at
FROM public.tender_clarifications
WHERE
  contractor_can_view_tender(tender_id)
  AND (asked_by = auth.uid() OR answer IS NOT NULL);

GRANT SELECT ON public.tender_clarifications_for_contractor TO authenticated;
