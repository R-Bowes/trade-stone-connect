-- 20260629120000_prequalification.sql

-- Storage bucket (run separately in Supabase dashboard if SQL approach not available)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('prequal-documents', 'prequal-documents', false);

-- Prequalification checklist record per contractor per company
CREATE TABLE IF NOT EXISTS public.panel_prequalification (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  contractor_id                 uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  public_liability_verified     boolean NOT NULL DEFAULT false,
  public_liability_expiry       date,
  employers_liability_verified  boolean NOT NULL DEFAULT false,
  employers_liability_expiry    date,
  trade_cert_verified           boolean NOT NULL DEFAULT false,
  trade_cert_expiry             date,
  site_induction_complete       boolean NOT NULL DEFAULT false,
  nda_signed                    boolean,
  terms_accepted                boolean NOT NULL DEFAULT false,
  overall_status                text NOT NULL DEFAULT 'pending'
    CHECK (overall_status IN ('pending','approved','suspended','lapsed')),
  reviewed_by                   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at                   timestamptz,
  next_review_date              date,
  notes                         text,
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, contractor_id)
);

CREATE INDEX idx_panel_prequal_company ON public.panel_prequalification(company_id);
CREATE INDEX idx_panel_prequal_contractor ON public.panel_prequalification(contractor_id);
CREATE INDEX idx_panel_prequal_status ON public.panel_prequalification(overall_status);

ALTER TABLE public.panel_prequalification ENABLE ROW LEVEL SECURITY;

-- Business can read and manage their prequalification records
CREATE POLICY "Business manages own prequal records"
ON public.panel_prequalification
FOR ALL
TO authenticated
USING (
  company_id IN (
    SELECT c.id FROM public.companies c
    JOIN public.profiles p ON p.id = c.owner_id
    WHERE p.user_id = auth.uid()
  )
);

-- Contractor can read their own prequal records (to see what's outstanding)
CREATE POLICY "Contractor reads own prequal records"
ON public.panel_prequalification
FOR SELECT
TO authenticated
USING (
  contractor_id IN (
    SELECT id FROM public.profiles WHERE user_id = auth.uid()
  )
);

-- Documents attached to a prequalification record
CREATE TABLE IF NOT EXISTS public.prequalification_documents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prequal_id      uuid NOT NULL REFERENCES public.panel_prequalification(id) ON DELETE CASCADE,
  document_type   text NOT NULL
    CHECK (document_type IN (
      'public_liability','employers_liability','trade_cert',
      'induction','nda','terms','other'
    )),
  file_url        text NOT NULL,
  file_name       text NOT NULL,
  expiry_date     date,
  uploaded_by     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  verified_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  verified_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_prequal_docs_prequal ON public.prequalification_documents(prequal_id);

ALTER TABLE public.prequalification_documents ENABLE ROW LEVEL SECURITY;

-- Business reads docs for their prequal records
CREATE POLICY "Business reads prequal docs"
ON public.prequalification_documents
FOR SELECT
TO authenticated
USING (
  prequal_id IN (
    SELECT pp.id FROM public.panel_prequalification pp
    JOIN public.companies c ON c.id = pp.company_id
    JOIN public.profiles p ON p.id = c.owner_id
    WHERE p.user_id = auth.uid()
  )
);

-- Business can update (verify) docs
CREATE POLICY "Business updates prequal docs"
ON public.prequalification_documents
FOR UPDATE
TO authenticated
USING (
  prequal_id IN (
    SELECT pp.id FROM public.panel_prequalification pp
    JOIN public.companies c ON c.id = pp.company_id
    JOIN public.profiles p ON p.id = c.owner_id
    WHERE p.user_id = auth.uid()
  )
);

-- Contractor inserts their own docs
CREATE POLICY "Contractor inserts own prequal docs"
ON public.prequalification_documents
FOR INSERT
TO authenticated
WITH CHECK (
  uploaded_by IN (
    SELECT id FROM public.profiles WHERE user_id = auth.uid()
  )
);

-- Contractor reads docs they uploaded
CREATE POLICY "Contractor reads own prequal docs"
ON public.prequalification_documents
FOR SELECT
TO authenticated
USING (
  uploaded_by IN (
    SELECT id FROM public.profiles WHERE user_id = auth.uid()
  )
);

-- Add prequalification columns to contractor_panel
ALTER TABLE public.contractor_panel
  ADD COLUMN IF NOT EXISTS prequal_id uuid REFERENCES public.panel_prequalification(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS prequal_status text NOT NULL DEFAULT 'not_started'
    CHECK (prequal_status IN ('not_started','in_progress','approved','lapsed')),
  ADD COLUMN IF NOT EXISTS can_receive_jobs boolean NOT NULL DEFAULT true;

-- Note: can_receive_jobs defaults true to avoid breaking existing panel contractors
-- New contractors added after this migration should default to false
-- Update existing approved panel rows to approved prequal_status
UPDATE public.contractor_panel
SET prequal_status = 'approved'
WHERE status = 'approved';

CREATE INDEX idx_contractor_panel_prequal ON public.contractor_panel(prequal_id);