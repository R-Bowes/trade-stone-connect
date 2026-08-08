// supabase/functions/process-refund/index.ts
//
// Brief 2 (refunds): the ONLY place Stripe is ever called for a refund.
// Takes { refundId }. Admin-authenticated only — the Authorization header is
// verified against a real user via supabase.auth.getUser(), then checked
// against admin_users (mirrors send-broadcast/index.ts's exact pattern).
// The body is never trusted for authorisation, only for refundId.
//
// TRIGGER: this function is NOT invoked from SQL. public.approve_refund()
// (20260807250000) deliberately does not fire a pg_net call to it, even
// though this repo has a precedent for that pattern (mint_job_from_quote ->
// sla-clock / send-cooling-off-notice, using the service-role key as
// Authorization bearer). That pattern doesn't fit here: this function must
// verify is_tradestone_admin on the CALLER, which only makes sense against a
// real end-user JWT, not a shared service-role secret — a service-role-
// triggered call has no "caller" to check. The intended flow is the admin's
// own client calling approve_refund(refund_id) via RPC, then immediately
// calling this function with their own session token. See the Brief 2
// report for the full reasoning, including the option (not built here) of a
// cron poller matching the sla-clock-check/tendering-scheduled-runner idiom
// if server-side triggering (independent of the admin's browser) is wanted
// later.
//
// LOCKED DECISIONS enforced here:
//   D2. reverse_transfer is ALWAYS true. No flag, no override.
//   D3. If the transfer reversal fails or is short, the customer refund
//       still proceeds — the shortfall becomes refunds.contractor_debt.
//       Stripe's own docs ("refunds come from your platform's balance",
//       and reversal requires sufficient destination balance) mean this is
//       a real, expected outcome, not an edge case to special-case away.
//   D4. refund_application_fee is true only when reason is
//       'cooling_off_cancellation'.
//   D5. Partial refunds: amount need not equal the full payment.
//
// Idempotency: the refunds row's own id is passed to Stripe as the request's
// idempotency key, so a retried call after a crashed/lost response reuses
// the same Stripe refund rather than creating a second one. Additionally,
// if refunds.stripe_refund_id is already set when this function loads the
// row, it returns the existing outcome as a no-op without calling Stripe
// again.
import Stripe from "https://esm.sh/stripe@18.5.0?target=deno";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { toPence, expectedTransferReversalPence } from "../_shared/paymentMath.ts";

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

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req.headers.get("Origin"));
  const json = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("ADMIN_SECRET_KEY")!,
      { auth: { persistSession: false } },
    );

    // Admin-authenticated only — verify the caller, never trust the body.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "Unauthorized" });
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) return json(401, { error: "Unauthorized" });

    const { data: adminRow } = await supabase
      .from("admin_users")
      .select("id")
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (!adminRow) return json(403, { error: "Forbidden — admin access required" });

    const { refundId }: { refundId?: string } = await req.json();
    if (!refundId) return json(400, { error: "refundId is required" });

    // 1. Load the refund row.
    const { data: refund, error: refundError } = await supabase
      .from("refunds")
      .select("*")
      .eq("id", refundId)
      .maybeSingle();
    if (refundError || !refund) return json(400, { error: "Refund not found" });

    // Idempotent no-op: a previous invocation already reached a Stripe
    // outcome for this refund.
    if (refund.stripe_refund_id) {
      return json(200, { refundId, status: refund.status, alreadyProcessed: true });
    }

    // Atomic claim: only proceed if status is currently 'approved'. If this
    // affects zero rows, either it was never approved or another
    // invocation already claimed it (processing/succeeded/failed/rejected)
    // — either way, this call is a no-op.
    const { data: claimed, error: claimError } = await supabase
      .from("refunds")
      .update({ status: "processing" })
      .eq("id", refundId)
      .eq("status", "approved")
      .select()
      .maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) {
      return json(200, { refundId, status: refund.status, alreadyProcessed: true });
    }

    // 2. Load the payment.
    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .select("id, stripe_payment_intent_id, stripe_charge_id, stripe_transfer_id, amount, platform_fee, stripe_fee, refunded_amount, transfer_reversed_amount, payer_id, payee_id")
      .eq("id", claimed.payment_id)
      .maybeSingle();

    if (paymentError || !payment || !payment.stripe_payment_intent_id) {
      await supabase.from("refunds").update({
        status: "failed",
        rejected_reason: "Underlying payment or its PaymentIntent could not be loaded",
      }).eq("id", refundId);
      return json(500, { error: "Payment not found or missing PaymentIntent" });
    }

    const amountPence = toPence(Number(claimed.amount));
    const paymentAmountPence = toPence(Number(payment.amount));
    // refund_application_fee (D4): statutory cooling-off only. TradeStone
    // ran the transaction for every other reason, so the fee stays taken.
    const refundApplicationFee = claimed.reason === "cooling_off_cancellation";

    // 3. Call Stripe. reverse_transfer is ALWAYS true (D2) — no flag, no override.
    let stripeRefund: Stripe.Refund;
    try {
      stripeRefund = await stripe.refunds.create(
        {
          payment_intent: payment.stripe_payment_intent_id,
          amount: amountPence,
          reverse_transfer: true,
          refund_application_fee: refundApplicationFee,
          expand: ["transfer_reversal"],
          metadata: {
            refundId: claimed.id,
            paymentId: payment.id,
            contractorId: claimed.contractor_id,
            reason: claimed.reason,
          },
        },
        { idempotencyKey: claimed.id },
      );
    } catch (stripeErr) {
      // Stripe rejected the refund CALL itself — status 'failed', do not
      // touch payments at all.
      const message = stripeErr instanceof Error ? stripeErr.message : "Unknown Stripe error";
      console.error(`[process-refund] Stripe refund creation failed for refund ${refundId}:`, message);
      await supabase.from("refunds").update({
        status: "failed",
        rejected_reason: message,
      }).eq("id", refundId);
      return json(502, { error: `Stripe refund failed: ${message}` });
    }

    // 4. D3 — read the ACTUAL reversed amount, never assume it equals the
    // requested amount. transfer_reversal may be null (reversal failed
    // outright) or short (partial connected-account balance) — in either
    // case the customer refund above has already succeeded and is NOT
    // rolled back. The gap becomes contractor_debt.
    const transferReversal = typeof stripeRefund.transfer_reversal === "object" && stripeRefund.transfer_reversal
      ? stripeRefund.transfer_reversal
      : null;
    const actualReversedPence = transferReversal?.amount ?? 0;

    if (actualReversedPence === 0 && payment.stripe_transfer_id) {
      console.error(`[process-refund] LOUD WARNING: refund ${refundId} (Stripe refund ${stripeRefund.id}) succeeded but transfer_reversal is null/zero — contractor's connected account balance likely could not cover any reversal. Full shortfall recorded as contractor_debt.`);
    }

    // Expected reversal — shared with the chargeback handler (Brief 3, E2:
    // "recorded the same way as a refund shortfall") via paymentMath.ts so
    // the two can't diverge on this arithmetic.
    const expectedReversalPence = expectedTransferReversalPence(
      paymentAmountPence,
      toPence(Number(payment.platform_fee ?? 0)),
      amountPence,
    );
    const shortfallPence = Math.max(0, expectedReversalPence - actualReversedPence);

    if (shortfallPence > 0) {
      console.error(`[process-refund] LOUD WARNING: refund ${refundId} (Stripe refund ${stripeRefund.id}) transfer reversal short by ${shortfallPence}p — recording as contractor_debt. Customer refund proceeds regardless (D3).`);
    }

    // application fee refunded: Stripe's documented proportional rule
    // ("an original payment of 100 USD with a 5 USD application fee that
    // you refund 40 USD (40%) refunds 2 USD of the application fee") —
    // computed rather than trusted to a response field, since the Refund
    // object doesn't expose a direct "application fee refunded" amount.
    const applicationFeeRefundedPence = refundApplicationFee && paymentAmountPence > 0
      ? Math.round(toPence(Number(payment.platform_fee ?? 0)) * (amountPence / paymentAmountPence))
      : 0;

    // stripe_fee_lost: Stripe does not return the original processing fee
    // on a refund — computed pro rata from payments.stripe_fee.
    const stripeFeeLostPence = paymentAmountPence > 0
      ? Math.round(toPence(Number(payment.stripe_fee ?? 0)) * (amountPence / paymentAmountPence))
      : 0;

    const transferReversedAmount = actualReversedPence / 100;
    const contractorDebt = shortfallPence / 100;
    const applicationFeeRefunded = applicationFeeRefundedPence / 100;
    const stripeFeeLost = stripeFeeLostPence / 100;

    // 5 + 6. Record the outcome and update the payments running totals
    // (D6 — refunds is the source of truth, payments carries the summary).
    const newRefundedAmount = Number(payment.refunded_amount ?? 0) + Number(claimed.amount);
    const newTransferReversedAmount = Number(payment.transfer_reversed_amount ?? 0) + transferReversedAmount;
    const isFullRefund = newRefundedAmount >= Number(payment.amount);

    const { error: refundUpdateError } = await supabase.from("refunds").update({
      status: "succeeded",
      stripe_refund_id: stripeRefund.id,
      transfer_reversed_amount: transferReversedAmount,
      contractor_debt: contractorDebt,
      application_fee_refunded: applicationFeeRefunded,
      stripe_fee_lost: stripeFeeLost,
    }).eq("id", refundId);
    if (refundUpdateError) {
      console.error(`[process-refund] Stripe refund ${stripeRefund.id} succeeded but failed to update refunds row ${refundId}:`, refundUpdateError);
    }

    const paymentUpdate: Record<string, unknown> = {
      refunded_amount: newRefundedAmount,
      transfer_reversed_amount: newTransferReversedAmount,
    };
    // status = 'refunded' ONLY on a full refund; left alone on partial.
    if (isFullRefund) paymentUpdate.status = "refunded";

    const { error: paymentUpdateError } = await supabase
      .from("payments")
      .update(paymentUpdate)
      .eq("id", payment.id);
    if (paymentUpdateError) {
      console.error(`[process-refund] Stripe refund ${stripeRefund.id} succeeded but failed to update payments row ${payment.id}:`, paymentUpdateError);
    }

    // 7. Notify contractor and customer.
    const notifications: Record<string, unknown>[] = [];
    if (claimed.contractor_id) {
      notifications.push({
        user_id: claimed.contractor_id,
        title: "Refund processed",
        message: `A £${Number(claimed.amount).toFixed(2)} refund has been processed.` +
          (contractorDebt > 0 ? ` £${contractorDebt.toFixed(2)} could not be recovered from your balance and has been recorded as a debt.` : ""),
        type: "refund_processed",
        reference_type: "refund",
        reference_id: refundId,
        is_read: false,
      });
    }
    if (payment.payer_id) {
      notifications.push({
        user_id: payment.payer_id,
        title: "Refund issued",
        message: `You have been refunded £${Number(claimed.amount).toFixed(2)}.`,
        type: "refund_processed",
        reference_type: "refund",
        reference_id: refundId,
        is_read: false,
      });
    }
    if (notifications.length > 0) {
      const { error: notifyError } = await supabase.from("notifications").insert(notifications);
      if (notifyError) console.error("[process-refund] Failed to insert notifications", notifyError);
    }

    return json(200, {
      refundId,
      stripeRefundId: stripeRefund.id,
      status: "succeeded",
      transferReversedAmount,
      contractorDebt,
      applicationFeeRefunded,
    });
  } catch (error) {
    console.error("process-refund failed", error);
    return json(500, { error: error instanceof Error ? error.message : "Unknown server error" });
  }
});
