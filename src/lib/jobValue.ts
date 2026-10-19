import { formatGBP } from "@/lib/formatGBP";

export interface JobCostSummary {
  /** Cost lines excluding rejected. */
  total: number;
  approved: number;
  lineCount: number;
}

interface JobValueInput {
  status?: string;
  engagement_id: string | null;
  work_order_id: string | null;
  contract_value: number | null;
}

/**
 * What a job is worth. Quote- and tender-origin jobs carry contract_value.
 * Engagement-origin jobs are always 0 there — they bill through the cost lines
 * recorded on their work order — so contract_value is never used for them.
 */
export function formatJobValue(job: JobValueInput, summary: JobCostSummary | null | undefined, poValue: number | null = null): string {
  if (!job.engagement_id) {
    return job.contract_value != null ? formatGBP(job.contract_value) : "—";
  }
  if (!job.work_order_id) {
    // A cancelled job with no work order will never be billed; the "can't be
    // recorded yet" wording only makes sense for one that is still live.
    if (job.status === "cancelled") return "—";
    return "No work order — costs can't be recorded yet";
  }
  // A work order with an approved amount: that is the job's value until costs
  // come in; then what's been spent against it, and anything still waiting.
  if (!summary) return poValue != null ? `Approved: ${formatGBP(poValue)}` : "—";
  if (summary.lineCount === 0) return poValue != null ? `Approved: ${formatGBP(poValue)}` : "No costs recorded yet";
  if (poValue != null) {
    const waiting = summary.total - summary.approved;
    return [`${formatGBP(summary.approved)} spent of ${formatGBP(poValue)} approved`, waiting > 0 ? `${formatGBP(waiting)} waiting` : null]
      .filter(Boolean)
      .join(" · ");
  }
  return `${formatGBP(summary.total)} — ${formatGBP(summary.approved)} approved`;
}
