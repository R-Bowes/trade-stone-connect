// Internal/service-to-service function — no end-user JWT is expected.
// Called from:
//   - job creation / approval flow → { action: 'start', job_id }
//   - a scheduled cron invocation (and ad-hoc per-job checks) → { action: 'check', job_id? }
//
// supabase.functions.invoke('sla-clock', { body: { action: 'start', job_id } })

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function addHours(iso: string, hours: number): string {
  return new Date(new Date(iso).getTime() + hours * 60 * 60 * 1000).toISOString();
}

interface JobRow {
  id: string;
  sla_rule_id: string | null;
  priority: string | null;
  company_id: string | null;
  contractor_id: string;
  created_at: string;
  responded_at: string | null;
  sla_response_due: string | null;
  sla_completion_due: string | null;
  sla_status: string | null;
}

interface SlaRuleRow {
  id: string;
  response_hours: number;
  resolution_hours: number;
  attendance_hours: number | null;
  alert_pct: number;
  business_hours_only: boolean;
}

// deno-lint-ignore no-explicit-any
async function notifyParties(
  supabase: any,
  companyId: string | null,
  contractorId: string | null,
  jobId: string,
  type: string,
  title: string,
  message: string,
) {
  const recipientUserIds: string[] = [];

  if (companyId) {
    const { data: company } = await supabase
      .from("companies")
      .select("owner_id")
      .eq("id", companyId)
      .maybeSingle();
    if (company?.owner_id) {
      const { data: ownerProfile } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("id", company.owner_id)
        .maybeSingle();
      if (ownerProfile?.user_id) recipientUserIds.push(ownerProfile.user_id);
    }
  }

  if (contractorId) {
    const { data: contractorProfile } = await supabase
      .from("profiles")
      .select("user_id")
      .eq("id", contractorId)
      .maybeSingle();
    if (contractorProfile?.user_id) recipientUserIds.push(contractorProfile.user_id);
  }

  if (!recipientUserIds.length) return;

  await supabase.from("notifications").insert(
    recipientUserIds.map((user_id) => ({
      user_id,
      type,
      title,
      message,
      reference_type: "job",
      reference_id: jobId,
    })),
  );
}

// deno-lint-ignore no-explicit-any
async function handleStart(supabase: any, jobId: string) {
  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select("id, sla_rule_id, priority, company_id, created_at")
    .eq("id", jobId)
    .maybeSingle();

  if (jobError) throw jobError;
  if (!job) return json(404, { success: false, error: "Job not found" });

  if (!job.sla_rule_id) {
    return json(200, { success: true, skipped: true, reason: "no_sla_rule" });
  }

  const { data: slaRule, error: ruleError } = await supabase
    .from("sla_rules")
    .select("id, response_hours, resolution_hours, attendance_hours, alert_pct, business_hours_only")
    .eq("id", job.sla_rule_id)
    .maybeSingle();

  if (ruleError) throw ruleError;
  if (!slaRule) return json(200, { success: true, skipped: true, reason: "sla_rule_not_found" });

  // TODO: business_hours_only support — at MVP we compute pure calendar-hour offsets
  // from job.created_at regardless of business_hours_only/business_hours_start/business_hours_end.
  // Proper implementation needs to walk forward hour-by-hour (or day-by-day), skipping
  // weekends and out-of-window hours, when slaRule.business_hours_only is true.
  const slaResponseDue = addHours(job.created_at, slaRule.response_hours);
  const slaAttendanceDue =
    slaRule.attendance_hours != null ? addHours(job.created_at, slaRule.attendance_hours) : null;
  const slaCompletionDue = addHours(job.created_at, slaRule.resolution_hours);

  const { error: updateError } = await supabase
    .from("jobs")
    .update({
      sla_response_due: slaResponseDue,
      sla_attendance_due: slaAttendanceDue,
      sla_completion_due: slaCompletionDue,
      sla_status: "on_track",
    })
    .eq("id", jobId);

  if (updateError) throw updateError;

  const { error: eventError } = await supabase.from("sla_clock_events").insert({
    job_id: jobId,
    sla_rule_id: job.sla_rule_id,
    event_type: "started",
    clock_target: "response",
    occurred_at: new Date().toISOString(),
  });

  if (eventError) throw eventError;

  return json(200, {
    success: true,
    sla_response_due: slaResponseDue,
    sla_attendance_due: slaAttendanceDue,
    sla_completion_due: slaCompletionDue,
    sla_status: "on_track",
  });
}

