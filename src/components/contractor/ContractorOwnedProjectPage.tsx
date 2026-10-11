import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2 } from "lucide-react";
import { ErrorState, LoadingState } from "@/components/AsyncState";
import { useContractorProjectsList } from "@/hooks/useContractorProjectParticipation";
import { useProjectDetail } from "@/hooks/useProjectDetail";
import { projectDisplayStatus, PROJECT_STATUS_CHIP } from "@/lib/projectStatus";
import { formatGBP } from "@/lib/formatGBP";
import { formatDate } from "@/lib/formatDate";
import { CreateProjectDialog } from "@/components/projects/CreateProjectDialog";
import { BudgetBand } from "@/components/projects/BudgetBand";
import { PackagesSection } from "@/components/projects/PackagesSection";
import { ProjectTimeline } from "@/components/projects/ProjectTimeline";
import { messageOf } from "@/components/projects/projectErrors";

const LIST_PATH = "/dashboard/contractor?view=projects";

interface FullProject {
  id: string;
  title: string;
  description: string | null;
  budget: number | null;
  status: string;
  target_start: string | null;
  target_end: string | null;
}

const PROJECT_SELECT = "id, title, description, budget, status, target_start, target_end" as const;

/**
 * A contractor's OWN project (projects.account_type = 'contractor') —
 * their own jobs grouped under one timeline and budget, for one
 * customer. Reuses the same slice-2/3 pieces the homeowner and business
 * pages use, in a 'contractor' viewer mode: packages are labelled
 * "Phases", the budget band is relabelled from the contractor's own
 * point of view, and there is no "Find a contractor" action, no snags
 * card and no sign-off card in this step — sign-off is the customer's,
 * not the contractor's (enforced server-side by sign_off_project).
 */
export function ContractorOwnedProjectPage({ projectId }: { projectId: string }) {
  const navigate = useNavigate();
  const { updateProject, deleteProject } = useContractorProjectsList();
  const detail = useProjectDetail(projectId, { viewer: "contractor" });

  const [project, setProject] = useState<FullProject | null>(null);
  const [projectLoading, setProjectLoading] = useState(true);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const loadProject = useCallback(async () => {
    setProjectLoading(true);
    setProjectError(null);
    try {
      const { data, error } = await supabase.from("projects").select(PROJECT_SELECT).eq("id", projectId).maybeSingle();
      if (error) throw error;
      setProject(data ?? null);
    } catch (err) {
      setProjectError(messageOf(err));
    } finally {
      setProjectLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadProject();
  }, [loadProject]);

  if (projectLoading || detail.loading) return <LoadingState message="Loading project..." />;
  if (projectError) return <ErrorState message={projectError} onRetry={() => void loadProject()} />;
  if (detail.error) return <ErrorState message={detail.error} onRetry={() => void detail.refetch()} />;

  const backLink = (
    <Button variant="link" className="px-0 text-muted-foreground" onClick={() => navigate(LIST_PATH)}>
      <i className="ti ti-arrow-left mr-1" aria-hidden="true" />
      All projects
    </Button>
  );

  if (!project) {
    return (
      <div className="space-y-4">
        {backLink}
        <ErrorState message="This project could not be found. It may have been deleted." />
      </div>
    );
  }

  const status = projectDisplayStatus(project.status, detail.attachedJobCount);
  const readOnly = project.status === "completed" || project.status === "cancelled";

  // One customer per contractor project (enforced server-side), so any
  // filled package's job names the same customer — the first one found is enough.
  const firstFilledJob = detail.packages.map((p) => (p.job_id ? detail.jobs[p.job_id] : undefined)).find((j) => j?.customer_id);
  const customerName = firstFilledJob?.customer_id ? detail.customerNames[firstFilledJob.customer_id] : undefined;

  const handleDelete = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteProject(project.id);
      setConfirmingDelete(false);
      navigate(LIST_PATH);
    } catch (err) {
      setDeleteError(messageOf(err));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {backLink}

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-heading text-2xl font-bold">{project.title}</h2>
            <Badge className={PROJECT_STATUS_CHIP[status]}>{status}</Badge>
          </div>
          {project.description && <p className="text-muted-foreground max-w-2xl">{project.description}</p>}
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <span>
              <span className="text-muted-foreground">For: </span>
              {detail.attachedJobCount > 0 ? (customerName ?? "Customer") : "not set yet"}
            </span>
            <span>
              <span className="text-muted-foreground">Start: </span>
              {project.target_start ? formatDate(project.target_start) : "Not set"}
            </span>
            <span>
              <span className="text-muted-foreground">Finish: </span>
              {project.target_end ? formatDate(project.target_end) : "Not set"}
            </span>
            <span>
              <span className="text-muted-foreground">Budget: </span>
              <span className="font-mono">{project.budget != null ? formatGBP(project.budget) : "Not set"}</span>
            </span>
          </div>
        </div>
        {!readOnly && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setEditing(true)}>
              <i className="ti ti-pencil mr-2" aria-hidden="true" />
              Edit
            </Button>
            <Button
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => { setDeleteError(null); setConfirmingDelete(true); }}
            >
              <i className="ti ti-trash mr-2" aria-hidden="true" />
              Delete
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-6">
        <BudgetBand
          budget={project.budget}
          packages={detail.packages}
          money={detail.money}
          onEditProject={() => setEditing(true)}
          readOnly={readOnly}
          viewer="contractor"
        />

        <PackagesSection
          packages={detail.packages}
          jobs={detail.jobs}
          money={detail.money}
          contractors={detail.contractors}
          addPackage={detail.addPackage}
          updatePackage={detail.updatePackage}
          deletePackage={detail.deletePackage}
          attachJob={detail.attachJob}
          detachJob={detail.detachJob}
          loadAttachableJobs={detail.loadAttachableJobs}
          readOnly={readOnly}
          viewer="contractor"
          findContractorPath=""
          showFindContractor={false}
          customerNames={detail.customerNames}
        />

        <ProjectTimeline
          targetStart={project.target_start}
          targetEnd={project.target_end}
          packages={detail.packages}
          jobs={detail.jobs}
          contractors={detail.contractors}
        />
      </div>

      <CreateProjectDialog
        open={editing}
        project={{
          id: project.id,
          title: project.title,
          description: project.description,
          budget: project.budget,
          status: project.status,
          target_start: project.target_start,
          target_end: project.target_end,
          created_at: "",
          updated_at: "",
        }}
        onClose={() => setEditing(false)}
        onSave={async (values) => {
          await updateProject(project.id, values);
          await loadProject();
        }}
      />

      <AlertDialog open={confirmingDelete} onOpenChange={(v) => !deleting && setConfirmingDelete(v)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this project?</AlertDialogTitle>
            <AlertDialogDescription>
              "{project.title}" will be removed. Your jobs, quotes and invoices are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
            >
              {deleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete project
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
