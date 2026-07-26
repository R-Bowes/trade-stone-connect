-- Contractor working patterns and absences
-- Applied: 2026-07-26

-- ============================================================
-- 1. contractor_absences table
-- ============================================================
CREATE TABLE IF NOT EXISTS contractor_absences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  absence_type text NOT NULL CHECK (absence_type IN ('holiday', 'sickness', 'training', 'personal', 'other')),
  start_date date NOT NULL,
  end_date date NOT NULL,
  notes text,
  status text NOT NULL DEFAULT 'approved' CHECK (status IN ('approved', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contractor_absences_date_order CHECK (end_date >= start_date)
);

ALTER TABLE contractor_absences ENABLE ROW LEVEL SECURITY;
GRANT ALL ON contractor_absences TO authenticated;

DROP POLICY IF EXISTS "Contractors can manage their own absences" ON contractor_absences;
CREATE POLICY "Contractors can manage their own absences"
  ON contractor_absences FOR ALL
  USING (
    contractor_id IN (
      SELECT id FROM profiles WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    contractor_id IN (
      SELECT id FROM profiles WHERE user_id = auth.uid()
    )
  );

-- ============================================================
-- 2. contractor_working_patterns table
-- ============================================================
CREATE TABLE IF NOT EXISTS contractor_working_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  is_working boolean NOT NULL DEFAULT true,
  start_time time,
  end_time time,
  UNIQUE (contractor_id, day_of_week)
);

ALTER TABLE contractor_working_patterns ENABLE ROW LEVEL SECURITY;
GRANT ALL ON contractor_working_patterns TO authenticated;

DROP POLICY IF EXISTS "Contractors can manage their own patterns" ON contractor_working_patterns;
CREATE POLICY "Contractors can manage their own patterns"
  ON contractor_working_patterns FOR ALL
  USING (
    contractor_id IN (
      SELECT id FROM profiles WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    contractor_id IN (
      SELECT id FROM profiles WHERE user_id = auth.uid()
    )
  );

-- ============================================================
-- 3. Updated availability RPC
-- Uses contractor_working_patterns instead of assuming Mon-Fri
-- Uses contractor_absences for contractor time off
-- Removes contractor_availability_overrides dependency
-- ============================================================
CREATE OR REPLACE FUNCTION get_contractor_availability(
  p_contractor_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS TABLE (
  available_date date,
  is_available boolean,
  remaining_capacity integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH dates AS (
    SELECT generate_series(p_start_date, p_end_date, '1 day'::interval)::date AS d
  ),
  active_workers AS (
    SELECT id FROM team_members
    WHERE contractor_id = p_contractor_id AND status = 'active'
  ),
  date_capacity AS (
    SELECT
      d.d AS the_date,
      (
        (SELECT COUNT(*) FROM active_workers aw
         WHERE (
           EXISTS (
             SELECT 1 FROM team_member_working_patterns wp
             WHERE wp.team_member_id = aw.id
             AND wp.day_of_week = (EXTRACT(ISODOW FROM d.d)::integer - 1)
             AND wp.is_working = true
           )
           OR (
             NOT EXISTS (
               SELECT 1 FROM team_member_working_patterns wp
               WHERE wp.team_member_id = aw.id
             )
             AND EXTRACT(ISODOW FROM d.d) BETWEEN 1 AND 5
           )
         )
         AND NOT EXISTS (
           SELECT 1 FROM team_member_absences a
           WHERE a.team_member_id = aw.id
           AND a.status = 'approved'
           AND a.start_date <= d.d
           AND a.end_date >= d.d
         )
        )
        + CASE
            WHEN EXISTS (
              SELECT 1 FROM contractor_working_patterns cwp
              WHERE cwp.contractor_id = p_contractor_id
              AND cwp.day_of_week = (EXTRACT(ISODOW FROM d.d)::integer - 1)
              AND cwp.is_working = true
            )
            THEN 1
            WHEN NOT EXISTS (
              SELECT 1 FROM contractor_working_patterns cwp
              WHERE cwp.contractor_id = p_contractor_id
            )
            AND EXTRACT(ISODOW FROM d.d) BETWEEN 1 AND 5
            THEN 1
            ELSE 0
          END
        - CASE
            WHEN EXISTS (
              SELECT 1 FROM contractor_absences ca
              WHERE ca.contractor_id = p_contractor_id
              AND ca.status = 'approved'
              AND ca.start_date <= d.d
              AND ca.end_date >= d.d
            )
            THEN 1
            ELSE 0
          END
      )::integer AS available,
      (SELECT COUNT(DISTINCT ja.job_id) FROM job_assignments ja
       JOIN jobs j ON j.id = ja.job_id
       WHERE j.contractor_id = p_contractor_id
       AND j.status IN ('scheduled', 'in_progress')
       AND (
         ja.assigned_date = d.d
         OR (ja.assigned_date IS NULL AND j.scheduled_start::date = d.d)
       )
      )::integer AS assigned
    FROM dates d
  )
  SELECT
    dc.the_date,
    CASE
      WHEN (dc.available - dc.assigned) > 0 THEN true
      ELSE false
    END,
    GREATEST(dc.available - dc.assigned, 0)::integer
  FROM date_capacity dc
  ORDER BY dc.the_date;
END;
$$;

GRANT EXECUTE ON FUNCTION get_contractor_availability(uuid, date, date) TO authenticated;