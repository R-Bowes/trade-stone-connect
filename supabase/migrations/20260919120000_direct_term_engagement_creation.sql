-- Direct term engagement creation — removes the tender-only requirement.
--
-- Audit before this migration (reported separately) found:
--  - Zero reads of term_engagements.agreement_id or .tender_id anywhere in
--    src/ or supabase/ — nothing needs null-case handling for either column.
--  - Exactly one place assumes a tender origin in a way that actually
--    breaks on a NULL tender_id: contract_expiry_radar
--    (20260712120000_expiry_radar_and_retender.sql:85-103) INNER JOINs
--    term_engagements.tender_id to tenders.id to pull trade_categories. A
--    direct-origin engagement would silently vanish from that view (no
--    error — an inner join with no match just omits the row). Fixed below
--    as a direct, mechanical consequence of this same column change, not a
--    new feature.
--  - next_business_document_number(company_id, entity) is keyed purely on
--    (company_id, entity), entity constrained to 'tender'/'engagement' —
--    there is no existing mechanism to give direct-origin engagements a
--    separate sequence without widening that CHECK constraint. This
--    migration does NOT do that: origin='direct' rows share the same
--    'engagement' counter and TE- prefix as tender-origin rows, because
--    the existing assign_engagement_number_trigger is left untouched (per
--    instruction) and it doesn't branch on origin.

-- =============================================================================
-- 1. agreement_id / tender_id become nullable.
-- =============================================================================

ALTER TABLE public.term_engagements
  ALTER COLUMN agreement_id DROP NOT NULL,
  ALTER COLUMN tender_id DROP NOT NULL;

-- =============================================================================
-- 2. origin column. Added nullable, backfilled explicitly, THEN set
--    NOT NULL — deliberately no DEFAULT on the final column. Every existing
--    row was inserted exclusively by
--    convert_awarded_agreement_to_term_engagement() (term_engagements has
--    no INSERT policy for any role, and that function is REVOKE ALL FROM
--    PUBLIC, anon, authenticated — 20260711130000...sql:205-215,431 — so
--    there is no other way a row could exist), and that function's own
--    INSERT always supplies both agreement_id and tender_id
--    (20260711130000...sql:385-391). So every existing row is tender-origin
--    by construction, not by inspecting data. Row count not run here — no
--    live DB access in this session:
--      SELECT count(*) FROM public.term_engagements;
-- =============================================================================

ALTER TABLE public.term_engagements ADD COLUMN origin text;

UPDATE public.term_engagements SET origin = 'tender';

ALTER TABLE public.term_engagements ALTER COLUMN origin SET NOT NULL;

ALTER TABLE public.term_engagements
  ADD CONSTRAINT term_engagements_origin_check
  CHECK (
    (origin = 'tender' AND agreement_id IS NOT NULL AND tender_id IS NOT NULL)
    OR
    (origin = 'direct' AND agreement_id IS NULL     AND tender_id IS NULL)
  );
-- No separate origin IN ('tender','direct') check needed: any other value
-- makes both branches false, so the constraint above already rejects it.

-- =============================================================================
-- 3. contract_expiry_radar — LEFT JOIN instead of JOIN so a direct-origin
--    engagement (tender_id NULL) still appears, with trade_categories NULL
--    instead of being silently dropped from the view. Full CREATE OR
--    REPLACE VIEW because a join type can't be altered in place; every
--    other line is unchanged from 20260712120000_expiry_radar_and_retender.sql.
-- =============================================================================

CREATE OR REPLACE VIEW public.contract_expiry_radar WITH (security_invoker = true) AS
SELECT
  e.id,
  'engagement'::text                            AS source,
  e.company_id,
  e.engagement_number                           AS label,
  e.contractor_id,
  t.trade_categories,
  COALESCE(
    (SELECT array_agg(es.site_id) FROM public.engagement_sites es WHERE es.engagement_id = e.id),
    ARRAY[]::uuid[]
  )                                              AS site_ids,
  e.expiry_date,
  e.retender_notice_months,
  e.notice_effective_date,
  e.retendered_as
