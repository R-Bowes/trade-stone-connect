-- Baseline companion to 20260709140000: the 5 tables that were deferred
-- pending live enum labels and the update_updated_at() trigger function body
-- (both now confirmed via pg_enum / pg_get_functiondef against the live DB —
-- see conversation history, not inferred). No-op against the live DB; makes
-- fresh environments reproducible.
--
-- Covers: assets, service_contracts, service_documents, service_schedules,
-- service_visits.

-- ============================================================================
-- 1. ENUM TYPES (guarded — CREATE TYPE has no IF NOT EXISTS, so check pg_type)
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'asset_category') THEN
    CREATE TYPE public.asset_category AS ENUM (
      'fire_safety','emergency_lighting','fire_suppression','fire_doors',
      'smoke_ventilation','electrical','lightning_protection','ups_systems',
      'solar_panels','ev_charging','hvac','boilers','air_handling',
      'ventilation','heat_pumps','chiller_systems','plumbing','water_hygiene',
      'water_treatment','drainage','rainwater_harvesting','gas',
      'gas_detection','security','access_control','cctv','intruder_alarms',
      'intercoms','lifts_lifting','escalators','loading_bays','roofing',
      'glazing','doors_windows','cladding','structural','grounds',
      'car_parks','drainage_external','pest_control','asbestos','legionella',
      'air_quality','waste_management','other'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'service_contract_status') THEN
    CREATE TYPE public.service_contract_status AS ENUM (
      'draft','active','expired','cancelled'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'service_document_type') THEN
    CREATE TYPE public.service_document_type AS ENUM (
      'certificate','report','invoice','photo','other'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'service_frequency') THEN
    CREATE TYPE public.service_frequency AS ENUM (
      'weekly','bi_weekly','monthly','bi_monthly','quarterly','six_monthly',
      'annual','2_yearly','3_yearly','4_yearly','5_yearly','6_yearly',
      '7_yearly','8_yearly','9_yearly','10_yearly'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'service_visit_status') THEN
    CREATE TYPE public.service_visit_status AS ENUM (
      'scheduled','confirmed','completed','overdue','cancelled'
    );
  END IF;
END $$;

-- ============================================================================
-- 2. TRIGGER FUNCTION (unversioned live function — body confirmed via
--    pg_get_functiondef, safe to CREATE OR REPLACE with the exact live body)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$function$;

-- ============================================================================
-- 3. TABLES (topological order: assets -> service_contracts ->
--    service_schedules -> service_visits -> service_documents)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.assets (
  id                 uuid NOT NULL DEFAULT gen_random_uuid(),
  site_id            uuid NOT NULL,
  company_id         uuid NOT NULL,
  name               text NOT NULL,
  category           public.asset_category NOT NULL,
  description        text,
  make               text,
  model              text,
  serial_number      text,
  install_date       date,
  is_active          boolean DEFAULT true,
  created_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now(),
  location_note      text,
  warranty_expiry    date,
  last_serviced      date,
  next_service_due   date,
  status             text NOT NULL DEFAULT 'operational',
  reference          text,
  CONSTRAINT assets_pkey PRIMARY KEY (id),
  CONSTRAINT assets_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE,
  CONSTRAINT assets_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE CASCADE,
  CONSTRAINT assets_status_check CHECK (status = ANY (ARRAY['operational','faulty','decommissioned']))
);

CREATE TABLE IF NOT EXISTS public.service_contracts (
  id             uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL,
  contractor_id  uuid NOT NULL,
  site_id        uuid,
  title          text NOT NULL,
  description    text,
  start_date     date NOT NULL,
  end_date       date NOT NULL,
  annual_value   numeric(10,2),
  status         public.service_contract_status DEFAULT 'draft',
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now(),
  CONSTRAINT service_contracts_pkey PRIMARY KEY (id),
  CONSTRAINT service_contracts_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE,
  CONSTRAINT service_contracts_contractor_id_fkey FOREIGN KEY (contractor_id) REFERENCES public.profiles(id),
  CONSTRAINT service_contracts_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id)
);

