-- Work Orders & Direct Dispatch — Slice B. Site contacts, service request
-- submission, FM triage, auto-dispatch. Builds on Slice A's work_orders /
-- site_autonomy_config / service_request_categories / service_requests
-- (20260804100000_work_orders.sql).

-- =============================================================================
-- 1. site_contacts — lightweight users scoped to a site. NOT full
--    TradeStone profiles — no row in `profiles` is created for these.
-- =============================================================================

CREATE TABLE public.site_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  site_id uuid NOT NULL REFERENCES public.sites(id),

  -- Auth
  user_id uuid REFERENCES auth.users(id),
  email text NOT NULL,
  full_name text NOT NULL,
  phone text,
  role text,

  -- Invite
  invite_token uuid DEFAULT gen_random_uuid(),
  invite_sent_at timestamptz,
  invite_accepted_at timestamptz,

  -- Status
  is_active boolean NOT NULL DEFAULT true,

  -- What they can do (derived from site_autonomy_config, but cached here
  -- for quick RLS checks)
  can_raise_requests boolean NOT NULL DEFAULT true,
  can_select_contractor boolean NOT NULL DEFAULT false,
  can_search_marketplace boolean NOT NULL DEFAULT false,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (company_id, site_id, email)
);

ALTER TABLE public.site_contacts ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER site_contacts_updated_at
  BEFORE UPDATE ON public.site_contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "site_contacts_select"
  ON public.site_contacts FOR SELECT
  TO authenticated
  USING (is_company_member(company_id) OR user_id = auth.uid());

CREATE POLICY "site_contacts_insert"
  ON public.site_contacts FOR INSERT
  TO authenticated
  WITH CHECK (is_company_member(company_id));

CREATE POLICY "site_contacts_update"
  ON public.site_contacts FOR UPDATE
  TO authenticated
  USING (is_company_member(company_id))
  WITH CHECK (is_company_member(company_id));

CREATE POLICY "site_contacts_delete"
  ON public.site_contacts FOR DELETE
  TO authenticated
  USING (is_company_member(company_id));

CREATE INDEX idx_site_contacts_company_id ON public.site_contacts(company_id);
CREATE INDEX idx_site_contacts_site_id ON public.site_contacts(site_id);
CREATE INDEX idx_site_contacts_user_id ON public.site_contacts(user_id) WHERE user_id IS NOT NULL;

-- =============================================================================
-- 2. is_site_contact() — SECURITY DEFINER helper, same allowlist idiom as
--    is_company_member()/is_company_owner().
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_site_contact(p_company_id uuid, p_site_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.site_contacts
    WHERE company_id = p_company_id
    AND site_id = p_site_id
    AND user_id = auth.uid()
    AND is_active = true
  );
$$;

REVOKE ALL ON FUNCTION public.is_site_contact(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_site_contact(uuid, uuid) TO authenticated;

-- =============================================================================
-- 3. Slice A policy extensions — site contacts can read categories for
--    their company, and can raise requests at their own site.
-- =============================================================================

CREATE POLICY "service_request_categories_site_contact_select"
  ON public.service_request_categories FOR SELECT
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT user_id FROM public.site_contacts
      WHERE company_id = service_request_categories.company_id AND is_active = true
    )
  );

DROP POLICY IF EXISTS "service_requests_insert" ON public.service_requests;

CREATE POLICY "service_requests_insert"
  ON public.service_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    is_company_member(company_id)
    OR auth.uid() IN (
      SELECT user_id FROM public.site_contacts
      WHERE company_id = service_requests.company_id
      AND site_id = service_requests.site_id
      AND is_active = true
    )
  );

-- Site contacts can also read/cancel their own requests (SELECT was
-- already `is_company_member OR requested_by = auth.uid()` in Slice A,
-- which already covers a site contact reading their own row — no change
-- needed there. requested_by = auth.uid() works because site contacts
-- authenticate as normal auth.users rows, same as everyone else).

-- =============================================================================
-- 4. Auto-dispatch — fires on service_requests INSERT when the site's
--    (or company default's) autonomy_level >= 2 and a matching rule exists.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.process_auto_dispatch()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_config site_autonomy_config%ROWTYPE;
  v_rule jsonb;
  v_category_name text;
  v_engagement_id uuid;
  v_wo_id uuid;
BEGIN
  -- Only fire on INSERT with status = 'open'
  IF NEW.status != 'open' THEN
    RETURN NEW;
  END IF;

  -- Get site autonomy config (site-specific, fall back to company default)
  SELECT * INTO v_config FROM site_autonomy_config
  WHERE company_id = NEW.company_id
  AND (site_id = NEW.site_id OR site_id IS NULL)
  ORDER BY site_id NULLS LAST
  LIMIT 1;

  IF NOT FOUND OR v_config.autonomy_level < 2 THEN
    RETURN NEW;  -- Level 1: no auto-dispatch
  END IF;

  -- Check auto-dispatch rules
  IF v_config.auto_dispatch_rules IS NOT NULL AND
     jsonb_array_length(v_config.auto_dispatch_rules) > 0 THEN

    -- Get category name
    SELECT name INTO v_category_name FROM service_request_categories
    WHERE id = NEW.category_id;

    -- Find matching rule
    FOR v_rule IN SELECT * FROM jsonb_array_elements(v_config.auto_dispatch_rules)
    LOOP
      IF v_rule->>'category' = v_category_name THEN
        v_engagement_id := (v_rule->>'engagement_id')::uuid;

        -- Verify engagement is still active
        IF EXISTS (
          SELECT 1 FROM term_engagements
          WHERE id = v_engagement_id AND status = 'active'
        ) THEN
          -- Create work order
          INSERT INTO work_orders (
            company_id, raised_by, raised_by_name, service_request_id,
            site_id, asset_id, title, description, trade_required,
            priority, dispatched_to, engagement_id, dispatched_at,
            response, status
          )
          SELECT
            NEW.company_id, NEW.requested_by, NEW.requested_by_name,
            NEW.id, NEW.site_id, NULL, NEW.title, NEW.description,
            v_rule->>'trade',
            COALESCE(v_rule->>'priority', NEW.priority),
            te.contractor_id, v_engagement_id, now(),
            'pending', 'dispatched'
          FROM term_engagements te WHERE te.id = v_engagement_id
          RETURNING id INTO v_wo_id;

          -- Update service request
          NEW.status := 'dispatched';
          NEW.work_order_id := v_wo_id;

          -- Notify contractor
          INSERT INTO notifications (user_id, title, message, type, reference_type, reference_id)
          SELECT p.user_id,
            'Auto-dispatched work order',
            NEW.title || ' at ' || (SELECT name FROM sites WHERE id = NEW.site_id),
            'work_order_dispatched', 'work_order', v_wo_id
          FROM profiles p
          JOIN term_engagements te ON te.contractor_id = p.id
          WHERE te.id = v_engagement_id;
        END IF;

        EXIT;  -- Stop after first matching rule
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER auto_dispatch_service_request
  BEFORE INSERT ON public.service_requests
  FOR EACH ROW EXECUTE FUNCTION public.process_auto_dispatch();
