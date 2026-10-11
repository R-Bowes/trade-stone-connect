import { ErrorState, LoadingState } from "@/components/AsyncState";
import { useContractorProjectsList } from "@/hooks/useContractorProjectParticipation";
import { ContractorOwnedProjectPage } from "./ContractorOwnedProjectPage";
import { ContractorProjectPage } from "./ContractorProjectPage";

/**
 * A contractor's single project can be one they own (account_type
 * 'contractor') or one they merely take part in (one of their jobs is
 * attached). Each is a genuinely different page — the owner gets the
 * full slice-2 editing surface, a participant gets the read-only
 * trade-scoped view — so this just picks between them.
 */
export function ContractorProjectRoute({ projectId }: { projectId: string }) {
  const { projects, loading, error, refetch } = useContractorProjectsList();

  if (loading) return <LoadingState message="Loading project..." />;
  if (error) return <ErrorState message={error} onRetry={() => void refetch()} />;

  const summary = projects.find((p) => p.project_id === projectId);
  if (!summary) {
    return (
      <ErrorState message="This project could not be found. It may have been deleted, or you may no longer have access to it." />
    );
  }

  return summary.relationship === "owner"
    ? <ContractorOwnedProjectPage projectId={projectId} />
    : <ContractorProjectPage projectId={projectId} />;
}
