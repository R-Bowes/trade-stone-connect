import type { WorkOrderCost } from "@/lib/costLines";
import { round2 } from "@/lib/costLines";
import { formatGBP } from "@/lib/formatGBP";

export interface DefaultValueRates {
  callout_standard: number | string | null;
  callout_ooh: number | string | null;
  hourly_rate: number | string | null;
  minimum_charge: number | string | null;
}

const num = (v: number | string | null | undefined): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Suggested approved value for a new work order: call-out (out-of-hours for
 * an emergency) plus two hours' labour, never below the minimum charge.
 * null when the rates give nothing to go on.
 *
 * Mirrors _work_order_default_value in
 * 20261014140000_work_order_po_and_write_lock.sql, which auto-dispatch uses.
 * Change them together.
 */
export function defaultApprovedValue(rates: DefaultValueRates | null, priority: string): number | null {
  if (!rates) return null;
  const callout = (priority === "emergency" ? num(rates.callout_ooh) : null) ?? num(rates.callout_standard) ?? 0;
  const labour = 2 * (num(rates.hourly_rate) ?? 0);
  const value = round2(Math.max(callout + labour, num(rates.minimum_charge) ?? 0));
  return value > 0 ? value : null;
}

export interface PoSpend {
  approvedValue: number;
  /** Approved lines only. The PO can never be lowered below this. */
  approvedTotal: number;
  /** Every line that isn't rejected: what auto-approval is measured against. */
  runningTotal: number;
  remaining: number;
}

export function poSpend(approvedValue: number, lines: Pick<WorkOrderCost, "status" | "line_total">[]): PoSpend {
  let approvedTotal = 0;
  let runningTotal = 0;
  for (const l of lines) {
    if (l.status === "rejected") continue;
    const n = Number(l.line_total);
    runningTotal += n;
    if (l.status === "approved") approvedTotal += n;
  }
  return {
    approvedValue,
    approvedTotal: round2(approvedTotal),
    runningTotal: round2(runningTotal),
    remaining: round2(approvedValue - approvedTotal),
  };
}

/**
 * A pending line whose approval would take the approved total past the
 * approved value — approving it amends the PO (approve_work_order_cost).
 */
export function isOverApprovedValue(
  line: Pick<WorkOrderCost, "id" | "status" | "line_total">,
  lines: Pick<WorkOrderCost, "status" | "line_total">[],
  approvedValue: number | null,
): boolean {
  if (approvedValue == null || line.status !== "pending") return false;
  const { approvedTotal } = poSpend(approvedValue, lines);
  return round2(approvedTotal + Number(line.line_total)) > approvedValue;
}

/**
 * Cost lines can only be recorded once the work order is accepted and its
 * job is under way. Mirrors _work_order_job_started in
 * 20261017120000_work_order_limits_and_po_requests.sql. A soft gate until
 * the step 5 check-in: jobs.status is still client-writable.
 */
export const JOB_STARTED_STATUSES = ["in_progress", "snagging", "complete"] as const;

export function isJobStarted(jobStatus: string | null | undefined): boolean {
  return !!jobStatus && (JOB_STARTED_STATUSES as readonly string[]).includes(jobStatus);
}

export function canRecordWorkOrderCosts(workOrderStatus: string, jobStatus: string | null | undefined): boolean {
  return workOrderStatus === "accepted" && isJobStarted(jobStatus);
}

/** Why Record costs is unavailable, for the disabled button's explanation. */
export function recordCostsBlockedReason(approvedValue: number | null): string {
  return approvedValue != null
    ? `Start the job before recording costs. If you expect it to cost more than ${formatGBP(approvedValue)}, request a PO increase instead.`
    : "Start the job before recording costs.";
}
