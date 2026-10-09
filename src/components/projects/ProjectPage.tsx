import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2 } from "lucide-react";
import { ErrorState, LoadingState } from "@/components/AsyncState";
import { useHomeownerProjects } from "@/hooks/useHomeownerProjects";
import { useProjectDetail } from "@/hooks/useProjectDetail";
import { projectDisplayStatus, PROJECT_STATUS_CHIP } from "@/lib/projectStatus";
import { formatGBP } from "@/lib/formatGBP";
import { formatDate } from "@/lib/formatDate";
import { CreateProjectDialog } from "./CreateProjectDialog";
import { PackagesSection } from "./PackagesSection";
import { BudgetBand } from "./BudgetBand";
import { ProjectTimeline } from "./ProjectTimeline";
import { NeedsYouCard } from "./NeedsYouCard";
import { SnagListCard } from "./SnagListCard";
import { SignOffCard } from "./SignOffCard";
import { signOffBlockers } from "@/lib/projectSignOff";
import { messageOf } from "./projectErrors";

const LIST_PATH = "/dashboard/homeowner?view=projects";

/** "Started" once the date has arrived, "Starts" while it is still ahead. */
function startLabel(date: string): string {
  const today = new Date().toISOString().slice(0, 10);
  return date <= today ? "Started" : "Starts";
}

/**
 * One homeowner project: the header, edit and delete, packages of work,
 * the budget band, the timeline, and the right column (needs you, snags,
 * sign-off). Once signed off the project is read-only.
 */
export function ProjectPage({ projectId }: { projectId: string }) {
  const navigate = useNavigate();
  const detail = useProjectDetail(projectId);
  // Edit and delete go through the list hook, which owns those writes.
  const { updateProject, deleteProject } = useHomeownerProjects();
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  if (detail.loading && !detail.project) return <LoadingState message="Loading project..." />;
  if (detail.error) return <ErrorState message={detail.error} onRetry={() => void detail.refetch()} />;

  const project = detail.project;

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
  // A signed-off project is read-only: every add, edit, delete, attach,
  // detach and snag action is hidden.
  const readOnly = project.status === "completed";
  const blockers = signOffBlockers(project.status, detail.packages, detail.jobs, detail.snags);
  const stillToPay = detail.packages
    .filter((p) => !!p.job_id)
    .reduce((sum, p) => sum + (detail.money[p.id]?.still_to_pay ?? 0), 0);

  const handleDelete = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteProject(project.id);
      setConfirmingDelete(false);
      navigate(LIST_PATH);
    } catch (err) {
      // Shown as the database reports it, e.g. a project that still has
      // jobs attached cannot be deleted.
      setDeleteError(messageOf(err));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {backLink}

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-heading text-2xl font-bold">{project.title}</h2>
            <Badge className={PROJECT_STATUS_CHIP[status]}>{status}</Badge>
          </div>
          {project.description && <p className="text-muted-foreground max-w-2xl">{project.description}</p>}
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <span>
              <span className="text-muted-foreground">
                {project.target_start ? startLabel(project.target_start) : "Start"}:{" "}
              </span>
              {project.target_start ? formatDate(project.target_start) : "Not set"}
            </span>
            <span>
              <span className="text-muted-foreground">Expected to finish: </span>
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

      {/* min-w-0 lets the columns shrink, so only the timeline's own box
          scrolls sideways on a narrow screen, never the page. */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <BudgetBand
            budget={project.budget}
            packages={detail.packages}
            money={detail.money}
            onEditProject={() => setEditing(true)}
            readOnly={readOnly}
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
            findContractorPath="/dashboard/homeowner?view=hire"
          />
          <ProjectTimeline
            targetStart={project.target_start}
            targetEnd={project.target_end}
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
            readyToSignOff={!readOnly && blockers.length === 0}
            invoicesPath="/dashboard/homeowner?view=invoices"
            findContractorPath="/dashboard/homeowner?view=hire"
          />
          <SnagListCard
            snags={detail.snags}
            packages={detail.packages}
            readOnly={readOnly}
            addSnag={detail.addSnag}
            resolveSnag={detail.resolveSnag}
          />
          <SignOffCard
            projectStatus={project.status}
            signOffs={detail.signOffs}
            blockers={blockers}
            stillToPay={stillToPay}
            onSignOff={detail.signOff}
          />
        </div>
      </div>

      <CreateProjectDialog
        open={editing}
        project={project}
        onClose={() => setEditing(false)}
        onSave={async (values) => {
          await updateProject(project.id, values);
          await detail.refetch();
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
                // Keep the dialog open until the database has answered.
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
