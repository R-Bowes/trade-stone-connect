-- Work Orders & Direct Dispatch — Slice A. Purely additive: no changes to
-- existing RPCs (create_callout_job, raise_callout) or tables.

-- =============================================================================
-- 0. business_counters — extend entity CHECK to allow 'work_order', same
--    allocator (next_business_document_number) as engagement_number.
-- =============================================================================

DO $$
DECLARE
  v_conname text;
BEGIN
  SELECT conname INTO v_conname
  FROM pg_constraint
  WHERE conrelid = 'public.business_counters'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%entity%';

  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.business_counters DROP CONSTRAINT %I', v_conname);
  END IF;
END $$;

ALTER TABLE public.business_counters
  ADD CONSTRAINT business_counters_entity_check
  CHECK (entity IN ('tender', 'engagement', 'work_order'));

-- =============================================================================
-- 1. work_orders — the dispatch record.
-- =============================================================================

CREATE TABLE public.work_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),

  -- Source
  raised_by uuid NOT NULL REFERENCES auth.users(id),
  raised_by_name text,
  service_request_id uuid,  -- FK added in Slice B

  -- Location
  site_id uuid REFERENCES public.sites(id),
  asset_id uuid REFERENCES public.assets(id),

  -- Details
  wo_number serial,
  title text NOT NULL,
  description text,
  trade_required text,
  priority text NOT NULL DEFAULT 'routine'
    CHECK (priority IN ('emergency', 'urgent', 'routine', 'planned')),

  -- Dispatch
  dispatched_to uuid REFERENCES public.profiles(id),
  engagement_id uuid REFERENCES public.term_engagements(id),
  dispatched_at timestamptz,

  -- Contractor response
  response text CHECK (response IN ('accepted', 'declined', 'pending')),
  responded_at timestamptz,
  decline_reason text,

  -- Resulting job
  job_id uuid REFERENCES public.jobs(id),

  -- Rates (snapshot from engagement_rates at dispatch time)
  rate_snapshot jsonb,

  -- Status
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'dispatched', 'accepted', 'declined',
                       'reassigned', 'cancelled', 'completed')),

  -- Spend control (for Slice B autonomy)
  estimated_cost numeric,
  requires_approval boolean NOT NULL DEFAULT false,
  approved_by uuid,
  approved_at timestamptz,

  -- Photos
  photos jsonb DEFAULT '[]'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.work_orders ENABLE ROW LEVEL SECURITY;

-- wo_number: per-company sequential, same idiom as assign_engagement_number
-- (20260711130000) — overrides the `serial` column's global-sequence
-- default with a per-company value from next_business_document_number, so
-- the schema's literal `wo_number serial` type is kept (as given in the
-- brief) while the actual numbers assigned are per-company as required for
-- the WO-{company_code}-{wo_number} display format.
CREATE OR REPLACE FUNCTION public.assign_wo_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.wo_number := next_business_document_number(NEW.company_id, 'work_order');
  RETURN NEW;
END;
$$;

CREATE TRIGGER assign_wo_number_trigger
  BEFORE INSERT ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION public.assign_wo_number();

CREATE TRIGGER work_orders_updated_at
  BEFORE UPDATE ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "work_orders_select"
  ON public.work_orders FOR SELECT
  TO authenticated
  USING (is_company_member(company_id) OR dispatched_to = auth.uid());

CREATE POLICY "work_orders_insert"
  ON public.work_orders FOR INSERT
  TO authenticated
  WITH CHECK (is_company_member(company_id));

-- Contractor can only update while responding to an active dispatch.
CREATE POLICY "work_orders_update"
  ON public.work_orders FOR UPDATE
  TO authenticated
  USING (is_company_member(company_id) OR (dispatched_to = auth.uid() AND status = 'dispatched'))
  WITH CHECK (is_company_member(company_id) OR (dispatched_to = auth.uid() AND status = 'dispatched'));

CREATE INDEX idx_work_orders_company_id ON public.work_orders(company_id);
CREATE INDEX idx_work_orders_dispatched_to ON public.work_orders(dispatched_to);
CREATE INDEX idx_work_orders_site_id ON public.work_orders(site_id);
CREATE INDEX idx_work_orders_status ON public.work_orders(status);

-- =============================================================================
-- 2. site_autonomy_config — schema for Slice B, used now to seed defaults.
-- =============================================================================

