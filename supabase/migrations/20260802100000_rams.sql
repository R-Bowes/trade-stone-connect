-- RAMS — Risk Assessments & Method Statements.
-- Purely additive: two new tables, ten seeded platform templates, storage
-- read policies for the generated PDF. No changes to existing job flow logic.

-- =============================================================================
-- 1. rams_templates — platform templates (owner_contractor_id NULL) +
--    contractor private templates (owner_contractor_id = their profile id)
-- =============================================================================

CREATE TABLE public.rams_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_contractor_id uuid REFERENCES public.profiles(id),
  name text NOT NULL,
  description text,
  trade_category text,
  hazards jsonb NOT NULL DEFAULT '[]'::jsonb,
  method_steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  ppe_requirements jsonb NOT NULL DEFAULT '[]'::jsonb,
  emergency_procedures text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rams_templates ENABLE ROW LEVEL SECURITY;

-- Deviation from the literal brief: the brief's RLS used the two-step
-- `owner_contractor_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())`
-- subquery form. CLAUDE.md's RLS section explicitly rules this out — since
-- migration 20260328110000 profiles.id == profiles.user_id == auth.uid() by
-- construction (CHECK constraint + FK), so the direct comparison below is
-- the house pattern and mixing both forms is noise. Same substitution
-- applied to job_rams below.

CREATE POLICY "rams_templates_select"
  ON public.rams_templates FOR SELECT
  TO authenticated
  USING (owner_contractor_id IS NULL OR owner_contractor_id = auth.uid());

CREATE POLICY "rams_templates_insert"
  ON public.rams_templates FOR INSERT
  TO authenticated
  WITH CHECK (owner_contractor_id = auth.uid());

CREATE POLICY "rams_templates_update"
  ON public.rams_templates FOR UPDATE
  TO authenticated
  USING (owner_contractor_id = auth.uid())
  WITH CHECK (owner_contractor_id = auth.uid());

CREATE POLICY "rams_templates_delete"
  ON public.rams_templates FOR DELETE
  TO authenticated
  USING (owner_contractor_id = auth.uid());

CREATE TRIGGER rams_templates_updated_at
  BEFORE UPDATE ON public.rams_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX idx_rams_templates_owner ON public.rams_templates(owner_contractor_id);

-- =============================================================================
-- 2. job_rams — one RAMS document per job (v1, UNIQUE(job_id))
-- =============================================================================

CREATE TABLE public.job_rams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id),
  contractor_id uuid NOT NULL REFERENCES public.profiles(id),
  template_id uuid REFERENCES public.rams_templates(id),

  -- Snapshot of content (editable per job, not linked to template changes)
  site_address text,
  job_description text,
  hazards jsonb NOT NULL DEFAULT '[]'::jsonb,
  method_steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  ppe_requirements jsonb NOT NULL DEFAULT '[]'::jsonb,
  emergency_procedures text,
  additional_notes text,

  -- Tailoring assent
  tailored_for_job boolean NOT NULL DEFAULT false,
  tailored_at timestamptz,
  tailored_by text,

  -- Status
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'tailored', 'signed', 'superseded')),

  -- Sign-off
  signed_off_at timestamptz,
  signed_off_by_name text,
  signed_off_by_role text,

  -- PDF
  pdf_storage_path text,
  pdf_generated_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (job_id)
);

ALTER TABLE public.job_rams ENABLE ROW LEVEL SECURITY;

-- Both parties on the job can view: the contractor, the job's homeowner
-- customer, or any member of the job's company (B2B/FM). See CLAUDE.md
-- B2B/FM foundation section for is_company_member().
CREATE POLICY "job_rams_select"
  ON public.job_rams FOR SELECT
  TO authenticated
  USING (
    contractor_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_rams.job_id
        AND (
          j.customer_id = auth.uid()
          OR (j.company_id IS NOT NULL AND public.is_company_member(j.company_id))
        )
    )
  );

CREATE POLICY "job_rams_insert"
  ON public.job_rams FOR INSERT
  TO authenticated
  WITH CHECK (contractor_id = auth.uid());

-- Can't edit after sign-off.
CREATE POLICY "job_rams_update"
  ON public.job_rams FOR UPDATE
  TO authenticated
  USING (contractor_id = auth.uid() AND status <> 'signed')
  WITH CHECK (contractor_id = auth.uid());

-- No DELETE policy — RAMS are audit records (RLS enabled with no DELETE
-- policy denies delete outright for the authenticated role).

CREATE TRIGGER job_rams_updated_at
  BEFORE UPDATE ON public.job_rams
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX idx_job_rams_contractor ON public.job_rams(contractor_id);

-- =============================================================================
-- 3. Storage — generated-documents bucket already exists (see
--    20260727150000_generated_documents_bucket_and_rls.sql). Add read
--    policies for rams/{job_id}.pdf, mirroring the completions/ pattern but
--    also covering B2B company members.
-- =============================================================================

CREATE POLICY "Job parties can view RAMS PDFs"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'generated-documents'
  AND (storage.foldername(name))[1] = 'rams'
  AND EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE storage.objects.name = 'rams/' || j.id::text || '.pdf'
      AND (
        j.contractor_id = auth.uid()
        OR j.customer_id = auth.uid()
        OR (j.company_id IS NOT NULL AND public.is_company_member(j.company_id))
      )
  )
);

