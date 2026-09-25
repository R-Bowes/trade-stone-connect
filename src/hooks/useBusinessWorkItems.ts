import { useCallback, useEffect, useState } from "react";
import { fetchBusinessWorkItems, mergeWorkItems, type WorkItem } from "@/lib/workItems";

/**
 * The business side has no pipeline equivalent — every item comes from
 * fetchBusinessWorkItems' direct queries. Still sorted through
 * mergeWorkItems (with an empty pipeline list) so both viewers share the
 * exact same ordering rule from one implementation.
 */
export function useBusinessWorkItems(companyId: string | null, profileId: string | null) {
  const [items, setItems] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!companyId || !profileId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchBusinessWorkItems({ companyId, profileId });
      setItems(mergeWorkItems([], result));
    } catch (err) {
      console.error("useBusinessWorkItems: failed to load work items", err);
      setError("Couldn't load your work list. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [companyId, profileId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { items, loading, error, refetch };
}
