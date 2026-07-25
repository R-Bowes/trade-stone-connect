// supabase/functions/cert-expiry-check/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// Cron-triggered. Finds team_member_certifications expiring within 30 days,
// flags them 'expiring_soon', flags anything already past expiry_date
// 'expired', and sends one summary email per contractor listing everything
// of theirs that's expiring soon.
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildEmail, buildSubject, type CertExpiryData } from "../_shared/emailTemplate.ts";

const TEAM_VIEW_URL = "https://tradesltd.co.uk/dashboard/contractor?view=team";
const DAY_MS = 24 * 60 * 60 * 1000;

interface CertRow {
  id: string;
  cert_name: string;
  expiry_date: string;
  status: string;
  team_member_id: string;
  team_member: {
    id: string;
    full_name: string;
    contractor_id: string;
  } | null;
}

serve(async (req) => {
  // Internal-only (verify_jwt=false in config.toml — cron-invoked, no
  // end-user JWT expected). Same shared-secret pattern as sla-clock and
  // mark-overdue-invoices: the Authorization bearer must equal the
  // service-role key.
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!serviceRoleKey || authHeader !== `Bearer ${serviceRoleKey}`) {
    console.error("[cert-expiry-check] rejected call with missing/invalid Authorization header");
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
    const in30Str = new Date(today.getTime() + 30 * DAY_MS).toISOString().slice(0, 10);

    // ── Certs expiring within the next 30 days ────────────────────────────
    const { data: expiringRows, error: expiringError } = await supabase
      .from("team_member_certifications")
      .select("id, cert_name, expiry_date, status, team_member_id, team_member:team_members(id, full_name, contractor_id)")
      .not("expiry_date", "is", null)
      .gt("expiry_date", todayStr)
      .lte("expiry_date", in30Str)
      .neq("status", "expired");
    if (expiringError) throw expiringError;

    const expiring = (expiringRows ?? []) as unknown as CertRow[];

    // ── Certs already past expiry ──────────────────────────────────────────
    const { data: expiredRows, error: expiredError } = await supabase
      .from("team_member_certifications")
      .select("id")
      .not("expiry_date", "is", null)
      .lt("expiry_date", todayStr)
      .neq("status", "expired");
    if (expiredError) throw expiredError;

    const expiredIds = (expiredRows ?? []).map((row) => row.id);

    if (expiredIds.length > 0) {
      const { error: updateExpiredError } = await supabase
        .from("team_member_certifications")
        .update({ status: "expired" })
        .in("id", expiredIds);
      if (updateExpiredError) throw updateExpiredError;
    }

    if (expiring.length === 0) {
      return new Response(
        JSON.stringify({ checked: expiredIds.length, expiring: 0, expired: expiredIds.length, emails_sent: 0 }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    const expiringIds = expiring.map((row) => row.id);
    const { error: updateExpiringError } = await supabase
      .from("team_member_certifications")
      .update({ status: "expiring_soon" })
      .in("id", expiringIds);
    if (updateExpiringError) throw updateExpiringError;

    // ── Group by contractor ────────────────────────────────────────────────
    const contractorIds = [
      ...new Set(expiring.map((row) => row.team_member?.contractor_id).filter((id): id is string => Boolean(id))),
    ];

    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, email, full_name")
      .in("id", contractorIds);
    if (profilesError) throw profilesError;

    const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

    const certsByContractor = new Map<string, CertExpiryData["certs"]>();
    for (const row of expiring) {
      const contractorId = row.team_member?.contractor_id;
      if (!contractorId) continue;

      const expiryDate = new Date(row.expiry_date);
      const daysRemaining = Math.ceil((expiryDate.getTime() - today.getTime()) / DAY_MS);

      const list = certsByContractor.get(contractorId) ?? [];
      list.push({
        workerName: row.team_member?.full_name ?? "Team member",
        certName: row.cert_name,
        expiryDate: expiryDate.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }),
        daysRemaining,
      });
      certsByContractor.set(contractorId, list);
    }

    // ── Send one email per contractor ──────────────────────────────────────
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    let emailsSent = 0;

    if (RESEND_API_KEY) {
      for (const [contractorId, certs] of certsByContractor.entries()) {
        const profile = profileById.get(contractorId);
        if (!profile?.email) continue;

        const emailData: CertExpiryData = {
          contractorName: profile.full_name ?? "there",
          certs,
          ctaUrl: TEAM_VIEW_URL,
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
            subject: buildSubject("cert_expiry", emailData),
            html: buildEmail("cert_expiry", emailData),
          }),
        });

        if (res.ok) {
          emailsSent++;
        } else {
          console.error("[cert-expiry-check] Resend send failed for contractor", contractorId, await res.text());
        }
      }
    }

    return new Response(
      JSON.stringify({
        checked: expiring.length + expiredIds.length,
        expiring: expiring.length,
        expired: expiredIds.length,
        emails_sent: emailsSent,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[cert-expiry-check] error", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
