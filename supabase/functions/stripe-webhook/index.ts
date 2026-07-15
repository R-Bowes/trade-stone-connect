// supabase/functions/stripe-webhook/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// Full replacement. Only the email section changes — everything else is 
// identical to the original. Find the block starting at:
//   if (resend && profile?.email) {
// and replace to the closing brace with the section below.
// ─────────────────────────────────────────────────────────────────────────────

// ADD this import at the top of the file alongside the other imports:
// import { buildEmail, buildSubject } from "../_shared/emailTemplate.ts";

// REPLACE the entire stripe-webhook/index.ts with this complete file:

import Stripe from "https://esm.sh/stripe@18.5.0?target=deno";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { buildEmail, buildSubject } from "../_shared/emailTemplate.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2025-08-27.basil",
});

const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const jsonResponse = (status: number, payload: Record<string, unknown>) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });

serve(async (req) => {
  try {
    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      return jsonResponse(400, { success: false, error: "Missing stripe-signature" });
    }
    if (!webhookSecret) {
      return jsonResponse(500, { success: false, error: "Webhook secret not configured" });
    }

    const body = await req.text();

    let event: Stripe.Event;
    try {
      if (webhookSecret && webhookSecret !== "skip") {
        event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
      } else {
        event = JSON.parse(body) as Stripe.Event;
        console.log("WARNING: Stripe signature verification skipped");
      }
    } catch (err) {
      console.error("Webhook signature verification failed", err);
      return jsonResponse(400, { success: false, error: "Invalid Stripe signature" });
    }

    if (event.type !== "checkout.session.completed") {
      return jsonResponse(200, { success: true, received: true });
    }

    const session = event.data.object as Stripe.Checkout.Session;

    if (session.payment_status !== "paid") {
      return jsonResponse(200, { success: true, received: true });
    }

    const invoiceId = session.metadata?.invoice_id;
    if (!invoiceId) {
      console.error("checkout.session.completed missing invoice_id metadata", session.id);
      return jsonResponse(400, { success: false, error: "Missing invoice_id in session metadata" });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("ADMIN_SECRET_KEY")!,
      { auth: { persistSession: false } }
    );

    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select("id, contractor_id, invoice_number, total")
      .eq("id", invoiceId)
      .single();

    if (invoiceError || !invoice) {
      console.error("Invoice not found", invoiceId, invoiceError);
      return jsonResponse(400, { success: false, error: "Invoice not found" });
    }

    const { error: updateError } = await supabase
      .from("invoices")
      .update({
        status: "paid",
        paid_date: new Date().toISOString().slice(0, 10),
        recipient_response: "paid",
      })
      .eq("id", invoiceId);

    if (updateError) {
      console.error("Failed to update invoice", updateError);
      throw updateError;
    }

    console.log(`Invoice ${invoiceId} marked paid via Checkout session ${session.id}`);

    if (!invoice.contractor_id) {
      return jsonResponse(200, { success: true, received: true });
    }

    const invoiceRef = invoice.invoice_number != null
      ? `INV-${String(invoice.invoice_number).padStart(4, "0")}`
      : invoice.id;

    const { error: notifError } = await supabase.from("notifications").insert({
      user_id:        invoice.contractor_id,
      title:          "Invoice paid",
      message:        `${invoiceRef} has been paid.`,
      type:           "invoice_response",
      reference_type: "invoice",
      reference_id:   invoice.id,
    });

    if (notifError) {
      console.error("Failed to insert notification", notifError);
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("email, full_name")
      .eq("user_id", invoice.contractor_id)
      .single();

    if (profileError) {
      console.error("Failed to load contractor profile", profileError);
    }

    if (RESEND_API_KEY && profile?.email) {
      const publicUrl = Deno.env.get("PUBLIC_APP_URL") ?? "https://tradesltd.co.uk";

      const emailData = {
        contractorName: profile.full_name || "Contractor",
        invoiceRef,
        amount:         `£${Number(invoice.total).toFixed(2)}`,
        ctaUrl:         `${publicUrl}/contractor/invoices`,
      };

      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: "TradeStone <noreply@tradesltd.co.uk>",
          to: [profile.email],
          subject: buildSubject("payment_received", emailData),
          html: buildEmail("payment_received", emailData),
        }),
      });
    }

    return jsonResponse(200, { success: true, received: true });
  } catch (error) {
    console.error("stripe-webhook unhandled error", error);
    return jsonResponse(500, {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});
