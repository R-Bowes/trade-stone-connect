-- Migration: contractor_inventory
-- Tables: contractor_tools, contractor_materials, job_tool_assignments, job_material_usage
-- Plus: log_material_usage SECURITY DEFINER, RLS policies, updated_at triggers

-- ============================================================
-- 1. contractor_tools
-- ============================================================
CREATE TABLE contractor_tools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL,
  brand text,
  model text,
  serial_number text,
  purchase_date date,
  purchase_cost numeric(10,2),
  warranty_expiry date,
  next_service_due date,
  service_type text,
  condition text NOT NULL DEFAULT 'good'
    CHECK (condition IN ('excellent','good','fair','poor','decommissioned')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE contractor_tools ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contractor_tools_select" ON contractor_tools
  FOR SELECT USING (
    contractor_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "contractor_tools_insert" ON contractor_tools
  FOR INSERT WITH CHECK (
    contractor_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "contractor_tools_update" ON contractor_tools
  FOR UPDATE USING (
    contractor_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "contractor_tools_delete" ON contractor_tools
  FOR DELETE USING (
    contractor_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
  );

CREATE TRIGGER set_contractor_tools_updated_at
  BEFORE UPDATE ON contractor_tools
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 2. contractor_materials
-- ============================================================
CREATE TABLE contractor_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL,
  unit text NOT NULL
    CHECK (unit IN ('metres','kg','litres','each','box','roll','pack','length')),
  quantity_on_hand numeric(10,2) NOT NULL DEFAULT 0,
  unit_cost numeric(10,2),
  reorder_level numeric(10,2),
  supplier text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE contractor_materials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contractor_materials_select" ON contractor_materials
  FOR SELECT USING (
    contractor_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "contractor_materials_insert" ON contractor_materials
  FOR INSERT WITH CHECK (
    contractor_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "contractor_materials_update" ON contractor_materials
  FOR UPDATE USING (
    contractor_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "contractor_materials_delete" ON contractor_materials
  FOR DELETE USING (
    contractor_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
  );

CREATE TRIGGER set_contractor_materials_updated_at
  BEFORE UPDATE ON contractor_materials
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 3. job_tool_assignments
-- ============================================================
CREATE TABLE job_tool_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  tool_id uuid NOT NULL REFERENCES contractor_tools(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  returned_at timestamptz
);

-- A tool can only be actively assigned to one job at a time
CREATE UNIQUE INDEX uq_tool_active_assignment
  ON job_tool_assignments (tool_id)
  WHERE returned_at IS NULL;

ALTER TABLE job_tool_assignments ENABLE ROW LEVEL SECURITY;

-- RLS via the tool ownership chain
CREATE POLICY "job_tool_assignments_select" ON job_tool_assignments
  FOR SELECT USING (
    tool_id IN (
      SELECT id FROM contractor_tools
      WHERE contractor_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "job_tool_assignments_insert" ON job_tool_assignments
  FOR INSERT WITH CHECK (
    tool_id IN (
      SELECT id FROM contractor_tools
      WHERE contractor_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "job_tool_assignments_update" ON job_tool_assignments
  FOR UPDATE USING (
    tool_id IN (
      SELECT id FROM contractor_tools
      WHERE contractor_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "job_tool_assignments_delete" ON job_tool_assignments
  FOR DELETE USING (
    tool_id IN (
      SELECT id FROM contractor_tools
      WHERE contractor_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    )
  );

-- ============================================================
-- 4. job_material_usage
-- ============================================================
CREATE TABLE job_material_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  material_id uuid NOT NULL REFERENCES contractor_materials(id) ON DELETE CASCADE,
  quantity_used numeric(10,2) NOT NULL CHECK (quantity_used > 0),
  unit_cost_at_use numeric(10,2),
  used_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE job_material_usage ENABLE ROW LEVEL SECURITY;

-- RLS via the material ownership chain
CREATE POLICY "job_material_usage_select" ON job_material_usage
  FOR SELECT USING (
    material_id IN (
      SELECT id FROM contractor_materials
      WHERE contractor_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "job_material_usage_insert" ON job_material_usage
  FOR INSERT WITH CHECK (
    material_id IN (
      SELECT id FROM contractor_materials
      WHERE contractor_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "job_material_usage_delete" ON job_material_usage
  FOR DELETE USING (
    material_id IN (
      SELECT id FROM contractor_materials
      WHERE contractor_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    )
  );

-- ============================================================
-- 5. log_material_usage — atomic insert + stock decrement
-- ============================================================
CREATE OR REPLACE FUNCTION log_material_usage(
  p_material_id uuid,
  p_job_id uuid,
  p_quantity numeric
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contractor_id uuid;
  v_unit_cost numeric(10,2);
  v_current_qty numeric(10,2);
  v_usage_id uuid;
BEGIN
  -- Verify caller owns this material
  SELECT cm.contractor_id, cm.unit_cost, cm.quantity_on_hand
    INTO v_contractor_id, v_unit_cost, v_current_qty
    FROM contractor_materials cm
    JOIN profiles p ON p.id = cm.contractor_id
    WHERE cm.id = p_material_id
      AND p.user_id = auth.uid();

  IF v_contractor_id IS NULL THEN
    RAISE EXCEPTION 'Material not found or access denied';
  END IF;

  -- Verify caller is the contractor on this job
  IF NOT EXISTS (
    SELECT 1 FROM jobs
    WHERE id = p_job_id
      AND contractor_id = v_contractor_id
  ) THEN
    RAISE EXCEPTION 'Job not found or not yours';
  END IF;

  IF p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be positive';
  END IF;

  -- Allow stock to go negative (contractor may not have logged a restock)
  -- but warn via the RAG indicators in the UI

  -- Insert usage record
  INSERT INTO job_material_usage (job_id, material_id, quantity_used, unit_cost_at_use)
  VALUES (p_job_id, p_material_id, p_quantity, v_unit_cost)
  RETURNING id INTO v_usage_id;

  -- Decrement stock
  UPDATE contractor_materials
  SET quantity_on_hand = quantity_on_hand - p_quantity
  WHERE id = p_material_id;

  RETURN v_usage_id;
END;
$$;

-- Grant execute to authenticated users (RLS + function body handle auth)
GRANT EXECUTE ON FUNCTION log_material_usage(uuid, uuid, numeric) TO authenticated;