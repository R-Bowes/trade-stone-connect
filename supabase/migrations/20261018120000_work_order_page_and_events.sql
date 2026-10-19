-- Work orders step 2a: one work order page, both sides.
--
-- 1. work_order_events — append-only history. Written ONLY by triggers on
--    work_orders, work_order_costs and work_order_po_requests, so every
--    writer (the RPCs, process_auto_dispatch, generate_b2b_invoice and any
--    future one) records its event in the same transaction without each RPC
--    re-implementing it. No client access at all; no UPDATE or DELETE for
--    anyone (a trigger refuses both). audience 'business' marks events the
--    contractor never sees (approval waiting / limit detail).
--    One-off backfill from current columns, payload {"backfilled": true};
--    history that was overwritten before this table existed (earlier value
--    amendments, earlier contractors on a reassigned work order) is gone.
-- 2. work_order_timeline(p_work_order_id) — events (contractor: audience
--    'all' only) + job started / finished + job messages + job photos
--    (business: customer-visible only). Empty unless the caller can see the
--    work order (owner, member covering its site, or the dispatched
--    contractor).
-- 3. work_order_context(p_work_order_id) — the page's display flags,
--    computed server-side because members can't read the roster or the
--    contractor's locked profile columns: viewer, show_po, multi_site,
--    multi_person, contractor VAT registration, names, raiser's approval
--    limit (business only), job/SLA, agreed rates, asset + certificate
--    expiry, invoicing state (on-account work orders only).
--    work_order_company_flags(p_company_id) — the same company-level flags
--    for screens without a work order (create dialog, list).
-- 4. Job conversation, messages and customer-visible photos on a work-order
--    job become readable by the owner and members covering the work order's
--    site (they were readable by the owner alone, as the job's customer).
--    Posting is post_work_order_message (creates the job conversation if
--    none exists yet, and notifies the other side: business post → the
--    contractor; contractor post → the owner). Contractor 'internal' photos
--    never reach the business.
-- 5. can_sign_off_work_order shim dropped (no client calls it after this).
--
-- VAT: profiles.vat_registered is the contractor's registration, as
-- generate_b2b_invoice reads it. It is not client-readable (column-locked),
-- so it reaches the page only through work_order_context.

-- ── Pre-flight ───────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_writers text[];
  v_n       integer;
BEGIN
  IF to_regclass('public.work_order_events') IS NOT NULL THEN
    RAISE EXCEPTION 'work_order_events already exists';
  END IF;

  -- Writers as left by step 1b. This migration adds none to these tables
  -- (its triggers write work_order_events only).
  SELECT array_agg(p.proname::text ORDER BY p.proname) INTO v_writers
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
    AND p.prosrc ~* '(insert\s+into|update|delete\s+from)\s+(public\.)?work_orders\M';
  IF v_writers IS DISTINCT FROM ARRAY['_dispatch_work_order', 'accept_work_order', 'amend_work_order_value',
       'approve_po_increase', 'approve_work_order', 'approve_work_order_cost', 'cancel_work_order',
       'create_work_order', 'decline_work_order', 'process_auto_dispatch', 'reassign_work_order'] THEN
    RAISE EXCEPTION 'Unaccounted work_orders writer(s): %', v_writers;
  END IF;

  SELECT array_agg(p.proname::text ORDER BY p.proname) INTO v_writers
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
    AND p.prosrc ~* '(insert\s+into|update|delete\s+from)\s+(public\.)?work_order_costs\M';
  IF v_writers IS DISTINCT FROM ARRAY['amend_work_order_cost', 'approve_work_order_cost', 'cancel_work_order',
       'generate_b2b_invoice', 'query_work_order_cost', 'reassign_work_order', 'reject_work_order_cost',
       'submit_work_order_cost'] THEN
    RAISE EXCEPTION 'Unaccounted work_order_costs writer(s): %', v_writers;
  END IF;

  SELECT array_agg(p.proname::text ORDER BY p.proname) INTO v_writers
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
    AND p.prosrc ~* '(insert\s+into|update|delete\s+from)\s+(public\.)?work_order_po_requests\M';
  IF v_writers IS DISTINCT FROM ARRAY['approve_po_increase', 'cancel_work_order', 'decline_po_increase',
       'request_po_increase', 'withdraw_po_increase'] THEN
    RAISE EXCEPTION 'Unaccounted work_order_po_requests writer(s): %', v_writers;
  END IF;

  -- Only the known triggers on the three tables the new triggers attach to.
  SELECT count(*) INTO v_n FROM pg_trigger
  WHERE NOT tgisinternal AND (
       (tgrelid = 'public.work_orders'::regclass AND tgname NOT IN ('assign_wo_number_trigger', 'work_orders_updated_at'))
    OR (tgrelid = 'public.work_order_costs'::regclass AND tgname NOT IN ('work_order_costs_updated_at'))
    OR (tgrelid = 'public.work_order_po_requests'::regclass AND tgname NOT IN ('work_order_po_requests_updated_at'))
  );
  IF v_n > 0 THEN
    RAISE EXCEPTION '% unexpected trigger(s) on work_orders / work_order_costs / work_order_po_requests', v_n;
  END IF;

  -- The shim must still be the step 1b shim, and nothing else may call it.
  IF to_regprocedure('public.can_sign_off_work_order(uuid)') IS NULL THEN
    RAISE EXCEPTION 'can_sign_off_work_order shim not found';
  END IF;
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname <> 'can_sign_off_work_order' AND p.prosrc ILIKE '%can_sign_off_work_order(%';
  IF v_n > 0 THEN
    RAISE EXCEPTION '% function(s) still call can_sign_off_work_order', v_n;
  END IF;

  -- The policies this migration adds alongside must not already exist.
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname LIKE 'work_order_company_%') THEN
    RAISE EXCEPTION 'work_order_company_* policies already exist';
  END IF;
