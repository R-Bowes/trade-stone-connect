// supabase/functions/notify-overdue-visits/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// Cron-triggered, daily at 08:00 (after mark_overdue_visits() runs directly
// in SQL at 07:00 — see 20260806100000_ppm_automation.sql). Two jobs:
//   1. Notify the FM company (owner + active business_members) and the
//      assigned contractor for visits that just went overdue.
//   2. Remind the assigned contractor of visits due within 7 days that are
//      still unconfirmed.
// Both are deduped via the notifications table itself (no separate
// tracking table) — checked per visit before inserting.
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

serve(async (req) => {
  // Internal-only (verify_jwt=false in config.toml — cron-invoked, no
  // end-user JWT expected). Same shared-secret pattern as
  // insurance-expiry-check / mark-overdue-invoices.
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!serviceRoleKey || authHeader !== `Bearer ${serviceRoleKey}`) {
    console.error("[notify-overdue-visits] rejected call with missing/invalid Authorization header");
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      serviceRoleKey,
      { auth: { persistSession: false } },
    );

    const todayStr = new Date().toISOString().slice(0, 10);
    let overdueNotified = 0;
    let reminderNotified = 0;

    // ── 1. Newly-overdue visits ──────────────────────────────────────────
    const { data: overdueVisits, error: overdueErr } = await supabase
      .from("service_visits")
      .select("id, asset_id, contractor_id, company_id, scheduled_window_end")
      .eq("status", "overdue");
    if (overdueErr) throw overdueErr;

    for (const visit of overdueVisits ?? []) {
      // Dedup: skip if an overdue notification for this visit already went
      // out in the last 24 hours.
      const { data: existing } = await supabase
        .from("notifications")
        .select("id")
        .eq("reference_type", "service_visit")
        .eq("reference_id", visit.id)
        .eq("type", "visit_overdue")
        .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .limit(1)
        .maybeSingle();
      if (existing) continue;

      const [{ data: asset }, { data: company }] = await Promise.all([
        supabase.from("assets").select("name, site_id").eq("id", visit.asset_id).maybeSingle(),
        supabase.from("companies").select("owner_id").eq("id", visit.company_id).maybeSingle(),
      ]);
      const { data: site } = asset?.site_id
        ? await supabase.from("sites").select("name").eq("id", asset.site_id).maybeSingle()
        : { data: null };

      const assetName = asset?.name ?? "an asset";
      const siteName = site?.name ?? "a site";
      const dueDate = visit.scheduled_window_end.slice(0, 10);
      const message = `Overdue: ${assetName} at ${siteName} — was due ${dueDate}`;

      const fmUserIds = new Set<string>();
      if (company?.owner_id) {
        const { data: ownerProfile } = await supabase.from("profiles").select("user_id").eq("id", company.owner_id).maybeSingle();
        if (ownerProfile?.user_id) fmUserIds.add(ownerProfile.user_id);
      }
      const { data: members } = await supabase
        .from("business_members")
        .select("profile_id")
        .eq("company_id", visit.company_id)
        .eq("status", "active");
      if ((members ?? []).length > 0) {
        const memberProfileIds = (members ?? []).map((m) => m.profile_id).filter((id): id is string => !!id);
        if (memberProfileIds.length > 0) {
          const { data: memberProfiles } = await supabase.from("profiles").select("user_id").in("id", memberProfileIds);
          for (const p of memberProfiles ?? []) if (p.user_id) fmUserIds.add(p.user_id);
        }
      }

      const { data: contractorProfile } = await supabase.from("profiles").select("user_id").eq("id", visit.contractor_id).maybeSingle();

      const notifyRows = [
        ...Array.from(fmUserIds).map((userId) => ({
          user_id: userId,
          title: "Overdue PPM visit",
          message,
          type: "visit_overdue",
          reference_type: "service_visit",
          reference_id: visit.id,
        })),
        ...(contractorProfile?.user_id ? [{
          user_id: contractorProfile.user_id,
          title: "Overdue PPM visit",
          message,
          type: "visit_overdue",
          reference_type: "service_visit",
          reference_id: visit.id,
        }] : []),
      ];
      if (notifyRows.length > 0) {
        const { error: insertErr } = await supabase.from("notifications").insert(notifyRows);
        if (insertErr) console.error("[notify-overdue-visits] failed to insert overdue notifications for visit", visit.id, insertErr);
        else overdueNotified++;
      }
    }

    // ── 2. Upcoming reminders (due within 7 days, not yet confirmed) ────
    const sevenDaysOut = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: upcomingVisits, error: upcomingErr } = await supabase
      .from("service_visits")
      .select("id, asset_id, contractor_id, scheduled_window_start")
      .eq("status", "scheduled")
      .lte("scheduled_window_start", sevenDaysOut)
      .gte("scheduled_window_start", new Date().toISOString());
    if (upcomingErr) throw upcomingErr;

    for (const visit of upcomingVisits ?? []) {
      // Dedup: send at most once per visit, ever.
      const { data: existing } = await supabase
        .from("notifications")
        .select("id")
        .eq("reference_type", "service_visit")
        .eq("reference_id", visit.id)
        .eq("type", "visit_reminder")
        .limit(1)
        .maybeSingle();
      if (existing) continue;

      const { data: asset } = await supabase.from("assets").select("name, site_id").eq("id", visit.asset_id).maybeSingle();
      const { data: site } = asset?.site_id
        ? await supabase.from("sites").select("name").eq("id", asset.site_id).maybeSingle()
        : { data: null };
      const { data: contractorProfile } = await supabase.from("profiles").select("user_id").eq("id", visit.contractor_id).maybeSingle();
      if (!contractorProfile?.user_id) continue;

      const dueDate = visit.scheduled_window_start.slice(0, 10);
      const { error: insertErr } = await supabase.from("notifications").insert({
        user_id: contractorProfile.user_id,
        title: "Upcoming PPM visit",
        message: `Reminder: ${asset?.name ?? "an asset"} at ${site?.name ?? "a site"} due ${dueDate}`,
        type: "visit_reminder",
        reference_type: "service_visit",
        reference_id: visit.id,
      });
      if (insertErr) console.error("[notify-overdue-visits] failed to insert reminder for visit", visit.id, insertErr);
      else reminderNotified++;
    }

    return new Response(
      JSON.stringify({ date: todayStr, overdue_notified: overdueNotified, reminders_sent: reminderNotified }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[notify-overdue-visits] error", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
