// supabase/functions/notify-invoice-quote-action/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// Sends branded HTML emails when a customer acts on a quote or invoice
// (accept, decline, query, pay, message). Sends two emails per action:
//   1. To the contractor — informing them of the customer's action
//   2. To the customer  — confirming their own action
//
// action_type "issue" (quotes only) is the one contractor-performed action:
// the contractor who owns a sent quote calls it, and the customer gets one
// "you have a new quote" email. See handleQuoteIssued.
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { buildEmail, buildSubject } from "../_shared/emailTemplate.ts";

const DEFAULT_ALLOWED_ORIGINS = [
  "https://tradesltd.co.uk",
  "https://www.tradesltd.co.uk",
  "http://localhost:5173",
  "http://localhost:4173",
  "http://localhost:8080",
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

// emailTemplate.ts's quote_action case interpolates `message` unescaped
// into an HTML detail row — this is the only user-supplied free-text
// field this function forwards into that HTML, so it's sanitized here at
// the source rather than making the shared template escape-aware for one
// caller.
const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");

// Customer-facing quote reference, duplicated from src/lib/documentRefs.ts's
// formatQuoteRef (Edge Functions cannot import from src/lib; pdfBranding.ts's
// copy pulls in pdf-lib). Any format change must be applied in both places.
const formatCustomerQuoteRef = (contractorCode: string | null, quoteNumber: number, version: number): string => {
  const num = String(quoteNumber).padStart(4, "0");
  const base = contractorCode ? `Q-${contractorCode.replace(/^TS-C-/, "")}-${num}` : `Q-${num}`;
  return version > 1 ? `${base}.${version}` : base;
};

const formatGbpDate = (isoDate: string): string =>
  new Date(`${isoDate.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  });

// Marks a quote version's "new quote" email as sent, so a repeated call for
// the same version (double click, retry, a second code path) never emails
// the customer twice. Reuses rate_limits as a send-once ledger: one row per
// quote id, claimed before sending and released if the send fails.
const QUOTE_ISSUED_LEDGER_ACTION = "quote_issued_email";

type IssueResult = { status: number; body: Record<string, unknown> };

// deno-lint-ignore no-explicit-any
async function handleQuoteIssued(supabase: any, quoteId: string, callerId: string, publicUrl: string): Promise<IssueResult> {
  const { data: quote, error: quoteError } = await supabase
    .from("issued_quotes")
    .select("id, contractor_id, recipient_id, quote_number, version, title, total, currency, valid_until, status, sent_at")
    .eq("id", quoteId)
    .maybeSingle();

  if (quoteError) {
    console.error("notify-invoice-quote-action issue: quote lookup failed", { quoteId, code: quoteError.code });
    return { status: 500, body: { success: false, error: "Could not load the quote" } };
  }
  if (!quote) {
    return { status: 404, body: { success: false, error: "Quote not found" } };
  }
  // The contractor sending their own quote — the only party who issues one.
  if (quote.contractor_id !== callerId) {
    return { status: 403, body: { success: false, error: "Not authorised for this quote" } };
  }
  if (quote.status !== "sent" || !quote.sent_at) {
    return { status: 409, body: { success: false, error: "This quote has not been sent" } };
  }
  // Guest ("Not on TradeStone") quote: nobody to email. Not an error.
  if (!quote.recipient_id) {
    return { status: 200, body: { success: true, sent: false, reason: "no_recipient" } };
  }

  const { data: alreadySent } = await supabase
    .from("rate_limits")
    .select("id")
    .eq("identifier", quote.id)
    .eq("action_type", QUOTE_ISSUED_LEDGER_ACTION)
    .limit(1);
  if (alreadySent && alreadySent.length > 0) {
    return { status: 200, body: { success: true, sent: false, reason: "already_sent" } };
  }

  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY) {
    console.error("notify-invoice-quote-action issue: RESEND_API_KEY not set", { quoteId });
    return { status: 503, body: { success: false, error: "Email is not configured" } };
  }

  // Recipient email resolved here with the service role only:
  // recipient_id -> profiles.user_id -> auth user email. Never returned to
  // the caller and never logged.
  const { data: recipientProfile } = await supabase
    .from("profiles")
    .select("user_id, user_type")
    .eq("id", quote.recipient_id)
    .maybeSingle();
  const { data: recipientAuth } = recipientProfile?.user_id
    ? await supabase.auth.admin.getUserById(recipientProfile.user_id)
    : { data: null };
  const recipientEmail = recipientAuth?.user?.email ?? "";
  if (!recipientEmail) {
    console.error("notify-invoice-quote-action issue: recipient has no email", { quoteId });
    return { status: 422, body: { success: false, error: "The customer has no email address on file" } };
  }

  const { data: contractorProfile } = await supabase
    .from("profiles")
    .select("company_name, full_name, ts_profile_code")
    .eq("id", quote.contractor_id)
    .maybeSingle();
  const contractorName = contractorProfile?.company_name || contractorProfile?.full_name || "Your contractor";

  const quoteRef = formatCustomerQuoteRef(contractorProfile?.ts_profile_code ?? null, quote.quote_number, quote.version ?? 1);
  const total = new Intl.NumberFormat("en-GB", { style: "currency", currency: quote.currency || "GBP" })
    .format(Number(quote.total ?? 0));
  const ctaUrl = recipientProfile?.user_type === "business"
    ? `${publicUrl}/dashboard/business?view=approvals`
    : `${publicUrl}/dashboard/homeowner?view=quotes`;

  const { data: claim, error: claimError } = await supabase
    .from("rate_limits")
    .insert({ identifier: quote.id, action_type: QUOTE_ISSUED_LEDGER_ACTION })
    .select("id")
    .single();
  if (claimError) {
    console.error("notify-invoice-quote-action issue: could not record send", { quoteId, code: claimError.code });
    return { status: 500, body: { success: false, error: "Could not send the email" } };
  }

  const emailData = {
    contractorName,
    quoteTitle: quote.title ?? "",
    quoteRef,
    total,
    validUntil: quote.valid_until ? formatGbpDate(quote.valid_until) : "",
    ctaUrl,
  };

  let sendOk = false;
  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({
        from: "TradeStone <noreply@tradesltd.co.uk>",
        to: [recipientEmail],
        subject: buildSubject("quote_issued", emailData),
        html: buildEmail("quote_issued", emailData),
      }),
    });
    sendOk = resp.ok;
    if (!resp.ok) {
      console.error("notify-invoice-quote-action issue: Resend rejected the email", { quoteId, status: resp.status });
    }
  } catch (e) {
    console.error("notify-invoice-quote-action issue: Resend request failed", { quoteId, error: e instanceof Error ? e.message : "unknown" });
  }

  if (!sendOk) {
    // Release the claim so a later retry can send.
    await supabase.from("rate_limits").delete().eq("id", claim.id);
    return { status: 502, body: { success: false, error: "Could not send the email" } };
  }

  return { status: 200, body: { success: true, sent: true } };
}

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

    const { action_type, context_type, context_id, message: rawMessage } = await req.json();
    const message = typeof rawMessage === "string" && rawMessage.trim()
      ? escapeHtml(rawMessage.trim().slice(0, 2000))
      : undefined;

    const publicUrl = Deno.env.get("SITE_URL") ?? Deno.env.get("PUBLIC_APP_URL") ?? "https://tradesltd.co.uk";

    // Contractor-performed: authorised on quote ownership, not recipiency.
    if (action_type === "issue") {
      if (context_type !== "quote" || typeof context_id !== "string" || !context_id) {
        return jsonResponse(400, { success: false, error: "Only a quote can be issued" }, corsHeaders);
      }
      const result = await handleQuoteIssued(supabase, context_id, userData.user.id, publicUrl);
      return jsonResponse(result.status, result.body, corsHeaders);
    }

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
