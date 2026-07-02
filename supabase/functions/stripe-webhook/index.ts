import Stripe from "https://esm.sh/stripe@18.5.0?target=deno";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { Resend } from "https://esm.sh/resend@4.7.0";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2025-08-27.basil",
});

const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
const resend = Deno.env.get("RESEND_API_KEY")
  ? new Resend(Deno.env.get("RESEND_API_KEY"))
  : null;

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

    const { error: notifError } = await supabase.from("notifications").insert({
      user_id: invoice.contractor_id,
      title: "Invoice paid",
      message: `Invoice ${invoice.invoice_number != null ? `INV-${String(invoice.invoice_number).padStart(4, "0")}` : invoice.id} has been paid.`,
      type: "invoice_response",
      reference_type: "invoice",
      reference_id: invoice.id,
    });

    if (notifError) {
      console.error("Failed to insert notification", notifError);
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("email")
      .eq("user_id", invoice.contractor_id)
      .single();

    if (profileError) {
      console.error("Failed to load contractor profile", profileError);
    }

    if (resend && profile?.email) {
      await resend.emails.send({
        from: Deno.env.get("RESEND_FROM_EMAIL") ?? "TradeStone <noreply@tradesltd.co.uk>",
        to: [profile.email],
        subject: `Payment received — ${invoice.invoice_number != null ? `INV-${String(invoice.invoice_number).padStart(4, "0")}` : invoice.id}`,
        html: `
          <p>Good news — your client has paid invoice <strong>${invoice.invoice_number != null ? `INV-${String(invoice.invoice_number).padStart(4, "0")}` : invoice.id}</strong>.</p>
          <p>Amount received: <strong>£${Number(invoice.total).toFixed(2)}</strong></p>
          <p>The funds will be transferred to your account via Stripe.</p>
          <p>— TradeStone</p>
        `,
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