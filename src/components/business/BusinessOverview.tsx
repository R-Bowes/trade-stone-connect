import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, subMonths, parseISO } from "date-fns";
import { Loader2, CheckCircle2, MapPin } from "lucide-react";
import { BusinessNeedsYourAction } from "./BusinessNeedsYourAction";
import { WorkOrderCard } from "@/components/shared/WorkOrderCard";
import { InvoiceCard, type InvoiceCardInvoice } from "@/components/shared/InvoiceCard";
import { EngagementCard, type EngagementCardEngagement, type EngagementCardRate, type EngagementCardSite } from "@/components/shared/EngagementCard";
import { DashboardSectionHeader } from "@/components/shared/DashboardSectionHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import type { WorkOrder, WorkOrderPriority } from "@/hooks/useWorkOrders";

const BIZ_WORK_ORDER_SELECT =
  "*, site:sites(id, name), asset:assets(id, name), contractor:profiles!work_orders_dispatched_to_fkey(id, full_name, ts_profile_code)" as const;

type BizWorkOrder = WorkOrder & { contractor?: { id: string; full_name: string | null; ts_profile_code: string | null } | null };

interface CostApprovalRow {
  workOrder: BizWorkOrder;
  pendingTotal: number;
}

interface ServiceRequestRow {
  id: string;
  title: string;
  priority: WorkOrderPriority;
  created_at: string;
  site: { id: string; name: string } | null;
}

interface EngagementAttentionRow {
  engagement: EngagementCardEngagement;
  rate: EngagementCardRate | null;
  counterparty: { name: string; logoUrl: string | null };
  sites: EngagementCardSite[];
}

// Confirmed DB values:
//   jobs.status:            'scheduled' | 'in_progress' | 'snagging' | 'complete' | 'cancelled'
//   invoices.status:        'draft' | 'sent' | 'viewed' | 'paid' | 'void'
//                            (overdue is derived from due_date, never stored — see src/lib/invoiceMoney.ts)
//   issued_quotes.status:   'pending' | 'viewed' | 'responded' | 'accepted' | 'declined' (+ 'draft'|'sent')

const OPEN_STATUSES = ["scheduled", "in_progress", "snagging"] as const;
const CLOSED_STATUSES = ["complete", "cancelled"] as const;

interface OverviewMetrics {
  openJobs: number;
  awaitingApproval: number;
  slaAtRisk: number;
  spendMtd: number;
}

interface AtRiskJob {
  id: string;
  title: string;
  site_name: string | null;
  sla_response_due: string | null;
  sla_resolution_due: string | null;
  status: string;
}

interface JobRow {
  id: string;
  title: string;
  status: string;
  site_id: string | null;
  contractor_id: string | null;
  site_name?: string | null;
  contractor_name?: string | null;
}

interface Props {
  profileId: string;
  companyId: string | null;
}

function fmt(iso: string) {
  return format(new Date(iso), "d MMM yyyy");
}

function fmtGbp(n: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(n);
}

