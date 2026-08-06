// supabase/functions/_shared/paymentMath.ts
//
// Single source of truth for payment arithmetic in edge functions. Mirrors
// the semantics of src/lib/invoiceMoney.ts exactly — the two must not
// diverge.
//
// LOCKED INVARIANT (do not deviate, do not "improve"):
//   invoices.total is ALWAYS the GROSS value of works.
//   A deposit is a PAYMENT AGAINST the invoice, never a reduction of its
//   value.
//   The amount to charge = total - deposit already settled.
//
// The 5% platform fee is applied per-payment, not per-invoice: a deposit
// payment and a balance payment against the same invoice each carry their
// own application_fee_amount, computed from that payment's own pence
// figure. Because the payments against one job sum to the job's gross
// value, the fees taken across those payments also sum to 5% of the job
// value — no cross-payment fee tracking is needed, PROVIDED each payment
// amount is correct (which is the entire point of this file).

export const PLATFORM_FEE_PERCENT = 0.05;

export interface InvoicePayableFields {
  total: number | string;
  deposit_amount: number | string | null;
  deposit_deducted: number | string | null;
  deposit_paid: boolean | null;
}

const num = (v: number | string | null | undefined): number =>
  v == null ? 0 : Number(v) || 0;

/**
 * The deposit already collected against this invoice. deposit_deducted is
 * preferred (the live source of truth, written by stripe-webhook); falls
 * back to deposit_amount for rows created before that write existed.
 */
export function depositSettled(inv: InvoicePayableFields): number {
  if (!inv.deposit_paid) return 0;
  const explicit = num(inv.deposit_deducted);
  return explicit > 0 ? explicit : num(inv.deposit_amount);
}

/** Gross value of the invoice. */
export function amountGross(inv: InvoicePayableFields): number {
  return num(inv.total);
}

/** What is left to charge — gross minus any deposit already settled. Never negative. */
export function amountPayable(inv: InvoicePayableFields): number {
  return Math.max(0, amountGross(inv) - depositSettled(inv));
}

/** Converts a pounds figure to integer pence. */
export function toPence(amount: number): number {
  return Math.round(amount * 100);
}

/** The platform's 5% application fee, in pence, for a given payment amount in pence. */
export function platformFeePence(amountPence: number): number {
  return Math.round(amountPence * PLATFORM_FEE_PERCENT);
}

/**
 * Net platform revenue for a single payment, in pounds. The application fee
 * is gross — Stripe's own processing fee is deducted from it under
 * destination charges — so net revenue is (application fee - Stripe fee),
 * both in pence, converted to pounds.
 */
export function netPlatformRevenue(applicationFeePence: number, stripeFeePence: number): number {
  return (applicationFeePence - stripeFeePence) / 100;
}

/**
 * The transfer reversal Stripe is expected to make for a given portion of a
 * payment being refunded/disputed, in pence. The "original transfer amount"
 * is what was actually sent to the contractor (payment amount minus the
 * platform's application fee) — a full-payment portion reverses all of it;
 * a partial portion reverses a proportional share, matching Stripe's own
 * documented behaviour for both refunds ("if the refund results in the
 * entire charge being refunded, the entire transfer is reversed; otherwise,
 * a proportional amount of the transfer is reversed") and transfer
 * reversals in general. Used to compute the shortfall (expected minus
 * actual) that becomes contractor_debt — see process-refund/index.ts and
 * stripe-webhook/index.ts's dispute handler, which must not diverge on this
 * arithmetic (Brief 3, E2: "recorded the same way as a refund shortfall").
 */
export function expectedTransferReversalPence(
  paymentAmountPence: number,
  platformFeePence: number,
  portionPence: number,
): number {
  if (paymentAmountPence <= 0) return 0;
  const originalTransferPence = paymentAmountPence - platformFeePence;
  return Math.round(originalTransferPence * (portionPence / paymentAmountPence));
}
