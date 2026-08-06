// supabase/functions/stripe-webhook/index.ts
//
// Handles two event types:
//  - checkout.session.completed: no live caller creates a Checkout Session
//    with invoice_id metadata as of readiness-audit R1-2 — the function
//    that used to (create-invoice-payment/index.ts) was retired in favour
//    of converging invoice payment on the payment_intent.succeeded/"invoice"
//    path below. Kept as a harmless, idempotent no-op path (not
//    create-deposit-checkout's session either — that's quarantined per
//    the Projects decision, and uses different metadata: type/"project_deposit"
//    this handler never reads) rather than deleted, in case Checkout
//    Session usage for invoices returns.
//  - payment_intent.succeeded: dispatches on paymentIntent.metadata.type —
//    "deposit" (accept-quote/index.ts's PaymentIntent): marks the deposit
//    paid on both the quote and the invoice (writing deposit_deducted
//    alongside deposit_paid — see fetchChargeLedger below — so
//    deposit_deducted becomes the live source of truth and demotes
//    paymentMath's deposit_amount fallback to a safety net for pre-backfill
//    rows), mints the job via mint_job_from_quote (LOCKED DECISION: a
//    scheduled job means money has moved, or none was due), and records a
//    payments row; "invoice" (create-payment-intent/index.ts's
//    PaymentIntent): marks the invoice paid and records a payments row.
//    Both branches are idempotent — safe to receive either event twice.
//    Both use camelCase metadata (invoiceId/contractorId/clientId) — no
//    attempt made in this slice to unify with checkout.session.completed's
//    snake_case.
//
//    Both branches also capture a revenue ledger on the payments row via
//    fetchChargeLedger(): the charge id, the Connect transfer id (needed to
//    reverse the contractor payout on a future refund/dispute — not handled
//    in this slice), the balance transaction id, and Stripe's own processing
//    fee. platform_fee stays the gross application fee; net_platform_revenue
//    is platform_fee minus Stripe's fee — see ../_shared/paymentMath.ts.
//    Ledger capture failures are logged and swallowed — they must never
//    block the invoice/job state transition itself.
//
//  - charge.dispute.created (Brief 3, E1; Brief 3a inquiry split): fires for
//    TWO genuinely different things Stripe lumps under one event —
//      INQUIRY / early-fraud-warning (status warning_needs_response,
//      warning_under_review, warning_closed): NO financial impact, Stripe
//      has NOT debited the platform balance. Recorded, notified, but never
//      reversed — see INQUIRY_DISPUTE_STATUSES below.
//      CHARGEBACK (status needs_response, under_review, won, lost): the
//      platform balance HAS been debited. AUTO-REVERSES the contractor's
//      transfer immediately, no approval step — unlike Brief 2's refund
//      flow (contractor requests, admin approves), the money is already
//      gone by the time this event arrives, so waiting only reduces the
//      chance of recovering anything from the contractor's Stripe balance.
//    Both branches record a public.chargebacks row (NOT the unrelated
//    public.disputes table, which is in-platform job disputes). A reversal
//    can fail OUTRIGHT (insufficient destination balance throws — it does
//    not return a short amount, unlike a refund's transfer_reversal) — the
//    shortfall becomes contractor_debt via a public.contractor_debts row,
//    mirroring a refund shortfall (E2/E5). Every internal failure path in
//    this handler is caught and still returns 200 — a non-200 makes Stripe
//    retry the whole webhook.
//  - charge.dispute.updated (Brief 3a): how an inquiry ESCALATES to a real
//    chargeback — the status changes on the SAME dispute object;
//    charge.dispute.created does not fire again. Detects an inquiry -> real
//    chargeback status transition on the existing chargebacks row and, only
//    then, runs the identical reversal path (shared with
//    handleChargeDisputeCreated via reverseContractorTransferForDispute()
//    so the two can never diverge). Guarded against double-reversal on a
//    duplicate/out-of-order delivery.
//  - charge.dispute.closed: on 'won' (E4), transfers the previously-reversed
//    funds back to the contractor and writes off any contractor_debts row
//    for that chargeback; on 'lost', the reversal and debt stand, and
//    payments.status reverts from 'disputed' to 'refunded'.
//  - charge.refunded / payment_intent.payment_failed: minimal logging-only
//    handlers — unhandled today, kept from being silently swallowed.
import Stripe from "https://esm.sh/stripe@18.5.0?target=deno";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { buildEmail, buildSubject } from "../_shared/emailTemplate.ts";
import { netPlatformRevenue, toPence, expectedTransferReversalPence } from "../_shared/paymentMath.ts";

// Inquiry / early-fraud-warning statuses. charge.dispute.created fires
// for these too, but they carry NO financial impact — Stripe has not
// debited the platform balance, so reversing the contractor's transfer
// would take money from them over a dispute that cost TradeStone
// nothing. Record the chargebacks row and notify, but never reverse.
// Escalation to a real chargeback arrives as charge.dispute.updated
// with a non-warning status.
const INQUIRY_DISPUTE_STATUSES = new Set([
  "warning_needs_response", "warning_under_review", "warning_closed",
]);