export function BusinessOverview({ profileId, companyId }: Props) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<OverviewMetrics>({ openJobs: 0, awaitingApproval: 0, slaAtRisk: 0, spendMtd: 0 });
  const [atRiskJobs, setAtRiskJobs] = useState<AtRiskJob[]>([]);
  const [jobRows, setJobRows] = useState<JobRow[]>([]);
  const [sites, setSites] = useState<{ id: string; name: string }[]>([]);
  const [siteFilter, setSiteFilter] = useState<string>("all");
  const [companyCode, setCompanyCode] = useState<string | null>(null);
  const [pendingCostWorkOrders, setPendingCostWorkOrders] = useState<CostApprovalRow[]>([]);
  const [pendingCostWorkOrdersCount, setPendingCostWorkOrdersCount] = useState(0);
  const [dispatchedWorkOrders, setDispatchedWorkOrders] = useState<BizWorkOrder[]>([]);
  const [dispatchedWorkOrdersCount, setDispatchedWorkOrdersCount] = useState(0);
  const [overdueInvoiceRows, setOverdueInvoiceRows] = useState<(InvoiceCardInvoice & { contractorName: string })[]>([]);
  const [overdueInvoiceRowsCount, setOverdueInvoiceRowsCount] = useState(0);
  const [openServiceRequests, setOpenServiceRequests] = useState<ServiceRequestRow[]>([]);
  const [openServiceRequestsCount, setOpenServiceRequestsCount] = useState(0);
  const [engagementsNeedingAttention, setEngagementsNeedingAttention] = useState<EngagementAttentionRow[]>([]);
  const [engagementsNeedingAttentionCount, setEngagementsNeedingAttentionCount] = useState(0);

  const nav = (view: string) => navigate(`/dashboard/business?view=${view}`);

  useEffect(() => {
    if (!companyId) { setLoading(false); return; }
    load();
  }, [profileId, companyId]);

  const load = async () => {
    setLoading(true);
    const now = new Date().toISOString();
    const monthStart = startOfMonth(new Date()).toISOString();

    interface JobsQueryRow { id: string; title: string; status: string; site_id: string | null; contractor_id: string | null }
    interface SlaJobsQueryRow {
      id: string; title: string; status: string; site_id: string | null;
      sla_response_due: string | null; sla_resolution_due: string | null; responded_at: string | null;
    }
    interface SpendRow { total: number | null }
    interface SiteRow { id: string; name: string }
    interface ContractorNameRow { id: string; full_name: string | null }

    const [
      jobsRes,
      quotesRes,
      slaRes,
      spendRes,
      sitesRes,
    ] = await Promise.all([
      // Open jobs by company_id
      supabase
        .from("jobs")
        .select("id, title, status, site_id, contractor_id")
        .eq("company_id", companyId!)
        .not("status", "in", `(${CLOSED_STATUSES.map(s => `"${s}"`).join(",")})`)
        .order("created_at", { ascending: false }),

      // Awaiting approval = issued_quotes not yet responded to (count only —
      // BusinessNeedsYourAction fetches the full list itself)
      supabase
        .from("issued_quotes")
        .select("id")
        .eq("recipient_id", profileId)
        .is("responded_at", null),

      // SLA at-risk jobs
      supabase
        .from("jobs")
        .select("id, title, status, site_id, sla_response_due, sla_resolution_due, responded_at")
        .eq("company_id", companyId!)
        .not("status", "in", `(${CLOSED_STATUSES.map(s => `"${s}"`).join(",")})`)
        .or(
          `and(sla_response_due.lt.${now},responded_at.is.null),` +
          `sla_resolution_due.lt.${now}`
        ),

      // Spend MTD
      supabase
        .from("invoices")
        .select("total")
        .eq("recipient_id", profileId)
        .eq("status", "paid")
        .gte("paid_date", monthStart),

      // Sites for filter
      supabase
        .from("sites")
        .select("id, name")
        .eq("company_id", companyId!),
    ]);

    const firstError = jobsRes.error ?? quotesRes.error ?? slaRes.error ?? spendRes.error ?? sitesRes.error;
    if (firstError) {
      console.error("Error loading business overview:", firstError);
      setLoading(false);
      return;
    }

    const jobs = (jobsRes.data ?? []) as JobsQueryRow[];
    const slaJobs = (slaRes.data ?? []) as SlaJobsQueryRow[];
    const spendTotal = ((spendRes.data ?? []) as SpendRow[]).reduce((acc, r) => acc + (r.total ?? 0), 0);
    // Count only — BusinessNeedsYourAction owns the actual list rendering now.
    const awaitingApprovalCount = (quotesRes.data ?? []).length;

    // Hydrate site names for jobs list and SLA jobs
    const siteIds = [...new Set([
      ...jobs.map((j) => j.site_id),
      ...slaJobs.map((j) => j.site_id),
    ].filter((id): id is string => !!id))];

    let siteMap: Record<string, string> = {};
    if (siteIds.length) {
      const { data: siteRows, error: siteError } = await supabase.from("sites").select("id, name").in("id", siteIds);
      if (siteError) console.error("Error loading site names:", siteError);
      else siteMap = Object.fromEntries((siteRows as SiteRow[]).map((s) => [s.id, s.name]));
    }

    // Hydrate contractor names for jobs list
    const cIds = [...new Set(jobs.map((j) => j.contractor_id).filter((id): id is string => !!id))];
    let contractorMap: Record<string, string> = {};
    if (cIds.length) {
      const { data: cProfiles, error: contractorError } = await supabase.from("profiles").select("id, full_name").in("id", cIds);
      if (contractorError) console.error("Error loading contractor names:", contractorError);
      else contractorMap = Object.fromEntries((cProfiles as ContractorNameRow[]).map((p) => [p.id, p.full_name ?? ""]));
    }

    const hydratedJobs = jobs.map((j) => ({
      ...j,
      site_name: j.site_id ? (siteMap[j.site_id] ?? null) : null,
      contractor_name: j.contractor_id ? (contractorMap[j.contractor_id] ?? null) : null,
    }));

    const hydratedSlaJobs = slaJobs.map((j) => ({
      ...j,
      site_name: j.site_id ? (siteMap[j.site_id] ?? null) : null,
    }));

    setMetrics({
      openJobs: jobs.length,
      awaitingApproval: awaitingApprovalCount,
      slaAtRisk: slaJobs.length,
      spendMtd: spendTotal,
    });
    setAtRiskJobs(hydratedSlaJobs);
    setJobRows(hydratedJobs);
    setSites(sitesRes.data ?? []);

    // ---- Company code, needed to compose WO-{code}-{number} references on this dashboard ----
    const companyRes = await supabase.from("companies").select("company_code").eq("id", companyId!).maybeSingle();
    if (companyRes.error) console.error("Error loading company code:", companyRes.error);
    else setCompanyCode(companyRes.data?.company_code ?? null);

    // ---- 1. Cost lines awaiting approval ----
    interface PendingCostLineRow { id: string; work_order_id: string; line_total: number; created_at: string }
    const pendingCostsRes = await supabase
      .from("work_order_costs")
      .select("id, work_order_id, line_total, created_at")
      .eq("company_id", companyId!)
      .eq("status", "pending")
      .order("created_at", { ascending: true });
    if (pendingCostsRes.error) {
      console.error("Error loading pending cost lines:", pendingCostsRes.error);
    } else {
      const lines = (pendingCostsRes.data ?? []) as PendingCostLineRow[];
      const totalsByWo = new Map<string, { total: number; earliest: string }>();
      for (const l of lines) {
        const cur = totalsByWo.get(l.work_order_id);
        if (cur) {
          cur.total += Number(l.line_total);
          if (l.created_at < cur.earliest) cur.earliest = l.created_at;
        } else {
          totalsByWo.set(l.work_order_id, { total: Number(l.line_total), earliest: l.created_at });
        }
      }
      const woIdsByEarliest = [...totalsByWo.entries()]
        .sort((a, b) => a[1].earliest.localeCompare(b[1].earliest))
        .map(([id]) => id);
      setPendingCostWorkOrdersCount(woIdsByEarliest.length);
      const topIds = woIdsByEarliest.slice(0, 5);
      if (topIds.length === 0) {
        setPendingCostWorkOrders([]);
      } else {
        const woRes = await supabase.from("work_orders").select(BIZ_WORK_ORDER_SELECT).in("id", topIds);
        if (woRes.error) {
          console.error("Error loading work orders for pending cost lines:", woRes.error);
          setPendingCostWorkOrders([]);
        } else {
          const woMap = new Map(((woRes.data ?? []) as unknown as BizWorkOrder[]).map((wo) => [wo.id, wo]));
          setPendingCostWorkOrders(
            topIds
              .map((id) => {
                const wo = woMap.get(id);
                const totals = totalsByWo.get(id);
                return wo && totals ? { workOrder: wo, pendingTotal: totals.total } : null;
              })
              .filter((r): r is CostApprovalRow => r !== null),
          );
        }
      }
    }

    // ---- 2. Work orders awaiting response ----
    const dispatchedRes = await supabase
      .from("work_orders")
      .select(BIZ_WORK_ORDER_SELECT, { count: "exact" })
      .eq("company_id", companyId!)
      .eq("status", "dispatched")
      .eq("response", "pending")
      .order("dispatched_at", { ascending: true })
      .limit(5);
    if (dispatchedRes.error) {
      console.error("Error loading dispatched work orders:", dispatchedRes.error);
    } else {
      setDispatchedWorkOrders((dispatchedRes.data ?? []) as unknown as BizWorkOrder[]);
      setDispatchedWorkOrdersCount(dispatchedRes.count ?? 0);
    }

    // ---- 3. Overdue invoices ----
    interface OverdueInvoiceRow extends InvoiceCardInvoice { contractor_id: string }
    const todayIso = new Date().toISOString().slice(0, 10);
    const overdueRes = await supabase
      .from("invoices")
      .select("id, invoice_number, status, total, due_date, issued_date, paid_date, subtotal, tax_rate, tax_amount, deposit_amount, deposit_deducted, deposit_paid, contractor_id", { count: "exact" })
      .eq("recipient_id", profileId)
      .in("status", ["sent", "viewed"])
      .lt("due_date", todayIso)
      .order("due_date", { ascending: true })
      .limit(5);
    if (overdueRes.error) {
      console.error("Error loading overdue invoices:", overdueRes.error);
    } else {
      const rows = (overdueRes.data ?? []) as OverdueInvoiceRow[];
      setOverdueInvoiceRowsCount(overdueRes.count ?? 0);
      const contractorIds = [...new Set(rows.map((r) => r.contractor_id))];
      let nameMap = new Map<string, string>();
      if (contractorIds.length) {
        const cRes = await supabase.from("profiles").select("id, full_name").in("id", contractorIds);
        if (cRes.error) console.error("Error loading contractor names for overdue invoices:", cRes.error);
        else nameMap = new Map(((cRes.data ?? []) as ContractorNameRow[]).map((p) => [p.id, p.full_name || "Contractor"]));
      }
      setOverdueInvoiceRows(rows.map((r) => ({ ...r, contractorName: nameMap.get(r.contractor_id) ?? "Contractor" })));
    }

    // ---- 4. Open service requests ----
    // service_requests is absent from the generated Database type (not yet
    // regenerated since the table shipped) — the (supabase as any) cast here
    // matches the existing workaround in useServiceRequests.ts.
    const requestsRes = await (supabase as any)
      .from("service_requests")
      .select("id, title, priority, created_at, site:sites(id, name)", { count: "exact" })
      .eq("company_id", companyId!)
      .eq("status", "open")
      .order("created_at", { ascending: true })
      .limit(5);
    if (requestsRes.error) {
      console.error("Error loading open service requests:", requestsRes.error);
    } else {
      setOpenServiceRequests((requestsRes.data ?? []) as ServiceRequestRow[]);
      setOpenServiceRequestsCount(requestsRes.count ?? 0);
    }

    // ---- 5. Engagements needing attention ----
    // contract_expiry_radar gives the expiry-window signal directly
    // (retender_notice_months against expiry_date) instead of re-deriving
    // the watcher's own nudge-date logic here.
    interface EngRow extends EngagementCardEngagement { contractor_id: string }
    interface RadarRow { id: string; expiry_date: string; retender_notice_months: number; retendered_as: string | null }
    const [engRes, radarRes] = await Promise.all([
      supabase
        .from("term_engagements")
        .select("id, engagement_number, company_id, start_date, expiry_date, status, billing_period, billing_anchor_day, contractor_id")
        .eq("company_id", companyId!)
        .in("status", ["active", "suspended", "notice_given"]),
      supabase
        .from("contract_expiry_radar")
        .select("id, expiry_date, retender_notice_months, retendered_as")
        .eq("company_id", companyId!)
        .eq("source", "engagement"),
    ]);
    if (engRes.error || radarRes.error) {
      console.error("Error loading engagements needing attention:", engRes.error ?? radarRes.error);
    } else {
      const engRows = (engRes.data ?? []) as EngRow[];
      const radarRows = (radarRes.data ?? []) as RadarRow[];
      const today = new Date();
      const expiringSoonIds = new Set(
        radarRows
          .filter((r) => r.retendered_as == null && today >= subMonths(parseISO(r.expiry_date), r.retender_notice_months))
          .map((r) => r.id),
      );

      if (engRows.length === 0) {
        setEngagementsNeedingAttention([]);
        setEngagementsNeedingAttentionCount(0);
      } else {
        const engIds = engRows.map((e) => e.id);
        const [ratesRes, contractorsRes, engSitesRes] = await Promise.all([
          supabase
            .from("engagement_rates")
            .select("id, engagement_id, version, callout_standard, callout_ooh, hourly_rate, materials_markup_pct, minimum_charge, effective_from, agreed_by_business_at, agreed_by_contractor_at")
            .in("engagement_id", engIds)
            .order("version", { ascending: false }),
          supabase.from("profiles").select("id, full_name").in("id", [...new Set(engRows.map((e) => e.contractor_id))]),
          supabase.from("engagement_sites").select("engagement_id, site_id, site:sites(id, name)").in("engagement_id", engIds),
        ]);
        if (ratesRes.error || contractorsRes.error || engSitesRes.error) {
          console.error("Error loading engagement rates/contractors/sites:", ratesRes.error ?? contractorsRes.error ?? engSitesRes.error);
        } else {
          const latestRateByEngagement = new Map<string, EngagementCardRate>();
          for (const r of ratesRes.data ?? []) if (!latestRateByEngagement.has(r.engagement_id)) latestRateByEngagement.set(r.engagement_id, r);
          const contractorMapForEng = new Map(((contractorsRes.data ?? []) as ContractorNameRow[]).map((p) => [p.id, p.full_name]));
          const sitesByEngagement = new Map<string, EngagementCardSite[]>();
          for (const row of engSitesRes.data ?? []) {
            const list = sitesByEngagement.get(row.engagement_id) ?? [];
            list.push({ id: row.site_id, name: row.site?.name ?? "Site (name not available)" });
            sitesByEngagement.set(row.engagement_id, list);
          }

          const rows: EngagementAttentionRow[] = [];
          for (const eng of engRows) {
            const rate = latestRateByEngagement.get(eng.id) ?? null;
            const ratesPending = !!rate && !(rate.agreed_by_business_at && rate.agreed_by_contractor_at);
            const expiringSoon = expiringSoonIds.has(eng.id);
            if (!ratesPending && !expiringSoon) continue;
            rows.push({
              engagement: eng,
              rate,
              counterparty: { name: contractorMapForEng.get(eng.contractor_id) ?? "Contractor", logoUrl: null },
              sites: sitesByEngagement.get(eng.id) ?? [],
            });
          }
          setEngagementsNeedingAttentionCount(rows.length);
          setEngagementsNeedingAttention(rows.slice(0, 5));
        }
      }
    }

    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const METRIC_CARDS = [
    {
      label: "Open jobs",
      value: metrics.openJobs,
      icon: "ti-briefcase",
      view: "jobs",
      colour: "#1a2744",
    },
    {
      label: "Awaiting approval",
      value: metrics.awaitingApproval,
      icon: "ti-circle-check",
      view: "approvals",
      colour: metrics.awaitingApproval > 0 ? "#c2410c" : "#1a2744",
    },
    {
      label: "SLA at risk",
      value: metrics.slaAtRisk,
      icon: "ti-alert-triangle",
      view: "jobs",
      colour: metrics.slaAtRisk > 0 ? "#b91c1c" : "#1a2744",
    },
    {
      label: "Spend this month",
      value: fmtGbp(metrics.spendMtd),
      icon: "ti-receipt",
      view: "spend",
      colour: "#1a2744",
    },
  ];

  const filteredJobs = siteFilter === "all"
    ? jobRows
    : jobRows.filter((j) => j.site_id === siteFilter);

  const statusLabel: Record<string, string> = {
    scheduled: "Scheduled",
    in_progress: "In Progress",
    snagging: "Snagging",
    complete: "Complete",
    cancelled: "Cancelled",
  };

  const statusBadge = (status: string) => {
    const colours: Record<string, string> = {
      scheduled: "bg-blue-100 text-blue-800",
      in_progress: "bg-yellow-100 text-yellow-800",
      snagging: "bg-orange-100 text-orange-800",
      complete: "bg-green-100 text-green-800",
      cancelled: "bg-gray-100 text-gray-600",
    };
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colours[status] ?? "bg-gray-100 text-gray-600"}`}>
        {statusLabel[status] ?? status}
      </span>
    );
  };

  const showAttention = metrics.slaAtRisk > 0;

  const allNewSectionsEmpty =
    pendingCostWorkOrders.length === 0 &&
    dispatchedWorkOrders.length === 0 &&
    overdueInvoiceRows.length === 0 &&
    openServiceRequests.length === 0 &&
    engagementsNeedingAttention.length === 0;

  return (
    <div className="p-6 space-y-8 max-w-5xl">

      {/* Four metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {METRIC_CARDS.map((card) => (
          <button
            key={card.label}
            onClick={() => nav(card.view)}
            className="text-left w-full"
          >
            <Card className="hover:shadow-md transition-shadow h-full">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <i className={`ti ${card.icon}`} style={{ fontSize: 18, color: card.colour }} />
                  <span className="text-xs text-muted-foreground font-medium">{card.label}</span>
                </div>
                <div
                  className="text-2xl font-bold font-mono"
                  style={{ color: card.colour }}
                >
                  {card.value}
                </div>
              </CardContent>
            </Card>
          </button>
        ))}
      </div>

      {allNewSectionsEmpty ? (
        <EmptyState
          icon={<CheckCircle2 className="h-10 w-10 text-green-500" />}
          message="Nothing needs your attention right now."
        />
      ) : (
        <div className="flex flex-col gap-6">
          {pendingCostWorkOrders.length > 0 && (
            <div className="space-y-3">
              <DashboardSectionHeader
                title="Cost lines awaiting approval"
                totalCount={pendingCostWorkOrdersCount}
                shownCount={pendingCostWorkOrders.length}
                onViewAll={() => nav("work-orders")}
              />
              <div className="grid gap-3">
                {pendingCostWorkOrders.map(({ workOrder, pendingTotal }) => (
                  <WorkOrderCard
                    key={workOrder.id}
                    workOrder={workOrder}
                    site={workOrder.site ?? null}
                    counterparty={workOrder.contractor?.full_name ?? null}
                    companyCode={companyCode}
                    viewer="business"
                    density="compact"
                    compactFact={{ label: "Pending", value: fmtGbp(pendingTotal) }}
                    actions={<Button size="sm" onClick={() => nav("work-orders")}>Review</Button>}
                  />
                ))}
              </div>
            </div>
          )}

          {dispatchedWorkOrders.length > 0 && (
            <div className="space-y-3">
              <DashboardSectionHeader
                title="Work orders awaiting response"
                totalCount={dispatchedWorkOrdersCount}
                shownCount={dispatchedWorkOrders.length}
                onViewAll={() => nav("work-orders")}
              />
              <div className="grid gap-3">
                {dispatchedWorkOrders.map((wo) => (
                  <WorkOrderCard
                    key={wo.id}
                    workOrder={wo}
                    site={wo.site ?? null}
                    counterparty={wo.contractor?.full_name ?? null}
                    companyCode={companyCode}
                    viewer="business"
                    density="compact"
                    actions={<Button size="sm" onClick={() => nav("work-orders")}>View</Button>}
                  />
                ))}
              </div>
            </div>
          )}

          {overdueInvoiceRows.length > 0 && (
            <div className="space-y-3">
              <DashboardSectionHeader
                title="Overdue invoices"
                totalCount={overdueInvoiceRowsCount}
                shownCount={overdueInvoiceRows.length}
                onViewAll={() => nav("invoices")}
              />
              <div className="grid gap-3">
                {overdueInvoiceRows.map((inv) => (
                  <InvoiceCard
                    key={inv.id}
                    invoice={inv}
                    viewer="business"
                    counterparty={inv.contractorName}
                    density="compact"
                    actions={<Button size="sm" onClick={() => nav("invoices")}>View</Button>}
                  />
                ))}
              </div>
            </div>
          )}

          {openServiceRequests.length > 0 && (
            <div className="space-y-3">
              <DashboardSectionHeader
                title="Open service requests"
                totalCount={openServiceRequestsCount}
                shownCount={openServiceRequests.length}
                onViewAll={() => nav("service-requests")}
              />
              <Card>
                <CardContent className="p-0">
                  {openServiceRequests.map((req) => (
                    <div key={req.id} className="flex items-center justify-between py-2.5 px-4 border-b last:border-0 gap-4">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{req.title}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          {req.site?.name && (
                            <>
                              <MapPin className="h-3 w-3" />
                              <span className="truncate">{req.site.name}</span>
                            </>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className="text-xs capitalize">{req.priority}</Badge>
                        <Button size="sm" variant="outline" onClick={() => nav("service-requests")}>Triage</Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          )}

          {engagementsNeedingAttention.length > 0 && (
            <div className="space-y-3">
              <DashboardSectionHeader
                title="Engagements needing attention"
                totalCount={engagementsNeedingAttentionCount}
                shownCount={engagementsNeedingAttention.length}
                onViewAll={() => nav("panel")}
              />
              <div className="grid gap-3">
                {engagementsNeedingAttention.map((row) => (
                  <EngagementCard
                    key={row.engagement.id}
                    engagement={row.engagement}
                    rate={row.rate}
                    counterparty={row.counterparty}
                    sites={row.sites}
                    viewer="business"
                    density="compact"
                    actions={<Button size="sm" onClick={() => nav("panel")}>Manage</Button>}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* B6: quotes to review, deposits to pay, dates to confirm — one click each */}
      <BusinessNeedsYourAction profileId={profileId} />

      {/* SLA breaches — a distinct, operational-risk category from counterparty actions above */}
      {showAttention && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">SLA at risk</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {atRiskJobs.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium">
                    {atRiskJobs.length} SLA breach{atRiskJobs.length !== 1 ? "es" : ""}
                  </p>
                  <Button size="sm" variant="outline" onClick={() => nav("jobs")}>
                    Go to Jobs
                  </Button>
                </div>
                <div className="space-y-1">
                  {atRiskJobs.slice(0, 3).map((j) => (
                    <div key={j.id} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                      <span className="text-muted-foreground truncate max-w-xs">
                        {j.title}
                        {j.site_name ? ` — ${j.site_name}` : ""}
                      </span>
                      <span className="text-xs text-red-600 shrink-0 ml-4">
                        {j.sla_response_due ? `Response due ${fmt(j.sla_response_due)}` : j.sla_resolution_due ? `Resolution due ${fmt(j.sla_resolution_due)}` : "SLA breached"}
                      </span>
                    </div>
                  ))}
                  {atRiskJobs.length > 3 && (
                    <p className="text-xs text-muted-foreground pt-1">+{atRiskJobs.length - 3} more</p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Jobs across sites */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <CardTitle className="text-base font-semibold">Jobs across sites</CardTitle>
            {sites.length > 0 && (
              <Select value={siteFilter} onValueChange={setSiteFilter}>
                <SelectTrigger className="w-44 h-8 text-sm">
                  <SelectValue placeholder="All sites" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sites</SelectItem>
                  {sites.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {filteredJobs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No open jobs{siteFilter !== "all" ? " for this site" : ""}.</p>
          ) : (
            <div className="space-y-0">
              {filteredJobs.map((job) => (
                <div
                  key={job.id}
                  className="flex items-center justify-between py-2.5 border-b last:border-0 gap-4"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{job.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {[job.site_name, job.contractor_name].filter(Boolean).join(" · ") || "No site assigned"}
                    </p>
                  </div>
                  {statusBadge(job.status)}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
