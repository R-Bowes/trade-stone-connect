import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth } from "date-fns";
import { Loader2 } from "lucide-react";

// Confirmed DB values:
//   jobs.status:            'scheduled' | 'in_progress' | 'snagging' | 'complete' | 'cancelled'
//   invoices.status:        'draft' | 'sent' | 'paid' | 'overdue' | 'void'
//   issued_quotes.status:   'pending' | 'viewed' | 'responded' | 'accepted' | 'declined' (+ 'draft'|'sent')

const OPEN_STATUSES = ["scheduled", "in_progress", "snagging"] as const;
const CLOSED_STATUSES = ["complete", "cancelled"] as const;

interface OverviewMetrics {
  openJobs: number;
  awaitingApproval: number;
  slaAtRisk: number;
  spendMtd: number;
}

interface AttentionQuote {
  id: string;
  title: string | null;
  contractor_name: string | null;
  created_at: string;
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
  const [attentionQuotes, setAttentionQuotes] = useState<AttentionQuote[]>([]);
  const [atRiskJobs, setAtRiskJobs] = useState<AtRiskJob[]>([]);
  const [jobRows, setJobRows] = useState<JobRow[]>([]);
  const [sites, setSites] = useState<{ id: string; name: string }[]>([]);
  const [siteFilter, setSiteFilter] = useState<string>("all");

  const nav = (view: string) => navigate(`/dashboard/business?view=${view}`);

  useEffect(() => {
    if (!companyId) { setLoading(false); return; }
    load();
  }, [profileId, companyId]);

  const load = async () => {
    setLoading(true);
    const now = new Date().toISOString();
    const monthStart = startOfMonth(new Date()).toISOString();

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

      // Awaiting approval = issued_quotes not yet responded to
      supabase
        .from("issued_quotes")
        .select("id, title:job_description, created_at, contractor_id")
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

    const jobs: JobRow[] = (jobsRes.data ?? []).map((j: any) => ({ ...j }));
    const slaJobs: AtRiskJob[] = (slaRes.data ?? []).map((j: any) => ({ ...j }));
    const spendTotal = (spendRes.data ?? []).reduce((acc: number, r: any) => acc + (r.total ?? 0), 0);
    const quotePending: AttentionQuote[] = (quotesRes.data ?? []).map((q: any) => ({
      id: q.id,
      title: q.title ?? null,
      contractor_name: null,
      created_at: q.created_at,
    }));

    // Hydrate contractor names for attention quotes
    const contractorIds = [...new Set((quotesRes.data ?? []).map((q: any) => q.contractor_id).filter(Boolean))];
    if (contractorIds.length) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", contractorIds);
      const pMap = Object.fromEntries((profiles ?? []).map((p: any) => [p.id, p.full_name]));
      quotePending.forEach((q, i) => {
        q.contractor_name = pMap[(quotesRes.data ?? [])[i]?.contractor_id] ?? null;
      });
    }

    // Hydrate site names for jobs list and SLA jobs
    const siteIds = [...new Set([
      ...jobs.map((j) => j.site_id),
      ...slaJobs.map((j: any) => j.site_id),
    ].filter(Boolean))] as string[];

    let siteMap: Record<string, string> = {};
    if (siteIds.length) {
      const { data: siteRows } = await supabase.from("sites").select("id, name").in("id", siteIds);
      siteMap = Object.fromEntries((siteRows ?? []).map((s: any) => [s.id, s.name]));
    }

    // Hydrate contractor names for jobs list
    const cIds = [...new Set(jobs.map((j) => j.contractor_id).filter(Boolean))] as string[];
    let contractorMap: Record<string, string> = {};
    if (cIds.length) {
      const { data: cProfiles } = await supabase.from("profiles").select("id, full_name").in("id", cIds);
      contractorMap = Object.fromEntries((cProfiles ?? []).map((p: any) => [p.id, p.full_name]));
    }

    const hydratedJobs = jobs.map((j) => ({
      ...j,
      site_name: j.site_id ? (siteMap[j.site_id] ?? null) : null,
      contractor_name: j.contractor_id ? (contractorMap[j.contractor_id] ?? null) : null,
    }));

    const hydratedSlaJobs = slaJobs.map((j) => ({
      ...j,
      site_name: (j as any).site_id ? (siteMap[(j as any).site_id] ?? null) : null,
    }));

    setMetrics({
      openJobs: jobs.length,
      awaitingApproval: quotePending.length,
      slaAtRisk: slaJobs.length,
      spendMtd: spendTotal,
    });
    setAttentionQuotes(quotePending);
    setAtRiskJobs(hydratedSlaJobs);
    setJobRows(hydratedJobs);
    setSites(sitesRes.data ?? []);
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

  const showAttention = metrics.awaitingApproval > 0 || metrics.slaAtRisk > 0;

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

      {/* Needs your attention */}
      {showAttention && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Needs your attention</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {attentionQuotes.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium">
                    {attentionQuotes.length} quote{attentionQuotes.length !== 1 ? "s" : ""} awaiting approval
                  </p>
                  <Button size="sm" variant="outline" onClick={() => nav("approvals")}>
                    Go to Approvals
                  </Button>
                </div>
                <div className="space-y-1">
                  {attentionQuotes.slice(0, 3).map((q) => (
                    <div key={q.id} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                      <span className="text-muted-foreground truncate max-w-xs">
                        {q.title ?? "Untitled quote"}
                        {q.contractor_name ? ` — ${q.contractor_name}` : ""}
                      </span>
                      <span className="text-xs text-muted-foreground shrink-0 ml-4">{fmt(q.created_at)}</span>
                    </div>
                  ))}
                  {attentionQuotes.length > 3 && (
                    <p className="text-xs text-muted-foreground pt-1">+{attentionQuotes.length - 3} more</p>
                  )}
                </div>
              </div>
            )}

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