// Statuses meaning the platform balance HAS been debited — a transfer
// reversal is appropriate (E1). 'won'/'lost' are included for
// defensiveness (charge.dispute.closed is the normal path for those
// terminal states, not .updated) so an unexpected delivery carrying one
// doesn't fall through unrecognised and skip a needed reversal.
const CHARGEBACK_DISPUTE_STATUSES = new Set([
  "needs_response", "under_review", "won", "lost",
]);

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

interface ChargeLedger {
  chargeId: string;
  transferId: string | null;
  balanceTransactionId: string | null;
  stripeFeePence: number;
}

/**
 * Resolves the charge behind a succeeded PaymentIntent and pulls the
 * revenue-ledger fields off it. Ledger capture must NEVER block the
 * invoice/job state transition — any failure here is logged and the caller
 * proceeds without a ledger row.
 */
async function fetchChargeLedger(paymentIntent: Stripe.PaymentIntent): Promise<ChargeLedger | null> {
  const latestCharge = paymentIntent.latest_charge;
  const chargeId = typeof latestCharge === "string" ? latestCharge : latestCharge?.id;
  if (!chargeId) {
    console.error("No latest_charge on PaymentIntent, skipping ledger capture", paymentIntent.id);
    return null;
  }

  try {
    // No stripeAccount header — the charge lives on the platform account
    // under destination charges, not on the connected account.
    const charge = await stripe.charges.retrieve(chargeId, { expand: ["balance_transaction"] });

    const transfer = charge.transfer;
    const transferId = typeof transfer === "string" ? transfer : transfer?.id ?? null;

    const balanceTransaction = charge.balance_transaction;
    const balanceTransactionId = typeof balanceTransaction === "string"
      ? balanceTransaction
      : balanceTransaction?.id ?? null;
    const stripeFeePence = typeof balanceTransaction === "object" && balanceTransaction
      ? balanceTransaction.fee
      : 0;

    return { chargeId, transferId, balanceTransactionId, stripeFeePence };
  } catch (err) {
    console.error("Failed to fetch charge ledger", chargeId, err);
    return null;
  }
}

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

async function handleInvoicePaymentIntentSucceeded(
  supabase: ReturnType<typeof createClient>,
  paymentIntent: Stripe.PaymentIntent,
) {
  const invoiceId = paymentIntent.metadata.invoiceId;
  if (!invoiceId) {
    console.error("payment_intent.succeeded (invoice) missing invoiceId metadata", paymentIntent.id);
    return jsonResponse(400, { success: false, error: "Missing invoiceId in payment intent metadata" });
  }

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select("id, status, contractor_id, recipient_id, job_id")
    .eq("id", invoiceId)
    .maybeSingle();

  if (invoiceError || !invoice) {
    console.error("Invoice not found for payment", invoiceId, invoiceError);
    return jsonResponse(400, { success: false, error: "Invoice not found" });
  }

  // Idempotent: only flip to paid if it isn't already. Setting
  // recipient_response fires notify_invoice_response, which notifies both
  // the contractor and the client — do not also hand-insert notifications
  // here, that would duplicate what the trigger now does.
  if (invoice.status !== "paid") {
    const { error: updateError } = await supabase
      .from("invoices")
      .update({
        status: "paid",
        paid_date: new Date().toISOString().slice(0, 10),
        recipient_response: "paid",
      })
      .eq("id", invoiceId);
    if (updateError) {
      console.error("Failed to mark invoice paid", updateError);
      throw updateError;
    }
  }

  // payments row — idempotent on stripe_payment_intent_id.
  const { data: existingPayment } = await supabase
    .from("payments")
    .select("id")
    .eq("stripe_payment_intent_id", paymentIntent.id)
    .maybeSingle();

  if (!existingPayment) {
    const applicationFeePence = paymentIntent.application_fee_amount ?? 0;
    const ledger = await fetchChargeLedger(paymentIntent);

    const { error: paymentError } = await supabase.from("payments").insert({
      job_id: invoice.job_id,
      invoice_id: invoiceId,
      payer_id: paymentIntent.metadata.clientId || invoice.recipient_id || null,
      payee_id: paymentIntent.metadata.contractorId || invoice.contractor_id || null,
      amount: paymentIntent.amount / 100,
      platform_fee: applicationFeePence / 100,
      stripe_payment_intent_id: paymentIntent.id,
      stripe_charge_id: ledger?.chargeId ?? null,
      stripe_transfer_id: ledger?.transferId ?? null,
      stripe_balance_transaction_id: ledger?.balanceTransactionId ?? null,
      stripe_fee: ledger ? ledger.stripeFeePence / 100 : null,
      net_platform_revenue: ledger ? netPlatformRevenue(applicationFeePence, ledger.stripeFeePence) : null,
      status: "released",
      type: "invoice",
    });
    if (paymentError) {
      console.error("Failed to record payments row for invoice payment", paymentError);
    }
  }

  console.log(`Invoice ${invoiceId} marked paid via PaymentIntent ${paymentIntent.id}`);

  return jsonResponse(200, { success: true, received: true });
}

