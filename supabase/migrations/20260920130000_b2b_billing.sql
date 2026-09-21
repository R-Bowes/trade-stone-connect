-- B2B billing: cost lines, approval, period invoicing.
--
-- Model: work is done under a term engagement and priced from
-- work_orders.rate_snapshot (stamped at dispatch). The contractor records cost
-- components as PENDING lines; someone at the company with coverage of the site
-- approves, queries or rejects each; at period end approved lines become one
-- invoice per contractor, 30-day terms, paid by the existing destination charge.
-- No funds are held. Cost lines attach to work_orders, not jobs.
--
-- Writes to work_order_costs happen ONLY through the SECURITY DEFINER RPCs
-- below. There are deliberately no INSERT/UPDATE/DELETE policies and the
-- table-level write grants are revoked: a contractor with a plain UPDATE could
-- set their own line to 'approved' (making approval decorative) or write an
-- arbitrary unit_rate, and the auto-approval decision has to be made
-- server-side. Financial records: no DELETE for anyone, six-year retention.

-- =============================================================================
-- 0. site_autonomy_config: the company-default row was unprotected.
--    UNIQUE (company_id, site_id) does not constrain rows with site_id NULL
--    (NULLs are distinct), so a duplicate default made maybeSingle() error and
--    an unchecked Promise.all read it as "config unset". On a money path that
--    means a line skipping approval. Pre-flight RAISEs; never deletes.
-- =============================================================================

DO $$
DECLARE
  dup_count integer;
BEGIN
  SELECT count(*) INTO dup_count
  FROM (
    SELECT company_id
    FROM public.site_autonomy_config
    WHERE site_id IS NULL
    GROUP BY company_id
    HAVING count(*) > 1
  ) d;

  IF dup_count > 0 THEN
    RAISE EXCEPTION
      'Cannot add company-default uniqueness: % companies have more than one site_autonomy_config row with site_id IS NULL. Resolve manually before applying.',
      dup_count;
  END IF;
END $$;

-- IF NOT EXISTS: this index was found to already exist live (created outside
-- migrations) when the migration was first pushed; the statement is kept so a
-- rebuilt database still gets it.
CREATE UNIQUE INDEX IF NOT EXISTS site_autonomy_config_company_default_uniq
  ON public.site_autonomy_config (company_id)
  WHERE site_id IS NULL;

-- =============================================================================
-- 1. invoices: B2B columns. Numbering is unchanged — B2B invoices use the same
--    per-contractor sequence via assign_invoice_number_trigger.
-- =============================================================================

ALTER TABLE public.invoices
  ADD COLUMN company_id    uuid REFERENCES public.companies(id),
  ADD COLUMN engagement_id uuid REFERENCES public.term_engagements(id),
  ADD COLUMN period_start  date,
  ADD COLUMN period_end    date;

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_b2b_shape_check
  CHECK (
    (company_id IS NULL AND engagement_id IS NULL AND period_start IS NULL AND period_end IS NULL)
    OR
    (company_id IS NOT NULL AND period_start IS NOT NULL AND period_end IS NOT NULL AND period_start <= period_end)
  );

CREATE INDEX idx_invoices_company_id ON public.invoices (company_id) WHERE company_id IS NOT NULL;

-- Company members can read B2B invoices addressed to their company. New policy,
-- direct form, {authenticated}. The existing invoices policies (two-step form,
-- {public}) are left exactly as they are.
CREATE POLICY "invoices_company_member_select"
ON public.invoices FOR SELECT TO authenticated
USING (company_id IS NOT NULL AND is_company_member(company_id));