END $$;

-- ── work_order_events ────────────────────────────────────────────────────────

CREATE TABLE public.work_order_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL REFERENCES public.work_orders(id),
  company_id    uuid NOT NULL REFERENCES public.companies(id),
  actor_id      uuid REFERENCES auth.users(id),
  event_type    text NOT NULL,
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
  audience      text NOT NULL DEFAULT 'all',
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT work_order_events_audience_check CHECK (audience IN ('all', 'business')),
  CONSTRAINT work_order_events_payload_check CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT work_order_events_type_check CHECK (event_type IN (
    'raised', 'awaiting_approval', 'approved', 'value_amended',
    'dispatched', 'reassigned', 'accepted', 'declined', 'cancelled', 'completed',
    'cost_recorded', 'cost_amended', 'cost_approved', 'cost_queried', 'cost_rejected', 'cost_invoiced',
    'po_increase_requested', 'po_increase_approved', 'po_increase_declined', 'po_increase_withdrawn'
  ))
);

CREATE INDEX work_order_events_work_order_idx ON public.work_order_events (work_order_id, created_at);
CREATE INDEX work_order_events_company_idx ON public.work_order_events (company_id);

ALTER TABLE public.work_order_events ENABLE ROW LEVEL SECURITY;
-- No policies: nobody reads or writes it directly. work_order_timeline reads
-- it as SECURITY DEFINER; the logging triggers write it as SECURITY DEFINER.
REVOKE ALL ON public.work_order_events FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public._work_order_events_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'work_order_events is append-only';
END;
$function$;

CREATE TRIGGER work_order_events_no_update_delete
  BEFORE UPDATE OR DELETE ON public.work_order_events
  FOR EACH ROW EXECUTE FUNCTION public._work_order_events_immutable();

CREATE TRIGGER work_order_events_no_truncate
  BEFORE TRUNCATE ON public.work_order_events
  FOR EACH STATEMENT EXECUTE FUNCTION public._work_order_events_immutable();

-- ── Backfill from current columns (before the logging triggers exist) ───────

INSERT INTO public.work_order_events (work_order_id, company_id, actor_id, event_type, payload, audience, created_at)
SELECT wo.id, wo.company_id, wo.raised_by, 'raised',
       jsonb_build_object('backfilled', true, 'title', wo.title, 'priority', wo.priority), 'all', wo.created_at
FROM public.work_orders wo;

-- The approved value at approval is lost where it was amended since.
INSERT INTO public.work_order_events (work_order_id, company_id, actor_id, event_type, payload, audience, created_at)
SELECT wo.id, wo.company_id, wo.approved_by, 'approved',
       jsonb_build_object('backfilled', true,
                          'value', CASE WHEN wo.value_amended_at IS NULL THEN wo.approved_value END),
       'all', wo.po_issued_at
FROM public.work_orders wo
WHERE wo.po_issued_at IS NOT NULL;

INSERT INTO public.work_order_events (work_order_id, company_id, actor_id, event_type, payload, audience, created_at)
SELECT wo.id, wo.company_id, NULL, 'awaiting_approval',
       jsonb_build_object('backfilled', true, 'value', wo.approved_value), 'business', wo.created_at
FROM public.work_orders wo
WHERE wo.approved_value IS NOT NULL AND wo.po_issued_at IS NULL AND wo.status NOT IN ('cancelled', 'completed');

INSERT INTO public.work_order_events (work_order_id, company_id, actor_id, event_type, payload, audience, created_at)
SELECT wo.id, wo.company_id, wo.value_amended_by, 'value_amended',
       jsonb_build_object('backfilled', true, 'old', NULL, 'new', wo.approved_value), 'all', wo.value_amended_at
FROM public.work_orders wo
WHERE wo.value_amended_at IS NOT NULL;

INSERT INTO public.work_order_events (work_order_id, company_id, actor_id, event_type, payload, audience, created_at)
SELECT wo.id, wo.company_id, NULL, 'dispatched',
       jsonb_build_object('backfilled', true, 'contractor_id', wo.dispatched_to), 'all', wo.dispatched_at
FROM public.work_orders wo
WHERE wo.dispatched_at IS NOT NULL AND wo.dispatched_to IS NOT NULL;

INSERT INTO public.work_order_events (work_order_id, company_id, actor_id, event_type, payload, audience, created_at)
SELECT wo.id, wo.company_id, wo.dispatched_to, 'accepted',
       jsonb_build_object('backfilled', true, 'job_id', wo.job_id), 'all', wo.responded_at
FROM public.work_orders wo
WHERE wo.status IN ('accepted', 'completed') AND wo.responded_at IS NOT NULL;

INSERT INTO public.work_order_events (work_order_id, company_id, actor_id, event_type, payload, audience, created_at)
SELECT wo.id, wo.company_id, wo.dispatched_to, 'declined',
       jsonb_build_object('backfilled', true, 'reason', wo.decline_reason), 'all', wo.responded_at
FROM public.work_orders wo
WHERE wo.status = 'declined' AND wo.responded_at IS NOT NULL;

INSERT INTO public.work_order_events (work_order_id, company_id, actor_id, event_type, payload, audience, created_at)
SELECT wo.id, wo.company_id, NULL, 'cancelled',
       jsonb_build_object('backfilled', true, 'reason', wo.decline_reason), 'all', wo.updated_at
FROM public.work_orders wo
WHERE wo.status = 'cancelled';