FROM public.term_engagements e
LEFT JOIN public.tenders t ON t.id = e.tender_id
WHERE e.status IN ('active', 'suspended', 'notice_given')

UNION ALL

SELECT
  lc.id,
  'logged_contract'::text                       AS source,
  lc.company_id,
  lc.supplier_name                              AS label,
  NULL::uuid                                    AS contractor_id,
  CASE WHEN lc.trade_category IS NOT NULL THEN ARRAY[lc.trade_category] ELSE NULL END AS trade_categories,
  lc.site_ids,
  lc.expiry_date,
  lc.retender_notice_months,
  NULL::date                                    AS notice_effective_date,
  lc.retendered_as
FROM public.logged_contracts lc;

-- =============================================================================
-- 4. create_direct_engagement — mirrors
--    convert_awarded_agreement_to_term_engagement's shape (SECURITY
--    DEFINER, same INSERT target), but takes a company and contractor
--    directly instead of unpacking a tender_agreements row.
--
--    Panel-membership check: contractor_panel.status = 'approved' AND
--    can_receive_jobs = true. status = 'approved' is the same signal
--    PanelManagement.tsx itself uses as "on the panel" (its own comment:
--    "DB constraint: status = ANY ('pending','approved','suspended',
--    'removed')", every approve action there sets status to 'approved').
--    can_receive_jobs is NOT NULL DEFAULT true (20260629120000_prequalification.sql:138,
--    confirmed against live types.ts: `can_receive_jobs: boolean` in the Row
--    type, no `| null` — the column can never be null, so `= true` is a
--    complete check on its own, no IS NOT NULL/COALESCE needed). A
--    standing commitment to send work is exactly what this column exists
--    to gate: BusinessPrequalView.tsx's suspend action
--    (handleSuspend, :343-351) sets it false on a compliance suspension,
--    and its approve action (:329-332) sets it true. One caveat worth
--    knowing before relying on it as a prequal-complete gate: PanelManagement.tsx's
--    own invite path never sets this column explicitly, so a freshly
--    invited, not-yet-prequalified contractor also reads true (the column
--    default), same as one who has genuinely completed prequalification —
--    today, this column distinguishes "not suspended" from "suspended," not
--    "prequalified" from "not yet prequalified." The check below is correct
--    and future-proof for the compliance-suspension case either way.
--
--    engagement_number is not set — assign_engagement_number_trigger
--    (unchanged, unmodified) fires BEFORE INSERT and assigns it exactly as
--    it does for the tender path, since it only checks
--    NEW.engagement_number IS NULL.
--
--    sla_rule_set_id, notice_period_days, retender_notice_months,
--    auto_suspend_on_lapse are all left at their column defaults (NULL /
--    30 / 6 / true) — not exposed as parameters here, since the brief for
--    this pass named only company, contractor, and dates.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_direct_engagement(
  p_company_id uuid,
  p_contractor_id uuid,
  p_start_date date,
  p_expiry_date date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_engagement_id uuid;
BEGIN
  IF NOT is_company_member(p_company_id) THEN
    RAISE EXCEPTION 'Not authorised to create an engagement for this company';
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

  INSERT INTO public.term_engagements (
    origin, company_id, contractor_id, start_date, expiry_date
  ) VALUES (
    'direct', p_company_id, p_contractor_id, p_start_date, p_expiry_date
  )
  RETURNING id INTO v_engagement_id;

  RETURN v_engagement_id;
END;
$$;

REVOKE ALL     ON FUNCTION public.create_direct_engagement(uuid, uuid, date, date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.create_direct_engagement(uuid, uuid, date, date) TO authenticated;

-- No INSERT policy added to term_engagements — creation stays exclusively
-- via SECURITY DEFINER functions (now two: the tender conversion, and
-- this one), per the table's existing, deliberate design.
