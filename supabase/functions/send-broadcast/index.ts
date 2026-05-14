// SQL migration — run this in the Supabase SQL editor before deploying:
//
// create table broadcast_emails (
//   id uuid primary key default gen_random_uuid(),
//   subject text not null,
//   body text not null,
//   cta_label text,
//   cta_url text,
//   audience_type text not null,
//   audience_filters jsonb,
//   recipient_count int,
//   scheduled_at timestamptz,
//   sent_at timestamptz,
//   created_by uuid references auth.users(id),
//   created_at timestamptz default now()
// );
//
// alter table broadcast_emails enable row level security;
//
// create policy "Admins can manage broadcasts"
// on broadcast_emails for all
// using (
//   exists (select 1 from admin_users where user_id = auth.uid())
// );
//
// Deploy: supabase functions deploy send-broadcast
// Secret required: RESEND_API_KEY (shared with other notify functions)

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const ALLOWED_ORIGINS = [
  "https://tradesltd.co.uk",
  "https://www.tradesltd.co.uk",
  "http://localhost:5173",
  "http://localhost:4173",
];

const getCorsHeaders = (origin: string | null): HeadersInit => {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin)
    ? origin
    : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
};

const jsonResponse = (
  status: number,
  payload: Record<string, unknown>,
  corsHeaders: HeadersInit,
) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function buildEmailHtml(
  subject: string,
  body: string,
  ctaLabel: string | null,
  ctaUrl: string | null,
  recipientFirstName: string,
): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const formattedBody = esc(body.replace(/\[first name\]/gi, recipientFirstName))
    .replace(/\n/g, "<br>");

  const ctaBlock = ctaLabel && ctaUrl
    ? `<div style="text-align:center;margin:28px 0 8px;">
        <a href="${esc(ctaUrl)}" style="background:#f07820;color:#fff;text-decoration:none;padding:13px 32px;border-radius:8px;font-weight:600;font-size:15px;display:inline-block;">${esc(ctaLabel)}</a>
       </div>`
    : "";

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:system-ui,-apple-system,sans-serif;">
  <div style="max-width:600px;margin:32px auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="background:#0f2744;padding:22px 32px;">
      <span style="color:#f07820;font-size:22px;font-weight:700;letter-spacing:-0.5px;">TradeStone</span>
    </div>
    <div style="padding:32px 32px 24px;">
      <h2 style="margin:0 0 18px;color:#0f2744;font-size:20px;font-weight:600;">${esc(subject)}</h2>
      <div style="font-size:15px;color:#333;line-height:1.65;">${formattedBody}</div>
      ${ctaBlock}
    </div>
    <div style="background:#f9f9f9;border-top:1px solid #e8e8e8;padding:14px 32px;text-align:center;">
      <span style="font-size:12px;color:#999;">
        TradeStone Connect &middot;
        <a href="https://tradesltd.co.uk" style="color:#999;text-decoration:none;">tradesltd.co.uk</a>
        &middot;
        <a href="https://tradesltd.co.uk/unsubscribe" style="color:#999;text-decoration:none;">Unsubscribe</a>
      </span>
    </div>
  </div>
</body>
</html>`;
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    // Verify caller is an authenticated admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse(401, { error: "Unauthorized" }, corsHeaders);
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) {
      return jsonResponse(401, { error: "Unauthorized" }, corsHeaders);
    }
    const { data: adminRow } = await supabase
      .from("admin_users")
      .select("id")
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (!adminRow) {
      return jsonResponse(403, { error: "Forbidden — admin access required" }, corsHeaders);
    }

    const body = await req.json();
    const broadcast_id: string | undefined = body?.broadcast_id;
    if (!broadcast_id || typeof broadcast_id !== "string") {
      return jsonResponse(400, { error: "broadcast_id required" }, corsHeaders);
    }

    // Fetch the broadcast row
    const { data: broadcast, error: broadcastError } = await supabase
      .from("broadcast_emails")
      .select("id, subject, body, cta_label, cta_url, audience_type, audience_filters, sent_at")
      .eq("id", broadcast_id)
      .single();

    if (broadcastError || !broadcast) {
      console.error("[send-broadcast] fetch failed:", broadcastError);
      return jsonResponse(404, { error: "Broadcast not found" }, corsHeaders);
    }
    if (broadcast.sent_at) {
      return jsonResponse(400, { error: "Broadcast already sent" }, corsHeaders);
    }

    // Build recipient query
    const filters = (broadcast.audience_filters ?? {}) as Record<string, unknown>;
    let query = supabase.from("profiles").select("id, full_name, email").not("email", "is", null);

    if (broadcast.audience_type === "contractors") {
      query = query.eq("user_type", "contractor");
      if (typeof filters.trade === "string" && filters.trade) {
        query = query.contains("trades", [filters.trade]);
      }
      if (filters.verified_only === true) {
        query = query.eq("is_verified", true);
      } else if (filters.verified_only === false) {
        query = query.or("is_verified.is.null,is_verified.eq.false");
      }
    } else if (broadcast.audience_type === "customers") {
      query = query.eq("user_type", "personal");
    } else if (broadcast.audience_type === "business") {
      query = query.eq("user_type", "business");
    }
    // audience_type === "all" — no user_type filter applied

    const { data: recipients, error: recipientsError } = await query;
    if (recipientsError) {
      console.error("[send-broadcast] recipients query failed:", recipientsError);
      return jsonResponse(500, { error: "Failed to fetch recipients" }, corsHeaders);
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      console.error("[send-broadcast] RESEND_API_KEY not set");
      return jsonResponse(500, { error: "Email service not configured" }, corsHeaders);
    }

    let sent = 0;
    for (const recipient of (recipients ?? [])) {
      if (!recipient.email) continue;
      const firstName = (recipient.full_name || "").split(" ")[0] || "there";
      const html = buildEmailHtml(
        broadcast.subject,
        broadcast.body,
        broadcast.cta_label,
        broadcast.cta_url,
        firstName,
      );
      const unsubUrl = `https://tradesltd.co.uk/unsubscribe?email=${encodeURIComponent(recipient.email)}`;
      const emailRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: "TradeStone <noreply@tradesltd.co.uk>",
          to: [recipient.email],
          subject: broadcast.subject,
          html,
          headers: {
            "List-Unsubscribe": `<${unsubUrl}>, <mailto:unsubscribe@tradesltd.co.uk?subject=unsubscribe>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        }),
      });
      if (!emailRes.ok) {
        const err = await emailRes.json();
        console.error(`[send-broadcast] Resend error for ${recipient.email}:`, err);
      } else {
        sent++;
      }
    }

    await supabase
      .from("broadcast_emails")
      .update({ sent_at: new Date().toISOString(), recipient_count: sent })
      .eq("id", broadcast_id);

    console.log(`[send-broadcast] broadcast ${broadcast_id} sent to ${sent} recipients`);
    return jsonResponse(200, { sent }, corsHeaders);
  } catch (error) {
    console.error("[send-broadcast] unexpected error:", error);
    return jsonResponse(500, { error: "Internal server error" }, corsHeaders);
  }
});