async function handlePaymentIntentSucceeded(
  supabase: ReturnType<typeof createClient>,
  paymentIntent: Stripe.PaymentIntent,
) {
  if (paymentIntent.metadata?.type === "invoice") {
    return await handleInvoicePaymentIntentSucceeded(supabase, paymentIntent);
  }

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
      // deposit_deducted is written here, alongside deposit_paid, as the
      // live source of truth (the amount actually charged via Stripe) —
      // paymentMath's deposit_amount fallback is a safety net for rows
      // created before this write existed.
      const { error: invoiceUpdateError } = await supabase
        .from("invoices")
        .update({
          deposit_paid: true,
          deposit_paid_at: new Date().toISOString(),
          deposit_deducted: paymentIntent.amount / 100,
        })
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
    const applicationFeePence = paymentIntent.application_fee_amount ?? 0;
    const ledger = await fetchChargeLedger(paymentIntent);

    const { error: paymentError } = await supabase.from("payments").insert({
      job_id: jobId,
      invoice_id: invoiceId ?? null,
      payer_id: paymentIntent.metadata.clientId || null,
      payee_id: paymentIntent.metadata.contractorId || null,
      amount: paymentIntent.amount / 100,
      platform_fee: applicationFeePence / 100,
      stripe_payment_intent_id: paymentIntent.id,
      stripe_charge_id: ledger?.chargeId ?? null,
      stripe_transfer_id: ledger?.transferId ?? null,
      stripe_balance_transaction_id: ledger?.balanceTransactionId ?? null,
      stripe_fee: ledger ? ledger.stripeFeePence / 100 : null,
      net_platform_revenue: ledger ? netPlatformRevenue(applicationFeePence, ledger.stripeFeePence) : null,
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

interface DisputePayment {
  id: string;
  invoice_id: string | null;
  job_id: string | null;
  payee_id: string | null;
  payer_id: string | null;
  amount: number | string;
  platform_fee: number | string | null;
  stripe_transfer_id: string | null;
}

/**
 * Reverses the contractor's transfer for a dispute's disputed amount.
 * Shared by handleChargeDisputeCreated (chargeback branch) and
 * handleChargeDisputeUpdated's escalation path — this arithmetic and the
 * try/catch-not-partial-success posture must not be duplicated a second
 * time (see Brief 3's own history of exactly that problem in
 * process-refund vs this file, fixed via paymentMath.ts's
 * expectedTransferReversalPence). CRITICAL DIFFERENCE FROM process-refund:
 * a reversal here can fail OUTRIGHT (insufficient destination balance
 * throws) rather than returning a short amount — no partial-success case
 * to read, only "the full requested amount" or "nothing, plus an error".
 */
async function reverseContractorTransferForDispute(
  payment: DisputePayment | null,
  chargebackId: string,
  disputeId: string,
  disputeAmountPence: number,
): Promise<{ transferReversedPence: number; contractorDebtPence: number; reversalError: string | null }> {
  if (!payment?.stripe_transfer_id) {
    console.error(`[stripe-webhook] chargeback ${chargebackId}: no payment or stripe_transfer_id on file — cannot attempt a transfer reversal. Full disputed amount is unrecoverable from the contractor via this mechanism.`);
    return { transferReversedPence: 0, contractorDebtPence: 0, reversalError: null };
  }

  const expectedReversalPence = expectedTransferReversalPence(
    toPence(Number(payment.amount)),
    toPence(Number(payment.platform_fee ?? 0)),
    disputeAmountPence,
  );

  try {
    const reversal = await stripe.transfers.createReversal(
      payment.stripe_transfer_id,
      {
        amount: expectedReversalPence,
        metadata: {
          chargebackId,
          disputeId,
          contractorId: payment.payee_id ?? "",
        },
      },
      { idempotencyKey: chargebackId },
    );
    // Read the ACTUAL reversed amount — never assume it equals what was requested.
    const transferReversedPence = reversal.amount;
    return {
      transferReversedPence,
      contractorDebtPence: Math.max(0, expectedReversalPence - transferReversedPence),
      reversalError: null,
    };
  } catch (reversalErr) {
    const reversalError = reversalErr instanceof Error ? reversalErr.message : "Unknown transfer reversal error";
    console.error(`[stripe-webhook] LOUD WARNING: transfer reversal FAILED outright for chargeback ${chargebackId} (dispute ${disputeId}): ${reversalError}. Full expected amount (${expectedReversalPence}p) recorded as contractor_debt.`);
    return { transferReversedPence: 0, contractorDebtPence: expectedReversalPence, reversalError };
  }
}

/**
 * charge.dispute.created (Brief 3, E1; Brief 3a inquiry split). Everything
 * in here is wrapped so that NO code path throws out of this function — a
 * non-200 response makes Stripe retry the whole webhook, and re-processing
 * a dispute we already reversed is exactly the double-reversal risk the
 * idempotency check below exists to prevent. Every failure is logged
 * loudly and swallowed instead.
 */
async function handleChargeDisputeCreated(
  supabase: ReturnType<typeof createClient>,
  dispute: Stripe.Dispute,
) {
  try {
    // 1. Idempotent on stripe_dispute_id.
    const { data: existing } = await supabase
      .from("chargebacks")
      .select("id")
      .eq("stripe_dispute_id", dispute.id)
      .maybeSingle();
    if (existing) {
      return jsonResponse(200, { success: true, received: true, alreadyProcessed: true });
    }

    // 2. Find the payment by stripe_charge_id.
    const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id;
    const { data: payment } = chargeId
      ? await supabase
          .from("payments")
          .select("id, invoice_id, job_id, payee_id, payer_id, amount, platform_fee, stripe_transfer_id")
          .eq("stripe_charge_id", chargeId)
          .maybeSingle()
      : { data: null };

    if (!payment) {
      console.error(`[stripe-webhook] LOUD WARNING: charge.dispute.created ${dispute.id} for charge ${chargeId ?? "(unknown)"} has NO matching payments row — inserting chargebacks row with payment_id null so this is never silently lost.`);
    }

    // Dispute fee: Stripe's own reasoning — "the dispute fee from
    // balance_transactions where reporting_category is 'dispute'".
    const disputeFeeEntry = dispute.balance_transactions?.find((bt) => bt.reporting_category === "dispute");
    const disputeFeePence = disputeFeeEntry?.fee ?? null;
    const evidenceDueBy = dispute.evidence_details?.due_by
      ? new Date(dispute.evidence_details.due_by * 1000).toISOString()
      : null;

    // 3. Insert the chargebacks row — always, inquiry or chargeback alike.
    // The record matters regardless, and it's what makes later escalation
    // (charge.dispute.updated) idempotent.
    const { data: chargeback, error: insertError } = await supabase
      .from("chargebacks")
      .insert({
        stripe_dispute_id: dispute.id,
        stripe_charge_id: chargeId ?? "",
        payment_id: payment?.id ?? null,
        invoice_id: payment?.invoice_id ?? null,
        job_id: payment?.job_id ?? null,
        contractor_id: payment?.payee_id ?? null,
        customer_id: payment?.payer_id ?? null,
        amount: dispute.amount / 100,
        dispute_fee: disputeFeePence != null ? disputeFeePence / 100 : null,
        reason: dispute.reason ?? null,
        status: dispute.status,
        evidence_due_by: evidenceDueBy,
      })
      .select()
      .single();

    if (insertError || !chargeback) {
      console.error(`[stripe-webhook] CRITICAL: failed to insert chargebacks row for dispute ${dispute.id} — a real chargeback/inquiry is now UNRECORDED`, insertError);
      return jsonResponse(200, { success: true, received: true });
    }

    const isInquiry = INQUIRY_DISPUTE_STATUSES.has(dispute.status);
    const dueByLabel = evidenceDueBy
      ? new Date(evidenceDueBy).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })
      : "an unknown date — check the Stripe Dashboard";
    const amountLabel = `£${(dispute.amount / 100).toFixed(2)}`;
    const notifications: Record<string, unknown>[] = [];

    if (isInquiry) {
      // Inquiry / early-fraud-warning: NO financial impact. Skip the
      // reversal entirely, do not touch payments.status — nothing has been
      // debited. Wording is deliberately different from the chargeback
      // notification below, which states funds have been reversed.
      const { error: chargebackUpdateError } = await supabase
        .from("chargebacks")
        .update({ transfer_reversed_amount: 0, contractor_debt: 0, reversal_error: null })
        .eq("id", chargeback.id);
      if (chargebackUpdateError) {
        console.error(`[stripe-webhook] failed to record no-reversal outcome on inquiry chargeback ${chargeback.id}`, chargebackUpdateError);
      }

      if (chargeback.contractor_id) {
        notifications.push({
          user_id: chargeback.contractor_id,
          title: "Payment inquiry raised",
          message: `An inquiry (${dispute.reason ?? "reason not given"}) has been raised on a ${amountLabel} payment. No funds have been moved. TradeStone may need to provide evidence by ${dueByLabel} — you may be asked for supporting information.`,
          type: "chargeback_inquiry",
          reference_type: "chargeback",
          reference_id: chargeback.id,
          is_read: false,
        });
      }
      const { data: admins } = await supabase.from("admin_users").select("user_id");
      for (const admin of admins ?? []) {
        notifications.push({
          user_id: admin.user_id,
          title: "Payment inquiry raised",
          message: `Inquiry ${dispute.id} for ${amountLabel} (${dispute.reason ?? "reason not given"}) — no funds moved. Response may be due by ${dueByLabel}.`,
          type: "chargeback_inquiry",
          reference_type: "chargeback",
          reference_id: chargeback.id,
          is_read: false,
        });
      }

      console.log(`Inquiry-stage dispute ${dispute.id} (status=${dispute.status}) recorded as chargeback ${chargeback.id}; no reversal.`);
    } else {
      // 4. CHARGEBACK — immediately reverse the contractor's transfer (E1).
      const { transferReversedPence, contractorDebtPence, reversalError } =
        await reverseContractorTransferForDispute(payment, chargeback.id, dispute.id, dispute.amount);

      const { error: chargebackUpdateError } = await supabase
        .from("chargebacks")
        .update({
          transfer_reversed_amount: transferReversedPence / 100,
          contractor_debt: contractorDebtPence / 100,
          reversal_error: reversalError,
        })
        .eq("id", chargeback.id);
      if (chargebackUpdateError) {
        console.error(`[stripe-webhook] failed to record reversal outcome on chargeback ${chargeback.id}`, chargebackUpdateError);
      }

      if (contractorDebtPence > 0 && chargeback.contractor_id) {
        const { error: debtError } = await supabase.from("contractor_debts").insert({
          contractor_id: chargeback.contractor_id,
          source_type: "chargeback",
          source_id: chargeback.id,
          amount: contractorDebtPence / 100,
          status: "outstanding",
        });
        if (debtError) {
          console.error(`[stripe-webhook] failed to insert contractor_debts row for chargeback ${chargeback.id}`, debtError);
        }
      }

      // 7. payments.status = 'disputed' (already an allowed value).
      if (payment) {
        const { error: paymentStatusError } = await supabase
          .from("payments")
          .update({ status: "disputed" })
          .eq("id", payment.id);
        if (paymentStatusError) {
          console.error(`[stripe-webhook] failed to set payments.status='disputed' for payment ${payment.id}`, paymentStatusError);
        }
      }

      if (chargeback.contractor_id) {
        notifications.push({
          user_id: chargeback.contractor_id,
          title: "Chargeback received",
          message: `A chargeback of ${amountLabel} (${dispute.reason ?? "reason not given"}) has been raised and funds have already been reversed from your balance` +
            (contractorDebtPence > 0 ? ` (£${(contractorDebtPence / 100).toFixed(2)} could not be recovered and has been recorded as a debt)` : "") +
            `. TradeStone will respond to the dispute on your behalf — evidence is due by ${dueByLabel}. If you have evidence to support this transaction, get in touch as soon as possible.`,
          type: "chargeback_created",
          reference_type: "chargeback",
          reference_id: chargeback.id,
          is_read: false,
        });
      }
      const { data: admins } = await supabase.from("admin_users").select("user_id");
      for (const admin of admins ?? []) {
        notifications.push({
          user_id: admin.user_id,
          title: "Chargeback received — evidence needed",
          message: `Dispute ${dispute.id} for ${amountLabel} (${dispute.reason ?? "reason not given"}) needs a response by ${dueByLabel}. Submit evidence via the Stripe Dashboard.`,
          type: "chargeback_created",
          reference_type: "chargeback",
          reference_id: chargeback.id,
          is_read: false,
        });
      }

      console.log(`Chargeback ${chargeback.id} recorded for dispute ${dispute.id}; transfer_reversed_amount=${transferReversedPence / 100}, contractor_debt=${contractorDebtPence / 100}`);
    }

    if (notifications.length > 0) {
      const { error: notifyError } = await supabase.from("notifications").insert(notifications);
      if (notifyError) console.error("[stripe-webhook] failed to insert dispute notifications", notifyError);
    }

    // 9. Always 200.
    return jsonResponse(200, { success: true, received: true });
  } catch (err) {
    console.error(`[stripe-webhook] UNHANDLED error in handleChargeDisputeCreated for dispute ${dispute?.id} — returning 200 to prevent a Stripe retry storm`, err);
    return jsonResponse(200, { success: true, received: true });
  }
}

/**
 * charge.dispute.updated (Brief 3a). How an inquiry ESCALATES to a real
 * chargeback — the status changes on the SAME dispute object;
 * charge.dispute.created does not fire again. Same "never throw out"
 * posture as the other dispute handlers.
 */
async function handleChargeDisputeUpdated(
  supabase: ReturnType<typeof createClient>,
  dispute: Stripe.Dispute,
) {
  try {
    // 1. Look up by stripe_dispute_id.
    const { data: chargeback } = await supabase
      .from("chargebacks")
      .select("*")
      .eq("stripe_dispute_id", dispute.id)
      .maybeSingle();

    if (!chargeback) {
      console.error(`[stripe-webhook] charge.dispute.updated for unknown dispute ${dispute.id} — no matching chargebacks row (charge.dispute.created may not have been received). Logging only.`);
      return jsonResponse(200, { success: true, received: true });
    }

    const previousStatus: string = chargeback.status;

    // 2. Refresh status/evidence_due_by/amount/dispute_fee from the event —
    // unconditionally, escalation or not.
    const disputeFeeEntry = dispute.balance_transactions?.find((bt) => bt.reporting_category === "dispute");
    const disputeFeePence = disputeFeeEntry?.fee ?? null;
    const evidenceDueBy = dispute.evidence_details?.due_by
      ? new Date(dispute.evidence_details.due_by * 1000).toISOString()
      : null;

    const { error: refreshError } = await supabase
      .from("chargebacks")
      .update({
        status: dispute.status,
        evidence_due_by: evidenceDueBy,
        amount: dispute.amount / 100,
        dispute_fee: disputeFeePence != null ? disputeFeePence / 100 : null,
      })
      .eq("id", chargeback.id);
    if (refreshError) {
      console.error(`[stripe-webhook] failed to refresh chargeback ${chargeback.id} on charge.dispute.updated`, refreshError);
    }

    const isEscalation = INQUIRY_DISPUTE_STATUSES.has(previousStatus) && CHARGEBACK_DISPUTE_STATUSES.has(dispute.status);
    if (!isEscalation) {
      // Any other update (inquiry refinement, chargeback status refinement,
      // etc.) — the refresh above already covers it, nothing further to do.
      return jsonResponse(200, { success: true, received: true });
    }

    // Double-reversal guard: only reverse if none of these three already
    // indicate an attempt happened — transfer_reversed_amount is nonzero
    // only after a genuine successful reversal (a reversal never "succeeds"
    // with 0, per reverseContractorTransferForDispute's contract: it's
    // either the full requested amount or a thrown error), reversal_error
    // is set only after a genuine failed attempt, and an existing
    // contractor_debts row is a third, independent signal of the same
    // fact. All three are checked so a duplicate/out-of-order
    // charge.dispute.updated delivery for the same escalation is a no-op.
    const alreadyAttempted = Number(chargeback.transfer_reversed_amount) !== 0 || chargeback.reversal_error != null;
    let hasDebtRow = false;
    if (!alreadyAttempted) {
      const { data: debtRow } = await supabase
        .from("contractor_debts")
        .select("id")
        .eq("source_type", "chargeback")
        .eq("source_id", chargeback.id)
        .maybeSingle();
      hasDebtRow = !!debtRow;
    }

    if (alreadyAttempted || hasDebtRow) {
      console.log(`Chargeback ${chargeback.id}: escalation to ${dispute.status} already reversed (or attempted) — duplicate/out-of-order charge.dispute.updated, no-op.`);
      return jsonResponse(200, { success: true, received: true, alreadyProcessed: true });
    }

    // Escalating — need the payment row for the reversal calc (may not
    // have been on the chargebacks row's own columns).
    const { data: payment } = chargeback.payment_id
      ? await supabase
          .from("payments")
          .select("id, invoice_id, job_id, payee_id, payer_id, amount, platform_fee, stripe_transfer_id")
          .eq("id", chargeback.payment_id)
          .maybeSingle()
      : { data: null };

    const { transferReversedPence, contractorDebtPence, reversalError } =
      await reverseContractorTransferForDispute(payment, chargeback.id, dispute.id, dispute.amount);

    const { error: reversalRecordError } = await supabase
      .from("chargebacks")
      .update({
        transfer_reversed_amount: transferReversedPence / 100,
        contractor_debt: contractorDebtPence / 100,
        reversal_error: reversalError,
      })
      .eq("id", chargeback.id);
    if (reversalRecordError) {
      console.error(`[stripe-webhook] failed to record escalation reversal outcome on chargeback ${chargeback.id}`, reversalRecordError);
    }

    if (contractorDebtPence > 0 && chargeback.contractor_id) {
      const { error: debtError } = await supabase.from("contractor_debts").insert({
        contractor_id: chargeback.contractor_id,
        source_type: "chargeback",
        source_id: chargeback.id,
        amount: contractorDebtPence / 100,
        status: "outstanding",
      });
      if (debtError) {
        console.error(`[stripe-webhook] failed to insert contractor_debts row for escalated chargeback ${chargeback.id}`, debtError);
      }
    }

    if (payment) {
      const { error: paymentStatusError } = await supabase
        .from("payments")
        .update({ status: "disputed" })
        .eq("id", payment.id);
      if (paymentStatusError) {
        console.error(`[stripe-webhook] failed to set payments.status='disputed' for payment ${payment.id} on escalation`, paymentStatusError);
      }
    }

    const dueByLabel = evidenceDueBy
      ? new Date(evidenceDueBy).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })
      : "an unknown date — check the Stripe Dashboard";
    const amountLabel = `£${(dispute.amount / 100).toFixed(2)}`;
    const notifications: Record<string, unknown>[] = [];

    if (chargeback.contractor_id) {
      notifications.push({
        user_id: chargeback.contractor_id,
        title: "Chargeback received",
        message: `An inquiry on a ${amountLabel} payment has escalated to a chargeback (${dispute.reason ?? "reason not given"}) and funds have now been reversed from your balance` +
          (contractorDebtPence > 0 ? ` (£${(contractorDebtPence / 100).toFixed(2)} could not be recovered and has been recorded as a debt)` : "") +
          `. TradeStone will respond to the dispute on your behalf — evidence is due by ${dueByLabel}.`,
        type: "chargeback_created",
        reference_type: "chargeback",
        reference_id: chargeback.id,
        is_read: false,
      });
    }
    const { data: admins } = await supabase.from("admin_users").select("user_id");
    for (const admin of admins ?? []) {
      notifications.push({
        user_id: admin.user_id,
        title: "Inquiry escalated to chargeback",
        message: `Dispute ${dispute.id} escalated to ${dispute.status} (${amountLabel}, ${dispute.reason ?? "reason not given"}). Response due by ${dueByLabel}.`,
        type: "chargeback_created",
        reference_type: "chargeback",
        reference_id: chargeback.id,
        is_read: false,
      });
    }
    if (notifications.length > 0) {
      const { error: notifyError } = await supabase.from("notifications").insert(notifications);
      if (notifyError) console.error("[stripe-webhook] failed to insert escalation notifications", notifyError);
    }

    console.log(`Chargeback ${chargeback.id} escalated (dispute ${dispute.id}, ${previousStatus} -> ${dispute.status}); transfer_reversed_amount=${transferReversedPence / 100}, contractor_debt=${contractorDebtPence / 100}`);

    return jsonResponse(200, { success: true, received: true });
  } catch (err) {
    console.error(`[stripe-webhook] UNHANDLED error in handleChargeDisputeUpdated for dispute ${dispute?.id} — returning 200 to prevent a Stripe retry storm`, err);
    return jsonResponse(200, { success: true, received: true });
  }
}