INSERT INTO public.work_order_events (work_order_id, company_id, actor_id, event_type, payload, audience, created_at)
SELECT c.work_order_id, c.company_id, c.contractor_id, 'cost_recorded',
       jsonb_build_object('backfilled', true, 'cost_id', c.id, 'kind', c.kind, 'quantity', c.quantity,
                          'line_total', c.line_total, 'description', c.description,
                          'auto_approved', c.auto_approved),
       'all', c.created_at
FROM public.work_order_costs c;

INSERT INTO public.work_order_events (work_order_id, company_id, actor_id, event_type, payload, audience, created_at)
SELECT c.work_order_id, c.company_id, c.approved_by, 'cost_approved',
       jsonb_build_object('backfilled', true, 'cost_id', c.id, 'kind', c.kind, 'quantity', c.quantity,
                          'line_total', c.line_total, 'description', c.description),
       'all', c.approved_at
FROM public.work_order_costs c
WHERE c.status = 'approved' AND NOT c.auto_approved AND c.approved_at IS NOT NULL;

INSERT INTO public.work_order_events (work_order_id, company_id, actor_id, event_type, payload, audience, created_at)
SELECT c.work_order_id, c.company_id, c.queried_by, 'cost_queried',
       jsonb_build_object('backfilled', true, 'cost_id', c.id, 'kind', c.kind, 'quantity', c.quantity,
                          'line_total', c.line_total, 'description', c.description, 'reason', c.queried_reason),
       'all', c.queried_at
FROM public.work_order_costs c
WHERE c.queried_at IS NOT NULL;

INSERT INTO public.work_order_events (work_order_id, company_id, actor_id, event_type, payload, audience, created_at)
SELECT c.work_order_id, c.company_id, c.rejected_by, 'cost_rejected',
       jsonb_build_object('backfilled', true, 'cost_id', c.id, 'kind', c.kind, 'quantity', c.quantity,
                          'line_total', c.line_total, 'description', c.description, 'reason', c.rejected_reason),
       'all', c.rejected_at
FROM public.work_order_costs c
WHERE c.rejected_at IS NOT NULL;

INSERT INTO public.work_order_events (work_order_id, company_id, actor_id, event_type, payload, audience, created_at)
SELECT c.work_order_id, c.company_id, NULL, 'cost_invoiced',
       jsonb_build_object('backfilled', true, 'cost_id', c.id, 'invoice_id', c.invoice_id, 'line_total', c.line_total),
       'all', i.created_at
FROM public.work_order_costs c JOIN public.invoices i ON i.id = c.invoice_id;

INSERT INTO public.work_order_events (work_order_id, company_id, actor_id, event_type, payload, audience, created_at)
SELECT r.work_order_id, r.company_id, r.contractor_id, 'po_increase_requested',
       jsonb_build_object('backfilled', true, 'request_id', r.id, 'amount', r.increase_amount,
                          'reason', r.reason, 'photos', r.photos),
       'all', r.created_at
FROM public.work_order_po_requests r;

INSERT INTO public.work_order_events (work_order_id, company_id, actor_id, event_type, payload, audience, created_at)
SELECT r.work_order_id, r.company_id, r.decided_by, 'po_increase_' || r.status,
       jsonb_build_object('backfilled', true, 'request_id', r.id, 'amount', r.increase_amount, 'reason', r.decline_reason),
       'all', r.decided_at
FROM public.work_order_po_requests r
WHERE r.status IN ('approved', 'declined', 'withdrawn') AND r.decided_at IS NOT NULL;

