-- Work orders: step 1 follow-ups a, b, c, and the SELECT coverage gap.
--
-- a. Cost lines only once the job is under way. submit_work_order_cost and
--    amend_work_order_cost refuse unless the work order is 'accepted' and its
--    job is in_progress, snagging or complete. Legacy work orders too. This is
--    a soft gate until the step 5 check-in: jobs.status is still
--    client-writable (the jobs lock is on the write-path list).
-- b. PO increase requests. work_order_po_requests, written only through
--    request_po_increase / approve_po_increase / decline_po_increase /
--    withdraw_po_increase. At most one pending request per work order.
--    Cancelling the work order declines a pending request.
-- c. Approval limits. business_members.approval_limit (NULL = cannot sign off
--    anything; the owner is always unlimited). _can_sign_off_amount(company,
--    site, amount) = owner, or an active member covering the site whose limit
--    is at least the amount. The amount is always the PO TOTAL after the
--    change. It gates: issuing a PO at raise, approve_work_order,
--    amend_work_order_value, approving an over-PO cost line, and
--    approve_po_increase. Amending an issued PO checks the GREATER of its old
--    and new value: a member can only change a PO they could have signed off
--    at both. Operational actions (raise, dispatch, reassign,
--    cancel, decline a request, query/reject a cost line, approve a line that
--    stays within the PO) keep _can_review_work_order_costs, unchanged: any
--    active member covering the site, or the owner. No role column: CLAUDE.md
--    stands. The site threshold still signs off site-contact auto-dispatch,
--    and nothing else.
--    approval_limit changes only through set_member_approval_limit (owner
--    only); column UPDATE/INSERT on it is revoked from authenticated.
-- d. work_orders, work_order_costs and work_order_po_requests company SELECT
--    narrow from "any company member" to "owner, or a member covering the work
--    order's site". A work order with no site is visible to the owner only.
-- e. job_variations cannot be raised (or moved) onto a work-order job; work
--    orders get one variation path (PO increase requests) instead.
-- f. can_sign_off_work_order is replaced by can_act_on_work_order (operational)
--    and can_sign_off_work_order_amount (sign-off for a given PO total). The
--    old function stays as a transitional shim delegating to
--    can_act_on_work_order, for the live client until the step 1b screens
--    deploy; it is dropped in step 2's migration.

-- ── Pre-flight ───────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_writers  text[];
  v_expected text[] := ARRAY['_dispatch_work_order', 'accept_work_order', 'amend_work_order_value',
                             'approve_work_order', 'approve_work_order_cost', 'cancel_work_order',
                             'create_work_order', 'decline_work_order', 'process_auto_dispatch',
                             'reassign_work_order'];
  v_n        integer;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'business_members' AND column_name = 'approval_limit') THEN
    RAISE EXCEPTION 'business_members.approval_limit already exists';
  END IF;
  IF to_regclass('public.work_order_po_requests') IS NOT NULL THEN
    RAISE EXCEPTION 'work_order_po_requests already exists';
  END IF;

  -- The writers step 1 left; anything new means the lock is incomplete.
  SELECT array_agg(p.proname::text ORDER BY p.proname) INTO v_writers
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
    AND p.prosrc ~* '(insert\s+into|update|delete\s+from)\s+(public\.)?work_orders\M';
  IF v_writers IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'Unaccounted work_orders writer(s): found %, expected %', v_writers, v_expected;
  END IF;

  IF has_table_privilege('authenticated', 'public.work_orders', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.work_orders', 'INSERT') THEN
    RAISE EXCEPTION 'authenticated can write work_orders: step 1 lock is not in place';
  END IF;

  SELECT count(*) INTO v_n FROM pg_policies
  WHERE schemaname = 'public' AND (
       (tablename = 'work_orders' AND policyname <> 'work_orders_select')
    OR (tablename = 'work_order_costs' AND policyname NOT IN ('work_order_costs_company_select', 'work_order_costs_contractor_select'))
  );
  IF v_n > 0 THEN
    RAISE EXCEPTION '% unexpected polic(ies) on work_orders / work_order_costs', v_n;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'job_variations' AND policyname = 'Contractor can raise job variations')
     OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'job_variations' AND policyname = 'Contractor can edit pending variations') THEN
    RAISE EXCEPTION 'job_variations contractor policies not found as expected';
  END IF;

  -- No variation already sits on a work-order job (the new policy would
  -- leave it uneditable). Fail, never delete.
  SELECT count(*) INTO v_n FROM public.job_variations v JOIN public.jobs j ON j.id = v.job_id
  WHERE j.work_order_id IS NOT NULL;
  IF v_n > 0 THEN
    RAISE EXCEPTION '% job_variations row(s) are on work-order jobs. Resolve manually before applying.', v_n;
  END IF;

  -- The business_members columns this migration re-grants one by one.
  SELECT count(*) INTO v_n FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'business_members';
  IF v_n <> 12 THEN
    RAISE EXCEPTION 'business_members has % columns, expected 12; re-derive the column grants', v_n;
  END IF;
END $$;

-- ── Approval limits ──────────────────────────────────────────────────────────

ALTER TABLE public.business_members
  ADD COLUMN approval_limit numeric(12,2);

ALTER TABLE public.business_members
  ADD CONSTRAINT business_members_approval_limit_check
    CHECK (approval_limit IS NULL OR approval_limit >= 0);

COMMENT ON COLUMN public.business_members.approval_limit IS
  'Highest PO total this member may sign off. NULL = cannot sign off. The owner has no row and no limit. Set only via set_member_approval_limit.';

-- Table-level INSERT/UPDATE would cover the new column; column privileges
-- cannot be revoked from under a table-level grant, so swap to per-column
-- grants on every existing column. RLS (owner-only writes) is unchanged.
REVOKE INSERT, UPDATE ON public.business_members FROM authenticated;
GRANT INSERT (id, company_id, profile_id, status, invited_email, invite_token, invite_expires_at,
              created_at, accepted_at, coverage_kind, coverage_group_id, coverage_site_id)
  ON public.business_members TO authenticated;
GRANT UPDATE (id, company_id, profile_id, status, invited_email, invite_token, invite_expires_at,
              created_at, accepted_at, coverage_kind, coverage_group_id, coverage_site_id)
  ON public.business_members TO authenticated;

