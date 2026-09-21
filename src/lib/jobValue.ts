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
export function formatJobValue(job: JobValueInput, summary: JobCostSummary | null | undefined): string {
  if (!job.engagement_id) {
    return job.contract_value != null ? formatGBP(job.contract_value) : "—";
  }
  if (!job.work_order_id) {
    // A cancelled job with no work order will never be billed; the "can't be
    // recorded yet" wording only makes sense for one that is still live.
    if (job.status === "cancelled") return "—";
    return "No work order — costs can't be recorded yet";
  }
  if (!summary) return "—";
  if (summary.lineCount === 0) return "No costs recorded yet";
  return `${formatGBP(summary.total)} — ${formatGBP(summary.approved)} approved`;
}
