import { Fragment, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { RecordCard, type RecordCardField } from "@/components/shared/RecordCard";
import { formatDate } from "@/lib/formatDate";
import { formatJobRef } from "@/lib/documentRefs";
import { formatJobValue, type JobCostSummary } from "@/lib/jobValue";

export interface JobCardJob {
  id: string;
  title: string;
  /** Live jobs_status_check: scheduled, in_progress, snagging, complete, cancelled. */
  status: string;
  job_number: number | null;
  start_date: string | null;
  contract_value: number | null;
  engagement_id: string | null;
  work_order_id: string | null;
  sla_response_due: string | null;
  sla_completion_due: string | null;
  sla_resolution_due: string | null;
}

interface JobCardProps {
  job: JobCardJob;
  viewer: "contractor" | "business";
  /** The client for a contractor viewer, the contractor for a business viewer. */
  counterparty: string | null;
  /** Contractor's TS code — needed for the full-form reference on the business side. */
  contractorCode?: string | null;
  site: { id: string; name: string } | null;
  asset?: { id: string; name: string } | null;
  /** Contractor viewer only. */
  workers?: string[] | null;
  /** Already formatted: a quote reference, or "WO-… · TE-…". */
  origin: string | null;
  /** Engagement-origin jobs only. */
  costSummary?: JobCostSummary | null;
  density?: "full" | "compact";
  actions?: ReactNode;
}

const STATUS: Record<string, { label: string; className: string }> = {
  scheduled: { label: "Scheduled", className: "bg-[#1e3a5f] text-white border-[#1e3a5f]" },
  in_progress: { label: "In progress", className: "bg-[#f07820] text-white border-[#f07820]" },
  snagging: { label: "Snagging", className: "bg-amber-500 text-white border-amber-500" },
  complete: { label: "Complete", className: "bg-green-600 text-white border-green-600" },
  cancelled: { label: "Cancelled", className: "bg-red-100 text-red-800 border-red-200" },
};

/**
 * Two engines write the resolution deadline: the sla-clock edge function writes
 * sla_completion_due, and the live-only trigger_check_sla_breach writes
 * sla_resolution_due on INSERT (see LATER.md). Prefer the first, fall back to
 * the second, until one engine is retired.
 */
export function jobResolutionDue(job: Pick<JobCardJob, "sla_completion_due" | "sla_resolution_due">): string | null {
  return job.sla_completion_due ?? job.sla_resolution_due ?? null;
}

/**
 * Renders "WO-… · TE-…" so each reference stays unbroken and a line break can
 * only fall between them.
 */
export function OriginRefs({ value }: { value: string }) {
  const refs = value.split(" · ");
  return (
    <>
      {refs.map((ref, i) => (
        <Fragment key={`${ref}-${i}`}>
          {i > 0 && " · "}
          <span className="whitespace-nowrap">{ref}</span>
        </Fragment>
      ))}
    </>
  );
}

export function JobCard({
  job,
  viewer,
  counterparty,
  contractorCode,
  site,
  asset,
  workers,
  origin,
  costSummary,
  density = "full",
  actions,
}: JobCardProps) {
  const status = STATUS[job.status] ?? { label: job.status, className: "bg-slate-100 text-slate-700" };
  const resolutionDue = jobResolutionDue(job);
  const live = job.status !== "complete" && job.status !== "cancelled";
  const overdue = live && !!resolutionDue && new Date(resolutionDue).getTime() < Date.now();

  const reference = job.job_number != null
    ? formatJobRef(job.job_number, viewer === "business" && contractorCode ? { contractorCode } : undefined)
    : job.id.slice(0, 8);

  const compact = density === "compact";

  const fields: RecordCardField[] = compact
    ? [
        { label: "Site", value: site?.name ?? "—" },
        { label: "Scheduled", value: job.start_date ? formatDate(job.start_date) : "Not scheduled" },
        { label: "Value", value: formatJobValue(job, costSummary) },
      ]
    : [
        { label: viewer === "contractor" ? "Client" : "Contractor", value: counterparty ?? "—" },
        { label: "Site", value: site?.name ?? "—" },
        ...(asset?.name ? [{ label: "Asset", value: asset.name }] : []),
        { label: "Scheduled", value: job.start_date ? formatDate(job.start_date) : "Not scheduled" },
        ...(viewer === "contractor"
          ? [{ label: "Workers", value: workers && workers.length > 0 ? workers.join(", ") : "None assigned" }]
          : []),
        ...(job.sla_response_due ? [{ label: "SLA response due", value: formatDate(job.sla_response_due) }] : []),
        ...(resolutionDue ? [{ label: "SLA resolution due", value: formatDate(resolutionDue) }] : []),
        { label: "Origin", value: origin ? <OriginRefs value={origin} /> : "—" },
        { label: "Value", value: formatJobValue(job, costSummary) },
      ];

  return (
    <RecordCard
      icon={<i className="ti ti-briefcase" style={{ fontSize: 20 }} />}
      title={job.title}
      reference={reference}
      badges={
        <>
          {overdue && <Badge className="bg-red-100 text-red-800 border-red-200">Overdue</Badge>}
          <Badge className={status.className}>{status.label}</Badge>
        </>
      }
      fields={fields}
      actions={actions}
      density={density}
    />
  );
}
