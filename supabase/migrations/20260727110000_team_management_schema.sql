-- Team Management Schema Migration
-- Applied: 2026-07-25

-- ============================================================
-- 1. team_members table cleanup and additions
-- ============================================================

-- Remove contractor self-entry (contractors tracked via profiles, not team_members)
-- DELETE FROM team_members WHERE id = '84086560-e38b-4372-839c-27bedbaf3520';

-- Fix test member role
-- UPDATE team_members SET role = 'Tradesperson' WHERE id = '68629f1e-eef6-4b58-bf82-f273158a01f6';

-- Drop redundant is_active column (status column is canonical)
ALTER TABLE team_members DROP COLUMN IF EXISTS is_active;

-- Make email nullable (communication goes through the platform)
ALTER TABLE team_members ALTER COLUMN email DROP NOT NULL;

-- Add new columns
ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS trade text,
  ADD COLUMN IF NOT EXISTS employment_type text DEFAULT 'subcontractor',
  ADD COLUMN IF NOT EXISTS day_rate numeric,
  ADD COLUMN IF NOT EXISTS overtime_rate numeric,
  ADD COLUMN IF NOT EXISTS emergency_contact_name text,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone text,
  ADD COLUMN IF NOT EXISTS next_of_kin text,
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS utr_number text;

-- Constraints
ALTER TABLE team_members DROP CONSTRAINT IF EXISTS team_members_status_check;
ALTER TABLE team_members
  ADD CONSTRAINT team_members_status_check
  CHECK (status IN ('active', 'inactive', 'suspended'));

ALTER TABLE team_members DROP CONSTRAINT IF EXISTS team_members_role_check;
ALTER TABLE team_members
  ADD CONSTRAINT team_members_role_check
  CHECK (role IN ('Tradesperson', 'Apprentice', 'Supervisor', 'Labourer', 'Site Manager', 'Foreman', 'Admin'));

ALTER TABLE team_members DROP CONSTRAINT IF EXISTS team_members_employment_type_check;
ALTER TABLE team_members
  ADD CONSTRAINT team_members_employment_type_check
  CHECK (employment_type IN ('employee', 'subcontractor', 'cis_subcontractor', 'agency'));

-- ============================================================
-- 2. team_member_certifications
-- ============================================================
CREATE TABLE IF NOT EXISTS team_member_certifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id uuid NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  cert_type text NOT NULL CHECK (cert_type IN (
    'cscs', 'gas_safe', 'niceic', 'napit', 'first_aid',
    'asbestos_awareness', 'ipaf', 'pasma', 'smsts', 'sssts',
    'ecs', 'oftec', 'other'
  )),
  cert_name text NOT NULL,
  reference_number text,
  issued_date date,
  expiry_date date,
  document_url text,
  status text NOT NULL DEFAULT 'not_verified' CHECK (status IN ('valid', 'expiring_soon', 'expired', 'not_verified')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE team_member_certifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Contractors can manage their team certs"
  ON team_member_certifications FOR ALL
  USING (
    team_member_id IN (
      SELECT tm.id FROM team_members tm
      WHERE tm.contractor_id IN (
        SELECT p.id FROM profiles p WHERE p.user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    team_member_id IN (
      SELECT tm.id FROM team_members tm
      WHERE tm.contractor_id IN (
        SELECT p.id FROM profiles p WHERE p.user_id = auth.uid()
      )
    )
  );

-- ============================================================
-- 3. job_assignments additions
-- ============================================================
ALTER TABLE job_assignments
  ADD COLUMN IF NOT EXISTS role_on_job text DEFAULT 'support' CHECK (role_on_job IN ('lead', 'support', 'supervisor')),
  ADD COLUMN IF NOT EXISTS assigned_date date,
  ADD COLUMN IF NOT EXISTS notes text;

-- ============================================================
-- 4. timesheets additions
-- ============================================================
ALTER TABLE timesheets
  ADD COLUMN IF NOT EXISTS break_minutes integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS rate_applied numeric,
  ADD COLUMN IF NOT EXISTS is_overtime boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS timesheet_week date;

-- ============================================================
-- 5. team_member_absences
-- ============================================================
CREATE TABLE IF NOT EXISTS team_member_absences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id uuid NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  absence_type text NOT NULL CHECK (absence_type IN ('holiday', 'sickness', 'training', 'personal', 'other')),
  start_date date NOT NULL,
  end_date date NOT NULL,
  notes text,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'approved', 'declined')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT absences_date_order CHECK (end_date >= start_date)
);

ALTER TABLE team_member_absences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Contractors can manage their team absences"
  ON team_member_absences FOR ALL
  USING (
    team_member_id IN (
      SELECT tm.id FROM team_members tm
      WHERE tm.contractor_id IN (
        SELECT p.id FROM profiles p WHERE p.user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    team_member_id IN (
      SELECT tm.id FROM team_members tm
      WHERE tm.contractor_id IN (
        SELECT p.id FROM profiles p WHERE p.user_id = auth.uid()
      )
    )
  );

-- ============================================================
-- 6. team_member_working_patterns
-- ============================================================
CREATE TABLE IF NOT EXISTS team_member_working_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id uuid NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  is_working boolean NOT NULL DEFAULT true,
  start_time time,
  end_time time,
  UNIQUE (team_member_id, day_of_week)
);

ALTER TABLE team_member_working_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Contractors can manage their team patterns"
  ON team_member_working_patterns FOR ALL
  USING (
    team_member_id IN (
      SELECT tm.id FROM team_members tm
      WHERE tm.contractor_id IN (
        SELECT p.id FROM profiles p WHERE p.user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    team_member_id IN (
      SELECT tm.id FROM team_members tm
      WHERE tm.contractor_id IN (
        SELECT p.id FROM profiles p WHERE p.user_id = auth.uid()
      )
    )
  );