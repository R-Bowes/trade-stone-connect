import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@4.7.0";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2024-06-20",
});

const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
const resendApiKey = Deno.env.get("RESEND_API_KEY");
const resend = resendApiKey ? new Resend(resendApiKey) : null;

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
      return jsonResponse(500, { success: false, error: "Stripe webhook secret is not configured" });
    }

    const body = await req.text();

    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
    } catch (error) {
      console.error("stripe-webhook signature verification failed", error);
      return jsonResponse(400, { success: false, error: "Invalid Stripe signature" });
    }

    if (event.type !== "payment_intent.succeeded") {
      return jsonResponse(200, { success: true, received: true });
    }

    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    const invoiceId = paymentIntent.metadata?.invoiceId;

    if (!invoiceId) {
      return jsonResponse(400, { success: false, error: "Missing invoiceId metadata" });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select("id, contractor_id, invoice_number")
      .eq("id", invoiceId)
      .single();

    if (invoiceError || !invoice) {
      return jsonResponse(400, { success: false, error: "Invoice not found" });
    }

    const { error: updateError } = await supabase
      .from("invoices")
      .update({
        status: "paid",
        paid_at: new Date().toISOString(),
        paid_date: new Date().toISOString().slice(0, 10),
      })
      .eq("id", invoiceId);

    if (updateError) {
      throw updateError;
    }

    if (invoice.contractor_id) {
      const { error: notificationError } = await supabase.from("notifications").insert({
        user_id: invoice.contractor_id,
        title: "Invoice paid",
        message: `Invoice ${invoice.invoice_number ?? invoice.id} has been paid successfully.`,
        type: "invoice_response",
        reference_type: "invoice",
        reference_id: invoice.id,
      });

      if (notificationError) {
        console.error("Failed to insert contractor notification", notificationError);
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
          from: Deno.env.get("RESEND_FROM_EMAIL") ?? "TradeStone <invoices@tradestone.app>",
          to: [profile.email],
          subject: `Payment received for invoice ${invoice.invoice_number ?? invoice.id}`,
          html: `<p>Your client payment has been received successfully.</p>`,
        });
      }
    }

    return jsonResponse(200, { success: true, received: true });
  } catch (error) {
    console.error("stripe-webhook error", error);
    return jsonResponse(500, { success: false, error: error instanceof Error ? error.message : "Unknown server error" });
  }
});
