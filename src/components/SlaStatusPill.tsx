// jobs.sla_status constraint: 'not_applicable' | 'on_track' | 'at_risk' | 'breached' | 'met'
const SLA_CONFIG: Record<string, { label: string; className: string }> = {
  on_track: { label: "SLA on track", className: "bg-green-100 text-green-800 border-green-200" },
  at_risk: { label: "SLA at risk", className: "bg-amber-100 text-amber-800 border-amber-200" },
  breached: { label: "SLA breached", className: "bg-red-100 text-red-800 border-red-200" },
  met: { label: "SLA met", className: "bg-gray-100 text-gray-600 border-gray-200" },
};

export function formatSlaRemaining(dueIso: string): string {
  const diffMs = new Date(dueIso).getTime() - Date.now();
  if (diffMs <= 0) return "overdue";
  const totalMinutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m remaining`;
  return `${hours}h ${minutes}m remaining`;
}

interface SlaStatusPillProps {
  status: string | null | undefined;
  completionDue?: string | null;
  className?: string;
}

export function SlaStatusPill({ status, completionDue, className }: SlaStatusPillProps) {
  if (!status || status === "not_applicable") return null;
  const config = SLA_CONFIG[status];
  if (!config) return null;

  const showRemaining = (status === "on_track" || status === "at_risk") && completionDue;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${config.className} ${className ?? ""}`}
    >
      {config.label}
      {showRemaining && (
        <span className="font-normal opacity-80">· {formatSlaRemaining(completionDue!)}</span>
      )}
    </span>
  );
}