CREATE TABLE IF NOT EXISTS public.service_schedules (
  id                  uuid NOT NULL DEFAULT gen_random_uuid(),
  contract_id         uuid NOT NULL,
  asset_id            uuid NOT NULL,
  frequency           public.service_frequency NOT NULL,
  last_completed_at   timestamptz,
  next_due_at         timestamptz NOT NULL,
  notice_days         integer DEFAULT 14,
  is_active           boolean DEFAULT true,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),
  CONSTRAINT service_schedules_pkey PRIMARY KEY (id),
  CONSTRAINT service_schedules_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE CASCADE,
  CONSTRAINT service_schedules_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES public.service_contracts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.service_visits (
  id                       uuid NOT NULL DEFAULT gen_random_uuid(),
  schedule_id              uuid NOT NULL,
  asset_id                 uuid NOT NULL,
  contractor_id            uuid NOT NULL,
  company_id               uuid NOT NULL,
  scheduled_window_start   timestamptz NOT NULL,
  scheduled_window_end     timestamptz NOT NULL,
  confirmed_date           timestamptz,
  completed_at             timestamptz,
  status                   public.service_visit_status DEFAULT 'scheduled',
  notes                    text,
  created_at               timestamptz DEFAULT now(),
  updated_at               timestamptz DEFAULT now(),
  CONSTRAINT service_visits_pkey PRIMARY KEY (id),
  CONSTRAINT service_visits_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets(id),
  CONSTRAINT service_visits_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id),
  CONSTRAINT service_visits_contractor_id_fkey FOREIGN KEY (contractor_id) REFERENCES public.profiles(id),
  CONSTRAINT service_visits_schedule_id_fkey FOREIGN KEY (schedule_id) REFERENCES public.service_schedules(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.service_documents (
  id              uuid NOT NULL DEFAULT gen_random_uuid(),
  visit_id        uuid NOT NULL,
  uploaded_by     uuid NOT NULL,
  document_name   text NOT NULL,
  document_url    text NOT NULL,
  document_type   public.service_document_type DEFAULT 'other',
  created_at      timestamptz DEFAULT now(),
  CONSTRAINT service_documents_pkey PRIMARY KEY (id),
  CONSTRAINT service_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.profiles(id),
  CONSTRAINT service_documents_visit_id_fkey FOREIGN KEY (visit_id) REFERENCES public.service_visits(id) ON DELETE CASCADE
);

-- ============================================================================
-- 4. INDEXES (extras beyond the inline PK)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_assets_company_id ON public.assets(company_id);
CREATE INDEX IF NOT EXISTS idx_assets_site_id ON public.assets(site_id);

-- ============================================================================
-- 5. ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.assets              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_contracts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_schedules   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_visits      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_documents   ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 6. POLICIES (verbatim from live pg_policies)
-- ============================================================================

-- assets
DROP POLICY IF EXISTS "Assets accessible by company owner" ON public.assets;
CREATE POLICY "Assets accessible by company owner" ON public.assets FOR ALL
  USING (company_id IN (
    SELECT c.id FROM public.companies c JOIN public.profiles p ON p.id = c.owner_id
    WHERE p.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Assets readable by contractor via visit" ON public.assets;
CREATE POLICY "Assets readable by contractor via visit" ON public.assets FOR SELECT
  USING (id IN (
    SELECT service_visits.asset_id FROM public.service_visits
    WHERE service_visits.contractor_id IN (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid())
  ));

DROP POLICY IF EXISTS "assets_delete" ON public.assets;
CREATE POLICY "assets_delete" ON public.assets FOR DELETE TO authenticated
  USING (can_access_site(site_id));

DROP POLICY IF EXISTS "assets_insert" ON public.assets;
CREATE POLICY "assets_insert" ON public.assets FOR INSERT TO authenticated
  WITH CHECK (can_access_site(site_id));

DROP POLICY IF EXISTS "assets_select" ON public.assets;
CREATE POLICY "assets_select" ON public.assets FOR SELECT TO authenticated
  USING (can_access_site(site_id));

DROP POLICY IF EXISTS "assets_update" ON public.assets;
CREATE POLICY "assets_update" ON public.assets FOR UPDATE TO authenticated
  USING (can_access_site(site_id))
  WITH CHECK (can_access_site(site_id));

-- service_contracts
DROP POLICY IF EXISTS "Service contracts accessible by company owner" ON public.service_contracts;
CREATE POLICY "Service contracts accessible by company owner" ON public.service_contracts FOR ALL
  USING (company_id IN (
    SELECT c.id FROM public.companies c JOIN public.profiles p ON p.id = c.owner_id
    WHERE p.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Service contracts readable by contractor" ON public.service_contracts;
CREATE POLICY "Service contracts readable by contractor" ON public.service_contracts FOR SELECT
  USING (contractor_id IN (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid()));

DROP POLICY IF EXISTS "Service contracts readable by contractor via visit" ON public.service_contracts;
CREATE POLICY "Service contracts readable by contractor via visit" ON public.service_contracts FOR SELECT
  USING (contractor_id IN (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid()));

-- service_schedules
DROP POLICY IF EXISTS "Service schedules accessible by company owner" ON public.service_schedules;
CREATE POLICY "Service schedules accessible by company owner" ON public.service_schedules FOR ALL
  USING (contract_id IN (
    SELECT sc.id FROM public.service_contracts sc
    JOIN public.companies c ON c.id = sc.company_id
    JOIN public.profiles p ON p.id = c.owner_id
    WHERE p.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Service schedules readable by contractor" ON public.service_schedules;
CREATE POLICY "Service schedules readable by contractor" ON public.service_schedules FOR SELECT
  USING (contract_id IN (
    SELECT service_contracts.id FROM public.service_contracts
    WHERE service_contracts.contractor_id IN (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid())
  ));

DROP POLICY IF EXISTS "Service schedules readable by contractor via visit" ON public.service_schedules;
CREATE POLICY "Service schedules readable by contractor via visit" ON public.service_schedules FOR SELECT
  USING (id IN (
    SELECT service_visits.schedule_id FROM public.service_visits
    WHERE service_visits.contractor_id IN (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid())
  ));

-- service_visits
DROP POLICY IF EXISTS "Service visits accessible by company owner" ON public.service_visits;
CREATE POLICY "Service visits accessible by company owner" ON public.service_visits FOR ALL
  USING (company_id IN (
    SELECT c.id FROM public.companies c JOIN public.profiles p ON p.id = c.owner_id
    WHERE p.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Service visits accessible by contractor" ON public.service_visits;
CREATE POLICY "Service visits accessible by contractor" ON public.service_visits FOR ALL
  USING (contractor_id IN (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid()));

-- service_documents
DROP POLICY IF EXISTS "Service documents accessible by contractor" ON public.service_documents;
CREATE POLICY "Service documents accessible by contractor" ON public.service_documents FOR ALL
  USING (uploaded_by IN (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid()));

DROP POLICY IF EXISTS "Service documents readable by company owner" ON public.service_documents;
CREATE POLICY "Service documents readable by company owner" ON public.service_documents FOR SELECT
  USING (visit_id IN (
    SELECT sv.id FROM public.service_visits sv
    JOIN public.companies c ON c.id = sv.company_id
    JOIN public.profiles p ON p.id = c.owner_id
    WHERE p.user_id = auth.uid()
  ));

-- ============================================================================
-- 7. TRIGGERS
-- ============================================================================

DROP TRIGGER IF EXISTS assets_updated_at ON public.assets;
CREATE TRIGGER assets_updated_at
  BEFORE UPDATE ON public.assets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS service_contracts_updated_at ON public.service_contracts;
CREATE TRIGGER service_contracts_updated_at
  BEFORE UPDATE ON public.service_contracts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS service_schedules_updated_at ON public.service_schedules;
CREATE TRIGGER service_schedules_updated_at
  BEFORE UPDATE ON public.service_schedules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS service_visits_updated_at ON public.service_visits;
CREATE TRIGGER service_visits_updated_at
  BEFORE UPDATE ON public.service_visits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
