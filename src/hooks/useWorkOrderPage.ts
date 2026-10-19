import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkOrders, type WorkOrder } from "@/hooks/useWorkOrders";
import type { WorkOrderContext } from "@/lib/workOrderCopy";

export interface TimelineEntry {
  occurred_at: string;
  kind: string;
  actor_name: string | null;
  title: string | null;
  body: string | null;
  /** Job photos carry {bucket, path, url}; PO-increase photos are plain paths in the work-order bucket. */
  photos: unknown[] | null;
}

/**
 * One work order page's data: the row (RLS-read), its display context and
 * its timeline (both SECURITY DEFINER RPCs that return nothing unless the
 * caller can see the work order). `missing` = not found or not visible.
 */
export function useWorkOrderPage(workOrderId: string) {
  const { fetchWorkOrder } = useWorkOrders();
  const [workOrder, setWorkOrder] = useState<WorkOrder | null>(null);
  const [context, setContext] = useState<WorkOrderContext | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);

  const reload = useCallback(async () => {
    const [wo, ctxRes, tlRes] = await Promise.all([
      fetchWorkOrder(workOrderId),
      supabase.rpc("work_order_context", { p_work_order_id: workOrderId }),
      supabase.rpc("work_order_timeline", { p_work_order_id: workOrderId }),
    ]);
    if (ctxRes.error) console.error("work_order_context failed:", ctxRes.error);
    if (tlRes.error) console.error("work_order_timeline failed:", tlRes.error);
    setWorkOrder(wo);
    setContext((ctxRes.data as unknown as WorkOrderContext | null) ?? null);
    setTimeline(((tlRes.data ?? []) as TimelineEntry[]).map((e) => ({ ...e, photos: Array.isArray(e.photos) ? e.photos : null })));
    setMissing(!wo || !ctxRes.data);
    setLoading(false);
  }, [workOrderId, fetchWorkOrder]);

  useEffect(() => {
    setLoading(true);
    void reload();
  }, [reload]);

  return { workOrder, context, timeline, loading, missing, reload };
}
