import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
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
import { Loader2, CalendarClock } from "lucide-react";
import { EngagementCard, type EngagementCardSite } from "@/components/shared/EngagementCard";
import { formatGBP } from "@/lib/formatGBP";

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

export function ContractorEngagementsView() {
  const [loading, setLoading] = useState(true);
  const [engagements, setEngagements] = useState<EngagementRow[]>([]);
  const [companyMap, setCompanyMap] = useState<Record<string, CompanyInfo>>({});
  // Only the current-highest-version rate row per engagement is fetched —
  // effective_engagement_rates already excludes anything not fully agreed,
  // so a plain "latest version" read (below) is what's needed to show a
  // pending proposal, which effective_engagement_rates would hide entirely.
  const [latestRateMap, setLatestRateMap] = useState<Record<string, RateRow>>({});
  const [sitesByEngagement, setSitesByEngagement] = useState<Record<string, EngagementCardSite[]>>({});
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
      setSitesByEngagement({});
      setLoading(false);
      return;
    }

    const companyIds = [...new Set(rows.map((r) => r.company_id))];
    const engagementIds = rows.map((r) => r.id);

    const [companiesRes, ratesRes, sitesRes] = await Promise.all([
      supabase.from("companies").select("id, name, logo_url, owner_id").in("id", companyIds),
      supabase
        .from("engagement_rates")
        .select("id, engagement_id, version, callout_standard, callout_ooh, hourly_rate, materials_markup_pct, minimum_charge, effective_from, agreed_by_business_at, agreed_by_contractor_at")
        .in("engagement_id", engagementIds)
        .order("version", { ascending: false }),
      supabase
        .from("engagement_sites")
        .select("engagement_id, site_id, site:sites(id, name)")
        .in("engagement_id", engagementIds),
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

    // A coverage row can exist while the joined site row is unreadable under
    // RLS (site is null) — that must not read as "no sites covered", so it
    // still counts, with a placeholder name.
    const sMap: Record<string, EngagementCardSite[]> = {};
    for (const row of sitesRes.data ?? []) {
      (sMap[row.engagement_id] ??= []).push({
        id: row.site_id,
        name: row.site?.name ?? "Site (name not available)",
      });
    }
    for (const list of Object.values(sMap)) list.sort((a, b) => a.name.localeCompare(b.name));
    setSitesByEngagement(sMap);

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
        const rate = latestRateMap[eng.id] ?? null;
        // Pending on the contractor's side: a rate exists, the business has
        // agreed it, and the contractor has not — the exact case
        // accept_engagement_rate_version's own authorisation branch covers.
        const pendingForContractor = !!rate && !!rate.agreed_by_business_at && !rate.agreed_by_contractor_at;

        return (
          <EngagementCard
            key={eng.id}
            engagement={eng}
            rate={rate}
            counterparty={{ name: company?.name ?? "Business", logoUrl: company?.logo_url ?? null }}
            sites={sitesByEngagement[eng.id] ?? []}
            viewer="contractor"
            actions={
              pendingForContractor && rate ? (
                <>
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
                </>
              ) : undefined
            }
          />
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
                    <li>Standard call-out fee: {formatGBP(confirmAcceptRate.callout_standard)}</li>
                    <li>Out-of-hours call-out fee: {formatGBP(confirmAcceptRate.callout_ooh)}</li>
                    <li>Hourly rate: {formatGBP(confirmAcceptRate.hourly_rate)}</li>
                    <li>Materials markup: {confirmAcceptRate.materials_markup_pct}%</li>
                    <li>
                      Minimum charge:{" "}
                      {confirmAcceptRate.minimum_charge != null ? formatGBP(confirmAcceptRate.minimum_charge) : "None"}
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
