import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2 } from "lucide-react";
import { ErrorState, LoadingState } from "@/components/AsyncState";
import { useHomeownerProjects } from "@/hooks/useHomeownerProjects";
import { projectDisplayStatus, PROJECT_STATUS_CHIP } from "@/lib/projectStatus";
import { formatGBP } from "@/lib/formatGBP";
import { formatDate } from "@/lib/formatDate";
import { CreateProjectDialog } from "./CreateProjectDialog";

const LIST_PATH = "/dashboard/homeowner?view=projects";

function messageOf(err: unknown): string {
  if (err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string") {
    return (err as { message: string }).message;
  }
  return "Something went wrong. Please try again.";
}

/** "Started" once the date has arrived, "Starts" while it is still ahead. */
function startLabel(date: string): string {
  const today = new Date().toISOString().slice(0, 10);
  return date <= today ? "Started" : "Starts";
}

/**
 * One homeowner project. Slice 2, step 1: the header, edit and delete.
 * Packages, budget, timeline and the right column are placeholders, built
 * in steps 2 to 4.
 */
export function ProjectPage({ projectId }: { projectId: string }) {
  const navigate = useNavigate();
  const { projects, loading, error, refetch, updateProject, deleteProject } = useHomeownerProjects();
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  if (loading) return <LoadingState message="Loading project..." />;
  if (error) return <ErrorState message={error} onRetry={() => void refetch()} />;

  const project = projects.find((p) => p.id === projectId);

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

  // No jobs are loaded in this step; step 2 passes the attached-job count.
  const status = projectDisplayStatus(project.status, 0);

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
      </div>

      {/* ── PLACEHOLDERS: slice 2 steps 2 to 4 (no data shown yet) ─────────── */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <PlaceholderSection title="Budget" step="step 3" />
          <PlaceholderSection title="Packages of work" step="step 2" />
          <PlaceholderSection title="Timeline" step="step 3" />
        </div>
        <div className="space-y-6">
          <PlaceholderSection title="Needs you" step="step 4" />
          <PlaceholderSection title="Snags" step="step 4" />
          <PlaceholderSection title="Sign-off" step="step 4" />
        </div>
      </div>

      <CreateProjectDialog
        open={editing}
        project={project}
        onClose={() => setEditing(false)}
        onSave={async (values) => { await updateProject(project.id, values); }}
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

/** PLACEHOLDER — replaced as each later step is built. Shows no data. */
function PlaceholderSection({ title, step }: { title: string; step: string }) {
  return (
    <Card className="border-dashed">
      <CardHeader className="pb-2">
        <CardTitle className="font-heading text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        Not built yet (Projects slice 2, {step}).
      </CardContent>
    </Card>
  );
}