/**
 * charge.dispute.closed. Same "never throw out" posture as
 * handleChargeDisputeCreated — a second delivery must not transfer funds
 * twice (guarded on chargebacks.closed_at, plus its own idempotency key on
 * the return-transfer call itself as defence in depth).
 */
async function handleChargeDisputeClosed(
  supabase: ReturnType<typeof createClient>,
  dispute: Stripe.Dispute,
) {
  try {
    // 1. Look up by stripe_dispute_id.
    const { data: chargeback } = await supabase
      .from("chargebacks")
      .select("*")
      .eq("stripe_dispute_id", dispute.id)
      .maybeSingle();

    if (!chargeback) {
      console.error(`[stripe-webhook] charge.dispute.closed for unknown dispute ${dispute.id} — no matching chargebacks row (charge.dispute.created may not have been received). Logging only.`);
      return jsonResponse(200, { success: true, received: true });
    }

    // Idempotent: already closed -> no-op, so a duplicate delivery can't
    // transfer funds back to the contractor twice.
    if (chargeback.closed_at) {
      return jsonResponse(200, { success: true, received: true, alreadyProcessed: true });
    }

    // 2. outcome from dispute.status.
    const outcome = dispute.status === "won" ? "won" : dispute.status === "lost" ? "lost" : null;

    const { error: closeUpdateError } = await supabase
      .from("chargebacks")
      .update({
        status: dispute.status,
        outcome,
        closed_at: new Date().toISOString(),
      })
      .eq("id", chargeback.id);
    if (closeUpdateError) {
      console.error(`[stripe-webhook] failed to update chargebacks row ${chargeback.id} on close`, closeUpdateError);
    }

    if (outcome === "won") {
      // 3. E4 — transfer the reversed funds BACK to the contractor.
      if (Number(chargeback.transfer_reversed_amount) > 0 && chargeback.contractor_id) {
        const { data: contractorProfile } = await supabase
          .from("profiles")
          .select("stripe_account_id")
          .eq("id", chargeback.contractor_id)
          .maybeSingle();

        if (contractorProfile?.stripe_account_id) {
          try {
            const returnPence = toPence(Number(chargeback.transfer_reversed_amount));
            const transfer = await stripe.transfers.create(
              {
                amount: returnPence,
                currency: "gbp",
                destination: contractorProfile.stripe_account_id,
                metadata: {
                  chargebackId: chargeback.id,
                  disputeId: dispute.id,
                  reason: "chargeback_won_funds_returned",
                },
              },
              { idempotencyKey: `${chargeback.id}-return` },
            );

            const { error: fundsReturnedError } = await supabase
              .from("chargebacks")
              .update({ funds_returned_amount: transfer.amount / 100 })
              .eq("id", chargeback.id);
            if (fundsReturnedError) {
              console.error(`[stripe-webhook] transfer ${transfer.id} sent but failed to record funds_returned_amount on chargeback ${chargeback.id}`, fundsReturnedError);
            }
          } catch (transferErr) {
            // If the platform balance is insufficient the transfer fails —
            // caught, logged loudly, never thrown.
            console.error(`[stripe-webhook] LOUD WARNING: failed to return funds to contractor for WON dispute ${dispute.id} (chargeback ${chargeback.id}) — platform balance may be insufficient. Funds NOT returned:`, transferErr);
          }
        } else {
          console.error(`[stripe-webhook] LOUD WARNING: chargeback ${chargeback.id} won but contractor ${chargeback.contractor_id} has no stripe_account_id on file — cannot return funds`);
        }
      }

      // Write off any contractor_debts row tied to this chargeback.
      const { error: writeOffError } = await supabase
        .from("contractor_debts")
        .update({ status: "written_off", notes: "Dispute won — debt written off" })
        .eq("source_type", "chargeback")
        .eq("source_id", chargeback.id);
      if (writeOffError) {
        console.error(`[stripe-webhook] failed to write off contractor_debts row for chargeback ${chargeback.id}`, writeOffError);
      }
    } else if (outcome === "lost") {
      // 4. Reversal and debt stand. payments.status reverts from
      // 'disputed' to 'refunded'.
      if (chargeback.payment_id) {
        const { error: paymentStatusError } = await supabase
          .from("payments")
          .update({ status: "refunded" })
          .eq("id", chargeback.payment_id)
          .eq("status", "disputed");
        if (paymentStatusError) {
          console.error(`[stripe-webhook] failed to revert payments.status on LOST dispute ${dispute.id} (payment ${chargeback.payment_id})`, paymentStatusError);
        }
      }
    }

    // 5. Notify contractor and admins of the outcome.
    const amountLabel = `£${Number(chargeback.amount).toFixed(2)}`;
    const notifications: Record<string, unknown>[] = [];
    if (chargeback.contractor_id) {
      const message = outcome === "won"
        ? `The ${amountLabel} chargeback dispute was won — reversed funds have been returned to your balance.`
        : outcome === "lost"
        ? `The ${amountLabel} chargeback dispute was lost — the reversal stands.`
        : `The ${amountLabel} chargeback dispute closed with status "${dispute.status}".`;
      notifications.push({
        user_id: chargeback.contractor_id,
        title: "Chargeback dispute closed",
        message,
        type: "chargeback_closed",
        reference_type: "chargeback",
        reference_id: chargeback.id,
        is_read: false,
      });
    }
    const { data: admins } = await supabase.from("admin_users").select("user_id");
    for (const admin of admins ?? []) {
      notifications.push({
        user_id: admin.user_id,
        title: "Chargeback dispute closed",
        message: `Dispute ${dispute.id} closed: ${dispute.status}.`,
        type: "chargeback_closed",
        reference_type: "chargeback",
        reference_id: chargeback.id,
        is_read: false,
      });
    }
    if (notifications.length > 0) {
      const { error: notifyError } = await supabase.from("notifications").insert(notifications);
      if (notifyError) console.error("[stripe-webhook] failed to insert chargeback-closed notifications", notifyError);
    }

    console.log(`Chargeback ${chargeback.id} closed for dispute ${dispute.id}; outcome=${outcome ?? dispute.status}`);

    return jsonResponse(200, { success: true, received: true });
  } catch (err) {
    console.error(`[stripe-webhook] UNHANDLED error in handleChargeDisputeClosed for dispute ${dispute?.id} — returning 200 to prevent a Stripe retry storm`, err);
    return jsonResponse(200, { success: true, received: true });
  }
}

