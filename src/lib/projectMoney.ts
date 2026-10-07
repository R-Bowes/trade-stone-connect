/**
 * Project money, built on the invoice rules in invoiceMoney.ts. Pure
 * functions only — no queries. The customer's view: what has been paid on a
 * job and what is still to pay.
 *
 * Rules (CLAUDE.md invoice invariants):
 *  - invoices.total is always gross; a deposit is a payment against it.
 *  - Void invoices never count. Drafts are not visible to the customer.
 *  - A paid invoice counts in full; an open one counts only its paid deposit.
 */
import { amountGross, depositSettled, type InvoiceMoneyFields } from "@/lib/invoiceMoney";

/** The invoice fields project money needs (the customer can read these). */
export interface ProjectInvoice extends InvoiceMoneyFields {
  job_id: string | null;
  quote_id: string | null;
}

/** The job fields project money needs. */
export interface ProjectJobMoneyFields {
  id: string;
  issued_quote_id: string | null;
  contract_value: number | string | null;
}

/**
 * The customer's non-void invoices for a job: those with its job_id, or,
 * for older invoices raised before job_id was recorded, those whose job_id
 * is empty and whose quote_id is the job's issued_quote_id.
 */
export function invoicesForJob(job: ProjectJobMoneyFields, invoices: ProjectInvoice[]): ProjectInvoice[] {
  return invoices.filter((inv) => {
    if (inv.status === "void") return false;
    if (inv.job_id) return inv.job_id === job.id;
    return !!job.issued_quote_id && inv.quote_id === job.issued_quote_id;
  });
}

/** Paid so far: a paid invoice in full, an open one by its paid deposit. */
export function paidSoFar(jobInvoices: ProjectInvoice[]): number {
  return jobInvoices.reduce(
    (sum, inv) => sum + (inv.status === "paid" ? amountGross(inv) : depositSettled(inv)),
    0,
  );
}

/**
 * Agreed value: jobs.contract_value (kept up to date by approved
 * variations), or, when that is not set, the largest invoice gross.
 * Null when there is neither.
 */
export function agreedAmount(job: ProjectJobMoneyFields, jobInvoices: ProjectInvoice[]): number | null {
  if (job.contract_value != null && job.contract_value !== "") {
    const value = Number(job.contract_value);
    if (Number.isFinite(value)) return value;
  }
  if (jobInvoices.length === 0) return null;
  return Math.max(...jobInvoices.map((inv) => amountGross(inv)));
}

export interface JobMoney {
  agreed: number | null;
  paid: number;
  stillToPay: number;
}

/** Agreed, paid so far and still to pay (never negative) for one job. */
export function jobMoney(job: ProjectJobMoneyFields, invoices: ProjectInvoice[]): JobMoney {
  const mine = invoicesForJob(job, invoices);
  const paid = paidSoFar(mine);
  const agreed = agreedAmount(job, mine);
  return { agreed, paid, stillToPay: Math.max(0, (agreed ?? 0) - paid) };
}