-- =============================================================================
-- 4. Seed — 10 platform templates (owner_contractor_id NULL)
-- =============================================================================

INSERT INTO public.rams_templates (owner_contractor_id, name, description, trade_category, hazards, method_steps, ppe_requirements, emergency_procedures) VALUES

(NULL, 'Domestic Electrical Installation',
 'Consumer unit changes, rewires, and circuit alterations in occupied domestic properties.',
 'Electrical',
 '[
   {"hazard": "Electric shock from live conductors", "risk_level": "high", "control_measures": "Safe isolation procedure followed at all times: isolate at consumer unit, lock off/tag out, prove dead with approved voltage indicator before touching any conductor. Never work on a circuit believed to be live.", "residual_risk": "low"},
   {"hazard": "Arc flash during fault-finding", "risk_level": "high", "control_measures": "Isolate supply before opening any enclosure. Where live testing is unavoidable (e.g. fault diagnosis), use insulated tools rated to GS38 and appropriate PPE.", "residual_risk": "medium"},
   {"hazard": "Working in loft spaces / confined roof voids", "risk_level": "medium", "control_measures": "Use crawl boards on joists, adequate lighting, and check loft floor loading before placing tools/materials. Take regular breaks in poor ventilation.", "residual_risk": "low"},
   {"hazard": "Asbestos-containing materials (pre-2000 properties)", "risk_level": "high", "control_measures": "Visual check of property age and any asbestos survey on file before drilling/chasing walls or ceilings. Stop work and seek specialist advice if suspect material is disturbed.", "residual_risk": "medium"},
   {"hazard": "Manual handling of consumer units and cable drums", "risk_level": "low", "control_measures": "Use correct lifting technique, team lift for heavy items, use a trolley for cable drums where possible.", "residual_risk": "low"},
   {"hazard": "Client and household members present during works", "risk_level": "medium", "control_measures": "Segregate work area with barrier tape where practical, keep children and pets away from open consumer unit, brief occupants before isolating supply.", "residual_risk": "low"}
 ]'::jsonb,
 '[
   {"step_number": 1, "description": "Carry out site survey, confirm scope with client and check for asbestos risk given property age.", "responsible": "Lead electrician", "hazards_addressed": ["Asbestos-containing materials (pre-2000 properties)"]},
   {"step_number": 2, "description": "Isolate electrical supply at consumer unit, lock off and place warning notice.", "responsible": "Lead electrician", "hazards_addressed": ["Electric shock from live conductors"]},
   {"step_number": 3, "description": "Prove isolation dead using an approved voltage indicator, tested before and after on a known live source (GS38).", "responsible": "Lead electrician", "hazards_addressed": ["Electric shock from live conductors"]},
   {"step_number": 4, "description": "Carry out installation/alteration works to agreed specification, following BS 7671 wiring regulations.", "responsible": "Lead electrician", "hazards_addressed": []},
   {"step_number": 5, "description": "Access loft/void spaces via crawl boards only, with adequate lighting rigged first.", "responsible": "Lead electrician", "hazards_addressed": ["Working in loft spaces / confined roof voids"]},
   {"step_number": 6, "description": "Carry out full testing and inspection (BS 7671 Part 6) before re-energising: continuity, insulation resistance, polarity, RCD operation.", "responsible": "Lead electrician", "hazards_addressed": ["Electric shock from live conductors"]},
   {"step_number": 7, "description": "Re-energise supply, demonstrate operation to client, issue Electrical Installation Certificate / Minor Works Certificate as applicable.", "responsible": "Lead electrician", "hazards_addressed": []}
 ]'::jsonb,
 '["Safety glasses", "Gloves", "Insulated tools (VDE rated)", "Dust mask/RPE", "Knee pads"]'::jsonb,
 'In the event of electric shock: do not touch the casualty until the supply is isolated. Call 999 immediately if the casualty is unconscious or not breathing normally. Nearest A&E and first aider details to be confirmed on site. In the event of suspected asbestos disturbance, stop work immediately, evacuate the area, and contact the office for specialist advice — do not attempt to clean up.'),

