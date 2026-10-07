// supabase/functions/void-invoice/index.ts
//
// Voids an unpaid, sent invoice. The only path to public.void_invoice(),
// which is executable by service_role alone, so that an invoice is never
// marked void while a Stripe PaymentIntent on it can still take money.
//
// Takes { invoiceId, reason }. The caller is authenticated from their own
// session token and must be the invoice's contractor or a platform admin
// (admin_users). The body is never trusted for authorisation.
//
// Order of operations:
//   1. Pre-check the same rules void_invoice() enforces (status sent or
//      viewed, no paid deposit, no payment that has not failed), so a
//      PaymentIntent is never cancelled for a void that would be refused.
//   2. If the invoice has a PaymentIntent: refuse when it has succeeded or
//      is processing (money is moving — the webhook decides what happens
//      next); cancel it when it is still open; carry on when it is already
//      canceled.
//   3. Call void_invoice(p_invoice_id, p_actor, p_reason), which re-checks
//      every rule inside one transaction and records reason, time and actor.
//
// If step 3 refuses after step 2 cancelled an open PaymentIntent, the
// invoice stays open and the customer's next payment attempt simply gets a
// fresh PaymentIntent from create-payment-intent.
import Stripe from "https://esm.sh/stripe@18.5.0?target=deno";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2025-08-27.basil",
});

const ALLOWED_ORIGINS = [
  "https://tradesltd.co.uk",
  "https://www.tradesltd.co.uk",
  "http://localhost:5173",
  "http://localhost:4173",
  "http://localhost:8080",
];

const getCorsHeaders = (origin: string | null): HeadersInit => {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
};

// PaymentIntent states that can still be cancelled. 'processing' is
// deliberately excluded: money may already be moving.
const CANCELLABLE_STATUSES = new Set([
  "requires_payment_method",
  "requires_confirmation",
  "requires_action",
  "requires_capture",
]);

const MAX_REASON_LENGTH = 500;

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req.headers.get("Origin"));
  const json = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("ADMIN_SECRET_KEY")!,
      { auth: { persistSession: false } },
    );

    // 1. Who is asking.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "Unauthorized" });
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) return json(401, { error: "Unauthorized" });
    const actorId = userData.user.id;

    const { invoiceId, reason }: { invoiceId?: string; reason?: string } = await req.json();
    if (!invoiceId) return json(400, { error: "invoiceId is required" });
    const trimmedReason = (reason ?? "").trim();
    if (!trimmedReason) return json(400, { error: "A reason is required to void an invoice." });
    if (trimmedReason.length > MAX_REASON_LENGTH) {
      return json(400, { error: `The reason must be ${MAX_REASON_LENGTH} characters or fewer.` });
    }

    // 2. The invoice, and whether this caller may void it.
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select("id, contractor_id, status, deposit_paid, stripe_payment_intent_id")
      .eq("id", invoiceId)
      .maybeSingle();
    if (invoiceError) throw invoiceError;
    if (!invoice) return json(404, { error: "Invoice not found." });

    if (invoice.contractor_id !== actorId) {
      const { data: adminRow, error: adminError } = await supabase
        .from("admin_users")
        .select("id")
        .eq("user_id", actorId)
        .maybeSingle();
      if (adminError) throw adminError;
      if (!adminRow) {
        return json(403, { error: "Only the contractor who issued this invoice, or a platform admin, can void it." });
      }
    }

    // 3. Pre-check, so a PaymentIntent is never cancelled for nothing.
    if (invoice.status === "draft") {
      return json(400, { error: "A draft invoice is deleted, not voided." });
    }
    if (invoice.status !== "sent" && invoice.status !== "viewed") {
      return json(400, { error: `This invoice is ${invoice.status} and cannot be voided.` });
    }
    if (invoice.deposit_paid) {
      return json(400, { error: "A deposit has been paid on this invoice, so it cannot be voided yet." });
    }

    const { data: livePayments, error: paymentsError } = await supabase
      .from("payments")
      .select("id, status")
      .eq("invoice_id", invoice.id);
    if (paymentsError) throw paymentsError;
    if ((livePayments ?? []).some((p) => (p.status ?? "pending") !== "failed")) {
      return json(400, { error: "A payment has been recorded against this invoice, so it cannot be voided." });
    }

    // 4. No payable PaymentIntent may survive the void.
    if (invoice.stripe_payment_intent_id) {
      let intent: Stripe.PaymentIntent;
      try {
        intent = await stripe.paymentIntents.retrieve(invoice.stripe_payment_intent_id);
      } catch (retrieveError) {
        console.error(`[void-invoice] could not retrieve PaymentIntent ${invoice.stripe_payment_intent_id} for invoice ${invoice.id}`, retrieveError);
        return json(502, { error: "Could not check this invoice's card payment with Stripe. Nothing was changed — please try again." });
      }

      if (intent.status === "succeeded" || intent.status === "processing") {
        return json(409, {
          error: intent.status === "succeeded"
            ? "This invoice has already been paid by card. It cannot be voided."
            : "A card payment on this invoice is being processed. It cannot be voided until that finishes.",
        });
      }

      if (CANCELLABLE_STATUSES.has(intent.status)) {
        try {
          await stripe.paymentIntents.cancel(intent.id);
        } catch (cancelError) {
          console.error(`[void-invoice] could not cancel PaymentIntent ${intent.id} for invoice ${invoice.id}`, cancelError);
          return json(502, { error: "Could not cancel this invoice's card payment with Stripe. Nothing was changed — please try again." });
        }
      } else if (intent.status !== "canceled") {
        // Any state Stripe adds later that we have not reasoned about.
        return json(409, { error: `This invoice's card payment is in an unexpected state (${intent.status}). It was not voided.` });
      }
    }

    // 5. The void itself, re-checked inside one transaction.
    const { error: voidError } = await supabase.rpc("void_invoice", {
      p_invoice_id: invoice.id,
      p_actor: actorId,
      p_reason: trimmedReason,
    });
    if (voidError) {
      return json(400, { error: voidError.message });
    }

    return json(200, { success: true, invoiceId: invoice.id, status: "void" });
  } catch (error) {
    console.error("[void-invoice] failed", error);
    return json(500, { error: error instanceof Error ? error.message : "Unknown server error" });
  }
});