/** Minimal logging-only handler — charge.refunded is currently unhandled. */
function handleChargeRefundedLogOnly(charge: Stripe.Charge) {
  console.log(`[stripe-webhook] charge.refunded received for charge ${charge.id} (amount_refunded=${charge.amount_refunded}) — logging only, no handler implemented yet.`);
  return jsonResponse(200, { success: true, received: true });
}

/** Minimal logging-only handler — payment_intent.payment_failed is currently unhandled. */
function handlePaymentIntentPaymentFailedLogOnly(paymentIntent: Stripe.PaymentIntent) {
  console.log(`[stripe-webhook] payment_intent.payment_failed received for PaymentIntent ${paymentIntent.id} — logging only, no handler implemented yet.`);
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

    if (event.type === "charge.dispute.created") {
      return await handleChargeDisputeCreated(supabase, event.data.object as Stripe.Dispute);
    }

    if (event.type === "charge.dispute.updated") {
      return await handleChargeDisputeUpdated(supabase, event.data.object as Stripe.Dispute);
    }

    if (event.type === "charge.dispute.closed") {
      return await handleChargeDisputeClosed(supabase, event.data.object as Stripe.Dispute);
    }

    if (event.type === "charge.refunded") {
      return handleChargeRefundedLogOnly(event.data.object as Stripe.Charge);
    }

    if (event.type === "payment_intent.payment_failed") {
      return handlePaymentIntentPaymentFailedLogOnly(event.data.object as Stripe.PaymentIntent);
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