-- Sign-off for a PO total: the owner, or an active member covering the site
-- whose limit covers the amount. A NULL site is owner-only.
CREATE OR REPLACE FUNCTION public._can_sign_off_amount(p_company_id uuid, p_site_id uuid, p_amount numeric)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN p_amount IS NULL THEN false
    WHEN is_company_owner(p_company_id) THEN true
    WHEN p_site_id IS NULL THEN false
    ELSE EXISTS (SELECT 1 FROM public.sites s WHERE s.id = p_site_id AND s.company_id = p_company_id)
         AND can_access_site(p_site_id)
         AND EXISTS (
           SELECT 1 FROM public.business_members bm
           JOIN public.profiles p ON p.id = bm.profile_id
           WHERE bm.company_id = p_company_id
             AND bm.status = 'active'
             AND p.user_id = auth.uid()
             AND bm.approval_limit IS NOT NULL
             AND bm.approval_limit >= p_amount
         )
  END;
$function$;

-- Everyone who could sign off p_amount at the site, as user ids: the owner,
-- plus active covering members whose limit covers it. Used for notifications,
-- so it evaluates coverage for other users rather than auth.uid().
CREATE OR REPLACE FUNCTION public._work_order_sign_off_recipients(p_company_id uuid, p_site_id uuid, p_amount numeric)
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p.user_id
  FROM public.companies c JOIN public.profiles p ON p.id = c.owner_id
  WHERE c.id = p_company_id
  UNION
  SELECT p.user_id
  FROM public.business_members bm
  JOIN public.profiles p ON p.id = bm.profile_id
  WHERE p_site_id IS NOT NULL
    AND bm.company_id = p_company_id
    AND bm.status = 'active'
    AND bm.approval_limit IS NOT NULL
    AND bm.approval_limit >= p_amount
    AND (
      bm.coverage_kind = 'national'
      OR (bm.coverage_kind = 'site' AND bm.coverage_site_id = p_site_id)
      OR (bm.coverage_kind = 'group' AND EXISTS (
            SELECT 1 FROM public.site_group_members sgm
            WHERE sgm.group_id = bm.coverage_group_id AND sgm.site_id = p_site_id))
    );
$function$;

-- Now used only by process_auto_dispatch: a person who can sign off the
-- amount, or the site's threshold for a site-contact request.
CREATE OR REPLACE FUNCTION public._work_order_value_signed_off(p_company_id uuid, p_site_id uuid, p_value numeric)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_threshold numeric;
BEGIN
  IF public._can_sign_off_amount(p_company_id, p_site_id, p_value) THEN
    RETURN true;
  END IF;
  v_threshold := public._work_order_approval_threshold(p_company_id, p_site_id);
  RETURN v_threshold IS NOT NULL AND p_value < v_threshold;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_member_approval_limit(p_member_id uuid, p_limit numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_bm    public.business_members%ROWTYPE;
  v_owner uuid;
BEGIN
  SELECT * INTO v_bm FROM public.business_members WHERE id = p_member_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Team member not found';
  END IF;

  IF NOT is_company_owner(v_bm.company_id) THEN
    RAISE EXCEPTION 'Only the company owner can set approval limits';
  END IF;

  SELECT owner_id INTO v_owner FROM public.companies WHERE id = v_bm.company_id;
  IF v_bm.profile_id IS NOT DISTINCT FROM v_owner THEN
    RAISE EXCEPTION 'The owner has no approval limit';
  END IF;

  IF v_bm.status = 'removed' THEN
    RAISE EXCEPTION 'This team member has been removed';
  END IF;

  IF p_limit IS NOT NULL AND p_limit < 0 THEN
    RAISE EXCEPTION 'An approval limit cannot be negative';
  END IF;

  UPDATE public.business_members SET approval_limit = round(p_limit, 2) WHERE id = p_member_id;
END;
$function$;

-- ── Coverage-scoped visibility ───────────────────────────────────────────────

-- For SELECT policies on tables keyed by work order: the owner, or a member
-- covering the work order's site. SECURITY DEFINER so the policy doesn't
-- depend on the caller's own work_orders RLS (no cycle: work_orders' policy
-- does not read these tables).
CREATE OR REPLACE FUNCTION public._work_order_visible_to_company(p_work_order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE((
    SELECT is_company_owner(wo.company_id) OR (wo.site_id IS NOT NULL AND can_access_site(wo.site_id))
    FROM public.work_orders wo
    WHERE wo.id = p_work_order_id
  ), false);
$function$;

DROP POLICY work_orders_select ON public.work_orders;
CREATE POLICY work_orders_select ON public.work_orders
  FOR SELECT TO authenticated
  USING (
    is_company_owner(company_id)
    OR (site_id IS NOT NULL AND can_access_site(site_id))
    OR dispatched_to = auth.uid()
  );

DROP POLICY work_order_costs_company_select ON public.work_order_costs;
CREATE POLICY work_order_costs_company_select ON public.work_order_costs
  FOR SELECT TO authenticated
  USING (public._work_order_visible_to_company(work_order_id));

-- ── PO increase requests ─────────────────────────────────────────────────────

CREATE TABLE public.work_order_po_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id   uuid NOT NULL REFERENCES public.work_orders(id),
  company_id      uuid NOT NULL REFERENCES public.companies(id),
  contractor_id   uuid NOT NULL REFERENCES public.profiles(id),
  increase_amount numeric(12,2) NOT NULL,
  reason          text NOT NULL,
  photos          jsonb NOT NULL DEFAULT '[]'::jsonb,
  status          text NOT NULL DEFAULT 'pending',
  decided_by      uuid REFERENCES auth.users(id),
  decided_at      timestamptz,
  decline_reason  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT work_order_po_requests_amount_check CHECK (increase_amount > 0),
  CONSTRAINT work_order_po_requests_reason_check CHECK (btrim(reason) <> ''),
  CONSTRAINT work_order_po_requests_photos_check CHECK (jsonb_typeof(photos) = 'array'),
  CONSTRAINT work_order_po_requests_status_check CHECK (status IN ('pending', 'approved', 'declined', 'withdrawn')),
  CONSTRAINT work_order_po_requests_decided_check CHECK ((status = 'pending') = (decided_at IS NULL)),
  CONSTRAINT work_order_po_requests_approved_has_approver_check
    CHECK (status <> 'approved' OR decided_by IS NOT NULL),
  CONSTRAINT work_order_po_requests_declined_has_reason_check
    CHECK (status <> 'declined' OR (decline_reason IS NOT NULL AND btrim(decline_reason) <> ''))
);

