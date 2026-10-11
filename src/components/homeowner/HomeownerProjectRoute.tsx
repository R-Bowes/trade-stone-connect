import { ErrorState, LoadingState } from "@/components/AsyncState";
import { useCustomerContractorProjects } from "@/hooks/useCustomerContractorProjects";
import { ProjectPage } from "@/components/projects/ProjectPage";
import { CustomerContractorProjectPage } from "@/components/homeowner/CustomerContractorProjectPage";

/**
 * A homeowner's single project is either their own (personal project,
 * the existing ProjectPage) or one run by a contractor they are the
 * customer of (CustomerContractorProjectPage, read-only but for snags
 * and sign-off). This just picks between them, the same way
 * ContractorProjectRoute picks between a contractor's owned and
 * participant projects.
 */
export function HomeownerProjectRoute({ projectId }: { projectId: string }) {
  const { projects, loading, error, refetch } = useCustomerContractorProjects();

  if (loading) return <LoadingState message="Loading project..." />;
  if (error) return <ErrorState message={error} onRetry={() => void refetch()} />;

  const isContractorRun = projects.some((p) => p.project_id === projectId);

  return isContractorRun
    ? <CustomerContractorProjectPage projectId={projectId} />
    : <ProjectPage projectId={projectId} />;
}
