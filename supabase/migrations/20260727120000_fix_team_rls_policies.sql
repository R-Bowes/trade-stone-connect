-- Fix RLS policies for team management tables
-- Original policies used nested profiles lookup which caused RLS recursion
-- team_members uses contractor_id = auth.uid() directly, child tables must match

-- Absences
DROP POLICY IF EXISTS "Contractors can manage their team absences" ON team_member_absences;
CREATE POLICY "Contractors can manage their team absences"
  ON team_member_absences FOR ALL
  USING (
    team_member_id IN (
      SELECT id FROM team_members WHERE contractor_id = auth.uid()
    )
  )
  WITH CHECK (
    team_member_id IN (
      SELECT id FROM team_members WHERE contractor_id = auth.uid()
    )
  );

-- Certifications
DROP POLICY IF EXISTS "Contractors can manage their team certs" ON team_member_certifications;
CREATE POLICY "Contractors can manage their team certs"
  ON team_member_certifications FOR ALL
  USING (
    team_member_id IN (
      SELECT id FROM team_members WHERE contractor_id = auth.uid()
    )
  )
  WITH CHECK (
    team_member_id IN (
      SELECT id FROM team_members WHERE contractor_id = auth.uid()
    )
  );

-- Working patterns
DROP POLICY IF EXISTS "Contractors can manage their team patterns" ON team_member_working_patterns;
CREATE POLICY "Contractors can manage their team patterns"
  ON team_member_working_patterns FOR ALL
  USING (
    team_member_id IN (
      SELECT id FROM team_members WHERE contractor_id = auth.uid()
    )
  )
  WITH CHECK (
    team_member_id IN (
      SELECT id FROM team_members WHERE contractor_id = auth.uid()
    )
  );