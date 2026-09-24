import { useCallback, useEffect, useMemo, useState } from "react";
import type { PipelineEngagement } from "@/hooks/useContractorPipeline";
import { fetchDashboardWorkItems, mapPipelineToWorkItems, mergeWorkItems, type WorkItem } from "@/lib/workItems";

/**
 * Combines useContractorPipeline's output (passed in, never re-fetched or
 * modified here) with the dashboard's own direct-table queries into the
 * unified, sorted work list.
 */
export function useWorkItems(
  contractorId: string | null,
  userId: string | null,
  pipelineEngagements: PipelineEngagement[],
  pipelineLoading: boolean,
) {
  const [dashboardItems, setDashboardItems] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!contractorId || !userId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchDashboardWorkItems({ contractorId, userId });
      setDashboardItems(result);
    } catch (err) {
      console.error("useWorkItems: failed to load work items", err);
      setError("Couldn't load your work list. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [contractorId, userId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const items = useMemo(() => {
    if (!contractorId) return [];
    return mergeWorkItems(mapPipelineToWorkItems(pipelineEngagements), dashboardItems);
  }, [contractorId, pipelineEngagements, dashboardItems]);

  return { items, loading: loading || pipelineLoading, error, refetch };
}
