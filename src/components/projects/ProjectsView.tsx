import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState, LoadingState } from "@/components/AsyncState";
import { useHomeownerProjects, type HomeownerProject } from "@/hooks/useHomeownerProjects";
import { projectDisplayStatus, PROJECT_STATUS_CHIP } from "@/lib/projectStatus";
import { formatGBP } from "@/lib/formatGBP";
import { formatDate } from "@/lib/formatDate";
import { CreateProjectDialog } from "./CreateProjectDialog";

const projectPath = (id: string) => `/dashboard/homeowner?view=projects&project=${id}`;

/** The homeowner's list of projects. Opening one navigates to ?project=<id>. */
export function ProjectsView() {
  const navigate = useNavigate();
  const { projects, attachedJobCounts, loading, error, refetch, createProject } = useHomeownerProjects();
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
      {/* The layout already shows the "Projects" page header. */}
      {projects.length > 0 && <div className="flex justify-end">{newProjectButton}</div>}

      {projects.length === 0 ? (
        <EmptyState
          icon={<i className="ti ti-layout-kanban text-4xl" aria-hidden="true" />}
          message="Group the jobs for one piece of work, such as an extension, and see the dates and costs together."
          action={newProjectButton}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              attachedJobCount={attachedJobCounts[project.id] ?? 0}
              onOpen={() => navigate(projectPath(project.id))}
            />
          ))}
        </div>
      )}

      <CreateProjectDialog
        open={creating}
        onClose={() => setCreating(false)}
        onSave={async (values) => {
          const created = await createProject(values);
          navigate(projectPath(created.id));
        }}
      />
    </div>
  );
}

function ProjectCard({ project, attachedJobCount, onOpen }: { project: HomeownerProject; attachedJobCount: number; onOpen: () => void }) {
  // Same count as the project page, so the two chips always agree.
  const status = projectDisplayStatus(project.status, attachedJobCount);
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
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Start</dt>
          <dd>{project.target_start ? formatDate(project.target_start) : "Not set"}</dd>
          <dt className="text-muted-foreground">Finish</dt>
          <dd>{project.target_end ? formatDate(project.target_end) : "Not set"}</dd>
          <dt className="text-muted-foreground">Budget</dt>
          <dd className="font-mono">{project.budget != null ? formatGBP(project.budget) : "Not set"}</dd>
        </dl>
      </CardContent>
    </Card>
  );
}
