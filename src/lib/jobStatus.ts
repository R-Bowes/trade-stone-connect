/**
 * Job status chip labels and colours, shared by every job surface.
 * Values follow the live jobs_status_check: scheduled, in_progress,
 * snagging, complete, cancelled.
 */
export const JOB_STATUS_CHIP: Record<string, { label: string; className: string }> = {
  scheduled: { label: "Scheduled", className: "bg-[#1e3a5f] text-white border-[#1e3a5f]" },
  in_progress: { label: "In progress", className: "bg-[#f07820] text-white border-[#f07820]" },
  snagging: { label: "Snagging", className: "bg-amber-500 text-white border-amber-500" },
  complete: { label: "Complete", className: "bg-green-600 text-white border-green-600" },
  cancelled: { label: "Cancelled", className: "bg-red-100 text-red-800 border-red-200" },
};

/** Chip for a status, with a neutral fallback for anything unrecognised. */
export function jobStatusChip(status: string): { label: string; className: string } {
  return JOB_STATUS_CHIP[status] ?? { label: status, className: "bg-slate-100 text-slate-700" };
}
