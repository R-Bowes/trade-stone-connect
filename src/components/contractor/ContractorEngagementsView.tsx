import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, Building2, CalendarClock, CheckCircle2, Clock } from "lucide-react";

interface EngagementRow {
  id: string;
  engagement_number: string;
  company_id: string;
  start_date: string;
  expiry_date: string;
  status: string;
  billing_period: string;
  billing_anchor_day: number | null;
}

interface RateRow {
  id: string;
  engagement_id: string;
  version: number;
  callout_standard: number;
  callout_ooh: number;
  hourly_rate: number;
  materials_markup_pct: number;
  minimum_charge: number | null;
  effective_from: string;
  agreed_by_business_at: string | null;
  agreed_by_contractor_at: string | null;
}

interface CompanyInfo {
  id: string;
  name: string;
  logo_url: string | null;
  owner_id: string;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function fmtGBP(n: number) {
  return n.toLocaleString("en-GB", { style: "currency", currency: "GBP" });
}

const BILLING_PERIOD_LABELS: Record<string, string> = {
  calendar_month: "Calendar month",
  custom: "Custom",
};

export function ContractorEngagementsView() {
  const [loading, setLoading] = useState(true);
  const [engagements, setEngagements] = useState<EngagementRow[]>([]);
  const [companyMap, setCompanyMap] = useState<Record<string, CompanyInfo>>({});
  // Only the current-highest-version rate row per engagement is fetched —
  // effective_engagement_rates already excludes anything not fully agreed,
  // so a plain "latest version" read (below) is what's needed to show a
  // pending proposal, which effective_engagement_rates would hide entirely.
  const [latestRateMap, setLatestRateMap] = useState<Record<string, RateRow>>({});
  const [actioningRateId, setActioningRateId] = useState<string | null>(null);
  const [confirmAcceptRate, setConfirmAcceptRate] = useState<RateRow | null>(null);
  const [declineTarget, setDeclineTarget] = useState<RateRow | null>(null);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    const { data: profileRow } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!profileRow) {
      setLoading(false);
      return;
    }