-- Guard: a B2B invoice is a financial record a company has approved costs
-- against. Contractors hold whole-row UPDATE and DELETE policies on their own
-- invoices, so without this they could edit the amount or delete it after the
-- fact. Status/payment fields stay writable (payments, webhook, void).
-- INSERT with company_id is only allowed from generate_b2b_invoice(), which sets
-- a transaction-local flag; a contractor cannot mint a B2B-flagged invoice
-- themselves and bypass approval.
CREATE OR REPLACE FUNCTION public.guard_b2b_invoice_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.company_id IS NOT NULL THEN
      RAISE EXCEPTION 'A B2B invoice cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.company_id IS NOT NULL
       AND COALESCE(current_setting('app.b2b_invoice_rpc', true), 'off') <> 'on' THEN
      RAISE EXCEPTION 'B2B invoices are created by generate_b2b_invoice only';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF OLD.company_id IS NULL AND NEW.company_id IS NOT NULL THEN
    RAISE EXCEPTION 'An existing invoice cannot be converted to a B2B invoice';
  END IF;

  IF OLD.company_id IS NOT NULL AND (
       NEW.company_id      IS DISTINCT FROM OLD.company_id
    OR NEW.engagement_id   IS DISTINCT FROM OLD.engagement_id
    OR NEW.period_start    IS DISTINCT FROM OLD.period_start
    OR NEW.period_end      IS DISTINCT FROM OLD.period_end
    OR NEW.contractor_id   IS DISTINCT FROM OLD.contractor_id
    OR NEW.recipient_id    IS DISTINCT FROM OLD.recipient_id
    OR NEW.client_name     IS DISTINCT FROM OLD.client_name
    OR NEW.client_email    IS DISTINCT FROM OLD.client_email
    OR NEW.invoice_number  IS DISTINCT FROM OLD.invoice_number
    OR NEW.items           IS DISTINCT FROM OLD.items
    OR NEW.subtotal        IS DISTINCT FROM OLD.subtotal
    OR NEW.tax_rate        IS DISTINCT FROM OLD.tax_rate
    OR NEW.tax_amount      IS DISTINCT FROM OLD.tax_amount
    OR NEW.total           IS DISTINCT FROM OLD.total
    OR NEW.issued_date     IS DISTINCT FROM OLD.issued_date
    OR NEW.due_date        IS DISTINCT FROM OLD.due_date
    OR NEW.currency        IS DISTINCT FROM OLD.currency
  ) THEN
    RAISE EXCEPTION 'The amount, lines and parties of a B2B invoice cannot be changed after it is generated';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_b2b_invoice_mutation_trigger
  BEFORE INSERT OR UPDATE OR DELETE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.guard_b2b_invoice_mutation();

-- =============================================================================
-- 2. work_order_costs
-- =============================================================================

CREATE TABLE public.work_order_costs (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id  uuid        NOT NULL REFERENCES public.work_orders(id),
  engagement_id  uuid        NOT NULL REFERENCES public.term_engagements(id),
  company_id     uuid        NOT NULL REFERENCES public.companies(id),
  contractor_id  uuid        NOT NULL REFERENCES public.profiles(id),

  kind           text        NOT NULL
                             CHECK (kind IN ('callout_standard', 'callout_ooh', 'hours', 'materials', 'other')),
  quantity       numeric     NOT NULL CHECK (quantity > 0),
  -- From the work order's rate_snapshot (callout/hours), or the contractor's
  -- own cost for materials/other. Never a live rate lookup.
  unit_rate      numeric     NOT NULL CHECK (unit_rate >= 0),
  markup_pct     numeric     CHECK (markup_pct >= 0),
  line_total     numeric     NOT NULL CHECK (line_total >= 0),
  description    text,

  status         text        NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'approved', 'queried', 'rejected')),

  queried_reason text,
  queried_at     timestamptz,
  queried_by     uuid,

  approved_by    uuid,
  approved_at    timestamptz,
  -- True when approved by the site's approval_threshold rather than a person.
  -- approved_by is then the company owner, so an approved line always has an
  -- approver on record.
  auto_approved  boolean     NOT NULL DEFAULT false,

  rejected_reason text,
  rejected_at     timestamptz,
  rejected_by     uuid,

  invoice_id     uuid        REFERENCES public.invoices(id),

  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT work_order_costs_markup_materials_check
    CHECK ((kind = 'materials') = (markup_pct IS NOT NULL)),
  CONSTRAINT work_order_costs_approved_has_approver_check
    CHECK (status <> 'approved' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
  CONSTRAINT work_order_costs_queried_has_reason_check
    CHECK (status <> 'queried' OR (queried_reason IS NOT NULL AND queried_at IS NOT NULL)),
  CONSTRAINT work_order_costs_rejected_has_reason_check
    CHECK (status <> 'rejected' OR (rejected_reason IS NOT NULL AND rejected_at IS NOT NULL)),
  CONSTRAINT work_order_costs_invoiced_is_approved_check
    CHECK (invoice_id IS NULL OR status = 'approved')
);

