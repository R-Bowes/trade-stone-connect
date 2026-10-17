-- Work orders: one record. Step 1 of 6 — lock writes, PO and approved value.
--
-- 1. work_orders gains approved_value (not-to-exceed), po_issued_at,
--    client_po_ref and value_amended_at/by. TradeStone's PO number is the
--    work order's own wo_number, shown as PO-{company_code}-{0000}.
-- 2. Every write to work_orders goes through a SECURITY DEFINER RPC.
--    authenticated loses INSERT/UPDATE/DELETE; the insert and update policies
--    are dropped; SELECT is unchanged. This closes two holes found 13 Oct:
--    the dispatched contractor could rewrite rate_snapshot (and any other
--    column) while status = 'dispatched', and any company member, including
--    a site-only one, could rewrite any work order including approved_by.
-- 3. Raising needs coverage of the site (owner, or a member covering it; no
--    site = owner only). The work order is approved and its PO issued at once
--    when the raiser can sign off for the site (_can_review_work_order_costs)
--    or the value is under _work_order_approval_threshold. Otherwise it waits
--    for approve_work_order. NULL threshold = needs a person (fail closed).
--    Dispatch is refused until the PO is issued. Changing an issued PO needs
--    sign-off rights; the threshold never authorises it.
-- 4. Cost lines on a work order with approved_value: a line auto-approves only
--    while the running non-rejected total including it is <= approved_value.
--    Approving a line that takes the approved total over the value raises
--    approved_value to that total: the variation. The PO is amended, never
--    re-issued. Legacy work orders (approved_value NULL) keep the threshold
--    behaviour exactly.
-- 5. rate_snapshot is built server-side from effective_engagement_rates by
--    _work_order_rate_snapshot, shared by dispatch and process_auto_dispatch.
-- 6. process_auto_dispatch moves from BEFORE to AFTER INSERT on
--    service_requests. As a BEFORE trigger its work order insert referenced
--    the not-yet-inserted request through a non-deferrable FK, so any
--    auto-dispatch would have failed the whole request insert. It never fired
--    live (site_autonomy_config has no rows).
--
-- _work_order_default_value mirrors defaultApprovedValue in
-- src/lib/workOrderValue.ts. Change them together.

-- ── Pre-flight: refuse to run against anything unexpected ───────────────────

DO $$
DECLARE
  v_writers  text[];
  v_expected text[] := ARRAY['accept_work_order', 'decline_work_order', 'process_auto_dispatch'];
  v_n        integer;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'work_orders'
      AND column_name IN ('approved_value', 'po_issued_at', 'client_po_ref', 'value_amended_at', 'value_amended_by')
  ) THEN
    RAISE EXCEPTION 'work_orders already has a step-1 column; this migration expects the pre-step-1 shape';
  END IF;

  -- Every SQL function that writes work_orders must be one this migration
  -- accounts for. A new writer means the lock below would be incomplete.
  SELECT array_agg(p.proname::text ORDER BY p.proname) INTO v_writers
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
    AND p.prosrc ~* '(insert\s+into|update|delete\s+from)\s+(public\.)?work_orders\M';
  IF v_writers IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'Unaccounted work_orders writer(s): found %, expected %', v_writers, v_expected;
  END IF;

  SELECT count(*) INTO v_n FROM pg_trigger
  WHERE tgrelid = 'public.work_orders'::regclass AND NOT tgisinternal
    AND tgname NOT IN ('assign_wo_number_trigger', 'work_orders_updated_at');
  IF v_n > 0 THEN
    RAISE EXCEPTION 'work_orders has % unexpected trigger(s)', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'work_orders'
    AND policyname NOT IN ('work_orders_select', 'work_orders_insert', 'work_orders_update');
  IF v_n > 0 THEN
    RAISE EXCEPTION 'work_orders has % unexpected polic(ies)', v_n;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.service_requests'::regclass AND tgname = 'auto_dispatch_service_request'
  ) THEN
    RAISE EXCEPTION 'auto_dispatch_service_request trigger not found on service_requests';
  END IF;

  -- Nothing has ever written approval data. If something has, a human
  -- decides what it means before the PO columns land beside it.
  SELECT count(*) INTO v_n FROM public.work_orders
  WHERE approved_by IS NOT NULL OR approved_at IS NOT NULL;
  IF v_n > 0 THEN
    RAISE EXCEPTION '% work_orders row(s) already carry approved_by/approved_at. Resolve manually before applying.', v_n;
  END IF;
END $$;

-- ── Columns and constraints ──────────────────────────────────────────────────

ALTER TABLE public.work_orders
  ADD COLUMN approved_value   numeric(12,2),
  ADD COLUMN po_issued_at     timestamptz,
  ADD COLUMN client_po_ref    text,
  ADD COLUMN value_amended_at timestamptz,
  ADD COLUMN value_amended_by uuid REFERENCES auth.users(id);

