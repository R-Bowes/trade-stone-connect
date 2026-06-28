-- Migration: pipeline gap closure
-- Closes all gaps identified in the quote→job pipeline audit
-- Safe to run: all changes are additive, no existing data is modified except
-- normalising legacy 'not_started' job status rows to 'scheduled'

-- ============================================
-- 1. JOB TYPE on enquiries and jobs
-- ============================================
ALTER TABLE enquiries
  ADD COLUMN IF NOT EXISTS job_type text
  CHECK (job_type IN (
    'service_visit', 'repair', 'installation',
    'inspection', 'emergency', 'other'
  ));

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS job_type text
  CHECK (job_type IN (
    'service_visit', 'repair', 'installation',
    'inspection', 'emergency', 'other'
  ));

-- ============================================
-- 2. SCHEDULING fields on jobs
-- ============================================
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS scheduled_start timestamptz,
  ADD COLUMN IF NOT EXISTS expected_completion timestamptz;

-- ============================================
-- 3. ESTIMATED DURATION on issued_quotes
-- ============================================
ALTER TABLE issued_quotes
  ADD COLUMN IF NOT EXISTS estimated_duration_minutes integer;

-- ============================================
-- 4. FIX JOB STATUS default and constraint
-- ============================================
ALTER TABLE jobs
  ALTER COLUMN status SET DEFAULT 'scheduled';

-- Normalise any legacy 'not_started' rows
UPDATE jobs
  SET status = 'scheduled'
  WHERE status = 'not_started';

-- Drop old constraint if exists, add canonical one
ALTER TABLE jobs
  DROP CONSTRAINT IF EXISTS jobs_status_check;

ALTER TABLE jobs
  ADD CONSTRAINT jobs_status_check
  CHECK (status IN (
    'scheduled', 'in_progress', 'snagging',
    'complete', 'cancelled'
  ));

-- ============================================
-- 5. CHECKLIST TEMPLATES (platform + B2B)
-- ============================================
CREATE TABLE IF NOT EXISTS job_checklist_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type text NOT NULL,
  stage text NOT NULL
    CHECK (stage IN ('work_started', 'final_checks')),
  item_text text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_checklist_templates_type_stage
  ON job_checklist_templates (job_type, stage);

CREATE INDEX IF NOT EXISTS idx_checklist_templates_company
  ON job_checklist_templates (company_id);

-- RLS
ALTER TABLE job_checklist_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Contractors can view checklist templates"
  ON job_checklist_templates FOR SELECT
  USING (
    company_id IS NULL
    OR company_id IN (
      SELECT j.company_id FROM jobs j
      JOIN profiles p ON p.id = j.contractor_id
      WHERE p.user_id = auth.uid()
    )
  );

-- ============================================
-- 6. PER-JOB CHECKLIST ITEMS
-- ============================================
CREATE TABLE IF NOT EXISTS job_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  stage text NOT NULL
    CHECK (stage IN ('work_started', 'final_checks')),
  item_text text NOT NULL,
  is_checked boolean NOT NULL DEFAULT false,
  checked_at timestamptz,
  checked_by uuid REFERENCES profiles(id),
  sort_order integer NOT NULL DEFAULT 0,
  is_contractor_added boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_checklist_items_job
  ON job_checklist_items (job_id, stage);

-- RLS
ALTER TABLE job_checklist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can view checklist items"
  ON job_checklist_items FOR SELECT
  USING (
    job_id IN (
      SELECT j.id FROM jobs j
      JOIN profiles p ON (p.id = j.contractor_id OR p.id = j.customer_id)
      WHERE p.user_id = auth.uid()
    )
  );

CREATE POLICY "Contractors can insert checklist items"
  ON job_checklist_items FOR INSERT
  WITH CHECK (
    job_id IN (
      SELECT j.id FROM jobs j
      JOIN profiles p ON p.id = j.contractor_id
      WHERE p.user_id = auth.uid()
    )
  );

CREATE POLICY "Contractors can update checklist items"
  ON job_checklist_items FOR UPDATE
  USING (
    job_id IN (
      SELECT j.id FROM jobs j
      JOIN profiles p ON p.id = j.contractor_id
      WHERE p.user_id = auth.uid()
    )
  );

-- ============================================
-- 7. SEED PLATFORM DEFAULT CHECKLIST TEMPLATES
-- ============================================
INSERT INTO job_checklist_templates
  (job_type, stage, item_text, sort_order)
VALUES
  -- Service visit — work started
  ('service_visit','work_started','Arrived on site and introduced to customer',1),
  ('service_visit','work_started','Risk assessment completed',2),
  ('service_visit','work_started','Work area protected and dust sheets laid',3),
  -- Service visit — final checks
  ('service_visit','final_checks','Works completed and tested',1),
  ('service_visit','final_checks','Work area cleaned and left tidy',2),
  ('service_visit','final_checks','Customer briefed on work carried out',3),
  ('service_visit','final_checks','Before and after photos uploaded',4),
  -- Repair — work started
  ('repair','work_started','Arrived on site and fault diagnosed',1),
  ('repair','work_started','Risk assessment completed',2),
  ('repair','work_started','Customer informed of scope before starting',3),
  -- Repair — final checks
  ('repair','final_checks','Repair completed and tested',1),
  ('repair','final_checks','Work area cleaned and left tidy',2),
  ('repair','final_checks','Photos of completed repair uploaded',3),
  ('repair','final_checks','Customer sign-off obtained',4),
  -- Installation — work started
  ('installation','work_started','Arrived on site and delivery / materials checked',1),
  ('installation','work_started','Risk assessment completed',2),
  ('installation','work_started','Installation area prepared',3),
  -- Installation — final checks
  ('installation','final_checks','Installation completed and commissioned',1),
  ('installation','final_checks','All testing passed',2),
  ('installation','final_checks','Customer walkthrough completed',3),
  ('installation','final_checks','Certificates and documentation provided',4),
  ('installation','final_checks','Photos uploaded',5),
  -- Inspection — work started
  ('inspection','work_started','Arrived on site and access confirmed',1),
  ('inspection','work_started','Inspection scope confirmed with customer',2),
  -- Inspection — final checks
  ('inspection','final_checks','Inspection completed',1),
  ('inspection','final_checks','Report and findings documented',2),
  ('inspection','final_checks','Customer briefed on findings',3),
  -- Emergency — work started
  ('emergency','work_started','Arrived on site and hazard assessed',1),
  ('emergency','work_started','Immediate safety measures taken',2),
  -- Emergency — final checks
  ('emergency','final_checks','Emergency works completed',1),
  ('emergency','final_checks','Site made safe',2),
  ('emergency','final_checks','Customer informed of further works required if any',3),
  ('emergency','final_checks','Photos uploaded',4)
ON CONFLICT DO NOTHING;