(NULL, 'Commercial Electrical Work',
 'Electrical installation and maintenance work in occupied commercial premises, including out-of-hours working.',
 'Electrical',
 '[
   {"hazard": "Electric shock / arc flash on 3-phase supplies", "risk_level": "high", "control_measures": "Safe isolation of all relevant phases and neutral, permit-to-work system used where site requires, lock-off/tag-out on distribution boards, prove dead before work commences.", "residual_risk": "low"},
   {"hazard": "Working at height to access ceiling voids/risers", "risk_level": "high", "control_measures": "Use of appropriate access equipment (podium steps/tower scaffold) with edge protection, inspected before use, never overreach.", "residual_risk": "medium"},
   {"hazard": "Interruption to critical building systems (fire alarm, access control)", "risk_level": "high", "control_measures": "Liaise with building management before isolating any life-safety system, notify fire alarm monitoring station, arrange fire watch if system is down for extended period.", "residual_risk": "medium"},
   {"hazard": "Working alongside building occupants / public access areas", "risk_level": "medium", "control_measures": "Segregate work area with barriers and signage, schedule disruptive works out-of-hours where possible, maintain clear escape routes at all times.", "residual_risk": "low"},
   {"hazard": "Existing services of unknown condition/age", "risk_level": "medium", "control_measures": "Review existing drawings/O&M manuals where available, visually inspect before connecting, treat all existing circuits as live until proven otherwise.", "residual_risk": "low"}
 ]'::jsonb,
 '[
   {"step_number": 1, "description": "Confirm site induction requirements and obtain permit-to-work if required by the building.", "responsible": "Lead electrician", "hazards_addressed": []},
   {"step_number": 2, "description": "Liaise with building management/facilities team regarding any life-safety systems affected.", "responsible": "Lead electrician", "hazards_addressed": ["Interruption to critical building systems (fire alarm, access control)"]},
   {"step_number": 3, "description": "Isolate relevant distribution board(s), lock off and prove dead across all phases before work begins.", "responsible": "Lead electrician", "hazards_addressed": ["Electric shock / arc flash on 3-phase supplies"]},
   {"step_number": 4, "description": "Erect barriers/signage around work area to protect building occupants and maintain escape routes.", "responsible": "Lead electrician", "hazards_addressed": ["Working alongside building occupants / public access areas"]},
   {"step_number": 5, "description": "Set up access equipment for ceiling void/riser work, inspect before use.", "responsible": "Lead electrician", "hazards_addressed": ["Working at height to access ceiling voids/risers"]},
   {"step_number": 6, "description": "Carry out installation/alteration works per specification and BS 7671.", "responsible": "Lead electrician", "hazards_addressed": []},
   {"step_number": 7, "description": "Test and inspect before re-energising, confirm with building management before restoring any life-safety system.", "responsible": "Lead electrician", "hazards_addressed": ["Interruption to critical building systems (fire alarm, access control)"]},
   {"step_number": 8, "description": "Clear area, remove barriers, issue certification and hand back to building management.", "responsible": "Lead electrician", "hazards_addressed": []}
 ]'::jsonb,
 '["Hard hat", "Safety boots", "Hi-vis vest", "Safety glasses", "Gloves", "Insulated tools (VDE rated)"]'::jsonb,
 'Fire alarm/emergency procedures as per building fire action plan — confirm with building management on arrival. If a life-safety system is inadvertently triggered or disabled, notify building management and the alarm monitoring station immediately. In the event of electric shock, isolate supply before approaching casualty and call 999.'),

(NULL, 'Domestic Plumbing & Heating',
 'Boiler installation/replacement, central heating alterations, and general plumbing in occupied homes.',
 'Plumbing & Heating',
 '[
   {"hazard": "Gas escape / carbon monoxide exposure", "risk_level": "high", "control_measures": "Only Gas Safe registered engineers to work on gas appliances/pipework. Tightness test on completion, CO alarm fitted/tested, flue and ventilation checked against manufacturer instructions and Building Regs Part J.", "residual_risk": "low"},
   {"hazard": "Scalding from hot water systems", "risk_level": "medium", "control_measures": "Drain down and allow systems to cool before opening. Warn occupants before restoring hot water supply.", "residual_risk": "low"},
   {"hazard": "Manual handling of boilers, cylinders and radiators", "risk_level": "medium", "control_measures": "Two-person lift for boilers/cylinders, use of sack truck for transport, correct lifting technique.", "residual_risk": "low"},
   {"hazard": "Water damage / flooding from pipework failure", "risk_level": "medium", "control_measures": "Isolate mains stopcock before works, protect flooring and furnishings with dust sheets, pressure test new joints before leaving site.", "residual_risk": "low"},
   {"hazard": "Working with power tools near existing pipework/cables", "risk_level": "medium", "control_measures": "Use of cable/pipe detector before drilling or chasing walls.", "residual_risk": "low"},
   {"hazard": "Asbestos-containing materials in older boiler flues/gaskets", "risk_level": "high", "control_measures": "Visual assessment of property age, treat old flue seals/gaskets as potential ACM until confirmed otherwise, stop work if suspect material found.", "residual_risk": "medium"}
 ]'::jsonb,
 '[
   {"step_number": 1, "description": "Site survey — confirm scope, check property age for asbestos risk, agree isolation points with client.", "responsible": "Lead engineer", "hazards_addressed": ["Asbestos-containing materials in older boiler flues/gaskets"]},
   {"step_number": 2, "description": "Isolate gas supply and/or mains water stopcock as required for the works.", "responsible": "Lead engineer", "hazards_addressed": ["Gas escape / carbon monoxide exposure", "Water damage / flooding from pipework failure"]},
   {"step_number": 3, "description": "Drain down affected heating/hot water circuits and allow to cool before disconnection.", "responsible": "Lead engineer", "hazards_addressed": ["Scalding from hot water systems"]},
   {"step_number": 4, "description": "Remove old appliance/pipework using safe manual handling technique (team lift for boiler/cylinder).", "responsible": "Lead engineer", "hazards_addressed": ["Manual handling of boilers, cylinders and radiators"]},
   {"step_number": 5, "description": "Install new appliance/pipework to manufacturer instructions and current Building Regulations.", "responsible": "Lead engineer", "hazards_addressed": []},
   {"step_number": 6, "description": "Pressure test all new joints, refill and vent system, check for leaks before restoring power.", "responsible": "Lead engineer", "hazards_addressed": ["Water damage / flooding from pipework failure"]},
   {"step_number": 7, "description": "Commission appliance, carry out gas tightness test and flue gas analysis, fit/test CO alarm.", "responsible": "Lead engineer", "hazards_addressed": ["Gas escape / carbon monoxide exposure"]},
   {"step_number": 8, "description": "Demonstrate system to client, issue Building Regulations notification and warranty registration.", "responsible": "Lead engineer", "hazards_addressed": []}
 ]'::jsonb,
 '["Safety glasses", "Gloves", "Safety boots", "Knee pads"]'::jsonb,
 'In the event of a suspected gas escape: stop work immediately, do not operate any electrical switches, ventilate the area, isolate the gas supply at the meter if safe to do so, and evacuate. Call the National Gas Emergency Service on 0800 111 999. In the event of a burn/scald, cool the affected area with cool running water for at least 20 minutes and seek medical attention if severe.'),