CREATE UNIQUE INDEX work_order_po_requests_one_pending
  ON public.work_order_po_requests (work_order_id) WHERE status = 'pending';
CREATE INDEX work_order_po_requests_company_idx ON public.work_order_po_requests (company_id);
CREATE INDEX work_order_po_requests_contractor_idx ON public.work_order_po_requests (contractor_id);

CREATE TRIGGER work_order_po_requests_updated_at
  BEFORE UPDATE ON public.work_order_po_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.work_order_po_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY work_order_po_requests_company_select ON public.work_order_po_requests
  FOR SELECT TO authenticated
  USING (public._work_order_visible_to_company(work_order_id));

CREATE POLICY work_order_po_requests_contractor_select ON public.work_order_po_requests
  FOR SELECT TO authenticated
  USING (contractor_id = auth.uid());

REVOKE ALL ON public.work_order_po_requests FROM anon, authenticated;
GRANT SELECT ON public.work_order_po_requests TO authenticated;

CREATE OR REPLACE FUNCTION public.request_po_increase(
  p_work_order_id uuid,
  p_amount        numeric,
  p_reason        text,
  p_photos        jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_wo     public.work_orders%ROWTYPE;
  v_amount numeric;
  v_total  numeric;
  v_id     uuid;
  v_name   text;
  r        uuid;
BEGIN
  SELECT * INTO v_wo FROM public.work_orders WHERE id = p_work_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Work order not found';
  END IF;

  IF v_wo.dispatched_to IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'This work order is not dispatched to you';
  END IF;
  IF v_wo.status <> 'accepted' THEN
    RAISE EXCEPTION 'A PO increase can be requested once you have accepted the work order (status: %)', v_wo.status;
  END IF;
  IF v_wo.approved_value IS NULL OR v_wo.po_issued_at IS NULL THEN
    RAISE EXCEPTION 'This work order has no PO to increase';
  END IF;

  v_amount := round(p_amount, 2);
  IF v_amount IS NULL OR v_amount <= 0 THEN
    RAISE EXCEPTION 'The increase must be more than £0';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'A reason is required';
  END IF;
  IF p_photos IS NULL OR jsonb_typeof(p_photos) <> 'array' THEN
    RAISE EXCEPTION 'Photos must be a list';
  END IF;

  BEGIN
    INSERT INTO public.work_order_po_requests (work_order_id, company_id, contractor_id, increase_amount, reason, photos)
    VALUES (v_wo.id, v_wo.company_id, auth.uid(), v_amount, btrim(p_reason), p_photos)
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'There is already a pending PO increase request on this work order';
  END;

  v_total := v_wo.approved_value + v_amount;

  -- Warning-only: notify everyone who could sign off the new total.
  BEGIN
    SELECT COALESCE(full_name, 'The contractor') INTO v_name FROM public.profiles WHERE id = auth.uid();
    FOR r IN SELECT * FROM public._work_order_sign_off_recipients(v_wo.company_id, v_wo.site_id, v_total)
    LOOP
      INSERT INTO public.notifications (user_id, title, message, type, reference_type, reference_id)
      VALUES (
        r,
        'PO increase requested',
        COALESCE(v_name, 'The contractor') || ' asks to increase ' || public._work_order_po_ref(v_wo.id)
          || ' by £' || to_char(v_amount, 'FM999999990.00')
          || ' to £' || to_char(v_total, 'FM999999990.00') || ': ' || btrim(p_reason),
        'work_order_po_increase_requested',
        'work_order',
        v_wo.id
      );
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'request_po_increase: notifications for work order % failed: %', v_wo.id, SQLERRM;
  END;

  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.approve_po_increase(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_wo_id uuid;
  v_wo    public.work_orders%ROWTYPE;
  v_req   public.work_order_po_requests%ROWTYPE;
  v_total numeric;
BEGIN
  SELECT work_order_id INTO v_wo_id FROM public.work_order_po_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PO increase request not found';
  END IF;

  -- Work order first, then the request: same order as every other writer.
  SELECT * INTO v_wo FROM public.work_orders WHERE id = v_wo_id FOR UPDATE;
  SELECT * INTO v_req FROM public.work_order_po_requests WHERE id = p_request_id FOR UPDATE;

  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'This request is already %', v_req.status;
  END IF;
  IF v_wo.status IN ('cancelled', 'completed') OR v_wo.approved_value IS NULL THEN
    RAISE EXCEPTION 'This work order''s PO can no longer be increased';
  END IF;

  v_total := v_wo.approved_value + v_req.increase_amount;
  IF NOT public._can_sign_off_amount(v_wo.company_id, v_wo.site_id, v_total) THEN
    RAISE EXCEPTION 'Approving this takes the PO to £%, which needs someone whose approval limit covers it, or the owner',
      to_char(v_total, 'FM999999990.00');
  END IF;

  UPDATE public.work_orders
  SET approved_value = v_total, value_amended_at = now(), value_amended_by = auth.uid()
  WHERE id = v_wo.id;

  UPDATE public.work_order_po_requests
  SET status = 'approved', decided_by = auth.uid(), decided_at = now()
  WHERE id = p_request_id;

  BEGIN
    INSERT INTO public.notifications (user_id, title, message, type, reference_type, reference_id)
    VALUES (
      v_req.contractor_id,
      'PO increase approved',
      public._work_order_po_ref(v_wo.id) || ' amended. Approved to spend £' || to_char(v_total, 'FM999999990.00') || '.',
      'work_order_po_amended',
      'work_order',
      v_wo.id
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'approve_po_increase: notification for request % failed: %', p_request_id, SQLERRM;
  END;
END;
$function$;

CREATE OR REPLACE FUNCTION public.decline_po_increase(p_request_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_wo_id uuid;
  v_wo    public.work_orders%ROWTYPE;
  v_req   public.work_order_po_requests%ROWTYPE;
BEGIN
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'A reason is required to decline a PO increase';
  END IF;

  SELECT work_order_id INTO v_wo_id FROM public.work_order_po_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PO increase request not found';
  END IF;

  SELECT * INTO v_wo FROM public.work_orders WHERE id = v_wo_id FOR UPDATE;
  SELECT * INTO v_req FROM public.work_order_po_requests WHERE id = p_request_id FOR UPDATE;

  IF NOT public._can_review_work_order_costs(v_wo.company_id, v_wo.site_id) THEN
    RAISE EXCEPTION 'Not authorised to decline requests on this work order';
  END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'This request is already %', v_req.status;
  END IF;

  UPDATE public.work_order_po_requests
  SET status = 'declined', decline_reason = btrim(p_reason), decided_by = auth.uid(), decided_at = now()
  WHERE id = p_request_id;

  BEGIN
    INSERT INTO public.notifications (user_id, title, message, type, reference_type, reference_id)
    VALUES (
      v_req.contractor_id,
      'PO increase declined',
      'Your request to increase ' || public._work_order_po_ref(v_wo.id) || ' by £'
        || to_char(v_req.increase_amount, 'FM999999990.00') || ' was declined: ' || btrim(p_reason),
      'work_order_po_increase_declined',
      'work_order',
      v_wo.id
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'decline_po_increase: notification for request % failed: %', p_request_id, SQLERRM;
  END;
END;
$function$;

CREATE OR REPLACE FUNCTION public.withdraw_po_increase(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_req public.work_order_po_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_req FROM public.work_order_po_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PO increase request not found';
  END IF;
  IF v_req.contractor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the contractor who made this request can withdraw it';
  END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'This request is already %', v_req.status;
  END IF;

  UPDATE public.work_order_po_requests
  SET status = 'withdrawn', decided_by = auth.uid(), decided_at = now()
  WHERE id = p_request_id;
END;
$function$;

-- ── UI checks (replace can_sign_off_work_order) ──────────────────────────────

-- Operational: may the caller dispatch, reassign, cancel, decline a request,
-- or review costs within the PO on this work order? false, never an error.
CREATE OR REPLACE FUNCTION public.can_act_on_work_order(p_work_order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE((
    SELECT public._can_review_work_order_costs(wo.company_id, wo.site_id)
    FROM public.work_orders wo WHERE wo.id = p_work_order_id
  ), false);
$function$;

-- Sign-off: may the caller sign off this work order's PO at p_amount (the PO
-- total after the change)? false, never an error.
CREATE OR REPLACE FUNCTION public.can_sign_off_work_order_amount(p_work_order_id uuid, p_amount numeric)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE((
    SELECT public._can_sign_off_amount(wo.company_id, wo.site_id, p_amount)
    FROM public.work_orders wo WHERE wo.id = p_work_order_id
  ), false);
$function$;

-- Transitional: live client until step 1b deploys; drop in step 2's migration.
-- Same signature, so its existing grants stand. Answers the operational
-- question only; sign-off by amount is can_sign_off_work_order_amount.
CREATE OR REPLACE FUNCTION public.can_sign_off_work_order(p_work_order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.can_act_on_work_order(p_work_order_id);
$function$;

-- ── Work order RPCs: sign-off now by amount ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_work_order(
  p_company_id         uuid,
  p_site_id            uuid,
  p_title              text,
  p_approved_value     numeric,
  p_priority           text    DEFAULT 'routine',
  p_description        text    DEFAULT NULL,
  p_trade_required     text    DEFAULT NULL,
  p_asset_id           uuid    DEFAULT NULL,
  p_photos             jsonb   DEFAULT '[]'::jsonb,
  p_client_po_ref      text    DEFAULT NULL,
  p_service_request_id uuid    DEFAULT NULL,
  p_id                 uuid    DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_value  numeric;
  v_signed boolean;
  v_name   text;
  v_id     uuid;
  v_sr     public.service_requests%ROWTYPE;
BEGIN
  -- Raising needs coverage of the site: the owner, or a member whose coverage
  -- includes it. A work order with no site is owner-only.
  IF NOT (is_company_member(p_company_id)
          AND (is_company_owner(p_company_id)
               OR (p_site_id IS NOT NULL AND can_access_site(p_site_id)))) THEN
    RAISE EXCEPTION 'You don''t cover this site, so you can''t raise work orders for it';
  END IF;

  IF p_title IS NULL OR btrim(p_title) = '' THEN
    RAISE EXCEPTION 'A title is required';
  END IF;

  v_value := round(p_approved_value, 2);
  IF v_value IS NULL OR v_value <= 0 THEN
    RAISE EXCEPTION 'An approved value greater than £0 is required';
  END IF;

  IF p_site_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.sites WHERE id = p_site_id AND company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'Site not found for this company';
  END IF;

  IF p_asset_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.assets
    WHERE id = p_asset_id AND company_id = p_company_id AND site_id IS NOT DISTINCT FROM p_site_id
  ) THEN
    RAISE EXCEPTION 'Asset not found at this site';
  END IF;

  IF p_photos IS NULL OR jsonb_typeof(p_photos) <> 'array' THEN
    RAISE EXCEPTION 'Photos must be a list';
  END IF;

  IF p_service_request_id IS NOT NULL THEN
    SELECT * INTO v_sr FROM public.service_requests WHERE id = p_service_request_id FOR UPDATE;
    IF NOT FOUND OR v_sr.company_id <> p_company_id THEN
      RAISE EXCEPTION 'Service request not found for this company';
    END IF;
    IF v_sr.work_order_id IS NOT NULL THEN
      RAISE EXCEPTION 'This request already has a work order';
    END IF;
    IF v_sr.status IN ('cancelled', 'completed') THEN
      RAISE EXCEPTION 'This request is % and cannot be raised as a work order', v_sr.status;
    END IF;
  END IF;

  -- The PO is issued at once only if the raiser's limit covers the value
  -- (or they are the owner). Otherwise it waits for someone whose does.
  v_signed := public._can_sign_off_amount(p_company_id, p_site_id, v_value);
  SELECT full_name INTO v_name FROM public.profiles WHERE id = auth.uid();

  INSERT INTO public.work_orders (
    id, company_id, raised_by, raised_by_name, service_request_id, site_id, asset_id,
    title, description, trade_required, priority, photos, status,
    approved_value, client_po_ref, approved_by, approved_at, po_issued_at
  ) VALUES (
    COALESCE(p_id, gen_random_uuid()), p_company_id, auth.uid(), v_name, p_service_request_id, p_site_id, p_asset_id,
    btrim(p_title), NULLIF(btrim(p_description), ''), NULLIF(btrim(p_trade_required), ''), p_priority, p_photos, 'draft',
    v_value, NULLIF(btrim(p_client_po_ref), ''),
    CASE WHEN v_signed THEN auth.uid() END,
    CASE WHEN v_signed THEN now() END,
    CASE WHEN v_signed THEN now() END
  )
  RETURNING id INTO v_id;

  IF p_service_request_id IS NOT NULL THEN
    UPDATE public.service_requests SET work_order_id = v_id WHERE id = p_service_request_id;
  END IF;

  -- Waiting: tell the people who can sign it off. Warning-only.
  IF NOT v_signed THEN
    DECLARE r uuid;
    BEGIN
      FOR r IN SELECT * FROM public._work_order_sign_off_recipients(p_company_id, p_site_id, v_value)
      LOOP
        INSERT INTO public.notifications (user_id, title, message, type, reference_type, reference_id)
        VALUES (
          r,
          'Work order waiting for sign-off',
          public._work_order_ref(v_id) || ' (' || btrim(p_title) || ') needs a PO for £'
            || to_char(v_value, 'FM999999990.00') || '.',
          'work_order_sign_off_needed',
          'work_order',
          v_id
        );
      END LOOP;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'create_work_order: sign-off notifications for work order % failed: %', v_id, SQLERRM;
    END;
  END IF;

  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.approve_work_order(p_work_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_wo public.work_orders%ROWTYPE;
BEGIN
  SELECT * INTO v_wo FROM public.work_orders WHERE id = p_work_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Work order not found';
  END IF;

  IF v_wo.status IN ('cancelled', 'completed') THEN
    RAISE EXCEPTION 'A % work order cannot be signed off', v_wo.status;
  END IF;
  IF v_wo.approved_value IS NULL THEN
    RAISE EXCEPTION 'Set an approved value before signing off this work order';
  END IF;
  IF v_wo.po_issued_at IS NOT NULL THEN
    RAISE EXCEPTION 'This work order is already approved';
  END IF;

  IF NOT public._can_sign_off_amount(v_wo.company_id, v_wo.site_id, v_wo.approved_value) THEN
    RAISE EXCEPTION 'Signing off £% needs someone whose approval limit covers it, or the owner',
      to_char(v_wo.approved_value, 'FM999999990.00');
  END IF;

  UPDATE public.work_orders
  SET approved_by = auth.uid(), approved_at = now(), po_issued_at = now()
  WHERE id = p_work_order_id;

  IF v_wo.raised_by IS DISTINCT FROM auth.uid() THEN
    BEGIN
      INSERT INTO public.notifications (user_id, title, message, type, reference_type, reference_id)
      VALUES (
        v_wo.raised_by,
        'Work order approved',
        public._work_order_ref(p_work_order_id) || ' approved. ' || public._work_order_po_ref(p_work_order_id)
          || ' issued for £' || to_char(v_wo.approved_value, 'FM999999990.00') || '.',
        'work_order_approved',
        'work_order',
        p_work_order_id
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'approve_work_order: notification for work order % failed: %', p_work_order_id, SQLERRM;
    END;
  END IF;
END;
$function$;

-- Pre-PO: covering member sets the value; the PO is issued if their limit
-- covers the new value. Issued PO: any change, up or down, needs a limit
-- covering GREATEST(old value, new value), so a member can only change a PO
-- they could have signed off at both (or the owner). Never below what is
-- already approved.
CREATE OR REPLACE FUNCTION public.amend_work_order_value(p_work_order_id uuid, p_new_value numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_wo       public.work_orders%ROWTYPE;
  v_value    numeric;
  v_approved numeric;
  v_signed   boolean;
BEGIN
  SELECT * INTO v_wo FROM public.work_orders WHERE id = p_work_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Work order not found';
  END IF;

  IF NOT (is_company_member(v_wo.company_id)
          AND (is_company_owner(v_wo.company_id)
               OR (v_wo.site_id IS NOT NULL AND can_access_site(v_wo.site_id)))) THEN
    RAISE EXCEPTION 'You don''t cover this site, so you can''t change this work order';
  END IF;

  IF v_wo.status IN ('cancelled', 'completed') THEN
    RAISE EXCEPTION 'A % work order cannot be changed', v_wo.status;
  END IF;

  v_value := round(p_new_value, 2);
  IF v_value IS NULL OR v_value <= 0 THEN
    RAISE EXCEPTION 'An approved value greater than £0 is required';
  END IF;

  SELECT COALESCE(sum(line_total), 0) INTO v_approved
  FROM public.work_order_costs
  WHERE work_order_id = p_work_order_id AND status = 'approved';

  IF v_value < v_approved THEN
    RAISE EXCEPTION 'The approved value cannot be lower than the £% already approved on this work order',
      to_char(v_approved, 'FM999999990.00');
  END IF;

  IF v_wo.po_issued_at IS NULL THEN
    v_signed := public._can_sign_off_amount(v_wo.company_id, v_wo.site_id, v_value);
    UPDATE public.work_orders
    SET approved_value = v_value,
        approved_by  = CASE WHEN v_signed THEN auth.uid() ELSE approved_by END,
        approved_at  = CASE WHEN v_signed THEN now() ELSE approved_at END,
        po_issued_at = CASE WHEN v_signed THEN now() ELSE NULL END
    WHERE id = p_work_order_id;
    RETURN;
  END IF;

  IF NOT public._can_sign_off_amount(v_wo.company_id, v_wo.site_id, GREATEST(v_wo.approved_value, v_value)) THEN
    RAISE EXCEPTION 'Changing this PO needs someone whose approval limit covers £%, or the owner',
      to_char(GREATEST(v_wo.approved_value, v_value), 'FM999999990.00');
  END IF;

  IF v_value = v_wo.approved_value THEN
    RETURN;
  END IF;

  UPDATE public.work_orders
  SET approved_value = v_value, value_amended_at = now(), value_amended_by = auth.uid()
  WHERE id = p_work_order_id;

  IF v_wo.dispatched_to IS NOT NULL AND v_wo.status IN ('dispatched', 'accepted') THEN
    BEGIN
      INSERT INTO public.notifications (user_id, title, message, type, reference_type, reference_id)
      VALUES (
        v_wo.dispatched_to,
        'PO amended',
        public._work_order_po_ref(p_work_order_id) || ' amended. Approved to spend £'
          || to_char(v_value, 'FM999999990.00') || '.',
        'work_order_po_amended',
        'work_order',
        p_work_order_id
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'amend_work_order_value: notification for work order % failed: %', p_work_order_id, SQLERRM;
    END;
  END IF;
END;
$function$;

-- Step 1 body plus: a pending PO increase request is declined with the work order.
CREATE OR REPLACE FUNCTION public.cancel_work_order(p_work_order_id uuid, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_wo public.work_orders%ROWTYPE;
BEGIN
  SELECT * INTO v_wo FROM public.work_orders WHERE id = p_work_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Work order not found';
  END IF;

  IF NOT public._can_review_work_order_costs(v_wo.company_id, v_wo.site_id) THEN
    RAISE EXCEPTION 'Not authorised to cancel this work order';
  END IF;

  IF v_wo.status NOT IN ('draft', 'dispatched', 'declined') THEN
    RAISE EXCEPTION 'A % work order cannot be cancelled', v_wo.status;
  END IF;

  -- Same rule as reassignment: nothing still open can be approved later.
  -- Approved lines stand; the contractor is owed them.
  UPDATE public.work_order_costs
  SET status = 'rejected',
      rejected_reason = 'Work order cancelled',
      rejected_at = now(),
      rejected_by = auth.uid()
  WHERE work_order_id = p_work_order_id AND status IN ('pending', 'queried');

  UPDATE public.work_order_po_requests
  SET status = 'declined',
      decline_reason = 'Work order cancelled',
      decided_by = auth.uid(),
      decided_at = now()
  WHERE work_order_id = p_work_order_id AND status = 'pending';

  -- No dedicated cancel-reason column: decline_reason is the general
  -- "why this stopped" field, as before.
  UPDATE public.work_orders
  SET status = 'cancelled', decline_reason = NULLIF(btrim(p_reason), '')
  WHERE id = p_work_order_id;

  IF v_wo.status = 'dispatched' AND v_wo.dispatched_to IS NOT NULL THEN
    BEGIN
      INSERT INTO public.notifications (user_id, title, message, type, reference_type, reference_id)
      VALUES (
        v_wo.dispatched_to,
        'Work order cancelled',
        public._work_order_ref(p_work_order_id) || ' (' || v_wo.title || ') was cancelled'
          || COALESCE(': ' || NULLIF(btrim(p_reason), ''), '') || '.',
        'work_order_cancelled',
        'work_order',
        p_work_order_id
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'cancel_work_order: notification for work order % failed: %', p_work_order_id, SQLERRM;
    END;
  END IF;
END;
$function$;

-- ── Cost lines: started-job gate, and over-PO approval by amount ─────────────

-- The work order is accepted and its job is under way. Soft until the step 5
-- check-in: jobs.status is still client-writable.
CREATE OR REPLACE FUNCTION public._work_order_job_started(p_work_order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.work_orders wo
    JOIN public.jobs j ON j.work_order_id = wo.id
    WHERE wo.id = p_work_order_id
      AND wo.status = 'accepted'
      AND j.status IN ('in_progress', 'snagging', 'complete')
  );
$function$;

CREATE OR REPLACE FUNCTION public.submit_work_order_cost(p_work_order_id uuid, p_kind text, p_quantity numeric DEFAULT NULL::numeric, p_unit_cost numeric DEFAULT NULL::numeric, p_description text DEFAULT NULL::text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_wo         public.work_orders%ROWTYPE;
  v_qty        numeric;
  v_unit       numeric;
  v_markup     numeric;
  v_total      numeric;
  v_threshold  numeric;
  v_wo_total   numeric;
  v_auto       boolean;
  v_approver   uuid;
  v_id         uuid;
BEGIN
  -- Row lock serialises concurrent submissions so the running-total check
  -- below cannot be raced past.
  SELECT * INTO v_wo FROM public.work_orders WHERE id = p_work_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Work order not found';
  END IF;

  IF v_wo.dispatched_to IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Not authorised to record costs on this work order';
  END IF;

  IF NOT public._work_order_job_started(v_wo.id) THEN
    IF v_wo.approved_value IS NOT NULL THEN
      RAISE EXCEPTION 'Start the job before recording costs. If you expect it to cost more than £%, request a PO increase instead.',
        to_char(v_wo.approved_value, 'FM999999990.00');
    END IF;
    RAISE EXCEPTION 'Start the job before recording costs.';
  END IF;

  IF v_wo.engagement_id IS NULL OR v_wo.rate_snapshot IS NULL THEN
    RAISE EXCEPTION 'This work order has no agreed rates on record, so costs cannot be recorded against it';
  END IF;

  IF p_kind = 'other' AND (p_description IS NULL OR btrim(p_description) = '') THEN
    RAISE EXCEPTION 'A description is required for an "other" cost';
  END IF;

  SELECT o_quantity, o_unit_rate, o_markup_pct, o_line_total
    INTO v_qty, v_unit, v_markup, v_total
  FROM public._price_cost_line(v_wo.rate_snapshot, p_kind, p_quantity, p_unit_cost);

  SELECT COALESCE(sum(line_total), 0) + v_total INTO v_wo_total
  FROM public.work_order_costs
  WHERE work_order_id = v_wo.id AND status <> 'rejected';

  IF v_wo.approved_value IS NOT NULL THEN
    -- PO work order: within the approved value auto-approves, on the
    -- authority of whoever signed the PO. Over it waits for a reviewer.
    v_auto := v_wo.po_issued_at IS NOT NULL AND v_wo_total <= v_wo.approved_value;
    v_approver := v_wo.approved_by;
  ELSE
    -- Legacy work order: unchanged. Absent configuration fails closed:
    -- NULL threshold => explicit approval.
    v_threshold := public._work_order_approval_threshold(v_wo.company_id, v_wo.site_id);
    v_auto := v_threshold IS NOT NULL AND v_wo_total < v_threshold;
    SELECT owner_id INTO v_approver FROM public.companies WHERE id = v_wo.company_id;
  END IF;

  INSERT INTO public.work_order_costs (
    work_order_id, engagement_id, company_id, contractor_id,
    kind, quantity, unit_rate, markup_pct, line_total, description,
    status, approved_by, approved_at, auto_approved
  ) VALUES (
    v_wo.id, v_wo.engagement_id, v_wo.company_id, auth.uid(),
    p_kind, v_qty, v_unit, v_markup, v_total, NULLIF(btrim(p_description), ''),
    CASE WHEN v_auto THEN 'approved' ELSE 'pending' END,
    CASE WHEN v_auto THEN v_approver END,
    CASE WHEN v_auto THEN now() END,
    v_auto
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

-- Live body (pre-step-1, unchanged by step 1) plus the started-job gate.
CREATE OR REPLACE FUNCTION public.amend_work_order_cost(p_cost_id uuid, p_quantity numeric DEFAULT NULL::numeric, p_unit_cost numeric DEFAULT NULL::numeric, p_description text DEFAULT NULL::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cost   public.work_order_costs%ROWTYPE;
  v_wo     public.work_orders%ROWTYPE;
  v_qty    numeric;
  v_unit   numeric;
  v_markup numeric;
  v_total  numeric;
BEGIN
  SELECT * INTO v_cost FROM public.work_order_costs WHERE id = p_cost_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cost line not found';
  END IF;

  IF v_cost.contractor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Not authorised to amend this cost line';
  END IF;

  IF v_cost.status NOT IN ('pending', 'queried') THEN
    RAISE EXCEPTION 'A % cost line can no longer be amended', v_cost.status;
  END IF;

  SELECT * INTO v_wo FROM public.work_orders WHERE id = v_cost.work_order_id;

  IF NOT public._work_order_job_started(v_wo.id) THEN
    IF v_wo.approved_value IS NOT NULL THEN
      RAISE EXCEPTION 'Start the job before recording costs. If you expect it to cost more than £%, request a PO increase instead.',
        to_char(v_wo.approved_value, 'FM999999990.00');
    END IF;
    RAISE EXCEPTION 'Start the job before recording costs.';
  END IF;

  IF v_wo.rate_snapshot IS NULL THEN
    RAISE EXCEPTION 'This work order has no agreed rates on record';
  END IF;

  IF v_cost.kind = 'other' AND (p_description IS NULL OR btrim(p_description) = '') THEN
    RAISE EXCEPTION 'A description is required for an "other" cost';
  END IF;

  SELECT o_quantity, o_unit_rate, o_markup_pct, o_line_total
    INTO v_qty, v_unit, v_markup, v_total
  FROM public._price_cost_line(v_wo.rate_snapshot, v_cost.kind, p_quantity, p_unit_cost);

  UPDATE public.work_order_costs
  SET quantity = v_qty,
      unit_rate = v_unit,
      markup_pct = v_markup,
      line_total = v_total,
      description = NULLIF(btrim(p_description), ''),
      status = 'pending'
  WHERE id = p_cost_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.approve_work_order_cost(p_cost_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_wo_id     uuid;
  v_wo        public.work_orders%ROWTYPE;
  v_cost      public.work_order_costs%ROWTYPE;
  v_new_total numeric;
BEGIN
  SELECT work_order_id INTO v_wo_id FROM public.work_order_costs WHERE id = p_cost_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cost line not found';
  END IF;

  -- Work order first, then the line: the same order as submit, reassign and
  -- cancel, so concurrent calls queue rather than deadlock.
  SELECT * INTO v_wo FROM public.work_orders WHERE id = v_wo_id FOR UPDATE;
  SELECT * INTO v_cost FROM public.work_order_costs WHERE id = p_cost_id FOR UPDATE;

  IF NOT public._can_review_work_order_costs(v_cost.company_id, v_wo.site_id) THEN
    RAISE EXCEPTION 'Not authorised to review costs on this work order';
  END IF;

  IF v_cost.status <> 'pending' THEN
    RAISE EXCEPTION 'Only a pending cost line can be approved (status: %)', v_cost.status;
  END IF;

  -- The variation: a line that takes the approved total past the approved
  -- value amends the PO up to the new approved total, which needs a limit
  -- covering that total. Within the PO, review rights are enough.
  IF v_wo.approved_value IS NOT NULL THEN
    SELECT COALESCE(sum(line_total), 0) + v_cost.line_total INTO v_new_total
    FROM public.work_order_costs
    WHERE work_order_id = v_wo.id AND status = 'approved';

    IF v_new_total > v_wo.approved_value THEN
      IF NOT public._can_sign_off_amount(v_wo.company_id, v_wo.site_id, v_new_total) THEN
        RAISE EXCEPTION 'Approving this line takes the PO to £%, which needs someone whose approval limit covers it, or the owner',
          to_char(v_new_total, 'FM999999990.00');
      END IF;

      UPDATE public.work_orders
      SET approved_value = v_new_total, value_amended_at = now(), value_amended_by = auth.uid()
      WHERE id = v_wo.id;
    END IF;
  END IF;

  UPDATE public.work_order_costs
  SET status = 'approved', approved_by = auth.uid(), approved_at = now(), auto_approved = false
  WHERE id = p_cost_id;
END;
$function$;

-- ── process_auto_dispatch: approver by limit, threshold for site contacts ────

CREATE OR REPLACE FUNCTION public.process_auto_dispatch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_config        site_autonomy_config%ROWTYPE;
  v_rule          jsonb;
  v_category_name text;
  v_engagement_id uuid;
  v_snapshot      jsonb;
  v_priority      text;
  v_value         numeric;
  v_reviewer      boolean;
  v_signed        boolean;
  v_approver      uuid;
  v_wo_id         uuid;
BEGIN
  IF NEW.status <> 'open' THEN
    RETURN NULL;
  END IF;

  -- Site-specific config, falling back to the company default.
  SELECT * INTO v_config FROM site_autonomy_config
  WHERE company_id = NEW.company_id
    AND (site_id = NEW.site_id OR site_id IS NULL)
  ORDER BY site_id NULLS LAST
  LIMIT 1;

  IF NOT FOUND OR v_config.autonomy_level < 2 THEN
    RETURN NULL;  -- Level 1: no auto-dispatch
  END IF;

  IF v_config.auto_dispatch_rules IS NULL OR jsonb_array_length(v_config.auto_dispatch_rules) = 0 THEN
    RETURN NULL;
  END IF;

  SELECT name INTO v_category_name FROM service_request_categories WHERE id = NEW.category_id;

  FOR v_rule IN SELECT * FROM jsonb_array_elements(v_config.auto_dispatch_rules)
  LOOP
    IF v_rule ->> 'category' = v_category_name THEN
      -- Auto-dispatch is a convenience: if any part of it fails, the request
      -- stays open for the FM queue and its insert still succeeds.
      BEGIN
        v_engagement_id := (v_rule ->> 'engagement_id')::uuid;

        IF EXISTS (
          SELECT 1 FROM term_engagements
          WHERE id = v_engagement_id AND status = 'active' AND company_id = NEW.company_id
        ) THEN
          v_snapshot := public._work_order_rate_snapshot(v_engagement_id);
          v_priority := COALESCE(v_rule ->> 'priority', NEW.priority);
          v_value := public._work_order_default_value(v_snapshot, v_priority);

          IF v_value IS NOT NULL THEN
            -- Signed off by the raiser's own limit: they approved it.
            -- Signed off by the threshold alone: recorded against the company
            -- owner, as legacy auto-approved cost lines are. A site contact
            -- or other non-member is never recorded as the approver.
            v_reviewer := public._can_sign_off_amount(NEW.company_id, NEW.site_id, v_value);
            v_signed := public._work_order_value_signed_off(NEW.company_id, NEW.site_id, v_value);
            IF v_reviewer THEN
              v_approver := auth.uid();
            ELSE
              SELECT owner_id INTO v_approver FROM companies WHERE id = NEW.company_id;
            END IF;

            INSERT INTO work_orders (
              company_id, raised_by, raised_by_name, service_request_id,
              site_id, title, description, trade_required, priority, status,
              approved_value, approved_by, approved_at, po_issued_at
            ) VALUES (
              NEW.company_id, NEW.requested_by, NEW.requested_by_name, NEW.id,
              NEW.site_id, NEW.title, NEW.description, v_rule ->> 'trade', v_priority, 'draft',
              v_value,
              CASE WHEN v_signed THEN v_approver END,
              CASE WHEN v_signed THEN now() END,
              CASE WHEN v_signed THEN now() END
            )
            RETURNING id INTO v_wo_id;

            UPDATE service_requests SET work_order_id = v_wo_id WHERE id = NEW.id;

            -- Signed off: dispatch now (this also marks the request
            -- dispatched and notifies the contractor). Otherwise the work
            -- order waits for sign-off and the request stays open, linked.
            IF v_signed THEN
              PERFORM public._dispatch_work_order(v_wo_id, v_engagement_id);
            END IF;
          END IF;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'process_auto_dispatch: auto-dispatch for service request % failed: %', NEW.id, SQLERRM;
      END;

      EXIT;  -- Stop after first matching rule
    END IF;
  END LOOP;

  RETURN NULL;
END;
$function$;

-- ── job_variations: none on work-order jobs ──────────────────────────────────

CREATE OR REPLACE FUNCTION public._job_is_work_order_job(p_job_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.jobs WHERE id = p_job_id AND work_order_id IS NOT NULL);
$function$;

DROP POLICY "Contractor can raise job variations" ON public.job_variations;
CREATE POLICY "Contractor can raise job variations" ON public.job_variations
  FOR INSERT
  WITH CHECK (contractor_id = auth.uid() AND NOT public._job_is_work_order_job(job_id));

-- Same rule on edit, so a pending variation can't be moved onto a work-order job.
DROP POLICY "Contractor can edit pending variations" ON public.job_variations;
CREATE POLICY "Contractor can edit pending variations" ON public.job_variations
  FOR UPDATE
  USING (contractor_id = auth.uid() AND status = 'pending')
  WITH CHECK (contractor_id = auth.uid() AND NOT public._job_is_work_order_job(job_id));

-- ── Grants ───────────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public._can_sign_off_amount(uuid, uuid, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._work_order_sign_off_recipients(uuid, uuid, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._work_order_visible_to_company(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public._work_order_job_started(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._job_is_work_order_job(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._can_sign_off_amount(uuid, uuid, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public._work_order_sign_off_recipients(uuid, uuid, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public._work_order_job_started(uuid) TO service_role;
-- Called from RLS policies, so the querying role needs EXECUTE.
GRANT EXECUTE ON FUNCTION public._work_order_visible_to_company(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._job_is_work_order_job(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.set_member_approval_limit(uuid, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.request_po_increase(uuid, numeric, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.approve_po_increase(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.decline_po_increase(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.withdraw_po_increase(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_act_on_work_order(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_sign_off_work_order_amount(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_member_approval_limit(uuid, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.request_po_increase(uuid, numeric, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.approve_po_increase(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.decline_po_increase(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.withdraw_po_increase(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_act_on_work_order(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_sign_off_work_order_amount(uuid, numeric) TO authenticated, service_role;

-- ── Post-flight ──────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF has_column_privilege('authenticated', 'public.business_members', 'approval_limit', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.business_members', 'approval_limit', 'INSERT') THEN
    RAISE EXCEPTION 'authenticated can still write business_members.approval_limit';
  END IF;
  IF NOT has_column_privilege('authenticated', 'public.business_members', 'coverage_kind', 'UPDATE')
     OR NOT has_column_privilege('authenticated', 'public.business_members', 'invited_email', 'INSERT') THEN
    RAISE EXCEPTION 'business_members column grants lost an existing column';
  END IF;

  IF has_table_privilege('authenticated', 'public.work_order_po_requests', 'INSERT')
     OR has_table_privilege('authenticated', 'public.work_order_po_requests', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.work_order_po_requests', 'DELETE')
     OR NOT has_table_privilege('authenticated', 'public.work_order_po_requests', 'SELECT') THEN
    RAISE EXCEPTION 'work_order_po_requests grants are not SELECT-only';
  END IF;

  IF to_regprocedure('public.can_sign_off_work_order(uuid)') IS NULL
     OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = 'public.can_sign_off_work_order(uuid)'::regprocedure
                    AND prosrc ILIKE '%can_act_on_work_order%')
     OR NOT has_function_privilege('authenticated', 'public.can_sign_off_work_order(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'can_sign_off_work_order shim missing, not delegating, or not executable';
  END IF;

  IF has_function_privilege('authenticated', 'public._can_sign_off_amount(uuid, uuid, numeric)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.request_po_increase(uuid, numeric, text, jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'function grants are wider than intended';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'work_orders'
             AND (qual ILIKE '%is_company_member%')) THEN
    RAISE EXCEPTION 'work_orders SELECT still uses is_company_member';
  END IF;
END $$;
