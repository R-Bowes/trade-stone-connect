import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2 } from "lucide-react";
import { ErrorState, LoadingState } from "@/components/AsyncState";
import { useCompanyProjects } from "@/hooks/useCompanyProjects";
import { projectDisplayStatus, PROJECT_STATUS_CHIP } from "@/lib/projectStatus";
import { formatGBP } from "@/lib/formatGBP";
import { formatDate } from "@/lib/formatDate";
import { CreateProjectDialog } from "@/components/projects/CreateProjectDialog";
import { messageOf } from "@/components/projects/projectErrors";

const LIST_PATH = "/dashboard/business?view=projects";

/**
 * Shell only — header, edit and delete, and placeholders for the
 * sections that come in later steps (sites, packages, budget, timeline,
 * needs-you, snags, sign-off). Mirrors ProjectPage.tsx's header, but
 * reads from useCompanyProjects rather than useHomeownerProjects, and
 * shows site names instead of a single customer.
 */
export function BusinessProjectPage({ companyId, projectId }: { companyId: string; projectId: string }) {
  const navigate = useNavigate();
  const { projects, attachedJobCounts, loading, error, refetch, updateProject, deleteProject } =
    useCompanyProjects(companyId);
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
        <ErrorState message="This project could not be found. It may have been deleted, or you may not have access to it." />
      </div>
    );
  }

  const attachedJobCount = attachedJobCounts[project.id] ?? 0;
  const status = projectDisplayStatus(project.status, attachedJobCount);
  const readOnly = project.status === "completed";

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
    <div className="space-y-6 p-6">
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
              <span className="text-muted-foreground">Sites: </span>
              {project.siteNames.length > 0 ? project.siteNames.join(", ") : "None"}
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

      {/* ── Placeholders for later steps ──────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Card><CardContent className="p-6 text-sm text-muted-foreground">Budget band — coming in a later step.</CardContent></Card>
          <Card><CardContent className="p-6 text-sm text-muted-foreground">Packages and attached jobs — coming in a later step.</CardContent></Card>
          <Card><CardContent className="p-6 text-sm text-muted-foreground">Timeline — coming in a later step.</CardContent></Card>
        </div>
        <div className="min-w-0 space-y-6">
          <Card><CardContent className="p-6 text-sm text-muted-foreground">Needs you — coming in a later step.</CardContent></Card>
          <Card><CardContent className="p-6 text-sm text-muted-foreground">Snags — coming in a later step.</CardContent></Card>
          <Card><CardContent className="p-6 text-sm text-muted-foreground">Sign-off — coming in a later step.</CardContent></Card>
        </div>
      </div>

      <CreateProjectDialog
        open={editing}
        project={project}
        onClose={() => setEditing(false)}
        onSave={async (values) => {
          await updateProject(project.id, values);
          await refetch();
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