(NULL, 'Bathroom Renovation',
 'Full or partial bathroom strip-out and refit including tiling, plumbing, and electrics in an occupied home.',
 'Multi-trade',
 '[
   {"hazard": "Manual handling during strip-out (bath, tiles, sanitaryware)", "risk_level": "medium", "control_measures": "Break up large items where safe to do so before removal, use of PPE, team lift for heavy items such as cast iron baths.", "residual_risk": "low"},
   {"hazard": "Dust from tile removal and floor preparation", "risk_level": "medium", "control_measures": "RPE (FFP3) worn during breaking out, dust sheets and sealed doorway to contain dust, extraction/vacuum used where practical.", "residual_risk": "low"},
   {"hazard": "Electric shock from electrics in a wet zone", "risk_level": "high", "control_measures": "Isolate all circuits before work, all electrical work to comply with BS 7671 zone requirements for bathrooms, RCD protection confirmed on completion.", "residual_risk": "low"},
   {"hazard": "Water damage to adjoining rooms during plumbing works", "risk_level": "medium", "control_measures": "Isolate water supply before disconnecting fittings, pressure test new pipework before tiling over, protect ceiling below if working above another room.", "residual_risk": "low"},
   {"hazard": "Slips on wet or dusty floor surfaces", "risk_level": "low", "control_measures": "Keep work area clear of debris, mop up spills promptly, use non-slip footwear.", "residual_risk": "low"},
   {"hazard": "Cutting tiles — flying debris and noise", "risk_level": "medium", "control_measures": "Use of guarded tile cutter, eye protection and hearing protection when using power tools, cutting station sited away from client living areas.", "residual_risk": "low"}
 ]'::jsonb,
 '[
   {"step_number": 1, "description": "Isolate water and electrical supplies to the bathroom before strip-out begins.", "responsible": "Lead tradesperson", "hazards_addressed": ["Electric shock from electrics in a wet zone", "Water damage to adjoining rooms during plumbing works"]},
   {"step_number": 2, "description": "Protect flooring and access routes with dust sheets/boards, seal doorway to contain dust.", "responsible": "Lead tradesperson", "hazards_addressed": ["Dust from tile removal and floor preparation"]},
   {"step_number": 3, "description": "Strip out sanitaryware, tiling and fittings, using team lift for heavy items.", "responsible": "Lead tradesperson", "hazards_addressed": ["Manual handling during strip-out (bath, tiles, sanitaryware)"]},
   {"step_number": 4, "description": "First-fix plumbing and electrics to new layout, respecting bathroom electrical zones.", "responsible": "Lead tradesperson", "hazards_addressed": ["Electric shock from electrics in a wet zone"]},
   {"step_number": 5, "description": "Waterproof (tank) wet areas before tiling, allow to cure per manufacturer instructions.", "responsible": "Lead tradesperson", "hazards_addressed": []},
   {"step_number": 6, "description": "Tile walls and floor, cutting tiles at a dedicated station away from occupied areas.", "responsible": "Lead tradesperson", "hazards_addressed": ["Cutting tiles — flying debris and noise"]},
   {"step_number": 7, "description": "Second-fix sanitaryware and electrics, pressure test all new plumbing connections.", "responsible": "Lead tradesperson", "hazards_addressed": ["Water damage to adjoining rooms during plumbing works"]},
   {"step_number": 8, "description": "Test electrics (RCD, polarity), clean down, remove protection and hand over to client.", "responsible": "Lead tradesperson", "hazards_addressed": []}
 ]'::jsonb,
 '["Safety glasses", "Gloves", "Dust mask/RPE", "Knee pads", "Ear protection"]'::jsonb,
 'In the event of injury from broken sanitaryware or tiles, apply first aid and seek medical attention for deep cuts. If a water leak causes flooding, isolate the mains stopcock immediately and inform the client. If dust exposure causes breathing difficulty, move the affected person to fresh air and seek medical advice if symptoms persist.'),

