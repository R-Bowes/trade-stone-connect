// supabase/functions/send-cooling-off-notice/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// Internal/service-to-service function — no end-user JWT expected (mirrors
// sla-clock's own header comment). Called exclusively from
// mint_job_from_quote's fire-and-forget net.http_post, with the
// service_role_key as bearer, right after a cooling_off_records row is
// created for a consumer job:
//   POST /functions/v1/send-cooling-off-notice { job_id }
//
// Sends the prescribed cancellation-rights information to the consumer on
// a durable medium (email), satisfying the Consumer Contracts Regulations
// 2013 requirement independently of whether the consumer opens the in-app
// CoolingOffNotice dialog.
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { buildEmail, buildSubject } from "../_shared/emailTemplate.ts";

const ALLOWED_ORIGINS = [
  "https://tradesltd.co.uk",
  "https://www.tradesltd.co.uk",
  "http://localhost:5173",
  "http://localhost:4173",
];

const getCorsHeaders = (origin: string | null): HeadersInit => {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
};

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req.headers.get("Origin"));

  const json = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { job_id } = await req.json();
    if (!job_id || typeof job_id !== "string") {
      return json(400, { success: false, error: "job_id required" });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const { data: record, error: recordError } = await supabase
      .from("cooling_off_records")
      .select("consumer_id, cooling_off_end")
      .eq("job_id", job_id)
      .maybeSingle();

    if (recordError || !record) {
      console.error("[send-cooling-off-notice] cooling-off record not found for job", job_id, recordError);
      return json(404, { success: false, error: "Cooling-off record not found" });
    }

    const { data: job } = await supabase
      .from("jobs")
      .select("title")
      .eq("id", job_id)
      .maybeSingle();

    const { data: consumerProfile } = await supabase
      .from("profiles")
      .select("email, full_name")
      .eq("id", record.consumer_id)
      .maybeSingle();

    if (!consumerProfile?.email) {
      console.warn("[send-cooling-off-notice] consumer profile has no email — skipping");
      return json(200, { success: true, skipped: true });
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      console.error("[send-cooling-off-notice] RESEND_API_KEY secret is not set");
      return json(500, { success: false, error: "Email service not configured" });
    }

    const publicUrl = Deno.env.get("SITE_URL") ?? "https://tradesltd.co.uk";
    const coolingOffEndDate = new Date(record.cooling_off_end).toLocaleDateString("en-GB", {
      day: "numeric", month: "long", year: "numeric",
    });

    const emailData = {
      consumerName: consumerProfile.full_name || "there",
      jobTitle: job?.title || "your job",
      coolingOffEndDate,
      ctaUrl: `${publicUrl}/dashboard/homeowner?view=jobs`,
    };

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({
        from: "TradeStone <noreply@tradesltd.co.uk>",
        to: [consumerProfile.email],
        subject: buildSubject("cooling_off_notice", emailData),
        html: buildEmail("cooling_off_notice", emailData),
      }),
    });

    if (!emailRes.ok) {
      const resendError = await emailRes.json();
      console.error("[send-cooling-off-notice] Resend API error:", resendError);
      return json(500, { success: false, error: "Failed to send email" });
    }

    console.log(`[send-cooling-off-notice] email sent to ${consumerProfile.email} for job ${job_id}`);
    return json(200, { success: true });
  } catch (error: unknown) {
    console.error("[send-cooling-off-notice] unexpected error:", error);
    return json(500, { success: false, error: "Internal server error" });
  }
});
