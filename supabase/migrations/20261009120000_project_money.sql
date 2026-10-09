-- Projects slice 3, step 3: server-side project money.
--
-- ROLLBACK: both functions are new, so undo is a plain drop,
-- nothing to restore:
--   DROP FUNCTION IF EXISTS public.project_money_totals(uuid[]);
--   DROP FUNCTION IF EXISTS public.project_money(uuid);
--
-- WHY THIS EXISTS
-- useProjectDetail.ts's client-side invoice read is permission-correct for
-- a personal project (the homeowner IS the invoice recipient) but wrong for
-- a business one: a coverage-scoped team member can only read invoices
-- where they themselves are recipient_id (RLS: "Recipients can view their
-- invoices"), so a colleague's deposit-paid invoice on the SAME project
-- silently drops out of the client's own invoices array and understates
-- paid/still-to-pay. These two SECURITY DEFINER functions compute the
-- money centrally, authorise once against can_access_project, and return
-- totals only — never an invoice row — so no caller, personal or
-- business, can read invoice detail they are not RLS-entitled to just by
-- calling this function.
--
-- MONEY RULE — identical to src/lib/projectMoney.ts and invoiceMoney.ts:
--   - a job's invoices: status NOT IN ('void','draft'), matched by job_id,
--     or (job_id IS NULL AND quote_id = the job's issued_quote_id) for
--     invoices raised before job_id was recorded.
--   - deposit settled = 0 unless deposit_paid; then deposit_deducted if
--     that is > 0, else deposit_amount. (Mirrors depositSettled().)
--   - paid = sum over those invoices of (status='paid' ? total : settled).
--   - agreed = jobs.contract_value, else the largest matching invoice
--     total, else null. (Mirrors agreedAmount().)
--   - still_to_pay = greatest(0, agreed - paid).
--   - due_now = sum over 'sent'/'viewed' invoices of
--     greatest(0, total - settled). (Mirrors amountOutstanding(), summed.)
--
-- PACKAGE VISIBILITY — identical to project_packages_select's own qual:
--     can_access_project(project_id)
--     AND (site_id IS NULL OR can_access_site(site_id)
--          OR is_company_owner(project_company_id(project_id)))
-- project_money raises once, up front, if the caller cannot access the
-- project at all; it then silently omits any package whose site-pin the
-- caller's own coverage doesn't reach, exactly as a direct SELECT on
-- project_packages would.

CREATE OR REPLACE FUNCTION public.project_money(p_project_id uuid)
RETURNS TABLE (
  package_id uuid,
  job_id uuid,
  agreed numeric,
  paid numeric,
  still_to_pay numeric,
  due_now numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF NOT public.can_access_project(p_project_id) THEN
    RAISE EXCEPTION 'Not authorized to view this project''s money.';
  END IF;

  RETURN QUERY
  WITH visible_packages AS (
    SELECT pkg.id, pkg.job_id, pkg.project_id
    FROM public.project_packages pkg
    WHERE pkg.project_id = p_project_id
      AND (
        pkg.site_id IS NULL
        OR public.can_access_site(pkg.site_id)
        OR public.is_company_owner(public.project_company_id(pkg.project_id))
      )
  ),
  job_invoices AS (
    SELECT
      vp.id AS jiv_package_id,
      vp.job_id AS jiv_job_id,
      inv.status AS jiv_status,
      inv.total AS jiv_total,
      inv.deposit_amount AS jiv_deposit_amount,
      inv.deposit_deducted AS jiv_deposit_deducted,
      inv.deposit_paid AS jiv_deposit_paid
    FROM visible_packages vp
    JOIN public.jobs j ON j.id = vp.job_id
    JOIN public.invoices inv
      ON inv.status NOT IN ('void', 'draft')
     AND (
       inv.job_id = j.id
       OR (inv.job_id IS NULL AND j.issued_quote_id IS NOT NULL AND inv.quote_id = j.issued_quote_id)
     )
    WHERE vp.job_id IS NOT NULL
  ),
  -- Columns here are deliberately NOT named package_id/job_id/etc: this
  -- function's OUT parameters carry those names, and plpgsql raises
  -- 42501 "ambiguous" on a bare reference that matches an OUT parameter,
  -- even many CTEs away from the RETURN QUERY. Every column downstream
  -- of job_invoices keeps a jiv_/stl_/pj_ prefix for exactly this reason.
  settled AS (
    SELECT
      jiv_package_id,
      jiv_job_id,
      jiv_status AS stl_status,
      jiv_total AS stl_total,
      CASE
        WHEN jiv_deposit_paid IS TRUE THEN
          CASE WHEN COALESCE(jiv_deposit_deducted, 0) > 0 THEN jiv_deposit_deducted ELSE COALESCE(jiv_deposit_amount, 0) END
        ELSE 0
      END AS stl_amount_settled
    FROM job_invoices
  ),
  per_job AS (
    SELECT
      jiv_package_id AS pj_package_id,
      jiv_job_id AS pj_job_id,
      SUM(CASE WHEN stl_status = 'paid' THEN stl_total ELSE stl_amount_settled END) AS pj_paid,
      MAX(stl_total) AS pj_max_invoice_total,
      SUM(CASE WHEN stl_status IN ('sent', 'viewed') THEN GREATEST(0, stl_total - stl_amount_settled) ELSE 0 END) AS pj_due_now
    FROM settled
    GROUP BY jiv_package_id, jiv_job_id
  )
  SELECT
    vp.id AS package_id,
    vp.job_id AS job_id,
    COALESCE(j.contract_value, pj.pj_max_invoice_total) AS agreed,
    COALESCE(pj.pj_paid, 0) AS paid,
    GREATEST(0, COALESCE(j.contract_value, pj.pj_max_invoice_total, 0) - COALESCE(pj.pj_paid, 0)) AS still_to_pay,
    COALESCE(pj.pj_due_now, 0) AS due_now
  FROM visible_packages vp
  LEFT JOIN public.jobs j ON j.id = vp.job_id
  LEFT JOIN per_job pj ON pj.pj_package_id = vp.id;
END;
$$;

REVOKE ALL ON FUNCTION public.project_money(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.project_money(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.project_money(uuid) TO authenticated;

-- Same rule, summed per project, for the overview's tiles and cards.
-- Projects the caller cannot access are silently absent from the result
-- (no row), never raised — the overview already only lists what RLS
-- shows the caller, so this just mirrors that for the money columns.
CREATE OR REPLACE FUNCTION public.project_money_totals(p_project_ids uuid[])
RETURNS TABLE (
  project_id uuid,
  agreed numeric,
  paid numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  WITH accessible AS (
    SELECT pid FROM unnest(p_project_ids) AS pid WHERE public.can_access_project(pid)
  ),
  visible_packages AS (
    SELECT pkg.id, pkg.job_id, pkg.project_id
    FROM public.project_packages pkg
    JOIN accessible a ON a.pid = pkg.project_id
    WHERE pkg.site_id IS NULL
       OR public.can_access_site(pkg.site_id)
       OR public.is_company_owner(public.project_company_id(pkg.project_id))
  ),
  job_invoices AS (
    SELECT
      vp.project_id,
      vp.id AS package_id,
      vp.job_id,
      inv.status,
      inv.total,
      inv.deposit_amount,
      inv.deposit_deducted,
      inv.deposit_paid
    FROM visible_packages vp
    JOIN public.jobs j ON j.id = vp.job_id
    JOIN public.invoices inv
      ON inv.status NOT IN ('void', 'draft')
     AND (
       inv.job_id = j.id
       OR (inv.job_id IS NULL AND j.issued_quote_id IS NOT NULL AND inv.quote_id = j.issued_quote_id)
     )
  ),
  settled AS (
    SELECT
      project_id, package_id, job_id, status, total,
      CASE
        WHEN deposit_paid IS TRUE THEN
          CASE WHEN COALESCE(deposit_deducted, 0) > 0 THEN deposit_deducted ELSE COALESCE(deposit_amount, 0) END
        ELSE 0
      END AS amount_settled
    FROM job_invoices
  ),
  per_job AS (
    SELECT
      project_id, package_id, job_id,
      SUM(CASE WHEN status = 'paid' THEN total ELSE amount_settled END) AS paid,
      MAX(total) AS max_invoice_total
    FROM settled
    GROUP BY project_id, package_id, job_id
  ),
  per_package AS (
    SELECT
      vp.project_id,
      vp.id AS package_id,
      COALESCE(j.contract_value, pj.max_invoice_total, 0) AS agreed,
      COALESCE(pj.paid, 0) AS paid
    FROM visible_packages vp
    LEFT JOIN public.jobs j ON j.id = vp.job_id
    LEFT JOIN per_job pj ON pj.package_id = vp.id
  )
  SELECT
    a.pid AS project_id,
    COALESCE(SUM(pp.agreed), 0) AS agreed,
    COALESCE(SUM(pp.paid), 0) AS paid
  FROM accessible a
  LEFT JOIN per_package pp ON pp.project_id = a.pid
  GROUP BY a.pid;
$$;

REVOKE ALL ON FUNCTION public.project_money_totals(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.project_money_totals(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.project_money_totals(uuid[]) TO authenticated;