(NULL, 'Kitchen Installation',
 'Full kitchen strip-out and installation including units, worktops, plumbing and electrics.',
 'Multi-trade',
 '[
   {"hazard": "Manual handling of units, worktops and appliances", "risk_level": "medium", "control_measures": "Team lift for worktops and appliances, use of trolleys/sack trucks, plan lifting routes in advance to avoid awkward turns on stairs.", "residual_risk": "low"},
   {"hazard": "Cutting worktops — dust and vibration", "risk_level": "medium", "control_measures": "RPE and eye protection worn when cutting, dust extraction fitted to saw where possible, work carried out outdoors or in ventilated area where practical.", "residual_risk": "low"},
   {"hazard": "Gas and electrical connections for appliances (hob, oven)", "risk_level": "high", "control_measures": "Only Gas Safe registered engineer to connect gas appliances, isolate electrics before connecting new circuits, all connections tested before handover.", "residual_risk": "low"},
   {"hazard": "Working with power tools in confined kitchen space", "risk_level": "medium", "control_measures": "Keep work area tidy, cables routed to avoid trip hazards, adequate lighting maintained throughout.", "residual_risk": "low"},
   {"hazard": "Client kitchen out of use — food safety/hygiene during works", "risk_level": "low", "control_measures": "Agree temporary kitchen arrangements with client, keep dust sheeting over any areas client needs to access.", "residual_risk": "low"}
 ]'::jsonb,
 '[
   {"step_number": 1, "description": "Isolate gas, water and electrical supplies to the kitchen before strip-out.", "responsible": "Lead fitter", "hazards_addressed": ["Gas and electrical connections for appliances (hob, oven)"]},
   {"step_number": 2, "description": "Strip out existing units, worktops and appliances using safe manual handling technique.", "responsible": "Lead fitter", "hazards_addressed": ["Manual handling of units, worktops and appliances"]},
   {"step_number": 3, "description": "First-fix plumbing and electrics to new kitchen layout.", "responsible": "Lead fitter", "hazards_addressed": []},
   {"step_number": 4, "description": "Install base and wall units, levelled and fixed securely to structure.", "responsible": "Lead fitter", "hazards_addressed": []},
   {"step_number": 5, "description": "Template and cut worktops, using RPE and eye protection, dust extraction where available.", "responsible": "Lead fitter", "hazards_addressed": ["Cutting worktops — dust and vibration"]},
   {"step_number": 6, "description": "Fit worktops with team lift, connect sink and appliances.", "responsible": "Lead fitter", "hazards_addressed": ["Manual handling of units, worktops and appliances"]},
   {"step_number": 7, "description": "Connect gas appliances (Gas Safe engineer) and test tightness; test electrical appliances and circuits.", "responsible": "Gas Safe engineer / Lead fitter", "hazards_addressed": ["Gas and electrical connections for appliances (hob, oven)"]},
   {"step_number": 8, "description": "Fit doors, handles and trims, clean down and hand over to client.", "responsible": "Lead fitter", "hazards_addressed": []}
 ]'::jsonb,
 '["Safety glasses", "Gloves", "Dust mask/RPE", "Ear protection", "Safety boots"]'::jsonb,
 'In the event of a suspected gas leak during appliance connection, stop work immediately, ventilate the area and call the National Gas Emergency Service on 0800 111 999. For cuts from worktop cutting or manual handling injuries, apply first aid and seek medical attention as needed.'),

(NULL, 'Roofing — Pitched Roof',
 'Re-roofing, repairs and re-tiling works on pitched domestic or light commercial roofs.',
 'Roofing',
 '[
   {"hazard": "Falls from height (roof edge, ladders, scaffold)", "risk_level": "high", "control_measures": "Full edge protection or scaffold with guard rails erected before work starts, compliant with Work at Height Regulations 2005. Ladders used only for access, tied and footed, never as a working platform for roofing tasks.", "residual_risk": "medium"},
   {"hazard": "Falling materials/tools striking people below", "risk_level": "high", "control_measures": "Exclusion zone at ground level beneath work area, debris netting/toe boards on scaffold, tools tethered where practical.", "residual_risk": "low"},
   {"hazard": "Fragile roof materials (old slates, roof lights)", "risk_level": "high", "control_measures": "Treat all roof materials as fragile until proven otherwise, use crawl boards/roof ladders to distribute weight, never step directly on roof lights.", "residual_risk": "medium"},
   {"hazard": "Manual handling of tiles, battens and timber", "risk_level": "medium", "control_measures": "Mechanical hoist or roof conveyor used for lifting materials to height where available, team lift for heavy bundles, materials stacked evenly on scaffold to avoid overload.", "residual_risk": "low"},
   {"hazard": "Adverse weather (wind, rain, ice)", "risk_level": "medium", "control_measures": "Work at height stopped in high winds (per scaffold/access equipment manufacturer limits) or icy conditions. Weather forecast checked daily before starting.", "residual_risk": "low"},
   {"hazard": "Asbestos cement roofing/fittings on older properties", "risk_level": "high", "control_measures": "Visual assessment before work begins, treat suspect material as ACM, do not break up or power-tool suspect sheets — stop and seek specialist advice.", "residual_risk": "medium"}
 ]'::jsonb,
 '[
   {"step_number": 1, "description": "Survey roof, confirm access method (scaffold/tower) and check for asbestos cement components.", "responsible": "Site supervisor", "hazards_addressed": ["Asbestos cement roofing/fittings on older properties"]},
   {"step_number": 2, "description": "Erect scaffold or tower with full edge protection, guard rails and toe boards, inspected before use.", "responsible": "Scaffolder / Site supervisor", "hazards_addressed": ["Falls from height (roof edge, ladders, scaffold)"]},
   {"step_number": 3, "description": "Set up ground-level exclusion zone and debris netting before any materials are moved to height.", "responsible": "Site supervisor", "hazards_addressed": ["Falling materials/tools striking people below"]},
   {"step_number": 4, "description": "Strip existing roof covering, using crawl boards on the roof structure at all times.", "responsible": "Roofer", "hazards_addressed": ["Fragile roof materials (old slates, roof lights)"]},
   {"step_number": 5, "description": "Inspect and repair/replace roof timbers as required, check condition before loading.", "responsible": "Roofer", "hazards_addressed": []},
   {"step_number": 6, "description": "Lift battens, felt and tiles to roof level using hoist/conveyor, distribute load evenly.", "responsible": "Roofer", "hazards_addressed": ["Manual handling of tiles, battens and timber"]},
   {"step_number": 7, "description": "Fit breathable membrane, battens and tiles to manufacturer specification.", "responsible": "Roofer", "hazards_addressed": []},
   {"step_number": 8, "description": "Remove scaffold/access equipment, clear debris, final inspection of roof and gutters.", "responsible": "Roofer / Site supervisor", "hazards_addressed": []}
 ]'::jsonb,
 '["Hard hat", "Safety boots", "Hi-vis vest", "Safety glasses", "Gloves", "Harness"]'::jsonb,
 'In the event of a fall from height, do not move the casualty unless in immediate danger, call 999 immediately and provide first aid within competence. In the event of suspected asbestos disturbance, stop work, evacuate the immediate area, and contact the office for specialist advice. Work stops immediately in high winds or lightning risk.'),