-- ── Logging triggers ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._log_work_order_event(
  p_work_order_id uuid, p_company_id uuid, p_actor uuid, p_type text, p_payload jsonb, p_audience text DEFAULT 'all'
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  INSERT INTO public.work_order_events (work_order_id, company_id, actor_id, event_type, payload, audience)
  VALUES (p_work_order_id, p_company_id, p_actor, p_type, COALESCE(p_payload, '{}'::jsonb), p_audience);
$function$;

CREATE OR REPLACE FUNCTION public._work_orders_log_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public._log_work_order_event(NEW.id, NEW.company_id, NEW.raised_by, 'raised',
      jsonb_build_object('title', NEW.title, 'priority', NEW.priority, 'service_request_id', NEW.service_request_id));
    IF NEW.po_issued_at IS NOT NULL THEN
      PERFORM public._log_work_order_event(NEW.id, NEW.company_id, NEW.approved_by, 'approved',
        jsonb_build_object('value', NEW.approved_value));
    ELSIF NEW.approved_value IS NOT NULL THEN
      PERFORM public._log_work_order_event(NEW.id, NEW.company_id, NULL, 'awaiting_approval',
        jsonb_build_object('value', NEW.approved_value), 'business');
    END IF;
    RETURN NULL;
  END IF;

  -- UPDATE
  IF NEW.approved_value IS DISTINCT FROM OLD.approved_value THEN
    PERFORM public._log_work_order_event(NEW.id, NEW.company_id, COALESCE(auth.uid(), NEW.value_amended_by), 'value_amended',
      jsonb_build_object('old', OLD.approved_value, 'new', NEW.approved_value));
  END IF;

  IF OLD.po_issued_at IS NULL AND NEW.po_issued_at IS NOT NULL THEN
    PERFORM public._log_work_order_event(NEW.id, NEW.company_id, NEW.approved_by, 'approved',
      jsonb_build_object('value', NEW.approved_value));
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'dispatched' THEN
      IF OLD.status = 'reassigned' THEN
        PERFORM public._log_work_order_event(NEW.id, NEW.company_id, COALESCE(auth.uid(), NEW.approved_by), 'reassigned',
          jsonb_build_object('from_contractor_id', OLD.dispatched_to, 'contractor_id', NEW.dispatched_to));
      ELSE
        PERFORM public._log_work_order_event(NEW.id, NEW.company_id, COALESCE(auth.uid(), NEW.approved_by), 'dispatched',
          jsonb_build_object('contractor_id', NEW.dispatched_to));
      END IF;
    ELSIF NEW.status = 'accepted' THEN
      PERFORM public._log_work_order_event(NEW.id, NEW.company_id, NEW.dispatched_to, 'accepted',
        jsonb_build_object('job_id', NEW.job_id));
    ELSIF NEW.status = 'declined' THEN
      PERFORM public._log_work_order_event(NEW.id, NEW.company_id, NEW.dispatched_to, 'declined',
        jsonb_build_object('reason', NEW.decline_reason));
    ELSIF NEW.status = 'cancelled' THEN
      PERFORM public._log_work_order_event(NEW.id, NEW.company_id, auth.uid(), 'cancelled',
        jsonb_build_object('reason', NEW.decline_reason));
    ELSIF NEW.status = 'completed' THEN
      PERFORM public._log_work_order_event(NEW.id, NEW.company_id, auth.uid(), 'completed', '{}'::jsonb);
    END IF;
    -- 'reassigned' itself is a transient step inside reassign_work_order; the
    -- move is logged when the work order is dispatched to the new contractor.
  END IF;

  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public._work_order_costs_log_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_line jsonb;
BEGIN
  v_line := jsonb_build_object('cost_id', NEW.id, 'kind', NEW.kind, 'quantity', NEW.quantity,
                               'line_total', NEW.line_total, 'description', NEW.description);

  IF TG_OP = 'INSERT' THEN
    PERFORM public._log_work_order_event(NEW.work_order_id, NEW.company_id, NEW.contractor_id, 'cost_recorded',
      v_line || jsonb_build_object('auto_approved', NEW.auto_approved, 'status', NEW.status));
    RETURN NULL;
  END IF;

  IF (NEW.quantity, NEW.unit_rate, NEW.markup_pct, NEW.line_total, NEW.description)
     IS DISTINCT FROM (OLD.quantity, OLD.unit_rate, OLD.markup_pct, OLD.line_total, OLD.description) THEN
    PERFORM public._log_work_order_event(NEW.work_order_id, NEW.company_id, COALESCE(auth.uid(), NEW.contractor_id), 'cost_amended',
      jsonb_build_object('cost_id', NEW.id, 'kind', NEW.kind,
        'old', jsonb_build_object('quantity', OLD.quantity, 'line_total', OLD.line_total, 'description', OLD.description),
        'new', jsonb_build_object('quantity', NEW.quantity, 'line_total', NEW.line_total, 'description', NEW.description)));
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'approved' THEN
      PERFORM public._log_work_order_event(NEW.work_order_id, NEW.company_id, COALESCE(auth.uid(), NEW.approved_by), 'cost_approved', v_line);
    ELSIF NEW.status = 'queried' THEN
      PERFORM public._log_work_order_event(NEW.work_order_id, NEW.company_id, COALESCE(auth.uid(), NEW.queried_by), 'cost_queried',
        v_line || jsonb_build_object('reason', NEW.queried_reason));
    ELSIF NEW.status = 'rejected' THEN
      PERFORM public._log_work_order_event(NEW.work_order_id, NEW.company_id, COALESCE(auth.uid(), NEW.rejected_by), 'cost_rejected',
        v_line || jsonb_build_object('reason', NEW.rejected_reason));
    END IF;
  END IF;

  IF OLD.invoice_id IS NULL AND NEW.invoice_id IS NOT NULL THEN
    PERFORM public._log_work_order_event(NEW.work_order_id, NEW.company_id, auth.uid(), 'cost_invoiced',
      v_line || jsonb_build_object('invoice_id', NEW.invoice_id));
  END IF;

  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public._work_order_po_requests_log_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public._log_work_order_event(NEW.work_order_id, NEW.company_id, NEW.contractor_id, 'po_increase_requested',
      jsonb_build_object('request_id', NEW.id, 'amount', NEW.increase_amount, 'reason', NEW.reason, 'photos', NEW.photos));
    RETURN NULL;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('approved', 'declined', 'withdrawn') THEN
    PERFORM public._log_work_order_event(NEW.work_order_id, NEW.company_id, COALESCE(NEW.decided_by, auth.uid()),
      'po_increase_' || NEW.status,
      jsonb_build_object('request_id', NEW.id, 'amount', NEW.increase_amount, 'reason', NEW.decline_reason));
  END IF;
  RETURN NULL;
END;
$function$;

CREATE TRIGGER work_orders_log_events
  AFTER INSERT OR UPDATE ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION public._work_orders_log_events();

CREATE TRIGGER work_order_costs_log_events
  AFTER INSERT OR UPDATE ON public.work_order_costs
  FOR EACH ROW EXECUTE FUNCTION public._work_order_costs_log_events();

CREATE TRIGGER work_order_po_requests_log_events
  AFTER INSERT OR UPDATE ON public.work_order_po_requests
  FOR EACH ROW EXECUTE FUNCTION public._work_order_po_requests_log_events();

-- ── Who is looking at this work order? ──────────────────────────────────────

-- 'business' (owner, or a member covering its site), 'contractor' (it is
-- dispatched to the caller), or NULL (can't see it).
CREATE OR REPLACE FUNCTION public._work_order_viewer(p_work_order_id uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN public._work_order_visible_to_company(p_work_order_id) THEN 'business'
    WHEN EXISTS (SELECT 1 FROM public.work_orders WHERE id = p_work_order_id AND dispatched_to = auth.uid()) THEN 'contractor'
  END;
$function$;

-- A work-order job is visible to the company side exactly as its work order is.
CREATE OR REPLACE FUNCTION public._work_order_job_visible_to_company(p_job_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE((
    SELECT public._work_order_visible_to_company(j.work_order_id)
    FROM public.jobs j WHERE j.id = p_job_id AND j.work_order_id IS NOT NULL
  ), false);
$function$;

-- ── Display flags ────────────────────────────────────────────────────────────

-- Company-level: more than one active person (the owner plus at least one
-- active member), more than one site, and whether the company has ever set
-- its own PO reference. show_po = multi_person OR used_client_po_ref.
-- Members only; NULL otherwise.
CREATE OR REPLACE FUNCTION public._work_order_company_flags(p_company_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH f AS (
    SELECT
      EXISTS (SELECT 1 FROM public.business_members bm
              JOIN public.companies c ON c.id = bm.company_id
              WHERE bm.company_id = p_company_id AND bm.status = 'active'
                AND bm.profile_id IS DISTINCT FROM c.owner_id) AS multi_person,
      (SELECT count(*) FROM public.sites WHERE company_id = p_company_id) > 1 AS multi_site,
      EXISTS (SELECT 1 FROM public.work_orders WHERE company_id = p_company_id AND client_po_ref IS NOT NULL) AS used_client_po_ref
  )
  SELECT jsonb_build_object(
    'multi_person', multi_person,
    'multi_site', multi_site,
    'used_client_po_ref', used_client_po_ref,
    'show_po', multi_person OR used_client_po_ref
  ) FROM f;
$function$;

CREATE OR REPLACE FUNCTION public.work_order_company_flags(p_company_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN is_company_member(p_company_id) THEN public._work_order_company_flags(p_company_id) END;
$function$;

-- Everything the work order page shows that the client can't (or shouldn't)
-- read for itself. NULL unless the caller can see the work order.
-- Business-only keys are omitted for the contractor.
CREATE OR REPLACE FUNCTION public.work_order_context(p_work_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_viewer   text;
  v_wo       public.work_orders%ROWTYPE;
  v_company  public.companies%ROWTYPE;
  v_flags    jsonb;
  v_job      public.jobs%ROWTYPE;
  v_result   jsonb;
  v_raiser_limit jsonb;
  v_invoicing jsonb;
  v_asset    jsonb;
  v_sla      jsonb;
BEGIN
  v_viewer := public._work_order_viewer(p_work_order_id);
  IF v_viewer IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_wo FROM public.work_orders WHERE id = p_work_order_id;
  SELECT * INTO v_company FROM public.companies WHERE id = v_wo.company_id;
  v_flags := public._work_order_company_flags(v_wo.company_id);
  IF v_wo.job_id IS NOT NULL THEN
    SELECT * INTO v_job FROM public.jobs WHERE id = v_wo.job_id;
  END IF;

  IF v_wo.job_id IS NOT NULL AND v_job.sla_rule_id IS NOT NULL THEN
    SELECT jsonb_build_object(
      'rule_name', r.name,
      'status', v_job.sla_status,
      'response_due', v_job.sla_response_due,
      'attendance_due', v_job.sla_attendance_due,
      'completion_due', COALESCE(v_job.sla_completion_due, v_job.sla_resolution_due),
      'responded_at', v_job.responded_at
    ) INTO v_sla
    FROM public.sla_rules r WHERE r.id = v_job.sla_rule_id;
  END IF;

  IF v_wo.asset_id IS NOT NULL THEN
    SELECT jsonb_build_object(
      'id', a.id, 'name', a.name, 'category', a.category, 'make', a.make, 'model', a.model,
      'location_note', a.location_note, 'next_service_due', a.next_service_due,
      'warranty_expiry', a.warranty_expiry,
      'certificate', (
        SELECT jsonb_build_object('name', COALESCE(jc.certificate_name, jc.certificate_type), 'expiry_date', jc.expiry_date)
        FROM public.job_certificates jc
        WHERE jc.asset_id = a.id AND jc.expiry_date IS NOT NULL
        ORDER BY jc.expiry_date DESC LIMIT 1
      )
    ) INTO v_asset
    FROM public.assets a WHERE a.id = v_wo.asset_id;
  END IF;

  -- On account only: approved lines invoiced in full, in part, or not yet;
  -- and the invoices behind them paid in full, in part, or not yet.
  IF v_wo.engagement_id IS NOT NULL THEN
    SELECT jsonb_build_object(
      'approved_lines', count(*) FILTER (WHERE c.status = 'approved'),
      'invoiced_lines', count(*) FILTER (WHERE c.status = 'approved' AND c.invoice_id IS NOT NULL),
      'invoices', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', i.id, 'status', i.status, 'invoice_number', i.invoice_number))
        FROM public.invoices i
        WHERE i.id IN (SELECT DISTINCT c2.invoice_id FROM public.work_order_costs c2
                       WHERE c2.work_order_id = v_wo.id AND c2.invoice_id IS NOT NULL)
      ), '[]'::jsonb)
    ) INTO v_invoicing
    FROM public.work_order_costs c WHERE c.work_order_id = v_wo.id;
  END IF;

  IF v_viewer = 'business' THEN
    v_raiser_limit := CASE
      WHEN EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_company.owner_id AND p.user_id = v_wo.raised_by)
        THEN jsonb_build_object('owner', true)
      ELSE (SELECT jsonb_build_object('owner', false, 'limit', bm.approval_limit)
            FROM public.business_members bm JOIN public.profiles p ON p.id = bm.profile_id
            WHERE bm.company_id = v_wo.company_id AND bm.status = 'active' AND p.user_id = v_wo.raised_by
            LIMIT 1)
    END;
  END IF;

  v_result := jsonb_build_object(
    'viewer', v_viewer,
    'company_name', v_company.name,
    'company_code', v_company.company_code,
    'show_po', (v_flags ->> 'show_po')::boolean,
    'multi_site', (v_flags ->> 'multi_site')::boolean,
    'multi_person', (v_flags ->> 'multi_person')::boolean,
    'contractor_vat_registered', COALESCE((SELECT p.vat_registered FROM public.profiles p WHERE p.id = v_wo.dispatched_to), false),
    'contractor_name', (SELECT p.full_name FROM public.profiles p WHERE p.id = v_wo.dispatched_to),
    'raised_by_name', COALESCE((SELECT p.full_name FROM public.profiles p WHERE p.id = v_wo.raised_by), v_wo.raised_by_name),
    'approved_by_name', (SELECT p.full_name FROM public.profiles p WHERE p.id = v_wo.approved_by),
    'approved_by_is_viewer', v_wo.approved_by IS NOT NULL AND v_wo.approved_by = auth.uid(),
    'site_name', (SELECT s.name FROM public.sites s WHERE s.id = v_wo.site_id),
    'has_agreed_rates', v_wo.engagement_id IS NOT NULL AND v_wo.rate_snapshot IS NOT NULL,
    'on_account', v_wo.engagement_id IS NOT NULL,
    'job', CASE WHEN v_wo.job_id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_job.id, 'status', v_job.status, 'actual_start', v_job.actual_start,
      'completed_at', v_job.completed_at, 'job_number', v_job.job_number) END,
    'sla', v_sla,
    'asset', v_asset,
    'invoicing', v_invoicing
  );

  IF v_viewer = 'business' THEN
    v_result := v_result || jsonb_build_object(
      'raiser_limit', v_raiser_limit,
      'can_act', public._can_review_work_order_costs(v_wo.company_id, v_wo.site_id),
      'can_approve_value', CASE WHEN v_wo.approved_value IS NULL THEN false
                                ELSE public._can_sign_off_amount(v_wo.company_id, v_wo.site_id, v_wo.approved_value) END
    );
  END IF;

  RETURN v_result;
END;
$function$;

-- ── Timeline ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._work_order_money(p_amount numeric, p_vat boolean)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT CASE WHEN p_amount IS NULL THEN NULL
    ELSE '£' || to_char(p_amount, 'FM999,999,990.00') || CASE WHEN p_vat THEN ' + VAT' ELSE '' END END;
$function$;

CREATE OR REPLACE FUNCTION public._work_order_cost_label(p_line jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT CASE p_line ->> 'kind'
    WHEN 'callout_standard' THEN 'Call-out'
    WHEN 'callout_ooh' THEN 'Out-of-hours call-out'
    WHEN 'hours' THEN 'Labour, ' || trim(to_char((p_line ->> 'quantity')::numeric, 'FM999990.##'), '.')
                      || CASE WHEN (p_line ->> 'quantity')::numeric = 1 THEN ' hr' ELSE ' hrs' END
    WHEN 'materials' THEN 'Materials' || COALESCE(': ' || (p_line ->> 'description'), '')
    ELSE COALESCE(p_line ->> 'description', 'Other')
  END;
$function$;

-- Ordered events for the page. Plain words; "approve" throughout. Empty
-- unless the caller can see the work order. The contractor gets audience
-- 'all' only; the business gets customer-visible photos only.
CREATE OR REPLACE FUNCTION public.work_order_timeline(p_work_order_id uuid)
RETURNS TABLE (
  occurred_at timestamptz,
  kind       text,
  actor_name text,
  title      text,
  body       text,
  photos     jsonb
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_viewer text;
  v_wo     public.work_orders%ROWTYPE;
  v_vat    boolean;
BEGIN
  v_viewer := public._work_order_viewer(p_work_order_id);
  IF v_viewer IS NULL THEN
    RETURN;
  END IF;

  SELECT * INTO v_wo FROM public.work_orders WHERE id = p_work_order_id;
  v_vat := COALESCE((SELECT p.vat_registered FROM public.profiles p WHERE p.id = v_wo.dispatched_to), false);

  RETURN QUERY
  SELECT * FROM (
    SELECT
      e.created_at,
      e.event_type,
      (SELECT p.full_name FROM public.profiles p WHERE p.id = e.actor_id),
      CASE e.event_type
        WHEN 'raised' THEN 'Raised'
        WHEN 'awaiting_approval' THEN 'Waiting for approval: ' || public._work_order_money((e.payload ->> 'value')::numeric, v_vat)
        WHEN 'approved' THEN COALESCE('Approved: ' || public._work_order_money((e.payload ->> 'value')::numeric, v_vat), 'Approved')
        WHEN 'value_amended' THEN COALESCE('Approved amount changed: ' || public._work_order_money((e.payload ->> 'old')::numeric, v_vat) || ' → ',
                                           'Approved amount set to ')
                                  || public._work_order_money((e.payload ->> 'new')::numeric, v_vat)
        WHEN 'dispatched' THEN 'Sent to ' || COALESCE((SELECT p.full_name FROM public.profiles p WHERE p.id = (e.payload ->> 'contractor_id')::uuid), 'the contractor')
        WHEN 'reassigned' THEN 'Moved from ' || COALESCE((SELECT p.full_name FROM public.profiles p WHERE p.id = (e.payload ->> 'from_contractor_id')::uuid), 'the previous contractor')
                               || ' to ' || COALESCE((SELECT p.full_name FROM public.profiles p WHERE p.id = (e.payload ->> 'contractor_id')::uuid), 'a new contractor')
        WHEN 'accepted' THEN 'Accepted'
        WHEN 'declined' THEN 'Declined'
        WHEN 'cancelled' THEN 'Cancelled'
        WHEN 'completed' THEN 'Completed'
        WHEN 'cost_recorded' THEN 'Cost added: ' || public._work_order_cost_label(e.payload) || ', '
                                  || public._work_order_money((e.payload ->> 'line_total')::numeric, v_vat)
        WHEN 'cost_amended' THEN 'Cost changed: ' || public._work_order_cost_label(e.payload || (e.payload -> 'new')) || ', '
                                 || public._work_order_money((e.payload -> 'old' ->> 'line_total')::numeric, v_vat) || ' → '
                                 || public._work_order_money((e.payload -> 'new' ->> 'line_total')::numeric, v_vat)
        WHEN 'cost_approved' THEN 'Cost approved: ' || public._work_order_cost_label(e.payload) || ', '
                                  || public._work_order_money((e.payload ->> 'line_total')::numeric, v_vat)
        WHEN 'cost_queried' THEN 'Cost queried: ' || public._work_order_cost_label(e.payload)
        WHEN 'cost_rejected' THEN 'Cost turned down: ' || public._work_order_cost_label(e.payload)
        WHEN 'cost_invoiced' THEN 'Invoiced: ' || public._work_order_cost_label(e.payload) || ', '
                                  || public._work_order_money((e.payload ->> 'line_total')::numeric, v_vat)
        WHEN 'po_increase_requested' THEN 'Asked to spend ' || public._work_order_money((e.payload ->> 'amount')::numeric, v_vat) || ' more'
        WHEN 'po_increase_approved' THEN 'Approved spending ' || public._work_order_money((e.payload ->> 'amount')::numeric, v_vat) || ' more'
        WHEN 'po_increase_declined' THEN 'Turned down spending ' || public._work_order_money((e.payload ->> 'amount')::numeric, v_vat) || ' more'
        WHEN 'po_increase_withdrawn' THEN 'Withdrew the request to spend ' || public._work_order_money((e.payload ->> 'amount')::numeric, v_vat) || ' more'
      END,
      CASE
        WHEN e.event_type = 'cost_recorded' AND (e.payload ->> 'auto_approved')::boolean THEN 'Within the approved amount, so approved straight away.'
        ELSE e.payload ->> 'reason'
      END,
      CASE WHEN e.event_type = 'po_increase_requested' THEN e.payload -> 'photos' END
    FROM public.work_order_events e
    WHERE e.work_order_id = p_work_order_id
      AND (v_viewer = 'business' OR e.audience = 'all')

    UNION ALL
    SELECT j.actual_start, 'job_started', NULL, 'Work started', NULL, NULL::jsonb
    FROM public.jobs j WHERE j.id = v_wo.job_id AND j.actual_start IS NOT NULL

    UNION ALL
    SELECT j.completed_at, 'job_completed', NULL, 'Work finished', NULL, NULL::jsonb
    FROM public.jobs j WHERE j.id = v_wo.job_id AND j.completed_at IS NOT NULL

    UNION ALL
    SELECT m.created_at, 'message', (SELECT p.full_name FROM public.profiles p WHERE p.id = m.sender_id), NULL, m.content, NULL::jsonb
    FROM public.job_conversations jc
    JOIN public.job_messages m ON m.conversation_id = jc.id
    WHERE jc.job_id = v_wo.job_id AND v_wo.job_id IS NOT NULL AND m.message_type = 'message'

    UNION ALL
    SELECT ph.created_at, 'photo', (SELECT p.full_name FROM public.profiles p WHERE p.id = ph.uploaded_by),
           COALESCE(ph.caption, ph.title, 'Photo added'), ph.description,
           jsonb_build_array(jsonb_build_object('bucket', 'job-photos', 'path', ph.storage_path, 'url', ph.photo_url))
    FROM public.job_photos ph
    WHERE ph.job_id = v_wo.job_id AND v_wo.job_id IS NOT NULL
      AND (v_viewer = 'contractor' OR ph.visibility = 'customer')
  ) t (occurred_at, kind, actor_name, title, body, photos)
  ORDER BY t.occurred_at, t.kind;
END;
$function$;

-- ── Messages and photos on a work-order job ──────────────────────────────────

-- Post to the job's conversation, creating it if the job has none yet.
-- Business side: owner or a member covering the site. Contractor: the
-- dispatched contractor. There is no conversation before the job exists.
-- Notifies the other side: a business post notifies the contractor; a
-- contractor post notifies the owner (covering members: step 3). One unread
-- 'new_message' notification per recipient per work order, as
-- send_subcontract_message does. Non-fatal: a failed notification never
-- rolls back the message.
CREATE OR REPLACE FUNCTION public.post_work_order_message(p_work_order_id uuid, p_content text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_viewer    text;
  v_wo        public.work_orders%ROWTYPE;
  v_job       public.jobs%ROWTYPE;
  v_conv      uuid;
  v_id        uuid;
  v_recipient uuid;
  v_sender    text;
BEGIN
  v_viewer := public._work_order_viewer(p_work_order_id);
  IF v_viewer IS NULL THEN
    RAISE EXCEPTION 'Work order not found';
  END IF;
  IF p_content IS NULL OR btrim(p_content) = '' THEN
    RAISE EXCEPTION 'Write a message first';
  END IF;

  SELECT * INTO v_wo FROM public.work_orders WHERE id = p_work_order_id;
  IF v_wo.job_id IS NULL THEN
    RAISE EXCEPTION 'Messages open once the work order is accepted';
  END IF;
  SELECT * INTO v_job FROM public.jobs WHERE id = v_wo.job_id;

  SELECT id INTO v_conv FROM public.job_conversations WHERE job_id = v_job.id;
  IF v_conv IS NULL THEN
    INSERT INTO public.job_conversations (job_id, context, contractor_id)
    VALUES (v_job.id, 'job', v_job.contractor_id)
    ON CONFLICT (job_id) DO NOTHING
    RETURNING id INTO v_conv;
    IF v_conv IS NULL THEN
      SELECT id INTO v_conv FROM public.job_conversations WHERE job_id = v_job.id;
    END IF;
  END IF;

  INSERT INTO public.job_messages (conversation_id, sender_id, sender_role, content, message_type)
  VALUES (v_conv, auth.uid(), v_viewer, btrim(p_content), 'message')
  RETURNING id INTO v_id;

  BEGIN
    IF v_viewer = 'business' THEN
      v_recipient := v_wo.dispatched_to;
    ELSE
      SELECT owner_id INTO v_recipient FROM public.companies WHERE id = v_wo.company_id;
    END IF;

    IF v_recipient IS NOT NULL AND v_recipient IS DISTINCT FROM auth.uid()
       AND NOT EXISTS (
         SELECT 1 FROM public.notifications
         WHERE user_id = v_recipient AND type = 'new_message'
           AND reference_type = 'work_order' AND reference_id = p_work_order_id AND is_read = false
       ) THEN
      SELECT COALESCE(company_name, full_name) INTO v_sender FROM public.profiles WHERE id = auth.uid();
      INSERT INTO public.notifications (user_id, title, message, type, reference_type, reference_id, is_read)
      VALUES (
        v_recipient,
        'New message',
        COALESCE(v_sender, 'Someone') || ' sent a message about "' || v_wo.title || '"',
        'new_message',
        'work_order',
        p_work_order_id,
        false
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'post_work_order_message: notification for work order % failed: %', p_work_order_id, SQLERRM;
  END;

  RETURN v_id;
END;
$function$;

CREATE POLICY work_order_company_select ON public.job_conversations
  FOR SELECT TO authenticated
  USING (job_id IS NOT NULL AND public._work_order_job_visible_to_company(job_id));

CREATE POLICY work_order_company_select ON public.job_messages
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.job_conversations jc
    WHERE jc.id = conversation_id AND jc.job_id IS NOT NULL
      AND public._work_order_job_visible_to_company(jc.job_id)
  ));

-- Customer-visible photos only; 'internal' never reaches the business.
CREATE POLICY work_order_company_select ON public.job_photos
  FOR SELECT TO authenticated
  USING (visibility = 'customer' AND public._work_order_job_visible_to_company(job_id));

CREATE POLICY work_order_company_view_job_photos ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'job-photos'
    AND EXISTS (
      SELECT 1 FROM public.job_photos jp
      WHERE jp.storage_path = objects.name
        AND jp.visibility = 'customer'
        AND public._work_order_job_visible_to_company(jp.job_id)
    )
  );

-- ── Drop the transitional shim ───────────────────────────────────────────────

DROP FUNCTION public.can_sign_off_work_order(uuid);

-- ── Grants ───────────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public._work_order_events_immutable() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._log_work_order_event(uuid, uuid, uuid, text, jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._work_orders_log_events() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._work_order_costs_log_events() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._work_order_po_requests_log_events() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._work_order_viewer(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._work_order_company_flags(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._work_order_money(numeric, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._work_order_cost_label(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._work_order_job_visible_to_company(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._log_work_order_event(uuid, uuid, uuid, text, jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION public._work_order_viewer(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public._work_order_company_flags(uuid) TO service_role;
-- Called from RLS policies, so the querying role needs EXECUTE.
GRANT EXECUTE ON FUNCTION public._work_order_job_visible_to_company(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.work_order_company_flags(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.work_order_context(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.work_order_timeline(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.post_work_order_message(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.work_order_company_flags(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.work_order_context(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.work_order_timeline(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.post_work_order_message(uuid, text) TO authenticated, service_role;

-- ── Post-flight ──────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_wos    integer;
  v_raised integer;
BEGIN
  IF to_regprocedure('public.can_sign_off_work_order(uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'can_sign_off_work_order shim still exists';
  END IF;

  IF has_table_privilege('authenticated', 'public.work_order_events', 'SELECT')
     OR has_table_privilege('authenticated', 'public.work_order_events', 'INSERT')
     OR has_table_privilege('authenticated', 'public.work_order_events', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.work_order_events', 'DELETE') THEN
    RAISE EXCEPTION 'authenticated has direct access to work_order_events';
  END IF;

  SELECT count(*) INTO v_wos FROM public.work_orders;
  SELECT count(*) INTO v_raised FROM public.work_order_events WHERE event_type = 'raised';
  IF v_raised <> v_wos THEN
    RAISE EXCEPTION 'backfill: % raised events for % work orders', v_raised, v_wos;
  END IF;

  IF (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgname IN
      ('work_orders_log_events', 'work_order_costs_log_events', 'work_order_po_requests_log_events',
       'work_order_events_no_update_delete', 'work_order_events_no_truncate')) <> 5 THEN
    RAISE EXCEPTION 'logging / immutability triggers missing';
  END IF;

  IF has_function_privilege('authenticated', 'public._log_work_order_event(uuid, uuid, uuid, text, jsonb, text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.work_order_timeline(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'function grants are wider than intended';
  END IF;
END $$;
