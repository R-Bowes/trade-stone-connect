// jobs.status is CHECK-constrained to exactly these five values.
export type JobStatus = "scheduled" | "in_progress" | "snagging" | "complete" | "cancelled";

const STYLE: Record<JobStatus, { bg: string; fg: string; label: string }> = {
  scheduled: { bg: "#eef0f3", fg: "#4b5563", label: "Scheduled" },
  in_progress: { bg: "#fff4eb", fg: "#c2570f", label: "In progress" },
  snagging: { bg: "#fffbeb", fg: "#b45309", label: "Snagging" },
  complete: { bg: "#f0fdf4", fg: "#16a34a", label: "Complete" },
  cancelled: { bg: "#fef2f2", fg: "#dc2626", label: "Cancelled" },
};

export default function FieldStatusPill({ status }: { status: string }) {
  const style = STYLE[status as JobStatus] ?? STYLE.scheduled;
  return (
    <span
      className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wide"
      style={{ backgroundColor: style.bg, color: style.fg }}
    >
      {style.label}
    </span>
  );
}