(NULL, 'Roofing — Flat Roof',
 'Flat roof covering replacement (felt, GRP fibreglass, or single-ply membrane) including hot works where applicable.',
 'Roofing',
 '[
   {"hazard": "Falls from height (roof edge)", "risk_level": "high", "control_measures": "Edge protection (guard rails) erected around the full perimeter before work starts, or use of a demarcated exclusion zone with physical barrier where a low-level flat roof and short duration work qualifies for an alternative control under a documented risk assessment.", "residual_risk": "medium"},
   {"hazard": "Hot works — gas torch used for felt/membrane bonding", "risk_level": "high", "control_measures": "Hot works permit obtained where required by site/insurer, fire extinguisher and fire blanket on site at all times, area checked for 60 minutes after hot works complete (fire watch), no hot works within 1m of combustible materials without protection.", "residual_risk": "medium"},
   {"hazard": "Fumes from bitumen/adhesives", "risk_level": "medium", "control_measures": "Work in well-ventilated conditions, RPE worn when specified by product data sheet, avoid prolonged exposure — rotate tasks.", "residual_risk": "low"},
   {"hazard": "Manual handling of felt rolls and roofing materials", "risk_level": "medium", "control_measures": "Mechanical lifting to roof level where available, team lift for heavy rolls, correct manual handling technique.", "residual_risk": "low"},
   {"hazard": "Slips on wet or newly-coated surfaces", "risk_level": "medium", "control_measures": "Sequence work to avoid standing on freshly applied material, non-slip footwear, cordon off curing areas.", "residual_risk": "low"}
 ]'::jsonb,
 '[
   {"step_number": 1, "description": "Survey roof, confirm edge protection method and obtain hot works permit if required.", "responsible": "Site supervisor", "hazards_addressed": ["Falls from height (roof edge)", "Hot works — gas torch used for felt/membrane bonding"]},
   {"step_number": 2, "description": "Erect edge protection around full roof perimeter before any works commence.", "responsible": "Roofer", "hazards_addressed": ["Falls from height (roof edge)"]},
   {"step_number": 3, "description": "Strip existing covering down to deck, inspect deck condition before re-covering.", "responsible": "Roofer", "hazards_addressed": []},
   {"step_number": 4, "description": "Lift new roofing materials to roof level, position fire extinguisher and fire blanket if hot works planned.", "responsible": "Roofer", "hazards_addressed": ["Manual handling of felt rolls and roofing materials", "Hot works — gas torch used for felt/membrane bonding"]},
   {"step_number": 5, "description": "Apply new covering (felt/GRP/single-ply) to manufacturer specification, working in a well-ventilated sequence.", "responsible": "Roofer", "hazards_addressed": ["Fumes from bitumen/adhesives"]},
   {"step_number": 6, "description": "Where hot works used, carry out a fire watch of the area for a minimum of 60 minutes after works complete.", "responsible": "Roofer", "hazards_addressed": ["Hot works — gas torch used for felt/membrane bonding"]},
   {"step_number": 7, "description": "Allow material to cure per manufacturer instructions, cordon off area to prevent foot traffic.", "responsible": "Roofer", "hazards_addressed": ["Slips on wet or newly-coated surfaces"]},
   {"step_number": 8, "description": "Remove edge protection, clear debris, final inspection and water test if required.", "responsible": "Roofer / Site supervisor", "hazards_addressed": []}
 ]'::jsonb,
 '["Hard hat", "Safety boots", "Hi-vis vest", "Safety glasses", "Gloves", "Harness"]'::jsonb,
 'In the event of fire during hot works, use the fire extinguisher/fire blanket immediately if safe to do so and call 999. Evacuate the area if the fire cannot be controlled. In the event of a fall from height, call 999 immediately and do not move the casualty unless in immediate danger. Fire watch to remain on site for a minimum of 60 minutes after any hot works.'),

