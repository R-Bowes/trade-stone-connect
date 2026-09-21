import type { ReactNode } from "react";
import { RecordCard, RecordSection, type RecordCardField } from "@/components/shared/RecordCard";
import { Badge } from "@/components/ui/badge";
import { Building2, CheckCircle2, Clock, AlertTriangle, MapPin } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";
import { formatDate } from "@/lib/formatDate";
import { formatGBP } from "@/lib/formatGBP";

export type EngagementCardEngagement = Pick<
  Database["public"]["Tables"]["term_engagements"]["Row"],
  "id" | "engagement_number" | "start_date" | "expiry_date" | "status" | "billing_period" | "billing_anchor_day"
>;

export type EngagementCardRate = Pick<
  Database["public"]["Tables"]["engagement_rates"]["Row"],
  | "id"
  | "version"
  | "callout_standard"
  | "callout_ooh"
  | "hourly_rate"
  | "materials_markup_pct"
  | "minimum_charge"
  | "effective_from"
  | "agreed_by_business_at"
  | "agreed_by_contractor_at"
>;

export interface EngagementCardSite {
  id: string;
  name: string;
}

interface EngagementCardProps {
  engagement: EngagementCardEngagement;
  rate: EngagementCardRate | null;
  /** The business for a contractor viewer, the contractor for a business viewer. */
  counterparty: { name: string; logoUrl: string | null };
  sites: EngagementCardSite[];
  density?: "full" | "compact";
  actions?: ReactNode;
  /** Whose perspective the status wording is written from. */
  viewer?: "contractor" | "business";
}

const BILLING_PERIOD_LABELS: Record<string, string> = {
  calendar_month: "Calendar month",
  custom: "Custom",
};

// Lifecycle statuses on which the engagement can still be dispatched under, so
// rate state and site coverage are meaningful. ended/expired are terminal.
const LIVE_STATUSES = ["active", "suspended", "notice_given"];

const LIFECYCLE_BADGE: Record<string, { label: string; className: string }> = {
  suspended: { label: "Suspended", className: "bg-red-100 text-red-800 border-red-200" },
  notice_given: { label: "Notice given", className: "bg-orange-100 text-orange-800 border-orange-200" },
  ended: { label: "Ended", className: "bg-slate-200 text-slate-600 border-slate-300" },
  expired: { label: "Expired", className: "bg-slate-200 text-slate-600 border-slate-300" },
};

function RateBadge({ rate, viewer }: { rate: EngagementCardRate | null; viewer: "contractor" | "business" }) {
  if (!rate) {
    return <Badge className="bg-gray-100 text-gray-700 border-gray-200">No rates proposed</Badge>;
  }

  const businessAgreed = !!rate.agreed_by_business_at;
  const contractorAgreed = !!rate.agreed_by_contractor_at;

  if (businessAgreed && contractorAgreed) {
    return (
      <Badge className="bg-green-100 text-green-800 border-green-200">
        <CheckCircle2 className="h-3 w-3 mr-1" /> Rates agreed
      </Badge>
    );
  }

  const awaiting: "contractor" | "business" = businessAgreed ? "contractor" : "business";
  if (awaiting === viewer) {
    return (
      <Badge className="bg-amber-100 text-amber-800 border-amber-200">
        <Clock className="h-3 w-3 mr-1" /> Awaiting your acceptance
      </Badge>
    );
  }
  return (
    <Badge className="bg-blue-100 text-blue-800 border-blue-200">
      <Clock className="h-3 w-3 mr-1" /> Awaiting {awaiting} acceptance
    </Badge>
  );
}

/**
 * Lifecycle beats rate state. An ended or expired engagement shows only that;
 * a suspended or notice_given one shows its lifecycle badge alongside the rate
 * badge; an active one shows the rate badge alone.
 */
function StatusBadge({
  status,
  rate,
  viewer,
}: {
  status: string;
  rate: EngagementCardRate | null;
  viewer: "contractor" | "business";
}) {
  const lifecycle = LIFECYCLE_BADGE[status];
  const live = LIVE_STATUSES.includes(status);
  return (
    <>
      {lifecycle && <Badge className={lifecycle.className}>{lifecycle.label}</Badge>}
      {live && <RateBadge rate={rate} viewer={viewer} />}
    </>
  );
}

function billingLabel(engagement: EngagementCardEngagement) {
  const base = BILLING_PERIOD_LABELS[engagement.billing_period] ?? engagement.billing_period;
  return engagement.billing_period === "custom" && engagement.billing_anchor_day
    ? `${base} (day ${engagement.billing_anchor_day})`
    : base;
}

export function EngagementCard({
  engagement,
  rate,
  counterparty,
  sites,
  density = "full",
  actions,
  viewer = "contractor",
}: EngagementCardProps) {
  const compact = density === "compact";
  const live = LIVE_STATUSES.includes(engagement.status);

  const fields: RecordCardField[] = [
    { label: "Start date", value: formatDate(engagement.start_date) },
    { label: "Expiry date", value: formatDate(engagement.expiry_date) },
    ...(compact
      ? [{
          label: "Sites covered",
          value: sites.length === 0 ? (
            live ? (
              <span className="text-amber-700 inline-flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> None
              </span>
            ) : (
              "—"
            )
          ) : (
            sites.length
          ),
        }]
      : [
          { label: "Billing period", value: billingLabel(engagement) },
          { label: "Status", value: <span className="capitalize">{engagement.status.replace(/_/g, " ")}</span> },
        ]),
  ];

  return (
    <RecordCard
      icon={<Building2 className="h-5 w-5" />}
      title={counterparty.name}
      reference={engagement.engagement_number}
      badges={<StatusBadge status={engagement.status} rate={rate} viewer={viewer} />}
      fields={fields}
      actions={actions}
      density={density}
    >
      {(sites.length > 0 || live) && (
        <RecordSection className="space-y-2">
          <p className="text-sm font-medium">Sites covered</p>
          {sites.length === 0 ? (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>No sites covered — nothing can be dispatched under this engagement.</span>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {sites.map((site) => (
                <Badge key={site.id} variant="outline" className="font-normal">
                  <MapPin className="h-3 w-3 mr-1" /> {site.name}
                </Badge>
              ))}
            </div>
          )}
        </RecordSection>
      )}

      {!rate && live && (
        <RecordSection className="">
          <p className="text-sm text-muted-foreground">
            This engagement is not usable yet — no rates have been proposed. Nothing can be dispatched to you
            under it until the business proposes rates and you accept them.
          </p>
        </RecordSection>
      )}

      {rate && (
        <RecordSection>
          <p className="text-sm font-medium">Proposed rates (version {rate.version})</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Standard call-out fee</p>
              <p>{formatGBP(rate.callout_standard)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Out-of-hours call-out fee</p>
              <p>{formatGBP(rate.callout_ooh)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Hourly rate</p>
              <p>{formatGBP(rate.hourly_rate)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Materials markup</p>
              <p>{rate.materials_markup_pct}%</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Minimum charge</p>
              <p>{rate.minimum_charge != null ? formatGBP(rate.minimum_charge) : "None"}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Effective from</p>
              <p>{formatDate(rate.effective_from)}</p>
            </div>
          </div>
        </RecordSection>
      )}
    </RecordCard>
  );
}
