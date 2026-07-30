// supabase/functions/insurance-expiry-check/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// Cron-triggered, daily. Warns contractors at exactly 30/14/7 days before
// contractor_verification.insurance_expires_at (in-app notification + email).
// Exact-day matching (not a range) means each threshold fires once, no
// dedup bookkeeping needed — mirrors cert-expiry-check's structure but not
// its range+status-guard dedup, since that table has no per-threshold state.
//
// Separately: any row whose insurance has already lapsed (expires_at < today
// AND still marked insurance_verified) is flipped to insurance_verified =
// false and current_tier is dropped to LEAST(current_tier, 2) — per
// SCORING.md ("if insurance lapses, verification drops back to Tier 2").
// Dropping below Tier 3 makes check_contractor_compliance()'s insurance_valid
// check fail, which is what actually gates job-taking downstream.
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildEmail, buildSubject, type InsuranceExpiryData } from "../_shared/emailTemplate.ts";

const VERIFICATION_VIEW_URL = "https://tradesltd.co.uk/dashboard/contractor?view=verification";
const DAY_MS = 24 * 60 * 60 * 1000;
const WARNING_THRESHOLDS = [30, 14, 7];

serve(async (req) => {
  // Internal-only (verify_jwt=false in config.toml — cron-invoked, no
  // end-user JWT expected). Same shared-secret pattern as cert-expiry-check.
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!serviceRoleKey || authHeader !== `Bearer ${serviceRoleKey}`) {
    console.error("[insurance-expiry-check] rejected call with missing/invalid Authorization header");
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

    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);

    // ── Lapsed insurance: drop tier, clear the verified flag ──────────────────
    const { data: lapsedRows, error: lapsedError } = await supabase
      .from("contractor_verification")
      .select("contractor_id, current_tier")
      .not("insurance_expires_at", "is", null)
      .lt("insurance_expires_at", todayStr)
      .eq("insurance_verified", true);
    if (lapsedError) throw lapsedError;

    for (const row of lapsedRows ?? []) {
      const { error: dropError } = await supabase
        .from("contractor_verification")
        .update({ insurance_verified: false, current_tier: Math.min(row.current_tier, 2) })
        .eq("contractor_id", row.contractor_id);
      if (dropError) console.error("[insurance-expiry-check] failed to drop tier for", row.contractor_id, dropError);
    }

    // ── Upcoming expiries at exactly 30/14/7 days out ──────────────────────────
    const targetDates = WARNING_THRESHOLDS.map((days) => ({
      days,
      dateStr: new Date(today.getTime() + days * DAY_MS).toISOString().slice(0, 10),
    }));

    const { data: warnRows, error: warnError } = await supabase
      .from("contractor_verification")
      .select("contractor_id, insurance_expires_at")
      .not("insurance_expires_at", "is", null)
      .in("insurance_expires_at", targetDates.map((t) => t.dateStr));
    if (warnError) throw warnError;

    const rows = warnRows ?? [];

    if (rows.length === 0) {
      return new Response(
        JSON.stringify({ lapsed: lapsedRows?.length ?? 0, warned: 0, emails_sent: 0 }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    const contractorIds = rows.map((r) => r.contractor_id);
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, email, full_name")
      .in("id", contractorIds);
    if (profilesError) throw profilesError;

    const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    let emailsSent = 0;

    for (const row of rows) {
      const match = targetDates.find((t) => t.dateStr === row.insurance_expires_at);
      const daysRemaining = match?.days ?? 0;
      const expiryDate = new Date(row.insurance_expires_at as string);
      const expiryDateFmt = expiryDate.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });

      // In-app notification — notifications.user_id is auth.uid(), which
      // equals profiles.id/profiles.user_id by construction (see CLAUDE.md
      // RLS section), so contractor_id can be used directly.
      const { error: notifyError } = await supabase.from("notifications").insert({
        user_id: row.contractor_id,
        title: "Insurance expiring soon",
        message: `Your public liability insurance expires on ${expiryDateFmt} (${daysRemaining} day${daysRemaining === 1 ? "" : "s"} remaining). Renew it to keep your verification tier.`,
        type: "insurance_expiring",
        reference_type: "contractor_verification",
        reference_id: row.contractor_id,
      });
      if (notifyError) console.error("[insurance-expiry-check] notification insert failed for", row.contractor_id, notifyError);

      if (RESEND_API_KEY) {
        const profile = profileById.get(row.contractor_id);
        if (!profile?.email) continue;

        const emailData: InsuranceExpiryData = {
          contractorName: profile.full_name ?? "there",
          expiryDate: expiryDateFmt,
          daysRemaining,
          ctaUrl: VERIFICATION_VIEW_URL,
        };

        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${RESEND_API_KEY}`,
          },
          body: JSON.stringify({
            from: "TradeStone <noreply@tradesltd.co.uk>",
            to: [profile.email],
            subject: buildSubject("insurance_expiry", emailData),
            html: buildEmail("insurance_expiry", emailData),
          }),
        });

        if (res.ok) {
          emailsSent++;
        } else {
          console.error("[insurance-expiry-check] Resend send failed for contractor", row.contractor_id, await res.text());
        }
      }
    }

    return new Response(
      JSON.stringify({ lapsed: lapsedRows?.length ?? 0, warned: rows.length, emails_sent: emailsSent }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[insurance-expiry-check] error", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
