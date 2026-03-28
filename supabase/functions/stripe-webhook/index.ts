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

serve(async (req) => {
  try {
    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      return new Response("Missing stripe-signature", { status: 400 });
    }

    const body = await req.text();
    const event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);

    if (event.type !== "payment_intent.succeeded") {
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    const invoiceId = paymentIntent.metadata?.invoiceId;

    if (!invoiceId) {
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: invoice } = await supabase
      .from("invoices")
      .select("id, contractor_id, invoice_number")
      .eq("id", invoiceId)
      .single();

    await supabase
      .from("invoices")
      .update({
        status: "paid",
        paid_at: new Date().toISOString(),
        paid_date: new Date().toISOString().slice(0, 10),
      })
      .eq("id", invoiceId);

    if (invoice?.contractor_id) {
      await supabase.from("notifications").insert({
        user_id: invoice.contractor_id,
        title: "Invoice paid",
        message: `Invoice ${invoice.invoice_number ?? invoice.id} has been paid successfully.`,
        type: "invoice_response",
        reference_type: "invoice",
        reference_id: invoice.id,
      });

      const { data: profile } = await supabase
        .from("profiles")
        .select("email")
        .eq("user_id", invoice.contractor_id)
        .single();

      if (resend && profile?.email) {
        await resend.emails.send({
          from: Deno.env.get("RESEND_FROM_EMAIL") ?? "TradeStone <invoices@tradestone.app>",
          to: [profile.email],
          subject: `Payment received for invoice ${invoice.invoice_number ?? invoice.id}`,
          html: `<p>Your client payment has been received successfully.</p>`,
        });
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("stripe-webhook error", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
});
