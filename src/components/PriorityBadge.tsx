// jobs.priority / sla_rules.priority / enquiries.priority values: 'p1' | 'p2' | 'p3' | 'p4'
export const PRIORITY_CONFIG: Record<string, { label: string; shortLabel: string; className: string }> = {
  p1: { label: "P1 Emergency", shortLabel: "P1", className: "bg-red-100 text-red-800 border-red-200" },
  p2: { label: "P2 Urgent", shortLabel: "P2", className: "bg-amber-100 text-amber-800 border-amber-200" },
  p3: { label: "P3 Routine", shortLabel: "P3", className: "bg-blue-100 text-blue-800 border-blue-200" },
  p4: { label: "P4 Planned", shortLabel: "P4", className: "bg-gray-100 text-gray-700 border-gray-200" },
};

interface PriorityBadgeProps {
  priority: string | null | undefined;
  full?: boolean;
  className?: string;
}

export function PriorityBadge({ priority, full, className }: PriorityBadgeProps) {
  if (!priority) return null;
  const config = PRIORITY_CONFIG[priority.toLowerCase()];
  if (!config) return null;

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${config.className} ${className ?? ""}`}
    >
      {full ? config.label : config.shortLabel}
    </span>
  );
}
