import { useMemo, type ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ClipboardList, MapPin, Wrench } from "lucide-react";
import { formatDateTime } from "@/lib/formatDate";
import { formatGBP } from "@/lib/formatGBP";
import { useSignedPhotoUrls } from "@/hooks/useSignedPhotoUrls";
import { formatWoNumber, type WorkOrder, type WorkOrderPriority } from "@/hooks/useWorkOrders";

export const WORK_ORDER_PHOTO_BUCKET = "work-order-photos";

export const PRIORITY_LABEL: Record<WorkOrderPriority, string> = {
  emergency: "Emergency", urgent: "Urgent", routine: "Routine", planned: "Planned",
};
export const PRIORITY_COLOR: Record<WorkOrderPriority, string> = {
  emergency: "bg-red-100 text-red-800 border-red-300",
  urgent: "bg-amber-100 text-amber-800 border-amber-300",
  routine: "bg-blue-100 text-blue-800 border-blue-300",
  planned: "bg-slate-100 text-slate-700 border-slate-300",
};

/**
 * The badge label is derived from status + response + job_id, exactly as
 * WorkOrderDashboard's summary tiles derive "awaiting response" and "in
 * progress" — no status values beyond the live CHECK set are invented.
 */
export function deriveWorkOrderStatus(wo: Pick<WorkOrder, "status" | "response" | "job_id">): { label: string; className: string } {
  switch (wo.status) {
    case "draft":
      return { label: "Draft", className: "bg-slate-100 text-slate-700" };
    case "dispatched":
      return wo.response === "pending"
        ? { label: "Awaiting response", className: "bg-amber-100 text-amber-800" }
        : { label: "Dispatched", className: "bg-blue-100 text-blue-800" };
    case "accepted":
      return wo.job_id
        ? { label: "In progress", className: "bg-green-100 text-green-800" }
        : { label: "Accepted", className: "bg-green-100 text-green-800" };
    case "declined":
      return { label: "Declined", className: "bg-red-100 text-red-800" };
    case "reassigned":
      return { label: "Reassigned", className: "bg-amber-100 text-amber-800" };
    case "cancelled":
      return { label: "Cancelled", className: "bg-slate-200 text-slate-500" };
    case "completed":
      return { label: "Completed", className: "bg-green-100 text-green-800" };
    default:
      return { label: wo.status, className: "bg-slate-100 text-slate-700" };
  }
}

interface RateSnapshotValues {
  calloutStandard: number | null;
  calloutOoh: number | null;
  hourlyRate: number | null;
  materialsMarkupPct: number | null;
  minimumCharge: number | null;
}

// rate_snapshot is the effective_engagement_rates row captured at dispatch —
// what the work will be billed against — not a live rate lookup.
function readRateSnapshot(snapshot: Record<string, unknown> | null): RateSnapshotValues | null {
  if (!snapshot) return null;
  const num = (key: string): number | null => {
    const value = snapshot[key];
    if (value == null || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };
  return {
    calloutStandard: num("callout_standard"),
    calloutOoh: num("callout_ooh"),
    hourlyRate: num("hourly_rate"),
    materialsMarkupPct: num("materials_markup_pct"),
    minimumCharge: num("minimum_charge"),
  };
}

interface WorkOrderCardProps {
  workOrder: WorkOrder;
  site: { id: string; name: string } | null;
  /** Contractor name for a business viewer, company name for a contractor viewer. */
  counterparty: string | null;
  /** Company code used to compose the WO-{code}-{number} reference. */
  companyCode: string | null;
  viewer: "business" | "contractor";
  density?: "full" | "compact";
  actions?: ReactNode;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p>{children}</p>
    </div>
  );
}

export function WorkOrderCard({
  workOrder,
  site,
  counterparty,
  companyCode,
  viewer,
  density = "full",
  actions,
}: WorkOrderCardProps) {
  const compact = density === "compact";
  const status = deriveWorkOrderStatus(workOrder);
  const rate = readRateSnapshot(workOrder.rate_snapshot);
  const counterpartyLabel = viewer === "business" ? "Dispatched to" : "Raised by";

  const photoPaths = useMemo(
    () => (Array.isArray(workOrder.photos) ? workOrder.photos.filter((p): p is string => typeof p === "string") : []),
    [workOrder.photos],
  );
  const { urls: signedUrls } = useSignedPhotoUrls(WORK_ORDER_PHOTO_BUCKET, compact ? [] : photoPaths);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <ClipboardList className="h-5 w-5 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <CardTitle className="text-base">{workOrder.title}</CardTitle>
              <p className="text-xs text-muted-foreground font-mono">{formatWoNumber(companyCode, workOrder.wo_number)}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Badge variant="outline" className={PRIORITY_COLOR[workOrder.priority]}>{PRIORITY_LABEL[workOrder.priority]}</Badge>
            <Badge className={status.className}>{status.label}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!compact && workOrder.description && <p className="text-sm">{workOrder.description}</p>}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <Field label="Site">
            {site?.name ? (
              <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{site.name}</span>
            ) : "—"}
          </Field>
          {!compact && workOrder.asset?.name && (
            <Field label="Asset">
              <span className="inline-flex items-center gap-1"><Wrench className="h-3 w-3" />{workOrder.asset.name}</span>
            </Field>
          )}
          <Field label={counterpartyLabel}>{counterparty ?? (viewer === "business" ? "Not yet dispatched" : "—")}</Field>
          <Field label="Created">{formatDateTime(workOrder.created_at)}</Field>
          {workOrder.dispatched_at && <Field label="Dispatched">{formatDateTime(workOrder.dispatched_at)}</Field>}
        </div>

        {!compact && (
          <div className="border-t pt-3 space-y-3">
            <p className="text-sm font-medium">Agreed rates</p>
            {rate ? (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                  <Field label="Standard call-out fee">{rate.calloutStandard != null ? formatGBP(rate.calloutStandard) : "—"}</Field>
                  <Field label="Out-of-hours call-out fee">{rate.calloutOoh != null ? formatGBP(rate.calloutOoh) : "—"}</Field>
                  <Field label="Hourly rate">{rate.hourlyRate != null ? formatGBP(rate.hourlyRate) : "—"}</Field>
                  <Field label="Materials markup">{rate.materialsMarkupPct != null ? `${rate.materialsMarkupPct}%` : "—"}</Field>
                  <Field label="Minimum charge">{rate.minimumCharge != null ? formatGBP(rate.minimumCharge) : "None"}</Field>
                </div>
                <p className="text-xs text-muted-foreground">
                  Captured when this work order was dispatched — this is what the work is billed against.
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Rates are recorded when the work order is dispatched.
              </p>
            )}
          </div>
        )}

        {!compact && photoPaths.length > 0 && (
          <div className="border-t pt-3 space-y-2">
            <p className="text-sm font-medium">Photos</p>
            <div className="flex gap-3 overflow-x-auto pb-1">
              {photoPaths.map((path) => (
                <a
                  key={path}
                  href={signedUrls[path]}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 rounded-lg overflow-hidden bg-muted border"
                  style={{ height: 84, width: 84 }}
                >
                  {signedUrls[path] ? <img src={signedUrls[path]} alt="" className="h-full w-full object-cover" /> : null}
                </a>
              ))}
            </div>
          </div>
        )}

        {!compact && workOrder.status === "declined" && workOrder.decline_reason && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            Declined: {workOrder.decline_reason}
          </div>
        )}

        {!compact && actions && <div className="flex flex-wrap gap-2 pt-1">{actions}</div>}
      </CardContent>
    </Card>
  );
}