// deno-lint-ignore no-explicit-any
async function handleCheck(supabase: any, jobId: string | undefined) {
  let jobs: JobRow[];

  if (jobId) {
    const { data, error } = await supabase
      .from("jobs")
      .select(
        "id, sla_rule_id, priority, company_id, contractor_id, created_at, responded_at, sla_response_due, sla_completion_due, sla_status",
      )
      .eq("id", jobId)
      .maybeSingle();
    if (error) throw error;
    jobs = data ? [data] : [];
  } else {
    const { data, error } = await supabase
      .from("jobs")
      .select(
        "id, sla_rule_id, priority, company_id, contractor_id, created_at, responded_at, sla_response_due, sla_completion_due, sla_status",
      )
      .in("sla_status", ["on_track", "at_risk"])
      .not("company_id", "is", null);
    if (error) throw error;
    jobs = data ?? [];
  }

  if (!jobs.length) return json(200, { success: true, checked: 0, breached: 0, at_risk: 0 });

  // Batch-fetch the sla_rules needed for alert_pct / resolution_hours.
  const ruleIds = [...new Set(jobs.map((j) => j.sla_rule_id).filter((id): id is string => Boolean(id)))];
  const rulesById = new Map<string, SlaRuleRow>();
  if (ruleIds.length) {
    const { data: rules, error: rulesError } = await supabase
      .from("sla_rules")
      .select("id, response_hours, resolution_hours, attendance_hours, alert_pct, business_hours_only")
      .in("id", ruleIds);
    if (rulesError) throw rulesError;
    for (const rule of rules ?? []) rulesById.set(rule.id, rule);
  }

  const now = Date.now();
  let breachedCount = 0;
  let atRiskCount = 0;

  for (const job of jobs) {
    const rule = job.sla_rule_id ? rulesById.get(job.sla_rule_id) : undefined;

    // (a) Completion breach — terminal, only fires once (status guard).
    if (
      job.sla_completion_due &&
      job.sla_status !== "breached" &&
      job.sla_status !== "met" &&
      now > new Date(job.sla_completion_due).getTime()
    ) {
      const { error: updateError } = await supabase
        .from("jobs")
        .update({ sla_status: "breached" })
        .eq("id", job.id);
      if (updateError) throw updateError;

      const { error: eventError } = await supabase.from("sla_clock_events").insert({
        job_id: job.id,
        sla_rule_id: job.sla_rule_id,
        event_type: "breached",
        clock_target: "completion",
        occurred_at: new Date().toISOString(),
      });
      if (eventError) throw eventError;

      await notifyParties(
        supabase,
        job.company_id,
        job.contractor_id,
        job.id,
        "sla_breach",
        "SLA breached",
        "An SLA completion deadline has been breached on a job.",
      );

      breachedCount++;
    } else if (
      job.sla_completion_due &&
      rule &&
      job.sla_status === "on_track" &&
      now >
        new Date(job.sla_completion_due).getTime() -
          rule.resolution_hours * 60 * 60 * 1000 * (1 - rule.alert_pct / 100)
    ) {
      // (b) At-risk warning — fires once on the on_track → at_risk transition.
      const { error: updateError } = await supabase
        .from("jobs")
        .update({ sla_status: "at_risk" })
        .eq("id", job.id);
      if (updateError) throw updateError;

      await notifyParties(
        supabase,
        job.company_id,
        job.contractor_id,
        job.id,
        "sla_at_risk",
        "SLA at risk",
        "A job is approaching its SLA completion deadline.",
      );

      atRiskCount++;
    }

    // (c) Response breach — independent of the completion clock above.
    if (job.sla_response_due && !job.responded_at && now > new Date(job.sla_response_due).getTime()) {
      const { data: existing } = await supabase
        .from("sla_clock_events")
        .select("id")
        .eq("job_id", job.id)
        .eq("event_type", "breached")
        .eq("clock_target", "response")
        .limit(1);

      if (!existing?.length) {
        const { error: eventError } = await supabase.from("sla_clock_events").insert({
          job_id: job.id,
          sla_rule_id: job.sla_rule_id,
          event_type: "breached",
          clock_target: "response",
          occurred_at: new Date().toISOString(),
        });
        if (eventError) throw eventError;
      }
    }
  }

  return json(200, { success: true, checked: jobs.length, breached: breachedCount, at_risk: atRiskCount });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Internal-only (verify_jwt=false in config.toml — no end-user JWT is
  // ever sent here). The shared secret IS the service-role key, already
  // sent as the Authorization bearer by every legitimate caller
  // (create_callout_job's net.http_post, the sla-clock-check cron body —
  // see 20260712130000_cron_secrets_to_vault.sql) since both source it
  // from the same Vault entry this env var mirrors. Closes the LATER.md
  // "sla-clock/mark-overdue-invoices have no auth" gap.
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!serviceRoleKey || authHeader !== `Bearer ${serviceRoleKey}`) {
    console.error("[sla-clock] rejected call with missing/invalid Authorization header");
    return json(401, { success: false, error: "Unauthorized" });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      serviceRoleKey,
      { auth: { persistSession: false } },
    );

    const body = await req.json().catch(() => ({}));
    const action: string | undefined = body?.action;

    if (action === "start") {
      const jobId: string | undefined = body?.job_id;
      if (!jobId || typeof jobId !== "string") {
        return json(400, { success: false, error: "job_id required" });
      }
      return await handleStart(supabase, jobId);
    }

    if (action === "check") {
      const jobId: string | undefined = body?.job_id;
      return await handleCheck(supabase, jobId);
    }

    return json(400, { success: false, error: "action must be 'start' or 'check'" });
  } catch (error: unknown) {
    console.error("[sla-clock] unexpected error:", error);
    return json(500, {
      success: false,
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
});
