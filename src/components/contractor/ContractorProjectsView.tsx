import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState, LoadingState } from "@/components/AsyncState";
import { useContractorProjectsList, type ContractorProjectSummary } from "@/hooks/useContractorProjectParticipation";
import { projectDisplayStatus, PROJECT_STATUS_CHIP } from "@/lib/projectStatus";
import { formatDate } from "@/lib/formatDate";

const projectPath = (id: string) => `/dashboard/contractor?view=projects&project=${id}`;

/**
 * Real projects (not jobs) the contractor takes part in — one of their
 * jobs is attached to a package. Read-only: no create, no edit.
 */
export function ContractorProjectsView() {
  const navigate = useNavigate();
  const { projects, loading, error, refetch } = useContractorProjectsList();

  if (loading) return <LoadingState message="Loading your projects..." />;
  if (error) return <ErrorState message={error} onRetry={() => void refetch()} />;

  if (projects.length === 0) {
    return (
      <EmptyState
        icon={<i className="ti ti-layout-kanban text-4xl" aria-hidden="true" />}
        message="When a customer adds one of your jobs to a project, it appears here."
      />
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {projects.map((project) => (
        <ProjectCard key={project.project_id} project={project} onOpen={() => navigate(projectPath(project.project_id))} />
      ))}
    </div>
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
        <p className="text-sm text-muted-foreground">{project.owner_name ?? "Unknown"}</p>
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
