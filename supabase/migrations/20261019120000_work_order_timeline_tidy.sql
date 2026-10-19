-- Work orders step 2a fixes (browser check, 19 Oct 2026). Display only — no
-- table, policy or grant changes.
--
-- 1. work_order_timeline: newest first. Ties at the same instant (one
--    transaction stamps every event with the same now()) break by the
--    logical sequence — raised → awaiting approval → approved → sent →
--    accepted → … — reversed with the time, so "Raised" never shows above
--    "Approved" for the same instant read oldest-first, and never below it
--    read newest-first.
-- 2. work_order_timeline: a value_amended that shares its instant with a
--    po_increase_approved or a cost_approved (the over-amount approval that
--    raised the amount) is merged into that line ("Approved spending £185.00
--    more — now £385.00") and not shown on its own. A value_amended with no
--    such partner is a manual change and still shows.
-- 3. Contractor shown by business name: work_order_context.contractor_name
--    and the timeline's "Sent to" / "Moved from … to …" use
--    company_name, falling back to full_name — the order every other
--    contractor display uses (invoice PDFs, inboxes, panel). New key
--    contractor_ts_code. profiles is not client-readable for members, so
--    both come through here.
-- Both functions keep their signatures and return types, so grants and the
-- generated types are unchanged.

-- ── Pre-flight ───────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF to_regprocedure('public.work_order_timeline(uuid)') IS NULL
     OR to_regprocedure('public.work_order_context(uuid)') IS NULL
     OR to_regprocedure('public._work_order_viewer(uuid)') IS NULL
     OR to_regprocedure('public._work_order_money(numeric, boolean)') IS NULL
     OR to_regprocedure('public._work_order_cost_label(jsonb)') IS NULL THEN
    RAISE EXCEPTION 'step 2a functions missing — apply 20261018120000 first';
  END IF;

  -- The merge relies on these being the only two writers that change
  -- approved_value inside an approval: approve_po_increase and
  -- approve_work_order_cost (plus amend_work_order_value, the manual change).
  IF (SELECT array_agg(p.proname::text ORDER BY p.proname)
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosrc ~* 'approved_value\s*=' AND p.prosrc ~* 'update\s+(public\.)?work_orders\M')
     IS DISTINCT FROM ARRAY['amend_work_order_value', 'approve_po_increase', 'approve_work_order_cost'] THEN
    RAISE EXCEPTION 'An unexpected function writes work_orders.approved_value — review the timeline merge first';
  END IF;
END $$;

-- ── Context: contractor by business name, plus TS code ──────────────────────

CREATE OR REPLACE FUNCTION public.work_order_context(p_work_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_viewer   text;
  v_wo       public.work_orders%ROWTYPE;
  v_company  public.companies%ROWTYPE;
  v_flags    jsonb;
  v_job      public.jobs%ROWTYPE;
  v_result   jsonb;
  v_raiser_limit jsonb;
  v_invoicing jsonb;
  v_asset    jsonb;
  v_sla      jsonb;
  v_contractor public.profiles%ROWTYPE;
BEGIN
  v_viewer := public._work_order_viewer(p_work_order_id);
  IF v_viewer IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_wo FROM public.work_orders WHERE id = p_work_order_id;
  SELECT * INTO v_company FROM public.companies WHERE id = v_wo.company_id;
  v_flags := public._work_order_company_flags(v_wo.company_id);
  IF v_wo.job_id IS NOT NULL THEN
    SELECT * INTO v_job FROM public.jobs WHERE id = v_wo.job_id;
  END IF;
  IF v_wo.dispatched_to IS NOT NULL THEN
    SELECT * INTO v_contractor FROM public.profiles WHERE id = v_wo.dispatched_to;
  END IF;

  IF v_wo.job_id IS NOT NULL AND v_job.sla_rule_id IS NOT NULL THEN
    SELECT jsonb_build_object(
      'rule_name', r.name,
      'status', v_job.sla_status,
      'response_due', v_job.sla_response_due,
      'attendance_due', v_job.sla_attendance_due,
      'completion_due', COALESCE(v_job.sla_completion_due, v_job.sla_resolution_due),
      'responded_at', v_job.responded_at
    ) INTO v_sla
    FROM public.sla_rules r WHERE r.id = v_job.sla_rule_id;
  END IF;

  IF v_wo.asset_id IS NOT NULL THEN
    SELECT jsonb_build_object(
      'id', a.id, 'name', a.name, 'category', a.category, 'make', a.make, 'model', a.model,
      'location_note', a.location_note, 'next_service_due', a.next_service_due,
      'warranty_expiry', a.warranty_expiry,
      'certificate', (
        SELECT jsonb_build_object('name', COALESCE(jc.certificate_name, jc.certificate_type), 'expiry_date', jc.expiry_date)
        FROM public.job_certificates jc
        WHERE jc.asset_id = a.id AND jc.expiry_date IS NOT NULL
        ORDER BY jc.expiry_date DESC LIMIT 1
      )
    ) INTO v_asset
    FROM public.assets a WHERE a.id = v_wo.asset_id;
  END IF;

  -- On account only: approved lines invoiced in full, in part, or not yet;
  -- and the invoices behind them paid in full, in part, or not yet.
  IF v_wo.engagement_id IS NOT NULL THEN
    SELECT jsonb_build_object(
      'approved_lines', count(*) FILTER (WHERE c.status = 'approved'),
      'invoiced_lines', count(*) FILTER (WHERE c.status = 'approved' AND c.invoice_id IS NOT NULL),
      'invoices', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', i.id, 'status', i.status, 'invoice_number', i.invoice_number))
        FROM public.invoices i
        WHERE i.id IN (SELECT DISTINCT c2.invoice_id FROM public.work_order_costs c2
                       WHERE c2.work_order_id = v_wo.id AND c2.invoice_id IS NOT NULL)
      ), '[]'::jsonb)
    ) INTO v_invoicing
    FROM public.work_order_costs c WHERE c.work_order_id = v_wo.id;
  END IF;

  IF v_viewer = 'business' THEN
    v_raiser_limit := CASE
      WHEN EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_company.owner_id AND p.user_id = v_wo.raised_by)
        THEN jsonb_build_object('owner', true)
      ELSE (SELECT jsonb_build_object('owner', false, 'limit', bm.approval_limit)
            FROM public.business_members bm JOIN public.profiles p ON p.id = bm.profile_id
            WHERE bm.company_id = v_wo.company_id AND bm.status = 'active' AND p.user_id = v_wo.raised_by
            LIMIT 1)
    END;
  END IF;

  v_result := jsonb_build_object(
    'viewer', v_viewer,
    'company_name', v_company.name,
    'company_code', v_company.company_code,
    'show_po', (v_flags ->> 'show_po')::boolean,
    'multi_site', (v_flags ->> 'multi_site')::boolean,
    'multi_person', (v_flags ->> 'multi_person')::boolean,
    'contractor_vat_registered', COALESCE(v_contractor.vat_registered, false),
    'contractor_name', COALESCE(NULLIF(btrim(v_contractor.company_name), ''), v_contractor.full_name),
    'contractor_ts_code', v_contractor.ts_profile_code,
    'raised_by_name', COALESCE((SELECT p.full_name FROM public.profiles p WHERE p.id = v_wo.raised_by), v_wo.raised_by_name),
    'approved_by_name', (SELECT p.full_name FROM public.profiles p WHERE p.id = v_wo.approved_by),
    'approved_by_is_viewer', v_wo.approved_by IS NOT NULL AND v_wo.approved_by = auth.uid(),
    'site_name', (SELECT s.name FROM public.sites s WHERE s.id = v_wo.site_id),
    'has_agreed_rates', v_wo.engagement_id IS NOT NULL AND v_wo.rate_snapshot IS NOT NULL,
    'on_account', v_wo.engagement_id IS NOT NULL,
    'job', CASE WHEN v_wo.job_id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_job.id, 'status', v_job.status, 'actual_start', v_job.actual_start,
      'completed_at', v_job.completed_at, 'job_number', v_job.job_number) END,
    'sla', v_sla,
    'asset', v_asset,
    'invoicing', v_invoicing
  );

  IF v_viewer = 'business' THEN
    v_result := v_result || jsonb_build_object(
      'raiser_limit', v_raiser_limit,
      'can_act', public._can_review_work_order_costs(v_wo.company_id, v_wo.site_id),
      'can_approve_value', CASE WHEN v_wo.approved_value IS NULL THEN false
                                ELSE public._can_sign_off_amount(v_wo.company_id, v_wo.site_id, v_wo.approved_value) END
    );
  END IF;

  RETURN v_result;