(NULL, 'General Building — Groundworks',
 'Excavation, drainage and foundation works for extensions, patios and general groundworks.',
 'Groundworks',
 '[
   {"hazard": "Excavation collapse", "risk_level": "high", "control_measures": "Excavations over 1.2m deep to be battered, benched or supported before entry. No entry to unsupported deep excavations. Spoil stored at least 1m back from excavation edge.", "residual_risk": "medium"},
   {"hazard": "Striking underground services (gas, electric, water)", "risk_level": "high", "control_measures": "Utility drawings/CAT scan (cable avoidance tool) used before any excavation. Hand-dig trial holes near suspected services — no mechanical excavation within 0.5m of a marked service.", "residual_risk": "medium"},
   {"hazard": "Plant/excavator movement near people", "risk_level": "high", "control_measures": "Trained/competent operator only, exclusion zone maintained around moving plant, banksman used for reversing manoeuvres and tight access.", "residual_risk": "medium"},
   {"hazard": "Manual handling of blocks, aggregate and drainage materials", "risk_level": "medium", "control_measures": "Mechanical handling (barrow, dumper) used where possible, team lift for heavy items, correct technique for repetitive tasks.", "residual_risk": "low"},
   {"hazard": "Noise and vibration from breakers/compactors", "risk_level": "medium", "control_measures": "Hearing protection worn, exposure time to vibrating tools monitored and rotated between operatives (HAVS management).", "residual_risk": "low"},
   {"hazard": "Falls into open excavations", "risk_level": "medium", "control_measures": "Excavations barriered or covered when unattended, especially overnight, warning signage displayed.", "residual_risk": "low"}
 ]'::jsonb,
 '[
   {"step_number": 1, "description": "Review site plans and carry out CAT scan survey to locate underground services before any digging.", "responsible": "Site supervisor", "hazards_addressed": ["Striking underground services (gas, electric, water)"]},
   {"step_number": 2, "description": "Set out excavation lines and confirm safe method of excavation (hand dig near services, mechanical elsewhere).", "responsible": "Site supervisor", "hazards_addressed": []},
   {"step_number": 3, "description": "Excavate to required depth, supporting/battening excavations over 1.2m before entry.", "responsible": "Groundworker", "hazards_addressed": ["Excavation collapse"]},
   {"step_number": 4, "description": "Maintain exclusion zone around excavator during operation, banksman to direct all plant movements.", "responsible": "Excavator operator / Banksman", "hazards_addressed": ["Plant/excavator movement near people"]},
   {"step_number": 5, "description": "Install drainage/foundations as specified, working within supported sections only.", "responsible": "Groundworker", "hazards_addressed": ["Excavation collapse"]},
   {"step_number": 6, "description": "Compact and backfill using mechanical compactor, hearing protection worn throughout.", "responsible": "Groundworker", "hazards_addressed": ["Noise and vibration from breakers/compactors"]},
   {"step_number": 7, "description": "Barrier or cover any excavation left open at the end of the working day.", "responsible": "Site supervisor", "hazards_addressed": ["Falls into open excavations"]},
   {"step_number": 8, "description": "Final inspection, remove barriers/plant, reinstate surrounding area.", "responsible": "Site supervisor", "hazards_addressed": []}
 ]'::jsonb,
 '["Hard hat", "Safety boots", "Hi-vis vest", "Safety glasses", "Gloves", "Ear protection"]'::jsonb,
 'In the event of a struck service: stop work immediately, evacuate the area if gas or electric is suspected, and call the relevant emergency utility number (Gas: 0800 111 999). In the event of excavation collapse or entrapment, call 999 immediately, do not enter the excavation to attempt rescue.'),

(NULL, 'Painting & Decorating — Interior',
 'Interior painting, wallpapering and minor preparation works in occupied properties.',
 'Painting & Decorating',
 '[
   {"hazard": "Working at height (stepladders, low-level access towers)", "risk_level": "medium", "control_measures": "Stepladders used only for short-duration, light work with 3 points of contact maintained, inspected before use. Access tower used for ceiling/stairwell work, erected by a competent person.", "residual_risk": "low"},
   {"hazard": "Exposure to solvents/fumes from paints and strippers", "risk_level": "medium", "control_measures": "Work in well-ventilated areas, windows open where possible, low-VOC products used where available, RPE worn when using solvent-based products in confined spaces.", "residual_risk": "low"},
   {"hazard": "Lead paint dust on pre-1960s properties during sanding", "risk_level": "medium", "control_measures": "Assume lead paint present on older properties, wet-sand or use a chemical stripper rather than dry sanding, RPE (P3) and disposable coveralls worn if dry sanding cannot be avoided.", "residual_risk": "low"},
   {"hazard": "Slips/trips from dust sheets, cables and equipment", "risk_level": "low", "control_measures": "Keep work area tidy, route cables away from walkways, secure dust sheet edges.", "residual_risk": "low"},
   {"hazard": "Client and household members present during works", "risk_level": "low", "control_measures": "Agree access arrangements with client, keep paint/solvents out of reach of children, ventilate rooms before client re-occupies.", "residual_risk": "low"}
 ]'::jsonb,
 '[
   {"step_number": 1, "description": "Survey property, assess age for lead paint risk, agree access and room-by-room schedule with client.", "responsible": "Decorator", "hazards_addressed": ["Lead paint dust on pre-1960s properties during sanding"]},
   {"step_number": 2, "description": "Protect flooring and furniture with dust sheets, remove/cover fixtures as needed.", "responsible": "Decorator", "hazards_addressed": ["Slips/trips from dust sheets, cables and equipment"]},
   {"step_number": 3, "description": "Prepare surfaces — wet-sand or chemically strip where lead paint is suspected, RPE worn if dry sanding unavoidable.", "responsible": "Decorator", "hazards_addressed": ["Lead paint dust on pre-1960s properties during sanding"]},
   {"step_number": 4, "description": "Set up access equipment for ceilings/stairwells, stepladders inspected before use.", "responsible": "Decorator", "hazards_addressed": ["Working at height (stepladders, low-level access towers)"]},
   {"step_number": 5, "description": "Apply primer/undercoat, ensuring adequate ventilation throughout.", "responsible": "Decorator", "hazards_addressed": ["Exposure to solvents/fumes from paints and strippers"]},
   {"step_number": 6, "description": "Apply top coats/wallpaper to specification, allowing recommended drying time between coats.", "responsible": "Decorator", "hazards_addressed": []},
   {"step_number": 7, "description": "Remove dust sheets and protection, clean down, ventilate rooms before client re-occupies.", "responsible": "Decorator", "hazards_addressed": []}
 ]'::jsonb,
 '["Dust mask/RPE", "Gloves", "Safety glasses"]'::jsonb,
 'In the event of a fall from a stepladder or access tower, apply first aid and call 999 if injury is significant. If solvent fumes cause dizziness or nausea, move to fresh air immediately and seek medical advice if symptoms persist. If lead paint dust exposure is suspected, stop dry sanding immediately and switch to wet methods.'),

