import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { ErrorState, LoadingState } from "@/components/AsyncState";
import type { ContractorSummary, ProjectJob, ProjectPackage } from "@/hooks/useProjectDetail";
import { formatJobRef } from "@/lib/documentRefs";
import { formatGBP } from "@/lib/formatGBP";
import { jobStatusChip } from "@/lib/jobStatus";
import { messageOf } from "./projectErrors";

type Props = {
  open: boolean;
  pkg: ProjectPackage | null;
  onClose: () => void;
  loadAttachableJobs: () => Promise<{ jobs: ProjectJob[]; contractors: Record<string, ContractorSummary> }>;
  onAttach: (jobId: string) => Promise<void>;
};

/** Lists my jobs that are in no project and not cancelled, and attaches one to the package. */
export function AttachJobDialog({ open, pkg, onClose, loadAttachableJobs, onAttach }: Props) {
  const [jobs, setJobs] = useState<ProjectJob[]>([]);
  const [contractors, setContractors] = useState<Record<string, ContractorSummary>>({});
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attachingId, setAttachingId] = useState<string | null>(null);
  const [attachError, setAttachError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const result = await loadAttachableJobs();
      setJobs(result.jobs);
      setContractors(result.contractors);
    } catch (err) {
      setLoadError(messageOf(err));
    } finally {
      setLoading(false);
    }
  }, [loadAttachableJobs]);

  useEffect(() => {
    if (!open) return;
    setAttachError(null);
    void load();
  }, [open, load]);

  const handleAttach = async (jobId: string) => {
    setAttachingId(jobId);
    setAttachError(null);
    try {
      await onAttach(jobId);
      onClose();
    } catch (err) {
      setAttachError(messageOf(err));
    } finally {
      setAttachingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !attachingId && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading">Attach a job</DialogTitle>
          <DialogDescription>
            {pkg ? <>Choose the job that covers <span className="font-medium text-foreground">{pkg.title}</span>.</> : null}
            {" "}Only your jobs that are not already in a project, and not cancelled, are listed.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <LoadingState message="Loading your jobs..." />
        ) : loadError ? (
          <ErrorState message={loadError} onRetry={() => void load()} />
        ) : jobs.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            You have no jobs to attach. A job appears here once you have accepted a contractor's quote, as long as it
            is not cancelled and not already in a project.
          </div>
        ) : (
          <ul className="divide-y rounded-md border">
            {jobs.map((job) => {
              const contractor = contractors[job.contractor_id];
              const chip = jobStatusChip(job.status);
              return (
                <li key={job.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm">
                        {formatJobRef(job.job_number, contractor?.tsCode ? { contractorCode: contractor.tsCode } : undefined)}
                      </span>
                      <Badge className={chip.className}>{chip.label}</Badge>
                    </div>
                    <p className="font-medium truncate">{job.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {contractor ? contractor.name : "Contractor"}
                      {contractor?.tsCode && <span className="font-mono"> · {contractor.tsCode}</span>}
                      {" · "}
                      <span className="font-mono">{job.contract_value != null ? formatGBP(job.contract_value) : "Value not set"}</span>
                    </p>
                  </div>
                  <Button size="sm" onClick={() => void handleAttach(job.id)} disabled={!!attachingId}>
                    {attachingId === job.id && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Attach
                  </Button>
                </li>
              );
            })}
          </ul>
        )}

        {attachError && <p className="text-sm text-destructive">{attachError}</p>}
      </DialogContent>
    </Dialog>
  );
}
