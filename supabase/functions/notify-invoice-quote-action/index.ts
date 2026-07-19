// supabase/functions/notify-invoice-quote-action/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// Sends branded HTML emails when a customer acts on a quote or invoice
// (accept, decline, query, pay, message). Sends two emails per action:
//   1. To the contractor — informing them of the customer's action
//   2. To the customer  — confirming their own action
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { buildEmail, buildSubject } from "../_shared/emailTemplate.ts";

const DEFAULT_ALLOWED_ORIGINS = [
  "https://tradesltd.co.uk",
  "https://www.tradesltd.co.uk",
  "http://localhost:5173",
  "http://localhost:4173",
];

const ALLOWED_ORIGINS = (() => {
  const envOrigins = Deno.env.get("ALLOWED_ORIGINS");
  if (!envOrigins) return DEFAULT_ALLOWED_ORIGINS;
  return envOrigins.split(",").map((o) => o.trim()).filter((o) => o.length > 0);
})();

const getCorsHeaders = (origin: string | null): HeadersInit => {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin)
    ? origin
    : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    "Vary": "Origin",
  };
};

const jsonResponse = (status: number, payload: Record<string, unknown>, corsHeaders: HeadersInit) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const ACTION_LABELS: Record<string, string> = {
  pay:     "Payment Initiated",
  stall:   "Stalled",
  query:   "Query Raised",
  accept:  "Accepted",
  reject:  "Declined",
  message: "New Message",
};

serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return jsonResponse(400, { success: false, error: "Origin not allowed" }, corsHeaders);
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("ADMIN_SECRET_KEY")!,
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse(401, { success: false, error: "Unauthorized" }, corsHeaders);
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) {
      return jsonResponse(401, { success: false, error: "Unauthorized" }, corsHeaders);
    }

    const { action_type, context_type, context_id, message } = await req.json();

    const { data: actorProfile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("user_id", userData.user.id)
      .single();

    const actorName  = actorProfile?.full_name || "Customer";
    const actorEmail = actorProfile?.email || userData.user.email || "";

    let contractorEmail = "";
    let contractorName  = "";
    let contextLabel    = "";

    const publicUrl = Deno.env.get("PUBLIC_APP_URL") ?? "https://tradesltd.co.uk";

    // Ownership gate: the caller must be the recipient on the invoice/quote
    // they're claiming to have acted on — without this, any authenticated
    // user could pass an arbitrary UUID and send a contractor a spoofed
    // "customer has accepted/declined" email for a deal they're not party
    // to. recipient_id on both tables is guaranteed equal to auth.uid() for
    // the true recipient (profiles.id == profiles.user_id == auth.uid() by
    // construction — see CLAUDE.md's RLS section), so a direct compare
    // against userData.user.id is correct for either table.
    if (context_type === "invoice") {
      const { data: invoice } = await supabase
        .from("invoices")
        .select("contractor_id, invoice_number, recipient_id")
        .eq("id", context_id)
        .single();

      if (invoice) {
        if (invoice.recipient_id !== userData.user.id) {
          return jsonResponse(403, { success: false, error: "Not authorised for this invoice" }, corsHeaders);
        }
        contextLabel = invoice.invoice_number != null
          ? `INV-${String(invoice.invoice_number).padStart(4, "0")}`
          : context_id;
        const { data: cp } = await supabase
          .from("profiles")
          .select("full_name, email")
          .eq("user_id", invoice.contractor_id)
          .single();
        contractorEmail = cp?.email || "";
        contractorName  = cp?.full_name || "Contractor";
      }
    } else if (context_type === "quote") {
      const { data: quote } = await supabase
        .from("issued_quotes")
        .select("contractor_id, quote_number, title, recipient_id")
        .eq("id", context_id)
        .single();

      if (quote) {
        if (quote.recipient_id !== userData.user.id) {
          return jsonResponse(403, { success: false, error: "Not authorised for this quote" }, corsHeaders);
        }
        contextLabel = quote.quote_number != null
          ? `Q-${String(quote.quote_number).padStart(4, "0")}`
          : (quote.title || context_id);
        const { data: cp } = await supabase
          .from("profiles")
          .select("full_name, email")
          .eq("user_id", quote.contractor_id)
          .single();
        contractorEmail = cp?.email || "";
        contractorName  = cp?.full_name || "Contractor";
      }
    }

    const actionLabel = ACTION_LABELS[action_type] || action_type;
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

    if (RESEND_API_KEY && contractorEmail) {
      // 1. Email to contractor — informing them of the customer action
      const contractorData = {
        recipientName:  contractorName,
        actorName,
        contextLabel,
        actionLabel,
        message:        message || undefined,
        isConfirmation: false,
        ctaUrl:         `${publicUrl}/contractor/quotes`,
      };

      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
        body: JSON.stringify({
          from: "TradeStone <noreply@tradesltd.co.uk>",
          to: [contractorEmail],
          subject: buildSubject("quote_action", contractorData),
          html: buildEmail("quote_action", contractorData),
        }),
      });

      // 2. Email to customer — confirming their own action
      if (actorEmail && actorEmail !== contractorEmail) {
        const customerData = {
          recipientName:  actorName,
          actorName,
          contextLabel,
          actionLabel,
          message:        message || undefined,
          isConfirmation: true,
          ctaUrl:         `${publicUrl}/quotes`,
        };

        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
          body: JSON.stringify({
            from: "TradeStone <noreply@tradesltd.co.uk>",
            to: [actorEmail],
            subject: buildSubject("quote_action", customerData),
            html: buildEmail("quote_action", customerData),
          }),
        });
      }
    }

    return jsonResponse(200, { success: true }, corsHeaders);
  } catch (error: unknown) {
    console.error("Error in notify-invoice-quote-action:", error);
    return jsonResponse(500, { success: false, error: "An error occurred processing your request" }, corsHeaders);
  }
});
