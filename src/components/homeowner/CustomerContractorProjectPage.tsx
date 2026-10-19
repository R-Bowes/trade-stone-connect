import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState, LoadingState } from "@/components/AsyncState";
import {
  useCustomerContractorProjects, useCustomerContractorProjectDetail, customerContractorProjectDisplayStatus,
} from "@/hooks/useCustomerContractorProjects";
import { ProjectTimeline } from "@/components/projects/ProjectTimeline";
import { NeedsYouCard } from "@/components/projects/NeedsYouCard";
import { SnagListCard } from "@/components/projects/SnagListCard";
import { SignOffCard } from "@/components/projects/SignOffCard";
import { signOffBlockers } from "@/lib/projectSignOff";
import { jobStatusChip } from "@/lib/jobStatus";
import { PROJECT_STATUS_CHIP } from "@/lib/projectStatus";
import { formatGBP } from "@/lib/formatGBP";
import { formatDate } from "@/lib/formatDate";

const LIST_PATH = "/dashboard/homeowner?view=projects";

/**
 * A personal customer's read-only view of a contractor-owned project.
 * Only snags (raise/resolve) and sign-off are writable -- everything
 * else (phases, dates, attachments) is the contractor's to edit.
 * No budget band (the customer has no budget figure for this project)
 * -- just a minimal Paid / still to pay summary, per the brief.
 */
export function CustomerContractorProjectPage({ projectId }: { projectId: string }) {
  const navigate = useNavigate();
  const { projects, loading: listLoading, error: listError, refetch: refetchList } = useCustomerContractorProjects();
  const detail = useCustomerContractorProjectDetail(projectId);

  if (listLoading || detail.loading) return <LoadingState message="Loading project..." />;
  if (listError) return <ErrorState message={listError} onRetry={() => void refetchList()} />;
  if (detail.error) return <ErrorState message={detail.error} onRetry={() => void detail.refetch()} />;

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
        <ErrorState message="This project could not be found. It may no longer be shared with you." />
      </div>
    );
  }

  const status = customerContractorProjectDisplayStatus(summary);
  const blockers = signOffBlockers(summary.status, detail.packages, detail.jobs, detail.snags);
  const paid = detail.packages.reduce((sum, p) => sum + (detail.money[p.id]?.paid ?? 0), 0);
  const stillToPay = detail.packages.reduce((sum, p) => sum + (detail.money[p.id]?.still_to_pay ?? 0), 0);

  return (
    <div className="space-y-6">
      {backLink}

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-heading text-2xl font-bold">{summary.title}</h2>
          <Badge className={PROJECT_STATUS_CHIP[status]}>{status}</Badge>
        </div>
        <p className="text-muted-foreground">Run by {summary.contractor_name ?? "your contractor"}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="font-heading text-lg">Money</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-muted-foreground">Paid</dt>
                  <dd className="font-mono text-lg">{formatGBP(paid)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Still to pay</dt>
                  <dd className="font-mono text-lg">{formatGBP(stillToPay)}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="font-heading text-lg">Phases</CardTitle>
            </CardHeader>
            <CardContent>
              {detail.packages.length === 0 ? (
                <p className="text-sm text-muted-foreground">No phases yet.</p>
              ) : (
                <ul className="divide-y rounded-md border text-sm">
                  {detail.packages.map((pkg) => {
                    const job = pkg.job_id ? detail.jobs[pkg.job_id] : undefined;
                    const chip = job ? jobStatusChip(job.status) : null;
                    const ref = pkg.job_id ? detail.jobRefs[pkg.job_id] : undefined;
                    const subNames = detail.subcontractorNames[pkg.id];
                    return (
                      <li key={pkg.id} className="flex flex-col gap-1 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{pkg.title}</p>
                          {pkg.trade && <span className="text-xs text-muted-foreground">{pkg.trade}</span>}
                          {chip && <Badge className={chip.className}>{chip.label}</Badge>}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {pkg.job_id ? (detail.contractors[pkg.job_id]?.name ?? "Your contractor") : "No job attached yet"}
                          {subNames && ` · with ${subNames}`}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {ref && <span className="font-mono">{ref}</span>}
                          {ref && " · "}
                          {job?.start_date ? formatDate(job.start_date) : "Start not set"} – {job?.end_date ? formatDate(job.end_date) : "end not set"}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <ProjectTimeline
            targetStart={summary.target_start}
            targetEnd={summary.target_end}
            packages={detail.packages}
            jobs={detail.jobs}
            contractors={detail.contractors}
          />
        </div>

        <div className="min-w-0 space-y-6">
          <NeedsYouCard
            packages={detail.packages}
            jobs={detail.jobs}
            money={detail.money}
            contractors={detail.contractors}
            snags={detail.snags}
            readyToSignOff={summary.status !== "completed" && blockers.length === 0}
            invoicesPath="/dashboard/homeowner?view=invoices"
            findContractorPath={LIST_PATH}
          />

          <SnagListCard
            snags={detail.snags}
            packages={detail.packages}
            readOnly={summary.status === "completed" || summary.status === "cancelled"}
            addSnag={detail.addSnag}
            resolveSnag={detail.resolveSnag}
            packageNoun="Phase"
          />

          <SignOffCard
            projectStatus={summary.status}
            signOffs={detail.signOffs}
            blockers={blockers}
            stillToPay={stillToPay}
            onSignOff={detail.signOff}
          />
        </div>
      </div>
    </div>
  );
}
