-- Tendering slice 1 follow-up: close the INSERT grant gap found in
-- post-push check 2a. DRAFT ONLY -- not applied, not pushed.
--
-- Root cause: 20261022130000_tender_lifecycle_lock.sql wrote
--   GRANT INSERT, UPDATE (col_list) ON public.tenders TO authenticated;
-- A column list after a privilege name scopes only THAT privilege in
-- Postgres -- it does not retroactively scope earlier privileges in the
-- same GRANT that had no list of their own. So this line granted INSERT
-- at the TABLE level, unrestricted (every column, including status), and
-- UPDATE (col_list) only on the listed columns. Confirmed live via
-- pg_class.relacl (authenticated had table-wide 'a'/INSERT after the
-- push) and pg_attribute.attacl (status's attacl was NULL -- no column
-- override, so it fell through to the unrestricted table-wide INSERT).
--
-- Same combined-grant mistake is possible elsewhere in that migration, so
-- this one splits every multi-privilege GRANT into one privilege per
-- statement, per the ruling, even where the previous migration's syntax
-- happened not to cause a bug (e.g. REVOKE INSERT, UPDATE ON ... with no
-- column list is NOT ambiguous -- it already applies evenly -- but split
-- anyway for a single consistent, auditable style going forward).
--
-- ROLLBACK (verbatim bodies/grants as they stood immediately after
-- 20261022130000, confirmed live before this migration):
--
--   REVOKE INSERT (tender_type, title, trade_categories, scope_description,
--     response_deadline, bid_visibility, distribution, bid_validity_days,
--     site_visit_required, budget_min, budget_max, budget_visible,
--     contract_start_date, contract_term_months, tupe_applies,
--     formal_procurement, sla_rule_set_id, project_id, company_id, created_by)
--     ON public.tenders FROM authenticated;
--   GRANT INSERT ON public.tenders TO authenticated;
--   GRANT INSERT ON public.tender_applications TO authenticated;
--   -- (both table-wide, unrestricted -- the pre-fix, buggy state)

-- ── 0. Pre-flight ────────────────────────────────────────────────────────────
DO $$
DECLARE v_has_table_insert boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM unnest(relacl) a
    WHERE a::text LIKE 'authenticated=%' AND a::text LIKE '%a%'
  ) INTO v_has_table_insert
  FROM pg_class WHERE relname = 'tenders' AND relnamespace = 'public'::regnamespace;

  IF NOT v_has_table_insert THEN
    RAISE EXCEPTION 'tenders no longer shows a table-wide INSERT grant for authenticated -- this fix migration appears to already be applied, or something else already changed it.';
  END IF;
END $$;

-- ── 1a. tenders: table-wide INSERT revoked, re-granted per content column ──
REVOKE INSERT ON public.tenders FROM authenticated;

GRANT INSERT (company_id) ON public.tenders TO authenticated;
GRANT INSERT (created_by) ON public.tenders TO authenticated;
GRANT INSERT (tender_type) ON public.tenders TO authenticated;
GRANT INSERT (title) ON public.tenders TO authenticated;
GRANT INSERT (trade_categories) ON public.tenders TO authenticated;
GRANT INSERT (scope_description) ON public.tenders TO authenticated;
GRANT INSERT (response_deadline) ON public.tenders TO authenticated;
GRANT INSERT (bid_visibility) ON public.tenders TO authenticated;
GRANT INSERT (distribution) ON public.tenders TO authenticated;
GRANT INSERT (bid_validity_days) ON public.tenders TO authenticated;
GRANT INSERT (site_visit_required) ON public.tenders TO authenticated;
GRANT INSERT (budget_min) ON public.tenders TO authenticated;
GRANT INSERT (budget_max) ON public.tenders TO authenticated;
GRANT INSERT (budget_visible) ON public.tenders TO authenticated;
GRANT INSERT (contract_start_date) ON public.tenders TO authenticated;
GRANT INSERT (contract_term_months) ON public.tenders TO authenticated;
GRANT INSERT (tupe_applies) ON public.tenders TO authenticated;
GRANT INSERT (formal_procurement) ON public.tenders TO authenticated;
GRANT INSERT (sla_rule_set_id) ON public.tenders TO authenticated;
GRANT INSERT (project_id) ON public.tenders TO authenticated;
-- Deliberately NOT granted: status, tender_number, published_at, closed_at,
-- unsealed_at, unsealed_by, awarded_at, cancelled_at, cancelled_by,
-- cancelled_reason, created_at, updated_at. The form only ever inserts the
-- first 10 of the 20 columns above (company_id, created_by, tender_type,
-- title, trade_categories, response_deadline, scope_description,
-- sla_rule_set_id, bid_visibility, distribution); the other 10 are not yet
-- surfaced in the UI but are genuine tender content, not server-stamped
-- state, so they're granted alongside for when they are (budget fields,
-- TUPE, site_visit_required, bid_validity_days, contract_start/term,
-- formal_procurement, project_id) -- matching the UPDATE grant list
-- 20261022130000 already carries for these same columns.

-- ── 1b. tender_applications: INSERT revoked entirely, no grant back ────────
-- Confirmed live before drafting this migration: no INSERT RLS policy
-- exists on tender_applications at all (only two SELECT policies and one
-- UPDATE policy) -- RLS already default-denies every INSERT attempt by
-- authenticated regardless of column grants, so this was not an active
-- hole the way tenders' was. Tightened anyway, belt-and-suspenders, since
-- the only writer is create_tender_application_draft (SECURITY DEFINER,
-- runs as the function owner, unaffected by this revoke) and no src/
-- file ever calls .insert() on this table directly (repo-wide grep,
-- confirmed zero matches).
REVOKE INSERT ON public.tender_applications FROM authenticated;
