import { useCallback, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { CostKind, WorkOrderCost } from "@/lib/costLines";

export interface CostInput {
  kind: CostKind;
  /** Hours for labour; unused for call-outs; optional for materials/other. */
  quantity?: number;
  /** The contractor's own cost/amount, for materials and other. */
  unitCost?: number;
  description?: string;
}

// All writes go through SECURITY DEFINER RPCs — work_order_costs has no
// client write policies, and pricing/approval decisions are made server-side.
export function useWorkOrderCosts() {
  const { toast } = useToast();
  const [costs, setCosts] = useState<WorkOrderCost[]>([]);
  const [loading, setLoading] = useState(false);

  const loadCosts = useCallback(async (workOrderIds: string[]) => {
    if (workOrderIds.length === 0) {
      setCosts([]);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("work_order_costs")
      .select("*")
      .in("work_order_id", workOrderIds)
      .order("created_at", { ascending: true });
    setLoading(false);

    if (error) {
      console.error("Error loading work order costs:", error);
      toast({ title: "Error", description: "Failed to load cost lines", variant: "destructive" });
      return;
    }
    setCosts(data ?? []);
  }, [toast]);

  const costsByWorkOrder = useMemo(() => {
    const map: Record<string, WorkOrderCost[]> = {};
    for (const c of costs) (map[c.work_order_id] ??= []).push(c);
    return map;
  }, [costs]);

  const fail = (title: string, message: string) => {
    toast({ title, description: message, variant: "destructive" });
    return false;
  };

  const submitCost = async (workOrderId: string, input: CostInput): Promise<boolean> => {
    const { error } = await supabase.rpc("submit_work_order_cost", {
      p_work_order_id: workOrderId,
      p_kind: input.kind,
      p_quantity: input.quantity,
      p_unit_cost: input.unitCost,
      p_description: input.description,
    });
    if (error) return fail("Could not record cost", error.message);
    return true;
  };

  const amendCost = async (costId: string, input: Omit<CostInput, "kind">): Promise<boolean> => {
    const { error } = await supabase.rpc("amend_work_order_cost", {
      p_cost_id: costId,
      p_quantity: input.quantity,
      p_unit_cost: input.unitCost,
      p_description: input.description,
    });
    if (error) return fail("Could not amend cost", error.message);
    toast({ title: "Cost line resubmitted", description: "It is back with the business for approval." });
    return true;
  };

  const approveCost = async (costId: string): Promise<boolean> => {
    const { error } = await supabase.rpc("approve_work_order_cost", { p_cost_id: costId });
    if (error) return fail("Could not approve", error.message);
    toast({ title: "Cost line approved" });
    return true;
  };

  const queryCost = async (costId: string, reason: string): Promise<boolean> => {
    const { error } = await supabase.rpc("query_work_order_cost", { p_cost_id: costId, p_reason: reason });
    if (error) return fail("Could not query", error.message);
    toast({ title: "Cost line queried", description: "The contractor has been told and can amend it." });
    return true;
  };

  const rejectCost = async (costId: string, reason: string): Promise<boolean> => {
    const { error } = await supabase.rpc("reject_work_order_cost", { p_cost_id: costId, p_reason: reason });
    if (error) return fail("Could not reject", error.message);
    toast({ title: "Cost line rejected" });
    return true;
  };

  return { costs, costsByWorkOrder, loading, loadCosts, submitCost, amendCost, approveCost, queryCost, rejectCost };
}
