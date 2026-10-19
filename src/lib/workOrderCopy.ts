import { formatGBP } from "@/lib/formatGBP";
import { formatPoNumber, type WorkOrder } from "@/hooks/useWorkOrders";

/**
 * What work_order_context (20261018120000) returns. Computed server-side:
 * members can't read the roster or the contractor's locked profile columns.
 * Business-only keys are absent for the contractor.
 */
export interface WorkOrderContext {
  viewer: "business" | "contractor";
  company_name: string | null;
  company_code: string | null;
  /** More than one active person, or the company has set its own PO reference. */
  show_po: boolean;
  multi_site: boolean;
  multi_person: boolean;
  contractor_vat_registered: boolean;
  /** The contractor's business name (company_name, else full_name). */
  contractor_name: string | null;
  contractor_ts_code?: string | null;
  raised_by_name: string | null;
  approved_by_name: string | null;
  approved_by_is_viewer: boolean;
  site_name: string | null;
  has_agreed_rates: boolean;
  /** Has an engagement: costs go on the monthly invoice. */
  on_account: boolean;
  job: { id: string; status: string; actual_start: string | null; completed_at: string | null; job_number: number | null } | null;
  sla: {
    rule_name: string | null;
    status: string | null;
    response_due: string | null;
    attendance_due: string | null;
    completion_due: string | null;
    responded_at: string | null;
  } | null;
  asset: {
    id: string; name: string; category: string | null; make: string | null; model: string | null;
    location_note: string | null; next_service_due: string | null; warranty_expiry: string | null;
    certificate: { name: string | null; expiry_date: string } | null;
  } | null;
  invoicing: {
    approved_lines: number;
    invoiced_lines: number;
    invoices: { id: string; status: string; invoice_number: number | null }[];
  } | null;
  /** The raiser: the owner, or a member and their approval limit (null = can't approve). */
  raiser_limit?: { owner: boolean; limit?: number | null } | null;
  can_act?: boolean;
  can_approve_value?: boolean;
}

/** A money figure, ex-VAT, with "+ VAT" when the contractor is VAT-registered. */
export function money(amount: number | string | null | undefined, vat: boolean): string {
  if (amount == null || amount === "") return "—";
  return `${formatGBP(amount)}${vat ? " + VAT" : ""}`;
}

/**
 * Plain words unless the business uses PO numbers (show_po). "Approve" is the
 * one word for approving, everywhere.
 */
export function workOrderWords(showPo: boolean) {
  return {
    askMore: showPo ? "Request PO increase" : "Ask to spend more",
    wantsMore: (amount: string) => (showPo ? `PO increase requested: +${amount}` : `Wants to spend ${amount} more`),
    newTotal: showPo ? "New PO total" : "New approved total",
    approveMore: (poRef: string | null) => (showPo && poRef ? `Approve and amend ${poRef}` : "Approve"),
  };
}

export function poReference(wo: Pick<WorkOrder, "wo_number" | "po_issued_at">, companyCode: string | null): string | null {
  return wo.po_issued_at ? formatPoNumber(companyCode, wo.wo_number) : null;
}

export type StageState = "done" | "current" | "part" | "todo";
export interface Stage { key: string; label: string; state: StageState; at?: string | null }

/**
 * Raised/Asked → Approved → Sent → On site → Done → Invoiced → Paid.
 * Invoiced and Paid appear only on account (an engagement; period invoices),
 * "Part-invoiced"/"Part-paid" when the work order's approved lines span more
 * than one invoice or aren't all invoiced yet. Without an engagement they are
 * left out until step 2b defines how those work orders are paid.
 */
export function workOrderStages(wo: WorkOrder, ctx: WorkOrderContext): Stage[] {
  const reached: Stage[] = [
    { key: "raised", label: wo.service_request_id ? "Asked" : "Raised", state: "done", at: wo.created_at },
    { key: "approved", label: "Approved", state: wo.po_issued_at ? "done" : "todo", at: wo.po_issued_at },
    { key: "sent", label: "Sent", state: wo.dispatched_at ? "done" : "todo", at: wo.dispatched_at },
    {
      key: "on_site",
      label: "On site",
      state: ctx.job?.actual_start || ["in_progress", "snagging", "complete"].includes(ctx.job?.status ?? "") ? "done" : "todo",
      at: ctx.job?.actual_start,
    },
    {
      key: "done",
      label: "Done",
      state: ctx.job?.completed_at || ctx.job?.status === "complete" ? "done" : "todo",
      at: ctx.job?.completed_at,
    },
  ];

  if (ctx.on_account && ctx.invoicing) {
    const { approved_lines, invoiced_lines, invoices } = ctx.invoicing;
    const invoicedState: StageState =
      invoiced_lines === 0 ? "todo" : invoiced_lines < approved_lines ? "part" : "done";
    const paidCount = invoices.filter((i) => i.status === "paid").length;
    const paidState: StageState =
      invoicedState === "todo" || paidCount === 0 ? "todo" : paidCount < invoices.length || invoicedState === "part" ? "part" : "done";
    reached.push(
      { key: "invoiced", label: invoicedState === "part" ? "Part-invoiced" : "Invoiced", state: invoicedState },
      { key: "paid", label: paidState === "part" ? "Part-paid" : "Paid", state: paidState },
    );
  }

  if (wo.status === "cancelled") return reached;
  // The current stage is the furthest one reached; everything after it is
  // still to come. A part-reached stage (part-invoiced / part-paid) keeps its
  // own state.
  let furthest = -1;
  reached.forEach((s, i) => { if (s.state !== "todo") furthest = i; });
  if (furthest >= 0 && reached[furthest].state === "done") reached[furthest] = { ...reached[furthest], state: "current" };
  return reached;
}
