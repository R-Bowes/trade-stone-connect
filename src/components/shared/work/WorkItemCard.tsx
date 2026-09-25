import type { CSSProperties } from "react";
import { RecordCard, type RecordCardField } from "@/components/shared/RecordCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/formatDate";
import { formatGBP } from "@/lib/formatGBP";
import { STAGE_LABEL, type WorkItem } from "@/lib/workItems";

const KIND_ICON: Record<WorkItem["kind"], string> = {
  enquiry: "ti-message-circle",
  quote: "ti-file-text",
  work_order: "ti-clipboard-list",
  job: "ti-briefcase",
  invoice: "ti-file-invoice",
  cost_line: "ti-receipt",
  engagement_rate: "ti-building",
  service_request: "ti-tool",
};

const BAND_BADGE: Record<WorkItem["band"], { label: string; className: string }> = {
  needs_you: { label: "Needs you", className: "bg-amber-100 text-amber-800" },
  waiting: { label: "Waiting", className: "bg-blue-100 text-blue-800" },
};

// Needs-you, not-overdue — the app's existing "this needs you" orange
// (PipelineCard's PRIMARY_STYLE), reused here so the same signal reads the
// same colour everywhere, not just in the unified list.
const NEEDS_YOU_STYLE = { backgroundColor: "#f07820", color: "#fff", borderColor: "#f07820" };

/**
 * Urgency, not stage — a job "In progress" and an invoice "Overdue" are both
 * needs_you, but they are not equally urgent. Three levels, from fields the
 * item already carries: overdue (red, filled) > needs_you (orange, filled)
 * > waiting (outline — there's nothing to do).
 */
function actionButtonProps(item: WorkItem): { variant?: "destructive" | "outline"; style?: CSSProperties } {
  if (item.overdue) return { variant: "destructive" };
  if (item.band === "waiting") return { variant: "outline" };
  return { style: NEEDS_YOU_STYLE };
}

interface WorkItemCardProps {
  item: WorkItem;
  /** Whether to show the stage badge — omit when the list is already scoped to one stage. */
  showStage?: boolean;
  onAction: (item: WorkItem) => void;
}

/**
 * The unified list's card — shared by both the contractor and business
 * dashboards. One generic compact RecordCard across every item kind, not a
 * reuse of EngagementCard/WorkOrderCard/JobCard/InvoiceCard (each of those
 * is tied to its own table's row shape; WorkItem is the deliberately
 * flattened shape unification exists to produce).
 */
export function WorkItemCard({ item, showStage = true, onAction }: WorkItemCardProps) {
  const fields: RecordCardField[] = [
    ...(item.counterparty ? [{ label: "With", value: item.counterparty.name }] : []),
    item.dueIso
      ? { label: "Due", value: `${formatDate(item.dueIso)}${item.overdue ? " — overdue" : ""}` }
      : { label: "Since", value: formatDate(item.sinceIso) },
    ...(item.amount != null ? [{ label: "Value", value: formatGBP(item.amount) }] : item.site ? [{ label: "Site", value: item.site }] : []),
  ];

  return (
    <RecordCard
      icon={<i className={`ti ${KIND_ICON[item.kind]}`} style={{ fontSize: 18 }} />}
      title={item.title}
      reference={item.reference}
      badges={
        <>
          {showStage && item.stage && <Badge variant="outline" className="text-xs">{STAGE_LABEL[item.stage]}</Badge>}
          <Badge className={`text-xs ${BAND_BADGE[item.band].className}`}>{BAND_BADGE[item.band].label}</Badge>
        </>
      }
      fields={fields}
      density="compact"
      actions={
        <Button size="sm" onClick={() => onAction(item)} {...actionButtonProps(item)}>
          {item.actionLabel}
        </Button>
      }
    />
  );
}