CREATE INDEX idx_work_order_costs_work_order_id ON public.work_order_costs (work_order_id);
CREATE INDEX idx_work_order_costs_company_status ON public.work_order_costs (company_id, status);
CREATE INDEX idx_work_order_costs_contractor_id ON public.work_order_costs (contractor_id);
CREATE INDEX idx_work_order_costs_invoice_id ON public.work_order_costs (invoice_id) WHERE invoice_id IS NOT NULL;

CREATE TRIGGER work_order_costs_updated_at
  BEFORE UPDATE ON public.work_order_costs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.work_order_costs ENABLE ROW LEVEL SECURITY;

-- Read-only from the client. Direct auth.uid() form.
CREATE POLICY "work_order_costs_contractor_select"
ON public.work_order_costs FOR SELECT TO authenticated
USING (contractor_id = auth.uid());

CREATE POLICY "work_order_costs_company_select"
ON public.work_order_costs FOR SELECT TO authenticated
USING (is_company_member(company_id));

REVOKE ALL ON public.work_order_costs FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.work_order_costs FROM authenticated;

-- =============================================================================
-- 3. Internal helpers (not callable by clients)
-- =============================================================================

-- WO-{code}-{0000}, matching src/hooks/useWorkOrders.ts formatWoNumber.
CREATE OR REPLACE FUNCTION public._work_order_ref(p_work_order_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'WO-' || regexp_replace(c.company_code, '^TS-B-', '') || '-' || lpad(wo.wo_number::text, 4, '0')
  FROM public.work_orders wo
  JOIN public.companies c ON c.id = wo.company_id
  WHERE wo.id = p_work_order_id;
$$;

-- The billing email a B2B invoice is addressed to. companies has two nullable
-- candidates; contact_email is the deliberate business-contact field and bare
-- email reads as a generic dashboard-era column, so prefer the first and fall
-- back to the second. NULL when both are empty — generate_b2b_invoice then
-- raises a clear message rather than inventing an address.
CREATE OR REPLACE FUNCTION public.company_billing_email(p_company_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(NULLIF(btrim(contact_email), ''), NULLIF(btrim(email), ''))
  FROM public.companies
  WHERE id = p_company_id;
$$;

-- approval_threshold for a work order's site, falling back to the company
-- default. NULL means "approval required": no config row at all fails closed.
-- STRICT so a duplicate row raises instead of silently picking one (the unique
-- indexes make that impossible; if it ever happened it must be loud).
CREATE OR REPLACE FUNCTION public._work_order_approval_threshold(p_company_id uuid, p_site_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_site    numeric;
  v_default numeric;
BEGIN
  IF p_site_id IS NOT NULL THEN
    BEGIN
      SELECT approval_threshold INTO STRICT v_site
      FROM public.site_autonomy_config
      WHERE company_id = p_company_id AND site_id = p_site_id;
    EXCEPTION WHEN no_data_found THEN
      v_site := NULL;
    END;
  END IF;

  IF v_site IS NOT NULL THEN
    RETURN v_site;
  END IF;

  BEGIN
    SELECT approval_threshold INTO STRICT v_default
    FROM public.site_autonomy_config
    WHERE company_id = p_company_id AND site_id IS NULL;
  EXCEPTION WHEN no_data_found THEN
    v_default := NULL;
  END;

  RETURN v_default;
END;
$$;

-- Prices one component from the work order's snapshot. quantity/unit_rate/
-- markup_pct/line_total come back ready to store. Callouts are always quantity
-- 1 (a second visit is a second line). Materials: the contractor supplies their
-- cost, the snapshot supplies the markup.
CREATE OR REPLACE FUNCTION public._price_cost_line(
  p_snapshot jsonb,
  p_kind text,
  p_quantity numeric,
  p_unit_cost numeric,
  OUT o_quantity numeric,
  OUT o_unit_rate numeric,
  OUT o_markup_pct numeric,
  OUT o_line_total numeric
)
RETURNS record
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  o_markup_pct := NULL;

  IF p_kind IN ('callout_standard', 'callout_ooh') THEN
    o_quantity := 1;
    o_unit_rate := (p_snapshot ->> p_kind)::numeric;
    IF o_unit_rate IS NULL THEN
      RAISE EXCEPTION 'This work order''s rate snapshot has no % rate', p_kind;
    END IF;
    o_line_total := round(o_quantity * o_unit_rate, 2);

  ELSIF p_kind = 'hours' THEN
    IF p_quantity IS NULL OR p_quantity <= 0 THEN
      RAISE EXCEPTION 'Hours must be greater than zero';
    END IF;
    o_quantity := p_quantity;
    o_unit_rate := (p_snapshot ->> 'hourly_rate')::numeric;
    IF o_unit_rate IS NULL THEN
      RAISE EXCEPTION 'This work order''s rate snapshot has no hourly rate';
    END IF;
    o_line_total := round(o_quantity * o_unit_rate, 2);

  ELSIF p_kind = 'materials' THEN
    IF p_unit_cost IS NULL OR p_unit_cost < 0 THEN
      RAISE EXCEPTION 'Materials cost is required';
    END IF;
    o_quantity := COALESCE(NULLIF(p_quantity, 0), 1);
    IF o_quantity <= 0 THEN
      RAISE EXCEPTION 'Quantity must be greater than zero';
    END IF;
    o_unit_rate := p_unit_cost;
    o_markup_pct := (p_snapshot ->> 'materials_markup_pct')::numeric;
    IF o_markup_pct IS NULL THEN
      RAISE EXCEPTION 'This work order''s rate snapshot has no materials markup';
    END IF;
    o_line_total := round(o_quantity * o_unit_rate * (1 + o_markup_pct / 100), 2);

  ELSIF p_kind = 'other' THEN
    IF p_unit_cost IS NULL OR p_unit_cost < 0 THEN
      RAISE EXCEPTION 'An amount is required';
    END IF;
    o_quantity := COALESCE(NULLIF(p_quantity, 0), 1);
    IF o_quantity <= 0 THEN
      RAISE EXCEPTION 'Quantity must be greater than zero';
    END IF;
    o_unit_rate := p_unit_cost;
    o_line_total := round(o_quantity * o_unit_rate, 2);

  ELSE
    RAISE EXCEPTION 'Unknown cost kind: %', p_kind;
  END IF;
END;
$$;

-- Can the caller approve/query/reject lines on this work order? Company member
-- with coverage of the work order's site; the owner always can, which also
-- covers work orders with no site (can_access_site(NULL) is false, so those
-- lines would otherwise be permanently unapprovable).
CREATE OR REPLACE FUNCTION public._can_review_work_order_costs(p_company_id uuid, p_site_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT is_company_member(p_company_id)
     AND (is_company_owner(p_company_id) OR can_access_site(p_site_id));
$$;

REVOKE ALL ON FUNCTION public._work_order_ref(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.company_billing_email(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._work_order_approval_threshold(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._price_cost_line(jsonb, text, numeric, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._can_review_work_order_costs(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- =============================================================================
-- 4. Contractor RPCs: record and amend
-- =============================================================================

CREATE OR REPLACE FUNCTION public.submit_work_order_cost(
  p_work_order_id uuid,
  p_kind text,
  p_quantity numeric DEFAULT NULL,
  p_unit_cost numeric DEFAULT NULL,
  p_description text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wo         public.work_orders%ROWTYPE;
  v_qty        numeric;
  v_unit       numeric;
  v_markup     numeric;
  v_total      numeric;
  v_threshold  numeric;
  v_wo_total   numeric;
  v_auto       boolean;
  v_owner      uuid;
  v_id         uuid;
BEGIN
  -- Row lock serialises concurrent submissions so the running-total threshold
  -- check below cannot be raced past.
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

  -- Absent configuration fails closed: NULL threshold => explicit approval.
  v_threshold := public._work_order_approval_threshold(v_wo.company_id, v_wo.site_id);

  SELECT COALESCE(sum(line_total), 0) + v_total INTO v_wo_total
  FROM public.work_order_costs
  WHERE work_order_id = v_wo.id AND status <> 'rejected';

  v_auto := v_threshold IS NOT NULL AND v_wo_total < v_threshold;

  SELECT owner_id INTO v_owner FROM public.companies WHERE id = v_wo.company_id;

  INSERT INTO public.work_order_costs (
    work_order_id, engagement_id, company_id, contractor_id,
    kind, quantity, unit_rate, markup_pct, line_total, description,
    status, approved_by, approved_at, auto_approved
  ) VALUES (
    v_wo.id, v_wo.engagement_id, v_wo.company_id, auth.uid(),
    p_kind, v_qty, v_unit, v_markup, v_total, NULLIF(btrim(p_description), ''),
    CASE WHEN v_auto THEN 'approved' ELSE 'pending' END,
    CASE WHEN v_auto THEN v_owner END,
    CASE WHEN v_auto THEN now() END,
    v_auto
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Amend a line that is still pending or was queried. A queried line goes back
-- to pending (pending -> queried -> pending); it is NOT re-auto-approved, a
-- resubmission always needs the reviewer's explicit approval. The last query
-- reason is kept for the audit trail.
CREATE OR REPLACE FUNCTION public.amend_work_order_cost(
  p_cost_id uuid,
  p_quantity numeric DEFAULT NULL,
  p_unit_cost numeric DEFAULT NULL,
  p_description text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

-- =============================================================================
-- 5. Reviewer RPCs: approve / query / reject
-- =============================================================================

CREATE OR REPLACE FUNCTION public.approve_work_order_cost(p_cost_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cost public.work_order_costs%ROWTYPE;
  v_site uuid;
BEGIN
  SELECT * INTO v_cost FROM public.work_order_costs WHERE id = p_cost_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cost line not found';
  END IF;

  SELECT site_id INTO v_site FROM public.work_orders WHERE id = v_cost.work_order_id;
  IF NOT public._can_review_work_order_costs(v_cost.company_id, v_site) THEN
    RAISE EXCEPTION 'Not authorised to review costs on this work order';
  END IF;

  IF v_cost.status <> 'pending' THEN
    RAISE EXCEPTION 'Only a pending cost line can be approved (status: %)', v_cost.status;
  END IF;

  UPDATE public.work_order_costs
  SET status = 'approved', approved_by = auth.uid(), approved_at = now(), auto_approved = false
  WHERE id = p_cost_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.query_work_order_cost(p_cost_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cost public.work_order_costs%ROWTYPE;
  v_site uuid;
BEGIN
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'A reason is required when querying a cost line';
  END IF;

  SELECT * INTO v_cost FROM public.work_order_costs WHERE id = p_cost_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cost line not found';
  END IF;

  SELECT site_id INTO v_site FROM public.work_orders WHERE id = v_cost.work_order_id;
  IF NOT public._can_review_work_order_costs(v_cost.company_id, v_site) THEN
    RAISE EXCEPTION 'Not authorised to review costs on this work order';
  END IF;

  IF v_cost.status <> 'pending' THEN
    RAISE EXCEPTION 'Only a pending cost line can be queried (status: %)', v_cost.status;
  END IF;

  UPDATE public.work_order_costs
  SET status = 'queried', queried_reason = btrim(p_reason), queried_at = now(), queried_by = auth.uid()
  WHERE id = p_cost_id;

  -- In-app notification. Non-fatal: a failed notification must not roll back
  -- the query itself. None of the existing notify-* edge functions fit (they
  -- are keyed to invoice/quote/enquiry contexts), so no email is sent here.
  BEGIN
    INSERT INTO public.notifications (user_id, title, message, type, reference_type, reference_id)
    VALUES (
      v_cost.contractor_id,
      'Cost line queried',
      'A cost line on ' || public._work_order_ref(v_cost.work_order_id) || ' was queried: '
        || btrim(p_reason) || '. Amend and resubmit it from your work orders.',
      'work_order_cost_queried',
      'work_order_costs',
      v_cost.id
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'query_work_order_cost: notification for cost line % failed: %', v_cost.id, SQLERRM;
  END;
END;
$$;

-- Terminal: a rejected line never invoices and never rolls forward.
CREATE OR REPLACE FUNCTION public.reject_work_order_cost(p_cost_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cost public.work_order_costs%ROWTYPE;
  v_site uuid;
BEGIN
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'A reason is required when rejecting a cost line';
  END IF;

  SELECT * INTO v_cost FROM public.work_order_costs WHERE id = p_cost_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cost line not found';
  END IF;

  SELECT site_id INTO v_site FROM public.work_orders WHERE id = v_cost.work_order_id;
  IF NOT public._can_review_work_order_costs(v_cost.company_id, v_site) THEN
    RAISE EXCEPTION 'Not authorised to review costs on this work order';
  END IF;

  IF v_cost.status NOT IN ('pending', 'queried') THEN
    RAISE EXCEPTION 'Only a pending or queried cost line can be rejected (status: %)', v_cost.status;
  END IF;

  UPDATE public.work_order_costs
  SET status = 'rejected', rejected_reason = btrim(p_reason), rejected_at = now(), rejected_by = auth.uid()
  WHERE id = p_cost_id;

  BEGIN
    INSERT INTO public.notifications (user_id, title, message, type, reference_type, reference_id)
    VALUES (
      v_cost.contractor_id,
      'Cost line rejected',
      'A cost line on ' || public._work_order_ref(v_cost.work_order_id) || ' was rejected: ' || btrim(p_reason) || '.',
      'work_order_cost_rejected',
      'work_order_costs',
      v_cost.id
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'reject_work_order_cost: notification for cost line % failed: %', v_cost.id, SQLERRM;
  END;
END;
$$;

-- =============================================================================
-- 6. Period boundaries and the live statement view
-- =============================================================================

-- calendar_month -> the calendar month containing p_on.
-- custom -> anchor day to the day before the next anchor day (anchor is 1-28,
-- enforced on term_engagements, so it exists in every month).
CREATE OR REPLACE FUNCTION public.engagement_billing_period(p_billing_period text, p_anchor integer, p_on date)
RETURNS TABLE (period_start date, period_end date)
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT x.s, (x.s + interval '1 month' - interval '1 day')::date
  FROM (
    SELECT CASE
      WHEN p_billing_period = 'custom' THEN
        CASE
          WHEN extract(day FROM p_on) >= p_anchor
            THEN make_date(extract(year FROM p_on)::int, extract(month FROM p_on)::int, p_anchor)
          ELSE (make_date(extract(year FROM p_on)::int, extract(month FROM p_on)::int, p_anchor) - interval '1 month')::date
        END
      ELSE date_trunc('month', p_on)::date
    END AS s
  ) x;
$$;

GRANT EXECUTE ON FUNCTION public.engagement_billing_period(text, integer, date) TO authenticated;

-- Live per-engagement (= per-contractor) statement for the CURRENT period.
-- Approved-and-due and the open figures include lines recorded in earlier
-- periods that were never invoiced — queried and unapproved lines roll forward
-- simply by not being collected. security_invoker: the underlying tables carry
-- correct RLS for both parties, so this is display convenience, not a new
-- access boundary.
CREATE OR REPLACE VIEW public.work_order_cost_period_statement WITH (security_invoker = true) AS
SELECT
  te.company_id,
  te.contractor_id,
  te.id AS engagement_id,
  b.period_start,
  b.period_end,
  COALESCE(sum(c.line_total) FILTER (WHERE c.status = 'approved' AND c.invoice_id IS NULL AND c.created_at::date <= b.period_end), 0) AS approved_due,
  COALESCE(sum(c.line_total) FILTER (WHERE c.status = 'pending' AND c.created_at::date <= b.period_end), 0)                          AS awaiting_approval,
  COALESCE(sum(c.line_total) FILTER (WHERE c.status = 'queried' AND c.created_at::date <= b.period_end), 0)                          AS queried,
  count(c.id) FILTER (WHERE c.status = 'approved' AND c.invoice_id IS NULL AND c.created_at::date <= b.period_end) AS approved_count,
  count(c.id) FILTER (WHERE c.status = 'pending' AND c.created_at::date <= b.period_end)                          AS pending_count,
  count(c.id) FILTER (WHERE c.status = 'queried' AND c.created_at::date <= b.period_end)                          AS queried_count
FROM public.term_engagements te
CROSS JOIN LATERAL public.engagement_billing_period(te.billing_period, te.billing_anchor_day, CURRENT_DATE) b
LEFT JOIN public.work_order_costs c ON c.engagement_id = te.id
WHERE te.status IN ('active', 'suspended', 'notice_given')
GROUP BY te.company_id, te.contractor_id, te.id, b.period_start, b.period_end;

GRANT SELECT ON public.work_order_cost_period_statement TO authenticated;

-- =============================================================================
-- 7. Invoice generation
-- =============================================================================

-- Only for a CLOSED period (p_period_end < CURRENT_DATE). Collects every
-- APPROVED, not-yet-invoiced cost line for this company and
-- contractor recorded on or before p_period_end (earlier lines that were never
-- collected roll into this invoice) and writes one invoice: lines in items jsonb
-- for display, work_order_costs.invoice_id for traceability. 30-day due date,
-- status 'sent' (the payer pays via the normal create_client_secret path; this
-- does not go through the contractor-token send_invoice action).
--
-- Minimum charge is per work order: where a work order's collected lines fall
-- short of the snapshot's minimum_charge, an adjustment entry is added to items
-- (never a work_order_costs row). Applied only the first time a work order is
-- invoiced (no line of it previously invoiced), so a later invoice for further
-- lines on the same work order does not top up a second time.
CREATE OR REPLACE FUNCTION public.generate_b2b_invoice(
  p_company_id uuid,
  p_contractor_id uuid,
  p_period_start date,
  p_period_end date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids          uuid[];
  v_engagements  uuid[];
  v_email        text;
  v_company      public.companies%ROWTYPE;
  v_vat          boolean;
  v_items        jsonb := '[]'::jsonb;
  v_subtotal     numeric := 0;
  v_tax_rate     numeric;
  v_tax          numeric;
  v_total        numeric;
  v_invoice_id   uuid;
  r              record;
  v_min          numeric;
BEGIN
  IF NOT is_company_member(p_company_id) THEN
    RAISE EXCEPTION 'Not authorised to generate invoices for this company';
  END IF;

  IF p_period_start IS NULL OR p_period_end IS NULL OR p_period_start > p_period_end THEN
    RAISE EXCEPTION 'Invalid billing period';
  END IF;

  -- The RPC is the gate, not the UI: an invoice can only be generated once its
  -- period has closed.
  IF p_period_end >= CURRENT_DATE THEN
    RAISE EXCEPTION 'This billing period has not closed yet (it ends on %). An invoice can be generated once it has.', p_period_end;
  END IF;

  v_email := public.company_billing_email(p_company_id);
  IF v_email IS NULL OR btrim(v_email) = '' THEN
    RAISE EXCEPTION 'This company has no billing email set. Set a billing email in your company settings before generating an invoice.';
  END IF;

  SELECT * INTO v_company FROM public.companies WHERE id = p_company_id;

  SELECT array_agg(id) INTO v_ids
  FROM (
    SELECT id
    FROM public.work_order_costs
    WHERE company_id = p_company_id
      AND contractor_id = p_contractor_id
      AND status = 'approved'
      AND invoice_id IS NULL
      AND created_at::date <= p_period_end
    FOR UPDATE
  ) locked;

  IF v_ids IS NULL THEN
    RAISE EXCEPTION 'There are no approved cost lines to invoice for this contractor';
  END IF;

  SELECT array_agg(DISTINCT engagement_id) INTO v_engagements
  FROM public.work_order_costs WHERE id = ANY (v_ids);

  IF array_length(v_engagements, 1) > 1 THEN
    RAISE EXCEPTION 'The approved lines span more than one engagement; invoice them separately';
  END IF;

  FOR r IN
    SELECT c.id, c.kind, c.quantity, c.line_total, c.description, c.work_order_id, c.created_at
    FROM public.work_order_costs c
    JOIN public.work_orders wo ON wo.id = c.work_order_id
    WHERE c.id = ANY (v_ids)
    ORDER BY wo.wo_number, c.created_at
  LOOP
    v_items := v_items || jsonb_build_object(
      'description',
        public._work_order_ref(r.work_order_id) || ' — ' ||
        CASE r.kind
          WHEN 'callout_standard' THEN 'Standard call-out'
          WHEN 'callout_ooh'      THEN 'Out-of-hours call-out'
          WHEN 'hours'            THEN 'Labour (hours)'
          WHEN 'materials'        THEN 'Materials'
          ELSE 'Other'
        END ||
        CASE WHEN r.description IS NOT NULL THEN ': ' || r.description ELSE '' END,
      'quantity',   r.quantity,
      'unit_price', round(r.line_total / r.quantity, 2),
      'total',      r.line_total
    );
    v_subtotal := v_subtotal + r.line_total;
  END LOOP;

  FOR r IN
    SELECT wo.id AS wo_id, wo.rate_snapshot, sum(c.line_total) AS collected
    FROM public.work_order_costs c
    JOIN public.work_orders wo ON wo.id = c.work_order_id
    WHERE c.id = ANY (v_ids)
    GROUP BY wo.id, wo.wo_number, wo.rate_snapshot
    ORDER BY wo.wo_number
  LOOP
    v_min := (r.rate_snapshot ->> 'minimum_charge')::numeric;
    IF v_min IS NOT NULL
       AND r.collected < v_min
       AND NOT EXISTS (
         SELECT 1 FROM public.work_order_costs x
         WHERE x.work_order_id = r.wo_id AND x.invoice_id IS NOT NULL
       )
    THEN
      v_items := v_items || jsonb_build_object(
        'description', public._work_order_ref(r.wo_id) || ' — Minimum charge adjustment',
        'quantity',    1,
        'unit_price',  v_min - r.collected,
        'total',       v_min - r.collected
      );
      v_subtotal := v_subtotal + (v_min - r.collected);
    END IF;
  END LOOP;

  SELECT COALESCE(vat_registered, false) INTO v_vat FROM public.profiles WHERE id = p_contractor_id;
  v_tax_rate := CASE WHEN v_vat THEN 20 ELSE 0 END;
  v_tax := round(v_subtotal * v_tax_rate / 100, 2);
  v_total := v_subtotal + v_tax;

  -- Transaction-local flag read by guard_b2b_invoice_mutation().
  PERFORM set_config('app.b2b_invoice_rpc', 'on', true);

  INSERT INTO public.invoices (
    contractor_id, recipient_id, client_name, client_email,
    items, subtotal, tax_rate, tax_amount, total, amount_due,
    status, sent_at, issued_date, due_date,
    company_id, engagement_id, period_start, period_end
  ) VALUES (
    p_contractor_id, v_company.owner_id, v_company.name, btrim(v_email),
    v_items, v_subtotal, v_tax_rate, v_tax, v_total, v_total,
    'sent', now(), CURRENT_DATE, CURRENT_DATE + 30,
    p_company_id, v_engagements[1], p_period_start, p_period_end
  )
  RETURNING id INTO v_invoice_id;

  PERFORM set_config('app.b2b_invoice_rpc', 'off', true);

  UPDATE public.work_order_costs SET invoice_id = v_invoice_id WHERE id = ANY (v_ids);

  RETURN v_invoice_id;
END;
$$;

-- =============================================================================
-- 8. Grants
-- =============================================================================

REVOKE ALL ON FUNCTION public.submit_work_order_cost(uuid, text, numeric, numeric, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.amend_work_order_cost(uuid, numeric, numeric, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.approve_work_order_cost(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.query_work_order_cost(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reject_work_order_cost(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.generate_b2b_invoice(uuid, uuid, date, date) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.submit_work_order_cost(uuid, text, numeric, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.amend_work_order_cost(uuid, numeric, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_work_order_cost(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.query_work_order_cost(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_work_order_cost(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_b2b_invoice(uuid, uuid, date, date) TO authenticated;
