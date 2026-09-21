import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { Loader2, ArrowLeft, Briefcase, ChevronDown, ChevronUp } from "lucide-react";
import { SlaStatusPill } from "@/components/SlaStatusPill";
import { PriorityBadge } from "@/components/PriorityBadge";
import { fetchJobOrigin, type JobOrigin } from "@/lib/fetchJobOrigin";
import { JobOriginSection } from "@/components/JobOriginSection";
import { JobCard } from "@/components/shared/JobCard";
import { useJobCardContext, resolveJobAsset, resolveJobSite } from "@/hooks/useJobCardContext";
import { formatJobValue, type JobCostSummary } from "@/lib/jobValue";
import { formatQuoteRef } from "@/lib/documentRefs";

// Confirmed jobs.status values from migration 20260328170000
const ALL_STATUSES = ["scheduled", "in_progress", "snagging", "complete", "cancelled"] as const;
type JobStatus = typeof ALL_STATUSES[number];

const STATUS_LABEL: Record<JobStatus, string> = {
  scheduled: "Scheduled",
  in_progress: "In Progress",
  snagging: "Snagging",
  complete: "Complete",
  cancelled: "Cancelled",
};

const STATUS_COLOUR: Record<JobStatus, string> = {
  scheduled: "bg-blue-100 text-blue-800",
  in_progress: "bg-yellow-100 text-yellow-800",
  snagging: "bg-orange-100 text-orange-800",
  complete: "bg-green-100 text-green-800",
  cancelled: "bg-gray-100 text-gray-600",
};

interface JobRow {
  id: string;
  title: string;
  status: string;
  priority: string | null;
  site_id: string | null;
  contractor_id: string | null;
  contract_value: number | null;
  sla_response_due: string | null;
  sla_resolution_due: string | null;
  sla_completion_due: string | null;
  sla_status: string | null;
  responded_at: string | null;
  created_at: string;
  issued_quote_id: string | null;
  engagement_id: string | null;
  job_number: number | null;
  work_order_id: string | null;
  asset_id: string | null;
  start_date: string | null;
  site_name?: string | null;
  contractor_name?: string | null;
  contractor_code?: string | null;
  quote_number?: number | null;
  quote_version?: number | null;
}

interface Props {
  companyId: string;
  profileId: string;
}

function fmt(iso: string) {
  return format(new Date(iso), "d MMM yyyy");
}

