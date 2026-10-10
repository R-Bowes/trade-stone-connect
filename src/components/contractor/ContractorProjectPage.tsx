import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState, LoadingState } from "@/components/AsyncState";
import {
  useContractorProjectsList,
  useContractorProjectDetail,
  type ContractorProjectPackageRow,
} from "@/hooks/useContractorProjectParticipation";
import type { ProjectJob, ProjectPackage, ProjectSnag } from "@/hooks/useProjectDetail";
import { ProjectTimeline } from "@/components/projects/ProjectTimeline";
import { SnagListCard } from "@/components/projects/SnagListCard";
import { projectDisplayStatus, PROJECT_STATUS_CHIP } from "@/lib/projectStatus";
import { jobStatusChip } from "@/lib/jobStatus";
import { formatJobRef } from "@/lib/documentRefs";
import { formatDate } from "@/lib/formatDate";

const LIST_PATH = "/dashboard/contractor?view=projects";
/** The old "Projects" tab's View/Edit buttons already just did this. */
const JOBS_PATH = "/dashboard/contractor?view=jobs";

/**
 * Read-only: a contractor's view of one project they take part in. Their
 * own packages show full job detail; every other package shows trade
 * and dates only, muted, with no status, contractor name or money
 * figure. No edit controls anywhere on this page.
 */
export function ContractorProjectPage({ projectId }: { projectId: string }) {
  const navigate = useNavigate();
  const { projects, loading: listLoading, error: listError, refetch: refetchList } = useContractorProjectsList();
  const { packages, snags, loading: detailLoading, error: detailError, refetch: refetchDetail } =
    useContractorProjectDetail(projectId);

  if (listLoading || detailLoading) return <LoadingState message="Loading project..." />;
  if (listError) return <ErrorState message={listError} onRetry={() => void refetchList()} />;
  if (detailError) return <ErrorState message={detailError} onRetry={() => void refetchDetail()} />;

  const summary = projects.find((p) => p.project_id === projectId);

  const backLink = (
    <Button variant="link" className="px-0 text-muted-foreground" onClick={() => navigate(LIST_PATH)}>
      <i className="ti ti-arrow-left mr-1" aria-hidden="true" />
      All projects
    </Button>
  );

  if (!summary) {
    return (
      <div className="space-y-4">
        {backLink}
        <ErrorState message="This project could not be found. It may no longer have one of your jobs attached." />
      </div>
    );
  }

  const status = projectDisplayStatus(summary.status, summary.attached_job_count);
  const mine = packages.filter((p) => p.is_mine);

  // ProjectTimeline is reused as-is: build the same package/job shapes it
  // already expects. Other contractors' packages get a synthetic job id
  // (never their real one) so their bar still renders by trade and dates;
  // mutedPackageIds then overrides the bar's style and label entirely.
  const timelinePackages: ProjectPackage[] = packages.map((p, i) => ({
    id: p.package_id,
    project_id: projectId,
    title: p.title,
    trade: p.trade,
    sort_order: i,
    allowance: null,
    needed_from: p.needed_from,
    needed_to: p.needed_to,
    job_id: p.job_status ? (p.job_id ?? `other-${p.package_id}`) : null,
    site_id: null,
    created_at: new Date(0).toISOString(),
  }));
  const timelineJobs: Record<string, ProjectJob> = {};
  for (const p of packages) {
    if (!p.job_status) continue;
    const key = p.job_id ?? `other-${p.package_id}`;
    timelineJobs[key] = {
      id: key,
      job_number: p.job_number ?? 0,
      title: p.title,
      status: p.job_status,
      start_date: p.job_start_date,
      end_date: p.job_end_date,
      contract_value: null,
      contractor_id: "",
      issued_quote_id: null,
      project_id: projectId,
      site_id: null,
    };
  }
  const mutedPackageIds = new Set(packages.filter((p) => !p.is_mine).map((p) => p.package_id));

  // SnagListCard expects a ProjectPackage[] purely to resolve a snag's
  // package title — only the caller's own packages can have a snag
  // returned at all (contractor_project_snags already scopes to those).
  const snagPackages: ProjectPackage[] = mine.map((p, i) => ({
    id: p.package_id,
    project_id: projectId,
    title: p.title,
    trade: p.trade,
    sort_order: i,
    allowance: null,
    needed_from: p.needed_from,
    needed_to: p.needed_to,
    job_id: p.job_id,
    site_id: null,
    created_at: new Date(0).toISOString(),
  }));
  const projectSnags: ProjectSnag[] = snags.map((s) => ({
    id: s.snag_id,
    description: s.description,
    status: s.status,
    package_id: null, // not exposed by contractor_project_snags — only used for the per-package title lookup below
    created_at: s.raised_at,
    resolved_at: s.resolved_at,
  }));

  return (
    <div className="space-y-6">
      {backLink}

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-heading text-2xl font-bold">{summary.title}</h2>
          <Badge className={PROJECT_STATUS_CHIP[status]}>{status}</Badge>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <span>
            <span className="text-muted-foreground">For: </span>
            {summary.owner_name ?? "Unknown"}
          </span>
          <span>
            <span className="text-muted-foreground">Start: </span>
            {summary.target_start ? formatDate(summary.target_start) : "Not set"}
          </span>
          <span>
            <span className="text-muted-foreground">Finish: </span>
            {summary.target_end ? formatDate(summary.target_end) : "Not set"}
          </span>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          {/* ── Your work ────────────────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="font-heading text-lg">Your work</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {mine.length === 0 ? (
                <p className="text-sm text-muted-foreground">None of your packages are on this project.</p>
              ) : (
                <ul className="divide-y rounded-md border text-sm">
                  {mine.map((p) => (
                    <YourWorkRow key={p.package_id} pkg={p} onOpenJob={() => navigate(JOBS_PATH)} />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <ProjectTimeline
            targetStart={summary.target_start}
            targetEnd={summary.target_end}
            packages={timelinePackages}
            jobs={timelineJobs}
            contractors={{}}
            mutedPackageIds={mutedPackageIds}
          />
        </div>

        <div className="min-w-0 space-y-6">
          <SnagListCard
            snags={projectSnags}
            packages={snagPackages}
            readOnly
            addSnag={async () => { throw new Error("Read-only."); }}
            resolveSnag={async () => { throw new Error("Read-only."); }}
          />
        </div>
      </div>
    </div>
  );
}

function YourWorkRow({ pkg, onOpenJob }: { pkg: ContractorProjectPackageRow; onOpenJob: () => void }) {
  if (!pkg.job_status) {
    return (
      <li className="p-3">
        <p className="font-medium">{pkg.title}</p>
        <p className="text-sm text-muted-foreground">No job attached yet.</p>
      </li>
    );
  }
  const chip = jobStatusChip(pkg.job_status);
  const reference = pkg.job_number != null ? formatJobRef(pkg.job_number) : null;
  const dates = pkg.job_start_date || pkg.job_end_date
    ? `${pkg.job_start_date ? formatDate(pkg.job_start_date) : "Start not set"} – ${pkg.job_end_date ? formatDate(pkg.job_end_date) : "end not set"}`
    : "Dates not set";
  return (
    <li className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{pkg.title}</p>
          <Badge className={chip.className}>{chip.label}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {reference && <span className="font-mono">{reference}</span>}
          {reference && " · "}
          {dates}
        </p>
      </div>
      <Button size="sm" variant="outline" className="shrink-0" onClick={onOpenJob}>
        View job
      </Button>
    </li>
  );
}
