import { useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp } from "lucide-react";
import { formatGBP } from "@/lib/formatGBP";
import { formatDate } from "@/lib/formatDate";
import {
  COST_STATUS_LABEL,
  describeCostLine,
  totalCostLines,
  type WorkOrderCost,
} from "@/lib/costLines";

interface WorkOrderCostLinesProps {
  lines: WorkOrderCost[];
  /** Per-line actions (amend for a contractor, approve/query/reject for a reviewer). */
  renderLineActions?: (line: WorkOrderCost) => ReactNode;
}

/**
 * The total is shown by default; the breakdown expands on the same card.
 * Rejected lines are listed in the breakdown but excluded from the total —
 * they never invoice.
 */
export function WorkOrderCostLines({ lines, renderLineActions }: WorkOrderCostLinesProps) {
  const [open, setOpen] = useState(false);
  const totals = totalCostLines(lines);

  if (lines.length === 0) {
    return (
      <div className="border-t pt-3 space-y-1">
        <p className="text-sm font-medium">Costs</p>
        <p className="text-sm text-muted-foreground">No costs recorded yet.</p>
      </div>
    );
  }

  return (
    <div className="border-t pt-3 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-medium">Costs</p>
          <p className="text-2xl font-semibold">{formatGBP(totals.total)}</p>
          <p className="text-xs text-muted-foreground">
            {formatGBP(totals.approved)} approved
            {totals.pending > 0 && ` · ${formatGBP(totals.pending)} awaiting approval`}
            {totals.queried > 0 && ` · ${formatGBP(totals.queried)} queried`}
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)}>
          {open ? <ChevronUp className="h-4 w-4 mr-1" /> : <ChevronDown className="h-4 w-4 mr-1" />}
          {open ? "Hide breakdown" : `Show breakdown (${lines.length})`}
        </Button>
      </div>

      {open && (
        <ul className="space-y-2">
          {lines.map((line) => {
            const status = COST_STATUS_LABEL[line.status] ?? { label: line.status, className: "bg-slate-100 text-slate-700" };
            const rejected = line.status === "rejected";
            return (
              <li key={line.id} className="rounded-md border p-3 text-sm space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className={rejected ? "line-through text-muted-foreground" : ""}>{describeCostLine(line)}</p>
                    <p className="text-xs text-muted-foreground">
                      Recorded {formatDate(line.created_at)}
                      {line.status === "approved" && line.approved_at &&
                        ` · ${line.auto_approved ? "Auto-approved" : "Approved"} ${formatDate(line.approved_at)}`}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={rejected ? "line-through text-muted-foreground" : "font-medium"}>{formatGBP(line.line_total)}</p>
                    <Badge className={status.className}>{status.label}</Badge>
                  </div>
                </div>

                {line.status === "queried" && line.queried_reason && (
                  <div className="rounded-md border border-orange-200 bg-orange-50 p-2 text-orange-900">
                    Query: {line.queried_reason}
                  </div>
                )}
                {rejected && line.rejected_reason && (
                  <div className="rounded-md border p-2 text-muted-foreground">Rejected: {line.rejected_reason}</div>
                )}

                {renderLineActions && <div className="flex flex-wrap gap-2">{renderLineActions(line)}</div>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