CREATE TABLE public.site_autonomy_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  site_id uuid REFERENCES public.sites(id),

  -- Level 1-4. NULL site_id = company default.
  autonomy_level integer NOT NULL DEFAULT 1
    CHECK (autonomy_level BETWEEN 1 AND 4),

  -- Spend controls
  max_wo_value numeric,
  max_monthly_spend numeric,
  approval_threshold numeric,

  -- Allowed categories (null = all allowed)
  allowed_categories jsonb,

  -- Auto-dispatch rules
  auto_dispatch_rules jsonb DEFAULT '[]'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (company_id, site_id)
);

ALTER TABLE public.site_autonomy_config ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER site_autonomy_config_updated_at
  BEFORE UPDATE ON public.site_autonomy_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "site_autonomy_config_select"
  ON public.site_autonomy_config FOR SELECT
  TO authenticated
  USING (is_company_member(company_id));

CREATE POLICY "site_autonomy_config_insert"
  ON public.site_autonomy_config FOR INSERT
  TO authenticated
  WITH CHECK (is_company_member(company_id));

CREATE POLICY "site_autonomy_config_update"
  ON public.site_autonomy_config FOR UPDATE
  TO authenticated
  USING (is_company_member(company_id))
  WITH CHECK (is_company_member(company_id));

-- =============================================================================
-- 3. service_request_categories — schema for Slice B, used now.
-- =============================================================================

CREATE TABLE public.service_request_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  name text NOT NULL,
  trade text,
  default_priority text DEFAULT 'routine'
    CHECK (default_priority IN ('emergency', 'urgent', 'routine', 'planned')),
  description text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.service_request_categories ENABLE ROW LEVEL SECURITY;

-- "OR site contacts" (Slice B) not implemented yet — no site-contact
-- concept exists in the schema until that slice lands.
CREATE POLICY "service_request_categories_select"
  ON public.service_request_categories FOR SELECT
  TO authenticated
  USING (is_company_member(company_id));

CREATE POLICY "service_request_categories_insert"
  ON public.service_request_categories FOR INSERT
  TO authenticated
  WITH CHECK (is_company_member(company_id));

CREATE POLICY "service_request_categories_update"
  ON public.service_request_categories FOR UPDATE
  TO authenticated
  USING (is_company_member(company_id))
  WITH CHECK (is_company_member(company_id));

CREATE POLICY "service_request_categories_delete"
  ON public.service_request_categories FOR DELETE
  TO authenticated
  USING (is_company_member(company_id));

-- =============================================================================
-- 4. service_requests — schema for Slice B UI, used now.
-- =============================================================================

CREATE TABLE public.service_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  site_id uuid NOT NULL REFERENCES public.sites(id),

  -- Requester
  requested_by uuid NOT NULL REFERENCES auth.users(id),
  requested_by_name text,
  requested_by_role text,

  -- Details
  category_id uuid REFERENCES public.service_request_categories(id),
  title text NOT NULL,
  description text,
  priority text NOT NULL DEFAULT 'routine'
    CHECK (priority IN ('emergency', 'urgent', 'routine', 'planned')),
  location_in_site text,
  photos jsonb DEFAULT '[]'::jsonb,

  -- Triage
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'triaged', 'dispatched', 'cancelled', 'completed')),
  triaged_by uuid,
  triaged_at timestamptz,
  triage_notes text,

  -- Link to work order (set when FM creates WO from this request)
  work_order_id uuid REFERENCES public.work_orders(id),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.service_requests ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER service_requests_updated_at
  BEFORE UPDATE ON public.service_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "service_requests_select"
  ON public.service_requests FOR SELECT
  TO authenticated
  USING (is_company_member(company_id) OR requested_by = auth.uid());

-- "OR site contact" (Slice B) not implemented yet, same reason as above.
CREATE POLICY "service_requests_insert"
  ON public.service_requests FOR INSERT
  TO authenticated
  WITH CHECK (is_company_member(company_id));

CREATE POLICY "service_requests_update"
  ON public.service_requests FOR UPDATE
  TO authenticated
  USING (is_company_member(company_id))
  WITH CHECK (is_company_member(company_id));

-- FK from work_orders.service_request_id, added now that service_requests
-- exists (the brief said "FK added in Slice B" for the column itself, but
-- the referenced table is created in this same migration, so the
-- constraint can be added immediately rather than left dangling).
ALTER TABLE public.work_orders
  ADD CONSTRAINT work_orders_service_request_id_fkey
  FOREIGN KEY (service_request_id) REFERENCES public.service_requests(id);

CREATE INDEX idx_service_requests_company_id ON public.service_requests(company_id);
CREATE INDEX idx_service_requests_site_id ON public.service_requests(site_id);
CREATE INDEX idx_service_requests_status ON public.service_requests(status);