ALTER TABLE public.work_orders
  ADD CONSTRAINT work_orders_approved_value_positive
    CHECK (approved_value IS NULL OR approved_value > 0),
  ADD CONSTRAINT work_orders_po_needs_approval
    CHECK (po_issued_at IS NULL OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
  ADD CONSTRAINT work_orders_po_needs_value
    CHECK (po_issued_at IS NULL OR approved_value IS NOT NULL),
  ADD CONSTRAINT work_orders_value_amended_pair
    CHECK ((value_amended_at IS NULL) = (value_amended_by IS NULL));

COMMENT ON COLUMN public.work_orders.approved_value IS
  'Not-to-exceed value. Required on every work order raised from 20261014140000; NULL only on legacy rows.';
COMMENT ON COLUMN public.work_orders.po_issued_at IS
  'When the PO (PO-{company_code}-{wo_number}) was issued. Dispatch is refused while NULL.';
COMMENT ON COLUMN public.work_orders.client_po_ref IS
  'The client''s own finance reference. Display only.';

-- ── Internal helpers (service_role only) ─────────────────────────────────────

-- The agreed rate version for an engagement, as the jsonb stored in
-- work_orders.rate_snapshot. NULL when no version is agreed by both sides.
CREATE OR REPLACE FUNCTION public._work_order_rate_snapshot(p_engagement_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_rate public.engagement_rates%ROWTYPE;
BEGIN
  SELECT * INTO v_rate FROM public.effective_engagement_rates(p_engagement_id);
  IF v_rate.id IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN to_jsonb(v_rate);
END;
$function$;

-- Default approved value: call-out (out-of-hours for an emergency) plus two
-- hours' labour, never below the minimum charge. Mirrors
-- defaultApprovedValue in src/lib/workOrderValue.ts.
CREATE OR REPLACE FUNCTION public._work_order_default_value(p_snapshot jsonb, p_priority text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN p_snapshot IS NULL THEN NULL ELSE
    NULLIF(round(greatest(
      COALESCE(
        CASE WHEN p_priority = 'emergency' THEN (p_snapshot ->> 'callout_ooh')::numeric END,
        (p_snapshot ->> 'callout_standard')::numeric,
        0
      ) + 2 * COALESCE((p_snapshot ->> 'hourly_rate')::numeric, 0),
      COALESCE((p_snapshot ->> 'minimum_charge')::numeric, 0)
    ), 2), 0)
  END;
$function$;

-- Decision 3 sign-off rule: the caller can sign off for the site, or the value
-- is under the configured threshold. NULL threshold never signs off by itself.
CREATE OR REPLACE FUNCTION public._work_order_value_signed_off(p_company_id uuid, p_site_id uuid, p_value numeric)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_threshold numeric;
BEGIN
  IF public._can_review_work_order_costs(p_company_id, p_site_id) THEN
    RETURN true;
  END IF;
  v_threshold := public._work_order_approval_threshold(p_company_id, p_site_id);
  RETURN v_threshold IS NOT NULL AND p_value < v_threshold;
END;
$function$;

CREATE OR REPLACE FUNCTION public._work_order_po_ref(p_work_order_id uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT regexp_replace(public._work_order_ref(p_work_order_id), '^WO-', 'PO-');
$function$;

-- Shared by dispatch_work_order, reassign_work_order and process_auto_dispatch.
-- Callers authorise and check status first; this enforces the PO and the
-- engagement, snapshots the rates and notifies the contractor.
CREATE OR REPLACE FUNCTION public._dispatch_work_order(p_work_order_id uuid, p_engagement_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_wo        public.work_orders%ROWTYPE;
  v_eng       public.term_engagements%ROWTYPE;
  v_snapshot  jsonb;
  v_site_name text;
BEGIN
  SELECT * INTO v_wo FROM public.work_orders WHERE id = p_work_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Work order not found';
  END IF;

  IF v_wo.approved_value IS NULL THEN
    RAISE EXCEPTION 'This work order has no approved value. Set one before dispatching it.';
  END IF;
  IF v_wo.po_issued_at IS NULL THEN
    RAISE EXCEPTION 'This work order is waiting for sign-off. It can be dispatched once the PO is issued.';
  END IF;

  SELECT * INTO v_eng FROM public.term_engagements WHERE id = p_engagement_id;
  IF NOT FOUND OR v_eng.company_id <> v_wo.company_id THEN
    RAISE EXCEPTION 'Engagement not found for this company';
  END IF;
  IF v_eng.status <> 'active' THEN
    RAISE EXCEPTION 'This engagement is not active (status: %)', v_eng.status;
  END IF;
  IF v_wo.site_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.engagement_sites es
    WHERE es.engagement_id = p_engagement_id AND es.site_id = v_wo.site_id
  ) THEN
    RAISE EXCEPTION 'This contractor''s engagement does not cover the work order''s site';
  END IF;

  v_snapshot := public._work_order_rate_snapshot(p_engagement_id);
  IF v_snapshot IS NULL THEN
    RAISE EXCEPTION 'Rates must be agreed with the contractor before a work order can be dispatched.';
  END IF;

  UPDATE public.work_orders
  SET dispatched_to  = v_eng.contractor_id,
      engagement_id  = p_engagement_id,
      dispatched_at  = now(),
      status         = 'dispatched',
      response       = 'pending',
      responded_at   = NULL,
      decline_reason = NULL,
      rate_snapshot  = v_snapshot
  WHERE id = p_work_order_id;

  IF v_wo.service_request_id IS NOT NULL THEN
    UPDATE public.service_requests
    SET status = 'dispatched',
        work_order_id = COALESCE(work_order_id, p_work_order_id)
    WHERE id = v_wo.service_request_id AND status IN ('open', 'triaged');
  END IF;

  -- Warning-only: a failed notification must not undo the dispatch.
  BEGIN
    SELECT name INTO v_site_name FROM public.sites WHERE id = v_wo.site_id;
    INSERT INTO public.notifications (user_id, title, message, type, reference_type, reference_id)
    VALUES (
      v_eng.contractor_id,
      'New work order',
      'New work order ' || public._work_order_ref(p_work_order_id) || ': ' || v_wo.title
        || ' at ' || COALESCE(v_site_name, 'site')
        || '. Approved to spend £' || to_char(v_wo.approved_value, 'FM999999990.00') || '.',
      'work_order_dispatched',
      'work_order',
      p_work_order_id
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '_dispatch_work_order: contractor notification for work order % failed: %', p_work_order_id, SQLERRM;
  END;
END;
$function$;

-- ── Public RPCs ──────────────────────────────────────────────────────────────

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

  v_signed := public._work_order_value_signed_off(p_company_id, p_site_id, v_value);
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

  IF NOT public._can_review_work_order_costs(v_wo.company_id, v_wo.site_id) THEN
    RAISE EXCEPTION 'Not authorised to sign off this work order';
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

CREATE OR REPLACE FUNCTION public.dispatch_work_order(p_work_order_id uuid, p_engagement_id uuid)
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
    RAISE EXCEPTION 'Not authorised to dispatch this work order';
  END IF;

  IF v_wo.status <> 'draft' THEN
    RAISE EXCEPTION 'Only a draft work order can be dispatched (status: %)', v_wo.status;
  END IF;

  PERFORM public._dispatch_work_order(p_work_order_id, p_engagement_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.reassign_work_order(p_work_order_id uuid, p_engagement_id uuid)
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
    RAISE EXCEPTION 'Not authorised to reassign this work order';
  END IF;

  IF v_wo.status <> 'declined' THEN
    RAISE EXCEPTION 'Only a declined work order can be reassigned (status: %)', v_wo.status;
  END IF;

  -- Approved lines from the previous contractor will invoice to them; moving
  -- the work order to someone else underneath those lines is refused.
  IF EXISTS (
    SELECT 1 FROM public.work_order_costs
    WHERE work_order_id = p_work_order_id AND status = 'approved'
  ) THEN
    RAISE EXCEPTION 'This work order has approved costs from the previous contractor, so it cannot be reassigned. Cancel it and raise a new one.';
  END IF;

  -- Lines still open from the previous contractor can never be approved or
  -- invoiced once the work order has moved on.
  UPDATE public.work_order_costs
  SET status = 'rejected',
      rejected_reason = 'Work order reassigned',
      rejected_at = now(),
      rejected_by = auth.uid()
  WHERE work_order_id = p_work_order_id AND status IN ('pending', 'queried');

  UPDATE public.work_orders
  SET status = 'reassigned', response = NULL
  WHERE id = p_work_order_id;

  PERFORM public._dispatch_work_order(p_work_order_id, p_engagement_id);
END;
$function$;

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

-- Sets the approved value on a work order with no PO yet (waiting, or a legacy
-- draft): needs the same site coverage as raising, then approves it if the
-- sign-off rule passes. Changing an issued PO, up or down, needs sign-off
-- rights for the site (_can_review_work_order_costs); the threshold never
-- authorises amending a live PO. Never below what is already approved.
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

  IF v_wo.po_issued_at IS NULL THEN
    IF NOT (is_company_member(v_wo.company_id)
            AND (is_company_owner(v_wo.company_id)
                 OR (v_wo.site_id IS NOT NULL AND can_access_site(v_wo.site_id)))) THEN
      RAISE EXCEPTION 'You don''t cover this site, so you can''t change this work order';
    END IF;
  ELSIF NOT public._can_review_work_order_costs(v_wo.company_id, v_wo.site_id) THEN
    RAISE EXCEPTION 'Changing an issued PO needs sign-off from the owner or a manager covering this site';
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
    v_signed := public._work_order_value_signed_off(v_wo.company_id, v_wo.site_id, v_value);
    UPDATE public.work_orders
    SET approved_value = v_value,
        approved_by  = CASE WHEN v_signed THEN auth.uid() ELSE approved_by END,
        approved_at  = CASE WHEN v_signed THEN now() ELSE approved_at END,
        po_issued_at = CASE WHEN v_signed THEN now() ELSE NULL END
    WHERE id = p_work_order_id;
    RETURN;
  END IF;

  -- Issued PO: the caller's sign-off rights were checked above.
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

-- For the UI: may the caller sign off (approve, dispatch, reassign, cancel)
-- this work order? false, never an error, when they cannot see it at all.
CREATE OR REPLACE FUNCTION public.can_sign_off_work_order(p_work_order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE((
    SELECT public._can_review_work_order_costs(wo.company_id, wo.site_id)
    FROM public.work_orders wo
    WHERE wo.id = p_work_order_id
  ), false);
$function$;

-- ── Cost RPCs: decision 4. Signatures and grants unchanged. ─────────────────

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

  IF v_wo.status NOT IN ('dispatched', 'accepted') THEN
    RAISE EXCEPTION 'Costs can only be recorded on a dispatched or accepted work order (status: %)', v_wo.status;
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

  -- The variation: approving a line that takes the approved total past the
  -- approved value amends the PO up to the new approved total.
  IF v_wo.approved_value IS NOT NULL THEN
    SELECT COALESCE(sum(line_total), 0) + v_cost.line_total INTO v_new_total
    FROM public.work_order_costs
    WHERE work_order_id = v_wo.id AND status = 'approved';

    IF v_new_total > v_wo.approved_value THEN
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

-- ── process_auto_dispatch: AFTER INSERT, PO-aware ───────────────────────────

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
            -- Signed off by the raiser's own review rights: they approved it.
            -- Signed off by the threshold alone: recorded against the company
            -- owner, as legacy auto-approved cost lines are. A site contact
            -- or other non-member is never recorded as the approver.
            v_reviewer := public._can_review_work_order_costs(NEW.company_id, NEW.site_id);
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

            -- Under the threshold: dispatch now (this also marks the request
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

DROP TRIGGER auto_dispatch_service_request ON public.service_requests;
CREATE TRIGGER auto_dispatch_service_request
  AFTER INSERT ON public.service_requests
  FOR EACH ROW EXECUTE FUNCTION public.process_auto_dispatch();

-- ── Lock the table ───────────────────────────────────────────────────────────

DROP POLICY work_orders_insert ON public.work_orders;
DROP POLICY work_orders_update ON public.work_orders;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER ON public.work_orders FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER ON public.work_orders FROM anon;

-- ── Grants ───────────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public._work_order_rate_snapshot(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._work_order_default_value(jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._work_order_value_signed_off(uuid, uuid, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._work_order_po_ref(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._dispatch_work_order(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._work_order_rate_snapshot(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public._work_order_default_value(jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION public._work_order_value_signed_off(uuid, uuid, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public._work_order_po_ref(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public._dispatch_work_order(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.create_work_order(uuid, uuid, text, numeric, text, text, text, uuid, jsonb, text, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.approve_work_order(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dispatch_work_order(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reassign_work_order(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_work_order(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.amend_work_order_value(uuid, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_sign_off_work_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_work_order(uuid, uuid, text, numeric, text, text, text, uuid, jsonb, text, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.approve_work_order(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dispatch_work_order(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reassign_work_order(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_work_order(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.amend_work_order_value(uuid, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_sign_off_work_order(uuid) TO authenticated, service_role;

-- ── Post-flight: the lock is actually in place ───────────────────────────────

DO $$
BEGIN
  IF has_table_privilege('authenticated', 'public.work_orders', 'INSERT')
     OR has_table_privilege('authenticated', 'public.work_orders', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.work_orders', 'DELETE')
     OR has_any_column_privilege('authenticated', 'public.work_orders', 'INSERT')
     OR has_any_column_privilege('authenticated', 'public.work_orders', 'UPDATE') THEN
    RAISE EXCEPTION 'authenticated still holds a write privilege on work_orders';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'work_orders' AND cmd <> 'SELECT'
  ) THEN
    RAISE EXCEPTION 'work_orders still has a non-SELECT policy';
  END IF;

  IF has_function_privilege('authenticated', 'public._dispatch_work_order(uuid, uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.create_work_order(uuid, uuid, text, numeric, text, text, text, uuid, jsonb, text, uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'function grants are wider than intended';
  END IF;
END $$;