    const { data: engagementRows, error } = await supabase
      .from("term_engagements")
      .select("id, engagement_number, company_id, start_date, expiry_date, status, billing_period, billing_anchor_day")
      .eq("contractor_id", profileRow.id)
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: "Error", description: "Failed to load engagements", variant: "destructive" });
      setLoading(false);
      return;
    }

    const rows = (engagementRows ?? []) as EngagementRow[];
    setEngagements(rows);

    if (rows.length === 0) {
      setCompanyMap({});
      setLatestRateMap({});
      setLoading(false);
      return;
    }

    const companyIds = [...new Set(rows.map((r) => r.company_id))];
    const engagementIds = rows.map((r) => r.id);

    const [companiesRes, ratesRes] = await Promise.all([
      supabase.from("companies").select("id, name, logo_url, owner_id").in("id", companyIds),
      supabase
        .from("engagement_rates")
        .select("id, engagement_id, version, callout_standard, callout_ooh, hourly_rate, materials_markup_pct, minimum_charge, effective_from, agreed_by_business_at, agreed_by_contractor_at")
        .in("engagement_id", engagementIds)
        .order("version", { ascending: false }),
    ]);

    const cMap: Record<string, CompanyInfo> = {};
    for (const c of companiesRes.data ?? []) cMap[c.id] = c as CompanyInfo;
    setCompanyMap(cMap);

    // Highest version per engagement — rows arrived version DESC, so the
    // first one seen per engagement_id is the latest.
    const rMap: Record<string, RateRow> = {};
    for (const r of (ratesRes.data ?? []) as RateRow[]) {
      if (!rMap[r.engagement_id]) rMap[r.engagement_id] = r;
    }
    setLatestRateMap(rMap);

    setLoading(false);
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  // Best-effort notification to the business side of a rate decision. The
  // business's identity isn't in engagement_rates or term_engagements — it's
  // resolved via companies.owner_id for the engagement's company_id, using
  // the engagement/company rows already loaded by `load()`. A non-owner
  // business member who originally proposed the rates won't be told the
  // outcome this way; the owner is the only stable, always-present target
  // until named approvers exist, so that gap is accepted as-is, not
  // engineered around.
  const notifyBusiness = async (rate: RateRow, type: string, title: string, message: string) => {
    const engagement = engagements.find((e) => e.id === rate.engagement_id);
    const ownerId = engagement ? companyMap[engagement.company_id]?.owner_id : undefined;
    if (!ownerId) {
      console.error(
        `Could not resolve a business owner to notify for rate version ${rate.id} on engagement ${rate.engagement_id} — no engagement/company/owner_id found in loaded state.`,
      );
      return;
    }
    try {
      const { error: notifyError } = await supabase.from("notifications").insert({
        user_id: ownerId,
        title,
        message,
        type,
        reference_type: "engagement_rates",
        reference_id: rate.id,
      });
      if (notifyError) {
        console.error(
          `Failed to notify business owner ${ownerId} of ${type} for rate version ${rate.id} on engagement ${rate.engagement_id}:`,
          notifyError,
        );
      }
    } catch (notifyException) {
      console.error(
        `Notification insert threw while notifying business owner ${ownerId} of ${type} for rate version ${rate.id} on engagement ${rate.engagement_id}:`,
        notifyException,
      );
    }
  };

  const handleAccept = async (rate: RateRow) => {
    setActioningRateId(rate.id);
    try {
      const { error } = await supabase.rpc("accept_engagement_rate_version", { p_rate_id: rate.id });
      if (error) {
        toast({ title: "Could not accept rates", description: error.message, variant: "destructive" });
        return;
      }
      await notifyBusiness(
        rate,
        "engagement_rate_accepted",
        "Rates accepted",
        "The contractor has accepted the proposed rates. This engagement is now active with the agreed rates.",
      );
      toast({ title: "Rates accepted", description: "This engagement is now active with the agreed rates." });
      setConfirmAcceptRate(null);
      load();
    } finally {
      setActioningRateId(null);
    }
  };

  const handleDecline = async (rate: RateRow) => {
    setActioningRateId(rate.id);
    try {
      const { error } = await supabase.rpc("withdraw_or_decline_engagement_rate_version", { p_rate_id: rate.id });
      if (error) {
        toast({ title: "Could not decline rates", description: error.message, variant: "destructive" });
        return;
      }
      await notifyBusiness(
        rate,
        "engagement_rate_declined",
        "Rates declined",
        "The contractor has declined the proposed rates. Propose a new rate version for this engagement to become usable.",
      );
      toast({ title: "Rates declined", description: "The business has been left without an agreed rate on this engagement." });
      setDeclineTarget(null);
      load();
    } finally {
      setActioningRateId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (engagements.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          <CalendarClock className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No term engagements yet.</p>
          <p className="text-sm mt-1">
            A term engagement appears here once a business sets one up with you from their panel.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-heading text-2xl font-bold">Engagements</h2>
        <p className="text-muted-foreground">Standing term engagements with your business clients, and rates awaiting your acceptance</p>
      </div>

      {engagements.map((eng) => {
        const company = companyMap[eng.company_id];
        const rate = latestRateMap[eng.id];
        // Pending on the contractor's side: a rate exists, the business has
        // agreed it, and the contractor has not — the exact case
        // accept_engagement_rate_version's own authorisation branch covers.
        const pendingForContractor = !!rate && !!rate.agreed_by_business_at && !rate.agreed_by_contractor_at;
        const fullyAgreed = !!rate && !!rate.agreed_by_business_at && !!rate.agreed_by_contractor_at;

        return (
          <Card key={eng.id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <CardTitle className="text-base">{company?.name ?? "Business"}</CardTitle>
                    <p className="text-xs text-muted-foreground font-mono">{eng.engagement_number}</p>
                  </div>
                </div>
                {fullyAgreed ? (
                  <Badge className="bg-green-100 text-green-800 border-green-200">
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Rates agreed
                  </Badge>
                ) : pendingForContractor ? (
                  <Badge className="bg-amber-100 text-amber-800 border-amber-200">
                    <Clock className="h-3 w-3 mr-1" /> Awaiting your acceptance
                  </Badge>
                ) : rate ? (
                  <Badge className="bg-blue-100 text-blue-800 border-blue-200">
                    <Clock className="h-3 w-3 mr-1" /> Awaiting business acceptance
                  </Badge>
                ) : (
                  <Badge className="bg-gray-100 text-gray-700 border-gray-200">No rates proposed</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Start date</p>
                  <p>{fmtDate(eng.start_date)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Expiry date</p>
                  <p>{fmtDate(eng.expiry_date)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Billing period</p>
                  <p>
                    {BILLING_PERIOD_LABELS[eng.billing_period] ?? eng.billing_period}
                    {eng.billing_period === "custom" && eng.billing_anchor_day ? ` (day ${eng.billing_anchor_day})` : ""}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Status</p>
                  <p className="capitalize">{eng.status.replace(/_/g, " ")}</p>
                </div>
              </div>

              {!fullyAgreed && !rate && (
                <p className="text-sm text-muted-foreground border-t pt-3">
                  This engagement is not usable yet — no rates have been proposed. Nothing can be dispatched to you
                  under it until the business proposes rates and you accept them.
                </p>
              )}

              {rate && (
                <div className="border-t pt-3 space-y-3">
                  <p className="text-sm font-medium">Proposed rates (version {rate.version})</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                    <div>
                      <p className="text-muted-foreground text-xs">Standard call-out fee</p>
                      <p>{fmtGBP(rate.callout_standard)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Out-of-hours call-out fee</p>
                      <p>{fmtGBP(rate.callout_ooh)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Hourly rate</p>
                      <p>{fmtGBP(rate.hourly_rate)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Materials markup</p>
                      <p>{rate.materials_markup_pct}%</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Minimum charge</p>
                      <p>{rate.minimum_charge != null ? fmtGBP(rate.minimum_charge) : "None"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Effective from</p>
                      <p>{fmtDate(rate.effective_from)}</p>
                    </div>
                  </div>

                  {pendingForContractor && (
                    <div className="flex gap-2 pt-1">
                      <Button
                        size="sm"
                        onClick={() => setConfirmAcceptRate(rate)}
                        disabled={actioningRateId === rate.id}
                      >
                        {actioningRateId === rate.id ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        Accept rates
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setDeclineTarget(rate)}
                        disabled={actioningRateId === rate.id}
                      >
                        Decline
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      {/* Accept confirmation — not a dismissible toast, a modal that must be
          read and explicitly confirmed, since accepting sets what the
          contractor is paid for every call-out until a new version is
          agreed. */}
      <AlertDialog open={!!confirmAcceptRate} onOpenChange={(o) => !o && setConfirmAcceptRate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Accept these rates?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  By accepting, you are agreeing what you will be paid for every call-out under this engagement —
                  standard call-out fee, out-of-hours call-out fee, hourly rate, materials markup, and minimum
                  charge — until a new rate version is proposed and agreed by both sides.
                </p>
                {confirmAcceptRate && (
                  <ul className="text-xs bg-muted/50 rounded-md p-3 space-y-1">
                    <li>Standard call-out fee: {fmtGBP(confirmAcceptRate.callout_standard)}</li>
                    <li>Out-of-hours call-out fee: {fmtGBP(confirmAcceptRate.callout_ooh)}</li>
                    <li>Hourly rate: {fmtGBP(confirmAcceptRate.hourly_rate)}</li>
                    <li>Materials markup: {confirmAcceptRate.materials_markup_pct}%</li>
                    <li>
                      Minimum charge:{" "}
                      {confirmAcceptRate.minimum_charge != null ? fmtGBP(confirmAcceptRate.minimum_charge) : "None"}
                    </li>
                  </ul>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmAcceptRate && handleAccept(confirmAcceptRate)}
              disabled={!!actioningRateId}
            >
              I agree to these rates
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!declineTarget} onOpenChange={(o) => !o && setDeclineTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Decline these rates?</AlertDialogTitle>
            <AlertDialogDescription>
              The business will need to propose a new rate version before this engagement can be used. Nothing is
              dispatched to you in the meantime.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => declineTarget && handleDecline(declineTarget)}
              disabled={!!actioningRateId}
            >
              Decline
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
