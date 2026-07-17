// supabase/functions/stripe-webhook/index.ts
//
// Handles two event types:
//  - checkout.session.completed: ordinary invoice payment (unchanged from
//    before this slice — preserved verbatim, including its snake_case
//    session.metadata.invoice_id, per Phase A/C instruction not to unify the
//    two metadata casings in this slice).
//  - payment_intent.succeeded: quote deposit payment (accept-quote/index.ts's
//    PaymentIntent, camelCase metadata). Marks the deposit paid on both the
//    quote and the invoice, mints the job via mint_job_from_quote (LOCKED
//    DECISION: a scheduled job means money has moved, or none was due), and
//    records a payments row. Idempotent — safe to receive either event twice.
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

async function handleCheckoutSessionCompleted(
  supabase: ReturnType<typeof createClient>,
  session: Stripe.Checkout.Session,
) {
  if (session.payment_status !== "paid") {
    return jsonResponse(200, { success: true, received: true });
  }

  const invoiceId = session.metadata?.invoice_id;
  if (!invoiceId) {
    console.error("checkout.session.completed missing invoice_id metadata", session.id);
    return jsonResponse(400, { success: false, error: "Missing invoice_id in session metadata" });
  }

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
}

async function handlePaymentIntentSucceeded(
  supabase: ReturnType<typeof createClient>,
  paymentIntent: Stripe.PaymentIntent,
) {
  if (paymentIntent.metadata?.type !== "deposit") {
    return jsonResponse(200, { success: true, received: true });
  }

  const quoteId = paymentIntent.metadata.quoteId;
  const invoiceId = paymentIntent.metadata.invoiceId;
  if (!quoteId) {
    console.error("payment_intent.succeeded (deposit) missing quoteId metadata", paymentIntent.id);
    return jsonResponse(400, { success: false, error: "Missing quoteId in payment intent metadata" });
  }

  // Idempotent: only flip deposit_paid if it isn't already set.
  const { data: quote, error: quoteError } = await supabase
    .from("issued_quotes")
    .select("id, deposit_paid, contractor_id, title")
    .eq("id", quoteId)
    .maybeSingle();

  if (quoteError || !quote) {
    console.error("Quote not found for deposit payment", quoteId, quoteError);
    return jsonResponse(400, { success: false, error: "Quote not found" });
  }

  if (!quote.deposit_paid) {
    const { error: quoteUpdateError } = await supabase
      .from("issued_quotes")
      .update({ deposit_paid: true, deposit_paid_at: new Date().toISOString() })
      .eq("id", quoteId);
    if (quoteUpdateError) {
      console.error("Failed to mark quote deposit paid", quoteUpdateError);
      throw quoteUpdateError;
    }
  }

  if (invoiceId) {
    const { data: invoice } = await supabase
      .from("invoices")
      .select("id, deposit_paid")
      .eq("id", invoiceId)
      .maybeSingle();

    if (invoice && !invoice.deposit_paid) {
      const { error: invoiceUpdateError } = await supabase
        .from("invoices")
        .update({ deposit_paid: true, deposit_paid_at: new Date().toISOString() })
        .eq("id", invoiceId);
      if (invoiceUpdateError) {
        console.error("Failed to mark invoice deposit paid", invoiceUpdateError);
      }
    }
  }

  // mint_job_from_quote is itself idempotent (returns the existing job if one
  // was already minted), so a duplicate delivery of this event is safe.
  const { data: jobId, error: mintError } = await supabase.rpc("mint_job_from_quote", {
    p_quote_id: quoteId,
  });

  if (mintError) {
    console.error("mint_job_from_quote failed", mintError);
    return jsonResponse(500, { success: false, error: mintError.message });
  }

  // payments row — idempotent on stripe_payment_intent_id.
  const { data: existingPayment } = await supabase
    .from("payments")
    .select("id")
    .eq("stripe_payment_intent_id", paymentIntent.id)
    .maybeSingle();

  if (!existingPayment) {
    const { error: paymentError } = await supabase.from("payments").insert({
      job_id: jobId,
      invoice_id: invoiceId ?? null,
      payer_id: paymentIntent.metadata.clientId || null,
      payee_id: paymentIntent.metadata.contractorId || null,
      amount: paymentIntent.amount / 100,
      platform_fee: (paymentIntent.application_fee_amount ?? 0) / 100,
      stripe_payment_intent_id: paymentIntent.id,
      status: "released",
      type: "deposit",
    });
    if (paymentError) {
      console.error("Failed to record payments row for deposit", paymentError);
    }
  }

  console.log(`Deposit for quote ${quoteId} marked paid via PaymentIntent ${paymentIntent.id}; job ${jobId}`);

  return jsonResponse(200, { success: true, received: true });
}

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
      event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
    } catch (err) {
      console.error("Webhook signature verification failed", err);
      return jsonResponse(400, { success: false, error: "Invalid Stripe signature" });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("ADMIN_SECRET_KEY")!,
      { auth: { persistSession: false } }
    );

    if (event.type === "checkout.session.completed") {
      return await handleCheckoutSessionCompleted(supabase, event.data.object as Stripe.Checkout.Session);
    }

    if (event.type === "payment_intent.succeeded") {
      return await handlePaymentIntentSucceeded(supabase, event.data.object as Stripe.PaymentIntent);
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
