/**
 * Single source of truth for invoice money predicates.
 *
 * Background: five screens each carried their own inline filter, producing
 * £0, £12, £15 and £27 for the same two invoices. Three of them filtered on
 * status === "overdue", a value nothing in the database ever writes.
 *
 * Rules:
 *  - Draft invoices are NOT outstanding. An unsent document is not a debt.
 *  - Overdue is DERIVED from due_date. It is never a status.
 *  - Amount owed nets off a deposit only once it has actually been paid.
 */

export type InvoiceStatus = "draft" | "sent" | "viewed" | "paid" | "void";

/** Minimal shape required to reason about invoice money. */
export interface InvoiceMoneyFields {
  status: string;
  total: number | string;
  due_date: string;
  deposit_amount: number | string | null;
  deposit_deducted: number | string | null;
  deposit_paid: boolean | null;
}

/** Statuses representing an invoice the client has received and not settled. */
const OPEN_STATUSES: ReadonlySet<string> = new Set(["sent", "viewed"]);

const num = (v: number | string | null | undefined): number =>
  v == null ? 0 : Number(v) || 0;

/** Start of today in local time, so due-date comparison is not time-of-day sensitive. */
const startOfToday = (): Date => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

/**
 * The deposit already collected against this invoice.
 * deposit_deducted is preferred but is currently never populated, so
 * deposit_amount is the fallback. Nothing is deducted until it is paid.
 */
export function depositSettled(inv: InvoiceMoneyFields): number {
  if (!inv.deposit_paid) return 0;
  const explicit = num(inv.deposit_deducted);
  return explicit > 0 ? explicit : num(inv.deposit_amount);
}

/** Gross value of the invoice. */
export function amountGross(inv: InvoiceMoneyFields): number {
  return num(inv.total);
}

/** What the client still owes, net of any paid deposit. Never negative. */
export function amountOutstanding(inv: InvoiceMoneyFields): number {
  if (!isOutstanding(inv)) return 0;
  return Math.max(0, amountGross(inv) - depositSettled(inv));
}

/** True when the invoice has been issued and is not yet settled or voided. */
export function isOutstanding(inv: InvoiceMoneyFields): boolean {
  return OPEN_STATUSES.has(inv.status);
}

/** True when an outstanding invoice has passed its due date. Derived, never stored. */
export function isOverdue(inv: InvoiceMoneyFields): boolean {
  if (!isOutstanding(inv)) return false;
  if (!inv.due_date) return false;
  return new Date(inv.due_date) < startOfToday();
}

/** Whole days past due. Zero when not overdue. */
export function daysOverdue(inv: InvoiceMoneyFields): number {
  if (!isOverdue(inv)) return 0;
  const due = new Date(inv.due_date);
  due.setHours(0, 0, 0, 0);
  const ms = startOfToday().getTime() - due.getTime();
  return Math.floor(ms / 86_400_000);
}

/** Display status including the derived overdue state. For badges and pills. */
export function displayStatus(inv: InvoiceMoneyFields): string {
  return isOverdue(inv) ? "overdue" : inv.status;
}

/** Totals for KPI tiles. Compute once, pass down — do not filter inline. */
export function summariseInvoices(invoices: InvoiceMoneyFields[]) {
  let outstanding = 0;
  let outstandingCount = 0;
  let overdue = 0;
  let overdueCount = 0;
  let paid = 0;

  for (const inv of invoices) {
    if (inv.status === "paid") {
      paid += amountGross(inv);
      continue;
    }
    if (!isOutstanding(inv)) continue;

    const owed = amountOutstanding(inv);
    outstanding += owed;
    outstandingCount += 1;

    if (isOverdue(inv)) {
      overdue += owed;
      overdueCount += 1;
    }
  }

  return { outstanding, outstandingCount, overdue, overdueCount, paid };
}