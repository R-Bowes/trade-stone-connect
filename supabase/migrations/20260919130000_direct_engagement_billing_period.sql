-- Billing period for term engagements — split out from
-- 20260919120000_direct_term_engagement_creation.sql, which was already
-- applied remotely (confirmed via `npx supabase migration list`) before this
-- work was added to it. Migrations are immutable once applied, so
-- 20260919120000 was reverted to exactly what was pushed and this billing
-- work moved into its own file instead.
--
-- The billing period belongs to the billing work, not this pass, but is
-- immutable once an engagement starts, so it must be collected at creation.

-- =============================================================================
-- 1. billing_period / billing_anchor_day. Same nullable-then-backfill-then-
--    NOT-NULL shape as origin in 20260919120000, same reasoning: no DEFAULT
--    on the final column, so a future insert that forgets to state it fails
--    loudly instead of silently mislabelling.
--
--    Backfill: every existing row predates this concept entirely (it did
--    not exist as a column until this migration), so every one of them
--    becomes 'calendar_month' unconditionally — not a data-dependent
--    classification, the same shape as the origin backfill. Row count not
--    run here — no live DB access in this session:
--      SELECT count(*) FROM public.term_engagements;
--
--    billing_anchor_day capped at 28, not 31: a custom period anchored on
--    the 29th, 30th, or 31st doesn't exist in every calendar month
--    (February has 28 or 29 days; April/June/September/November have 30),
--    so "the 31st" as a recurring monthly anchor is undefined five months
--    a year and "the 29th/30th" is undefined in February specifically.
--    Capping at 28 guarantees the anchor day exists in every month with no
--    special-casing (no "if the month is short, use the last day instead"
--    logic) needed wherever this column is eventually consumed. Agree with
--    the limit: the alternative buys a handful of extra anchor days at the
--    cost of exception-handling everywhere this gets read.
-- =============================================================================

ALTER TABLE public.term_engagements ADD COLUMN billing_period text;

UPDATE public.term_engagements SET billing_period = 'calendar_month';

ALTER TABLE public.term_engagements ALTER COLUMN billing_period SET NOT NULL;

ALTER TABLE public.term_engagements ADD COLUMN billing_anchor_day integer;

ALTER TABLE public.term_engagements
  ADD CONSTRAINT term_engagements_billing_period_check
  CHECK (
    (billing_period = 'calendar_month' AND billing_anchor_day IS NULL)
    OR
    (billing_period = 'custom' AND billing_anchor_day BETWEEN 1 AND 28)
  );
-- Same as origin: any value other than 'calendar_month'/'custom' fails
-- both branches, so no separate enum-style CHECK is needed.

-- =============================================================================
-- 2. create_direct_engagement — extended to take and set billing_period /
--    billing_anchor_day. This is a CREATE OR REPLACE against the exact
--    four-parameter function already live from 20260919120000, adding two
--    new parameters with the second defaulted so existing callers of the
--    four-arg form would still resolve if any remained — none do, since
--    PanelManagement.tsx (the only caller) is updated in this same pass to
--    pass both.
--
--    Everything else — the is_company_member check, the panel-membership
--    check (status='approved' AND can_receive_jobs=true), the duplicate-
--    engagement guard added in 20260919120000, engagement_number left to
--    the unchanged trigger — is carried over unmodified from the applied
--    function body.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_direct_engagement(
  p_company_id uuid,
  p_contractor_id uuid,
  p_start_date date,
  p_expiry_date date,
  p_billing_period text,
  p_billing_anchor_day integer DEFAULT NULL
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

  RETURN v_engagement_id;
END;
$$;

-- The old four-arg signature is a distinct overload in Postgres and is not
-- replaced by the CREATE OR REPLACE above — it must be dropped explicitly,
-- otherwise both signatures would coexist live with no caller left using
-- the old one.
DROP FUNCTION IF EXISTS public.create_direct_engagement(uuid, uuid, date, date);

REVOKE ALL     ON FUNCTION public.create_direct_engagement(uuid, uuid, date, date, text, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.create_direct_engagement(uuid, uuid, date, date, text, integer) TO authenticated;