(NULL, 'Landscaping & External Works',
 'Garden landscaping, patios, fencing and external hard/soft landscaping works.',
 'Landscaping',
 '[
   {"hazard": "Manual handling of paving slabs, sleepers and turf", "risk_level": "medium", "control_measures": "Mechanical handling (barrow, plate trolley) used where possible, team lift for heavy slabs/sleepers, correct lifting technique for repetitive tasks.", "residual_risk": "low"},
   {"hazard": "Use of power tools (disc cutters, strimmers, chainsaws)", "risk_level": "high", "control_measures": "Only competent/trained operatives to use chainsaws and disc cutters, guards fitted and checked before use, PPE worn as specified by the tool manufacturer, exclusion zone maintained around cutting operations.", "residual_risk": "medium"},
   {"hazard": "Striking underground services when digging post holes/foundations", "risk_level": "high", "control_measures": "CAT scan survey before digging, hand-dig near suspected service routes, utility plans checked where available.", "residual_risk": "medium"},
   {"hazard": "Flying debris from cutting slabs/blocks", "risk_level": "medium", "control_measures": "Eye protection worn at all times when cutting, cutting station positioned away from client access routes and neighbouring properties, water-fed disc cutter used to suppress dust where practical.", "residual_risk": "low"},
   {"hazard": "Weather exposure (sun, rain, cold) — outdoor working", "risk_level": "low", "control_measures": "Appropriate clothing for conditions, sun protection/hydration in hot weather, work paused in severe weather.", "residual_risk": "low"},
   {"hazard": "Uneven/sloping ground causing trips and falls", "risk_level": "low", "control_measures": "Site walked and hazards identified before work starts, materials stacked on level, stable ground.", "residual_risk": "low"}
 ]'::jsonb,
 '[
   {"step_number": 1, "description": "Survey site, walk the ground for trip hazards and carry out CAT scan survey before any digging.", "responsible": "Lead landscaper", "hazards_addressed": ["Striking underground services when digging post holes/foundations", "Uneven/sloping ground causing trips and falls"]},
   {"step_number": 2, "description": "Set out work area, establish material storage and cutting station away from access routes.", "responsible": "Lead landscaper", "hazards_addressed": ["Flying debris from cutting slabs/blocks"]},
   {"step_number": 3, "description": "Excavate for foundations/post holes by hand near any marked services, mechanically elsewhere.", "responsible": "Lead landscaper", "hazards_addressed": ["Striking underground services when digging post holes/foundations"]},
   {"step_number": 4, "description": "Move and position paving/sleepers using mechanical aids and team lifting for heavy items.", "responsible": "Lead landscaper", "hazards_addressed": ["Manual handling of paving slabs, sleepers and turf"]},
   {"step_number": 5, "description": "Cut paving/blocks at the designated station, eye protection worn, water suppression used where available.", "responsible": "Lead landscaper", "hazards_addressed": ["Flying debris from cutting slabs/blocks"]},
   {"step_number": 6, "description": "Carry out fencing/timber work using power tools only by competent operatives, guards checked before use.", "responsible": "Lead landscaper", "hazards_addressed": ["Use of power tools (disc cutters, strimmers, chainsaws)"]},
   {"step_number": 7, "description": "Complete planting/turfing, clear site of debris and offcuts.", "responsible": "Lead landscaper", "hazards_addressed": []},
   {"step_number": 8, "description": "Final walk-round with client, remove all tools and materials from site.", "responsible": "Lead landscaper", "hazards_addressed": []}
 ]'::jsonb,
 '["Safety boots", "Hi-vis vest", "Safety glasses", "Gloves", "Ear protection"]'::jsonb,
 'In the event of a struck underground service, stop work immediately and evacuate the area if gas or electric is suspected — call 0800 111 999 for gas. In the event of injury from power tools, apply first aid immediately and call 999 for serious lacerations or amputation risk. Keep chainsaws and disc cutters locked away when not in direct use, especially where children may access the site.');
