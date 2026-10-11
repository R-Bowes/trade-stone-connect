import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState, LoadingState } from "@/components/AsyncState";
import {
  useContractorProjectsList, type ContractorProjectSummary,
  useMySubcontractWork, type SubcontractWorkRow,
  useSubcontractUnreadCounts,
} from "@/hooks/useContractorProjectParticipation";
import { SubcontractThread } from "@/components/contractor/SubcontractThread";
import { projectDisplayStatus, PROJECT_STATUS_CHIP } from "@/lib/projectStatus";
import { formatDate } from "@/lib/formatDate";
import { CreateProjectDialog } from "@/components/projects/CreateProjectDialog";
import { messageOf } from "@/components/projects/projectErrors";

const subcontractPath = (id: string) => `/dashboard/contractor?view=projects&subcontract=${id}`;

const projectPath = (id: string) => `/dashboard/contractor?view=projects&project=${id}`;

/**
 * Projects (not jobs) the contractor either owns — their own jobs
 * grouped for one customer — or merely takes part in, because one of
 * their jobs is attached to someone else's project.
 */
export function ContractorProjectsView() {
  const navigate = useNavigate();
  const { projects, loading, error, refetch, createProject } = useContractorProjectsList();
  const [creating, setCreating] = useState(false);

  if (loading) return <LoadingState message="Loading your projects..." />;
  if (error) return <ErrorState message={error} onRetry={() => void refetch()} />;

  const newProjectButton = (
    <Button onClick={() => setCreating(true)}>
      <i className="ti ti-plus mr-2" aria-hidden="true" />
      New project
    </Button>
  );

  return (
    <div className="space-y-6">
      {projects.length > 0 && <div className="flex justify-end">{newProjectButton}</div>}

      {projects.length === 0 ? (
        <EmptyState
          icon={<i className="ti ti-layout-kanban text-4xl" aria-hidden="true" />}
          message="When a customer adds one of your jobs to a project, it appears here."
          action={newProjectButton}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard key={project.project_id} project={project} onOpen={() => navigate(projectPath(project.project_id))} />
          ))}
        </div>
      )}

      <SubcontractWorkSection />

      <CreateProjectDialog
        open={creating}
        onClose={() => setCreating(false)}
        onSave={async (values) => {
          const id = await createProject(values);
          navigate(projectPath(id));
        }}
      />
    </div>
  );
}

/** Sub-contract work this contractor has been invited to, or has accepted, elsewhere. */
function SubcontractWorkSection() {
  const navigate = useNavigate();
  const { rows, loading, error, refetch, respond } = useMySubcontractWork();
  const { counts: unreadCounts, refetch: refetchUnread } = useSubcontractUnreadCounts();
  const [declineTarget, setDeclineTarget] = useState<SubcontractWorkRow | null>(null);
  const [declineNote, setDeclineNote] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [messagesFor, setMessagesFor] = useState<SubcontractWorkRow | null>(null);

  if (loading) return null;
  if (error) return <ErrorState message={error} onRetry={() => void refetch()} />;
  if (rows.length === 0) return null;

  const handleAccept = async (row: SubcontractWorkRow) => {
    setBusyId(row.id);
    setActionError(null);
    try {
      await respond(row.id, true, null);
      navigate(subcontractPath(row.id));
    } catch (err) {
      setActionError(messageOf(err));
    } finally {
      setBusyId(null);
    }
  };

  const handleDecline = async () => {
    if (!declineTarget) return;
    setBusyId(declineTarget.id);
    setActionError(null);
    try {
      await respond(declineTarget.id, false, declineNote.trim() || null);
      setDeclineTarget(null);
      setDeclineNote("");
    } catch (err) {
      setActionError(messageOf(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="font-heading text-lg">Sub-contract work</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {actionError && <p className="text-sm text-destructive">{actionError}</p>}
        <ul className="divide-y rounded-md border text-sm">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{row.phase_title}</p>
                  {row.trade && <span className="text-xs text-muted-foreground">{row.trade}</span>}
                  <Badge className={row.status === "accepted" ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"}>
                    {row.status === "accepted" ? "Accepted" : "Invited"}
                  </Badge>
                  {!!unreadCounts[row.id] && (
                    <Badge className="bg-destructive text-destructive-foreground">{unreadCounts[row.id]} unread</Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {row.project_title} · {row.main_contractor_name ?? "Main contractor"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {row.starts_on ? formatDate(row.starts_on) : "Start not set"} – {row.ends_on ? formatDate(row.ends_on) : "end not set"}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                {row.status === "invited" ? (
                  <>
                    <Button size="sm" variant="outline" onClick={() => setMessagesFor(row)}>
                      Message
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setDeclineTarget(row)} disabled={busyId === row.id}>
                      Decline
                    </Button>
                    <Button size="sm" onClick={() => void handleAccept(row)} disabled={busyId === row.id}>
                      {busyId === row.id && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Accept
                    </Button>
                  </>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => navigate(subcontractPath(row.id))}>
                    Open
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>

      <Dialog open={!!declineTarget} onOpenChange={(v) => !v && setDeclineTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Decline this invite?</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Textarea
              placeholder="Optional note for the main contractor"
              value={declineNote}
              onChange={(e) => setDeclineNote(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeclineTarget(null)}>Back</Button>
            <Button variant="destructive" onClick={() => void handleDecline()} disabled={busyId === declineTarget?.id}>
              {busyId === declineTarget?.id && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Decline
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!messagesFor} onOpenChange={(v) => { if (!v) { setMessagesFor(null); void refetchUnread(); } }}>
        <DialogContent className="flex h-[70vh] max-w-lg flex-col">
          <DialogHeader>
            <DialogTitle>Messages — {messagesFor?.main_contractor_name ?? "Main contractor"}</DialogTitle>
          </DialogHeader>
          {messagesFor && (
            <SubcontractThread
              subcontractId={messagesFor.id}
              status={messagesFor.status}
              otherPartyName={messagesFor.main_contractor_name}
            />
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function ProjectCard({ project, onOpen }: { project: ContractorProjectSummary; onOpen: () => void }) {
  const status = projectDisplayStatus(project.status, project.attached_job_count);
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="cursor-pointer transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <CardContent className="p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-heading text-lg font-semibold leading-tight">{project.title}</h3>
          <Badge className={PROJECT_STATUS_CHIP[status]}>{status}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {project.relationship === "owner"
            ? (project.customerName ? `Yours · for ${project.customerName}` : "Yours")
            : `For ${project.owner_name ?? "Unknown"}`}
        </p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Start</dt>
          <dd>{project.target_start ? formatDate(project.target_start) : "Not set"}</dd>
          <dt className="text-muted-foreground">Finish</dt>
          <dd>{project.target_end ? formatDate(project.target_end) : "Not set"}</dd>
        </dl>
        <p className="text-sm font-medium">
          {project.my_package_count === 1 ? "1 package is yours" : `${project.my_package_count} packages are yours`}
        </p>
      </CardContent>
    </Card>
  );
}