function StatusBadge({ status }: { status: string }) {
  const colour = STATUS_COLOUR[status as JobStatus] ?? "bg-gray-100 text-gray-600";
  const label = STATUS_LABEL[status as JobStatus] ?? status;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colour}`}>
      {label}
    </span>
  );
}

function JobDetail({ job, valueText, onBack }: { job: JobRow; valueText: string; onBack: () => void }) {
  const [originOpen, setOriginOpen] = useState(false);
  const [origin, setOrigin] = useState<JobOrigin | null>(null);
  const [originLoading, setOriginLoading] = useState(false);
  const hasOrigin = !!job.issued_quote_id || !!job.engagement_id;

  const toggleOrigin = () => {
    setOriginOpen((v) => !v);
    if (!origin && !originLoading) {
      setOriginLoading(true);
      fetchJobOrigin({ issuedQuoteId: job.issued_quote_id, engagementId: job.engagement_id }).then((result) => {
        setOrigin(result);
        setOriginLoading(false);
      });
    }
  };

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Jobs
      </button>

      <div className="space-y-1">
        <h2 className="font-heading text-2xl font-bold">{job.title}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <PriorityBadge priority={job.priority} full />
          <StatusBadge status={job.status} />
          <SlaStatusPill status={job.sla_status} completionDue={job.sla_completion_due} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        {job.site_name && (
          <div>
            <p className="text-muted-foreground text-xs mb-0.5">Site</p>
            <p className="font-medium">{job.site_name}</p>
          </div>
        )}
        {job.contractor_name && (
          <div>
            <p className="text-muted-foreground text-xs mb-0.5">Contractor</p>
            <p className="font-medium">{job.contractor_name}</p>
          </div>
        )}
        {(job.engagement_id || job.contract_value != null) && (
          <div>
            <p className="text-muted-foreground text-xs mb-0.5">{job.engagement_id ? "Value" : "Contract value"}</p>
            <p className="font-medium font-mono">{valueText}</p>
          </div>
        )}
        <div>
          <p className="text-muted-foreground text-xs mb-0.5">Created</p>
          <p className="font-medium">{fmt(job.created_at)}</p>
        </div>
        {job.sla_response_due && (
          <div>
            <p className="text-muted-foreground text-xs mb-0.5">SLA response due</p>
            <p className="font-medium">{fmt(job.sla_response_due)}</p>
          </div>
        )}
        {job.sla_resolution_due && (
          <div>
            <p className="text-muted-foreground text-xs mb-0.5">SLA resolution due</p>
            <p className="font-medium">{fmt(job.sla_resolution_due)}</p>
          </div>
        )}
      </div>

      {hasOrigin && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={toggleOrigin}
            className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            Origin
            {originOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {originOpen && (
            <div className="rounded-md border p-4">
              <JobOriginSection origin={origin} loading={originLoading} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function BusinessJobsView({ companyId, profileId: _profileId }: Props) {
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [sites, setSites] = useState<{ id: string; name: string }[]>([]);
  const [contractors, setContractors] = useState<{ id: string; name: string }[]>([]);
  const [filterSite, setFilterSite] = useState("all");
  const [filterContractor, setFilterContractor] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [selected, setSelected] = useState<JobRow | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { ctx: jobCtx } = useJobCardContext(jobs);

  useEffect(() => { load(); }, [companyId]);

  // Deep-link support: ?view=jobs&jobId=... (used by the asset detail job history panel)
  useEffect(() => {
    const jobId = searchParams.get("jobId");
    if (jobId && jobs.length) {
      const match = jobs.find((j) => j.id === jobId);
      if (match) setSelected(match);
    }
  }, [searchParams, jobs]);

  const load = async () => {
    setLoading(true);

    const { data: jobRows, error: jobsError } = await supabase
      .from("jobs")
      .select("id, title, status, priority, site_id, contractor_id, contract_value, sla_response_due, sla_resolution_due, sla_completion_due, sla_status, responded_at, created_at, issued_quote_id, engagement_id, job_number, work_order_id, asset_id, start_date")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    if (jobsError) {
      console.error("Business jobs: failed to load jobs", jobsError);
      setLoadError("Jobs could not be loaded. Please try again.");
      setLoading(false);
      return;
    }
    setLoadError(null);

    if (!jobRows?.length) { setJobs([]); setLoading(false); return; }

    const siteIds = [...new Set(jobRows.map((j) => j.site_id).filter((id): id is string => !!id))];
    const contractorIds = [...new Set(jobRows.map((j) => j.contractor_id).filter((id): id is string => !!id))];
    const quoteIds = [...new Set(jobRows.map((j) => j.issued_quote_id).filter((id): id is string => !!id))];

    const fetchSites = async () => {
      if (siteIds.length === 0) return [];
      const { data, error } = await supabase.from("sites").select("id, name").in("id", siteIds);
      if (error) console.error("Business jobs: failed to load sites", error);
      return data ?? [];
    };
    const fetchProfiles = async () => {
      if (contractorIds.length === 0) return [];
      const { data, error } = await supabase.from("profiles").select("id, full_name, ts_profile_code").in("id", contractorIds);
      if (error) console.error("Business jobs: failed to load contractors", error);
      return data ?? [];
    };
    const fetchQuotes = async () => {
      if (quoteIds.length === 0) return [];
      const { data, error } = await supabase.from("issued_quotes").select("id, quote_number, version").in("id", quoteIds);
      if (error) console.error("Business jobs: failed to load quotes", error);
      return data ?? [];
    };

    const [siteRows, profileRows, quoteRows] = await Promise.all([fetchSites(), fetchProfiles(), fetchQuotes()]);
    const siteMap = new Map(siteRows.map((s) => [s.id, s.name]));
    const profileMap = new Map(profileRows.map((p) => [p.id, p]));
    const quoteMap = new Map(quoteRows.map((q) => [q.id, q]));

    const hydrated: JobRow[] = jobRows.map((j) => ({
      ...j,
      site_name: j.site_id ? (siteMap.get(j.site_id) ?? null) : null,
      contractor_name: j.contractor_id ? (profileMap.get(j.contractor_id)?.full_name ?? null) : null,
      contractor_code: j.contractor_id ? (profileMap.get(j.contractor_id)?.ts_profile_code ?? null) : null,
      quote_number: j.issued_quote_id ? (quoteMap.get(j.issued_quote_id)?.quote_number ?? null) : null,
      quote_version: j.issued_quote_id ? (quoteMap.get(j.issued_quote_id)?.version ?? null) : null,
    }));

    setSites(siteRows.map((s) => ({ id: s.id, name: s.name })));
    setContractors(profileRows.map((p) => ({ id: p.id, name: p.full_name ?? "Contractor" })));
    setJobs(hydrated);
    setLoading(false);
  };

  const costFor = (job: JobRow): JobCostSummary | null => (job.work_order_id ? jobCtx.costs[job.work_order_id] ?? null : null);

  const originLabel = (job: JobRow): string | null => {
    if (job.quote_number != null) {
      return formatQuoteRef(job.quote_number, { version: job.quote_version ?? undefined, contractorCode: job.contractor_code ?? undefined });
    }
    if (job.engagement_id) {
      const engagementNumber = jobCtx.engagements[job.engagement_id];
      const workOrder = job.work_order_id ? jobCtx.workOrders[job.work_order_id] : null;
      if (workOrder && engagementNumber) return `${workOrder.ref} · ${engagementNumber}`;
      return engagementNumber ?? workOrder?.ref ?? "Call-out";
    }
    return null;
  };

  if (selected) {
    return (
      <JobDetail
        job={selected}
        valueText={formatJobValue(selected, costFor(selected))}
        onBack={() => setSelected(null)}
      />
    );
  }

  const filtered = jobs.filter((j) => {
    if (filterSite !== "all" && j.site_id !== filterSite) return false;
    if (filterContractor !== "all" && j.contractor_id !== filterContractor) return false;
    if (filterStatus !== "all" && j.status !== filterStatus) return false;
    return true;
  });

  // at_risk and breached jobs surface first by default
  const SLA_SORT_RANK: Record<string, number> = { breached: 0, at_risk: 1 };
  const sortedFiltered = [...filtered].sort((a, b) => {
    const rankA = SLA_SORT_RANK[a.sla_status ?? ""] ?? 2;
    const rankB = SLA_SORT_RANK[b.sla_status ?? ""] ?? 2;
    if (rankA !== rankB) return rankA - rankB;
    return b.created_at.localeCompare(a.created_at);
  });

  const slaCounts = jobs.reduce(
    (acc, j) => {
      if (j.sla_status === "at_risk") acc.at_risk++;
      else if (j.sla_status === "breached") acc.breached++;
      else if (j.sla_status === "on_track") acc.on_track++;
      return acc;
    },
    { at_risk: 0, breached: 0, on_track: 0 },
  );

  return (
    <div className="p-6 space-y-4 max-w-5xl">

      {/* SLA summary bar */}
      {(slaCounts.at_risk > 0 || slaCounts.breached > 0 || slaCounts.on_track > 0) && (
        <div className="flex items-center gap-4 text-sm rounded-md border bg-muted/30 px-4 py-2">
          <span className={slaCounts.at_risk > 0 ? "font-medium text-amber-700" : "text-muted-foreground"}>
            {slaCounts.at_risk} job{slaCounts.at_risk !== 1 ? "s" : ""} at risk
          </span>
          <span className="text-muted-foreground">·</span>
          <span className={slaCounts.breached > 0 ? "font-medium text-red-600" : "text-muted-foreground"}>
            {slaCounts.breached} breached
          </span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">{slaCounts.on_track} on track</span>
        </div>
      )}

      {/* Filter bar */}
      <div className="flex flex-wrap gap-3">
        <Select value={filterSite} onValueChange={setFilterSite}>
          <SelectTrigger className="w-44 h-8 text-sm">
            <SelectValue placeholder="All sites" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sites</SelectItem>
            {sites.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={filterContractor} onValueChange={setFilterContractor}>
          <SelectTrigger className="w-48 h-8 text-sm">
            <SelectValue placeholder="All contractors" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All contractors</SelectItem>
            {contractors.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40 h-8 text-sm">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {ALL_STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
          </SelectContent>
        </Select>

        {(filterSite !== "all" || filterContractor !== "all" || filterStatus !== "all") && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-sm"
            onClick={() => { setFilterSite("all"); setFilterContractor("all"); setFilterStatus("all"); }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : loadError ? (
        <Card><CardContent className="p-10 text-center text-sm text-destructive">{loadError}</CardContent></Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center">
            <Briefcase className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No jobs found.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {filtered.length} job{filtered.length !== 1 ? "s" : ""}
            {filterSite !== "all" || filterContractor !== "all" || filterStatus !== "all" ? " (filtered)" : ""}
          </p>
          <div className="grid gap-3">
            {sortedFiltered.map((job) => (
              <div key={job.id} className={job.status === "cancelled" ? "opacity-60" : undefined}>
                <JobCard
                  job={job}
                  viewer="business"
                  counterparty={job.contractor_name ?? null}
                  contractorCode={job.contractor_code ?? null}
                  site={resolveJobSite(jobCtx, job) ?? (job.site_id && job.site_name ? { id: job.site_id, name: job.site_name } : null)}
                  asset={resolveJobAsset(jobCtx, job)}
                  origin={originLabel(job)}
                  costSummary={costFor(job)}
                  actions={<Button size="sm" variant="outline" onClick={() => setSelected(job)}>View</Button>}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