END;
$function$;

-- ── Timeline: newest first, logical tie-break, merged amount changes ────────

CREATE OR REPLACE FUNCTION public.work_order_timeline(p_work_order_id uuid)
RETURNS TABLE (
  occurred_at timestamptz,
  kind       text,
  actor_name text,
  title      text,
  body       text,
  photos     jsonb
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_viewer text;
  v_wo     public.work_orders%ROWTYPE;
  v_vat    boolean;
BEGIN
  v_viewer := public._work_order_viewer(p_work_order_id);
  IF v_viewer IS NULL THEN
    RETURN;
  END IF;

  SELECT * INTO v_wo FROM public.work_orders WHERE id = p_work_order_id;
  v_vat := COALESCE((SELECT p.vat_registered FROM public.profiles p WHERE p.id = v_wo.dispatched_to), false);

  RETURN QUERY
  SELECT t.occurred_at, t.kind, t.actor_name, t.title, t.body, t.photos
  FROM (
    SELECT
      e.created_at AS occurred_at,
      e.event_type AS kind,
      (SELECT p.full_name FROM public.profiles p WHERE p.id = e.actor_id) AS actor_name,
      CASE e.event_type
        WHEN 'raised' THEN 'Raised'
        WHEN 'awaiting_approval' THEN 'Waiting for approval: ' || public._work_order_money((e.payload ->> 'value')::numeric, v_vat)
        WHEN 'approved' THEN COALESCE('Approved: ' || public._work_order_money((e.payload ->> 'value')::numeric, v_vat), 'Approved')
        WHEN 'value_amended' THEN COALESCE('Approved amount changed: ' || public._work_order_money((e.payload ->> 'old')::numeric, v_vat) || ' → ',
                                           'Approved amount set to ')
                                  || public._work_order_money((e.payload ->> 'new')::numeric, v_vat)
        WHEN 'dispatched' THEN 'Sent to ' || COALESCE((SELECT COALESCE(NULLIF(btrim(p.company_name), ''), p.full_name) FROM public.profiles p WHERE p.id = (e.payload ->> 'contractor_id')::uuid), 'the contractor')
        WHEN 'reassigned' THEN 'Moved from ' || COALESCE((SELECT COALESCE(NULLIF(btrim(p.company_name), ''), p.full_name) FROM public.profiles p WHERE p.id = (e.payload ->> 'from_contractor_id')::uuid), 'the previous contractor')
                               || ' to ' || COALESCE((SELECT COALESCE(NULLIF(btrim(p.company_name), ''), p.full_name) FROM public.profiles p WHERE p.id = (e.payload ->> 'contractor_id')::uuid), 'a new contractor')
        WHEN 'accepted' THEN 'Accepted'
        WHEN 'declined' THEN 'Declined'
        WHEN 'cancelled' THEN 'Cancelled'
        WHEN 'completed' THEN 'Completed'
        WHEN 'cost_recorded' THEN 'Cost added: ' || public._work_order_cost_label(e.payload) || ', '
                                  || public._work_order_money((e.payload ->> 'line_total')::numeric, v_vat)
        WHEN 'cost_amended' THEN 'Cost changed: ' || public._work_order_cost_label(e.payload || (e.payload -> 'new')) || ', '
                                 || public._work_order_money((e.payload -> 'old' ->> 'line_total')::numeric, v_vat) || ' → '
                                 || public._work_order_money((e.payload -> 'new' ->> 'line_total')::numeric, v_vat)
        WHEN 'cost_approved' THEN 'Cost approved: ' || public._work_order_cost_label(e.payload) || ', '
                                  || public._work_order_money((e.payload ->> 'line_total')::numeric, v_vat)
                                  || COALESCE(' — approved amount now ' || public._work_order_money((va.payload ->> 'new')::numeric, v_vat), '')
        WHEN 'cost_queried' THEN 'Cost queried: ' || public._work_order_cost_label(e.payload)
        WHEN 'cost_rejected' THEN 'Cost turned down: ' || public._work_order_cost_label(e.payload)
        WHEN 'cost_invoiced' THEN 'Invoiced: ' || public._work_order_cost_label(e.payload) || ', '
                                  || public._work_order_money((e.payload ->> 'line_total')::numeric, v_vat)
        WHEN 'po_increase_requested' THEN 'Asked to spend ' || public._work_order_money((e.payload ->> 'amount')::numeric, v_vat) || ' more'
        WHEN 'po_increase_approved' THEN 'Approved spending ' || public._work_order_money((e.payload ->> 'amount')::numeric, v_vat) || ' more'
                                         || COALESCE(' — now ' || public._work_order_money((va.payload ->> 'new')::numeric, v_vat), '')
        WHEN 'po_increase_declined' THEN 'Turned down spending ' || public._work_order_money((e.payload ->> 'amount')::numeric, v_vat) || ' more'
        WHEN 'po_increase_withdrawn' THEN 'Withdrew the request to spend ' || public._work_order_money((e.payload ->> 'amount')::numeric, v_vat) || ' more'
      END AS title,
      CASE
        WHEN e.event_type = 'cost_recorded' AND (e.payload ->> 'auto_approved')::boolean THEN 'Within the approved amount, so approved straight away.'
        ELSE e.payload ->> 'reason'
      END AS body,
      CASE WHEN e.event_type = 'po_increase_requested' THEN e.payload -> 'photos' END AS photos
    FROM public.work_order_events e
    -- The amount change made by this approval, if any (same transaction, same instant).
    LEFT JOIN LATERAL (
      SELECT x.payload FROM public.work_order_events x
      WHERE e.event_type IN ('po_increase_approved', 'cost_approved')
        AND x.work_order_id = e.work_order_id AND x.event_type = 'value_amended' AND x.created_at = e.created_at
      ORDER BY (x.payload ->> 'new')::numeric DESC NULLS LAST
      LIMIT 1
    ) va ON true
    WHERE e.work_order_id = p_work_order_id
      AND (v_viewer = 'business' OR e.audience = 'all')
      -- An amount change folded into its approval line is not shown separately.
      AND NOT (e.event_type = 'value_amended' AND EXISTS (
        SELECT 1 FROM public.work_order_events x
        WHERE x.work_order_id = e.work_order_id AND x.created_at = e.created_at
          AND x.event_type IN ('po_increase_approved', 'cost_approved')
          AND (v_viewer = 'business' OR x.audience = 'all')
      ))

    UNION ALL
    SELECT j.actual_start, 'job_started', NULL, 'Work started', NULL, NULL::jsonb
    FROM public.jobs j WHERE j.id = v_wo.job_id AND j.actual_start IS NOT NULL

    UNION ALL
    SELECT j.completed_at, 'job_completed', NULL, 'Work finished', NULL, NULL::jsonb
    FROM public.jobs j WHERE j.id = v_wo.job_id AND j.completed_at IS NOT NULL

    UNION ALL
    SELECT m.created_at, 'message', (SELECT p.full_name FROM public.profiles p WHERE p.id = m.sender_id), NULL, m.content, NULL::jsonb
    FROM public.job_conversations jc
    JOIN public.job_messages m ON m.conversation_id = jc.id
    WHERE jc.job_id = v_wo.job_id AND v_wo.job_id IS NOT NULL AND m.message_type = 'message'

    UNION ALL
    SELECT ph.created_at, 'photo', (SELECT p.full_name FROM public.profiles p WHERE p.id = ph.uploaded_by),
           COALESCE(ph.caption, ph.title, 'Photo added'), ph.description,
           jsonb_build_array(jsonb_build_object('bucket', 'job-photos', 'path', ph.storage_path, 'url', ph.photo_url))
    FROM public.job_photos ph
    WHERE ph.job_id = v_wo.job_id AND v_wo.job_id IS NOT NULL
      AND (v_viewer = 'contractor' OR ph.visibility = 'customer')
  ) t
  ORDER BY t.occurred_at DESC,
    -- Logical sequence for ties at one instant, reversed with the time.
    CASE t.kind
      WHEN 'raised' THEN 1 WHEN 'awaiting_approval' THEN 2 WHEN 'approved' THEN 3 WHEN 'value_amended' THEN 4
      WHEN 'dispatched' THEN 5 WHEN 'declined' THEN 6 WHEN 'reassigned' THEN 7 WHEN 'accepted' THEN 8
      WHEN 'job_started' THEN 9 WHEN 'po_increase_requested' THEN 10 WHEN 'po_increase_withdrawn' THEN 11
      WHEN 'po_increase_declined' THEN 12 WHEN 'po_increase_approved' THEN 13 WHEN 'cost_recorded' THEN 14
      WHEN 'cost_amended' THEN 15 WHEN 'cost_queried' THEN 16 WHEN 'cost_rejected' THEN 17 WHEN 'cost_approved' THEN 18
      WHEN 'message' THEN 19 WHEN 'photo' THEN 20 WHEN 'job_completed' THEN 21 WHEN 'completed' THEN 22
      WHEN 'cost_invoiced' THEN 23 WHEN 'cancelled' THEN 24 ELSE 25
    END DESC;
END;
$function$;

-- ── Post-flight ──────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT has_function_privilege('authenticated', 'public.work_order_timeline(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.work_order_context(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.work_order_timeline(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.work_order_context(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'grants on work_order_timeline / work_order_context changed';
  END IF;
END $$;
