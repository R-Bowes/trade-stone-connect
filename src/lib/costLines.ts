import type { Database } from "@/integrations/supabase/types";
import { formatGBP } from "@/lib/formatGBP";

export type WorkOrderCost = Database["public"]["Tables"]["work_order_costs"]["Row"];

export type CostKind = "callout_standard" | "callout_ooh" | "hours" | "materials" | "other";

export const COST_KIND_LABEL: Record<CostKind, string> = {
  callout_standard: "Standard call-out",
  callout_ooh: "Out-of-hours call-out",
  hours: "Labour",
  materials: "Materials",
  other: "Other",
};

export const COST_STATUS_LABEL: Record<string, { label: string; className: string }> = {
  pending: { label: "Awaiting approval", className: "bg-amber-100 text-amber-800" },
  approved: { label: "Approved", className: "bg-green-100 text-green-800" },
  queried: { label: "Queried", className: "bg-orange-100 text-orange-800" },
  rejected: { label: "Rejected", className: "bg-slate-200 text-slate-600" },
};

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Plain-English description of one stored line, e.g. "Labour: 5 hrs × £45.00". */
export function describeCostLine(
  line: Pick<WorkOrderCost, "kind" | "quantity" | "unit_rate" | "markup_pct" | "description">,
): string {
  const base = (() => {
    switch (line.kind) {
      case "callout_standard":
      case "callout_ooh":
        return COST_KIND_LABEL[line.kind];
      case "hours":
        return `Labour: ${Number(line.quantity)} hrs × ${formatGBP(line.unit_rate)}`;
      case "materials": {
        const cost = Number(line.quantity) === 1
          ? formatGBP(line.unit_rate)
          : `${Number(line.quantity)} × ${formatGBP(line.unit_rate)}`;
        return `Materials: ${cost} + ${Number(line.markup_pct ?? 0)}% markup`;
      }
      default:
        return "Other";
    }
  })();
  return line.description ? `${base} — ${line.description}` : base;
}

export interface CostTotals {
  total: number;
  approved: number;
  pending: number;
  queried: number;
}

/** Rejected lines are excluded: they never invoice. */
export function totalCostLines(lines: Pick<WorkOrderCost, "status" | "line_total">[]): CostTotals {
  const t: CostTotals = { total: 0, approved: 0, pending: 0, queried: 0 };
  for (const l of lines) {
    const n = Number(l.line_total);
    if (l.status === "approved") t.approved += n;
    else if (l.status === "pending") t.pending += n;
    else if (l.status === "queried") t.queried += n;
    else continue;
    t.total += n;
  }
  return t;
}
