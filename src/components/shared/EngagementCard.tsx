import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

function StatusBadge({ rate, viewer }: { rate: EngagementCardRate | null; viewer: "contractor" | "business" }) {
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

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-muted-foreground" />
            <div>
              <CardTitle className="text-base">{counterparty.name}</CardTitle>
              <p className="text-xs text-muted-foreground font-mono">{engagement.engagement_number}</p>
            </div>
          </div>
          <StatusBadge rate={rate} viewer={viewer} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div>
            <p className="text-muted-foreground text-xs">Start date</p>
            <p>{formatDate(engagement.start_date)}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Expiry date</p>
            <p>{formatDate(engagement.expiry_date)}</p>
          </div>
          {compact ? (
            <div>
              <p className="text-muted-foreground text-xs">Sites covered</p>
              {sites.length === 0 ? (
                <p className="text-amber-700 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> None
                </p>
              ) : (
                <p>{sites.length}</p>
              )}
            </div>
          ) : (
            <>
              <div>
                <p className="text-muted-foreground text-xs">Billing period</p>
                <p>{billingLabel(engagement)}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Status</p>
                <p className="capitalize">{engagement.status.replace(/_/g, " ")}</p>
              </div>
            </>
          )}
        </div>

        {!compact && (
          <div className="border-t pt-3 space-y-2">
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
          </div>
        )}

        {!compact && !rate && (
          <p className="text-sm text-muted-foreground border-t pt-3">
            This engagement is not usable yet — no rates have been proposed. Nothing can be dispatched to you
            under it until the business proposes rates and you accept them.
          </p>
        )}

        {!compact && rate && (
          <div className="border-t pt-3 space-y-3">
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
          </div>
        )}

        {!compact && actions && <div className="flex gap-2 pt-1">{actions}</div>}
      </CardContent>
    </Card>
  );
}
