import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { defaultApprovedValue } from "@/lib/workOrderValue";

export type WorkOrderPriority = "emergency" | "urgent" | "routine" | "planned";
export type WorkOrderStatus = "draft" | "dispatched" | "accepted" | "declined" | "reassigned" | "cancelled" | "completed";
export type WorkOrderResponse = "accepted" | "declined" | "pending" | null;

export interface WorkOrder {
  id: string;
  company_id: string;
  raised_by: string;
  raised_by_name: string | null;
  service_request_id: string | null;
  site_id: string | null;
  asset_id: string | null;
  wo_number: number;
  title: string;
  description: string | null;
  trade_required: string | null;
  priority: WorkOrderPriority;
  dispatched_to: string | null;
  engagement_id: string | null;
  dispatched_at: string | null;
  response: WorkOrderResponse;
  responded_at: string | null;
  decline_reason: string | null;
  job_id: string | null;
  rate_snapshot: Record<string, unknown> | null;
  status: WorkOrderStatus;
  estimated_cost: number | null;
  requires_approval: boolean;
  approved_by: string | null;
  approved_at: string | null;
  /** Not-to-exceed value. NULL only on work orders raised before 13 Oct 2026. */
  approved_value: number | null;
  /** Set when the PO is issued; dispatch is refused until it is. */
  po_issued_at: string | null;
  client_po_ref: string | null;
  value_amended_at: string | null;
  value_amended_by: string | null;
  photos: string[];
  created_at: string;
  updated_at: string;
  // joined
  site?: { id: string; name: string } | null;
  asset?: { id: string; name: string } | null;
  contractor?: { id: string; full_name: string | null; ts_profile_code: string | null } | null;
  /** The job minted on acceptance, via work_orders.job_id. */
  job?: { id: string; status: string } | null;
}

export interface WorkOrderFilters {
  status?: WorkOrderStatus;
  siteId?: string;
  priority?: WorkOrderPriority;
  contractorId?: string;
}

export interface AvailableContractor {
  contractor_id: string;
  engagement_id: string;
  full_name: string | null;
  ts_profile_code: string | null;
  trades: string[] | null;
}

export interface SuggestedValue {
  value: number;
  /** One entry per contractor whose agreed rates gave a value. */
  basis: { contractorName: string; value: number }[];
}

const WORK_ORDER_SELECT = "*, site:sites(id, name), asset:assets(id, name), contractor:profiles!work_orders_dispatched_to_fkey(id, full_name, ts_profile_code), job:jobs!work_orders_job_id_fkey(id, status)" as const;

export function formatWoNumber(companyCode: string | null | undefined, woNumber: number): string {
  const num = String(woNumber).padStart(4, "0");
  const code = (companyCode ?? "").replace(/^TS-B-/, "");
  return code ? `WO-${code}-${num}` : `WO-${num}`;
}

/** TradeStone issues the PO; its number is the work order's own number. */
export function formatPoNumber(companyCode: string | null | undefined, woNumber: number): string {
  return formatWoNumber(companyCode, woNumber).replace(/^WO-/, "PO-");
}

/** Approved value set, PO not yet issued: waiting for someone with sign-off. */
export function isAwaitingSignOff(wo: Pick<WorkOrder, "approved_value" | "po_issued_at" | "status">): boolean {
  return wo.approved_value != null && wo.po_issued_at == null && wo.status !== "cancelled" && wo.status !== "completed";
}

// Every write goes through a SECURITY DEFINER RPC (20261014140000):
// authenticated has no INSERT/UPDATE/DELETE on work_orders. The server sets
// raised_by, the approval, the rate snapshot and the contractor notification —
// none of them is ever sent from here. RPC errors are written for the user,
// so they are shown as they come back.
export function useWorkOrders() {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const fail = (title: string, error: { message?: string } | null) => {
    toast({ title, description: error?.message ?? "Please try again.", variant: "destructive" });
  };

  const fetchWorkOrders = useCallback(async (companyId: string, filters?: WorkOrderFilters) => {
    setLoading(true);
    let query = supabase
      .from("work_orders")
      .select(WORK_ORDER_SELECT)
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    if (filters?.status) query = query.eq("status", filters.status);
    if (filters?.siteId) query = query.eq("site_id", filters.siteId);
    if (filters?.priority) query = query.eq("priority", filters.priority);
    if (filters?.contractorId) query = query.eq("dispatched_to", filters.contractorId);

    const { data, error } = await query;
    if (error) {
      console.error("Error fetching work orders:", error);
      setLoading(false);
      return [];
    }
    const rows = (data ?? []) as WorkOrder[];
    setWorkOrders(rows);
    setLoading(false);
    return rows;
  }, []);

  const fetchWorkOrder = useCallback(async (id: string): Promise<WorkOrder | null> => {
    const { data, error } = await supabase
      .from("work_orders")
      .select(WORK_ORDER_SELECT)
      .eq("id", id)
      .maybeSingle();
    if (error) {
      console.error("Error fetching work order:", error);
      return null;
    }
    return data as WorkOrder | null;
  }, []);

  // Panel contractors with an active engagement that covers this site,
  // optionally filtered by trade.
  const fetchAvailableContractors = useCallback(async (
    companyId: string, siteId: string, trade?: string,
  ): Promise<AvailableContractor[]> => {
    const { data: engagementRows, error } = await supabase
      .from("term_engagements")
      .select("id, contractor_id, engagement_sites!inner(site_id)")
      .eq("company_id", companyId)
      .eq("status", "active")
      .eq("engagement_sites.site_id", siteId);

    if (error) {
      console.error("Error fetching available contractors:", error);
      return [];
    }

    const rows = (engagementRows ?? []) as { id: string; contractor_id: string }[];
    if (rows.length === 0) return [];

    const contractorIds = rows.map((r) => r.contractor_id);
    const { data: profileRows } = await supabase
      .from("profiles")
      .select("id, full_name, ts_profile_code, trades")
      .in("id", contractorIds);

    const profileById = new Map((profileRows ?? []).map((p) => [p.id, p]));

    return rows
      .map((r) => {
        const profile = profileById.get(r.contractor_id);
        return {
          contractor_id: r.contractor_id,
          engagement_id: r.id,
          full_name: profile?.full_name ?? null,
          ts_profile_code: profile?.ts_profile_code ?? null,
          trades: (profile?.trades as string[] | null) ?? null,
        };
      })
      .filter((c) => !trade || (c.trades ?? []).includes(trade));
  }, []);

  // Pre-fill for the approved value: the highest defaultApprovedValue across
  // the given contractors' agreed rates, so the PO covers whichever of them is
  // dispatched. null when none of them has agreed rates — the field is then
  // left blank for the user to fill, never a made-up figure.
  const fetchSuggestedValue = useCallback(async (
    candidates: AvailableContractor[], priority: WorkOrderPriority,
  ): Promise<SuggestedValue | null> => {
    const results = await Promise.all(candidates.map(async (c) => {
      const { data, error } = await supabase.rpc("effective_engagement_rates", { p_engagement_id: c.engagement_id });
      if (error || !data) return null;
      const value = defaultApprovedValue(data, priority);
      return value == null ? null : { contractorName: c.full_name ?? "Contractor", value };
    }));
    const basis = results.filter((r): r is { contractorName: string; value: number } => r !== null);
    if (basis.length === 0) return null;
    return { value: Math.max(...basis.map((b) => b.value)), basis };
  }, []);

  const createWorkOrder = async (data: {
    // Supplied by the caller when photos were uploaded ahead of the insert,
    // since their storage path embeds the work order id.
    id?: string;
    company_id: string;
    site_id: string | null;
    asset_id?: string | null;
    title: string;
    description?: string | null;
    trade_required?: string | null;
    priority: WorkOrderPriority;
    photos?: string[];
    approved_value: number;
    client_po_ref?: string | null;
    service_request_id?: string | null;
  }): Promise<WorkOrder | null> => {
    const { data: id, error } = await supabase.rpc("create_work_order", {
      p_company_id: data.company_id,
      p_site_id: data.site_id,
      p_title: data.title,
      p_approved_value: data.approved_value,
      p_priority: data.priority,
      p_description: data.description ?? undefined,
      p_trade_required: data.trade_required ?? undefined,
      p_asset_id: data.asset_id ?? undefined,
      p_photos: data.photos ?? [],
      p_client_po_ref: data.client_po_ref ?? undefined,
      p_service_request_id: data.service_request_id ?? undefined,
      p_id: data.id,
    });
    if (error || !id) {
      fail("Could not raise work order", error);
      throw error ?? new Error("create_work_order returned no id");
    }
    return fetchWorkOrder(id);
  };

  const approveWorkOrder = async (workOrderId: string) => {
    const { error } = await supabase.rpc("approve_work_order", { p_work_order_id: workOrderId });
    if (error) {
      fail("Could not approve work order", error);
      throw error;
    }
    toast({ title: "Approved" });
  };

  // The engagement decides the contractor; the server snapshots its agreed
  // rates, refuses if none are agreed or the PO isn't issued, and notifies
  // the contractor.
  const dispatchWorkOrder = async (workOrderId: string, engagementId: string) => {
    const { error } = await supabase.rpc("dispatch_work_order", {
      p_work_order_id: workOrderId,
      p_engagement_id: engagementId,
    });
    if (error) {
      fail("Cannot dispatch", error);
      throw error;
    }
    toast({ title: "Work order dispatched" });
  };

  // Accept and decline are single SECURITY DEFINER calls. The server locks the
  // work order, checks it is still awaiting this contractor's response, and does
  // the job creation / status change / business notification in one transaction,
  // so a failure leaves nothing half-done and a second call raises instead of
  // minting a second job.
  const respondToWorkOrder = async (workOrderId: string, accept: boolean, declineReason?: string) => {
    if (accept) {
      const { data: jobId, error } = await supabase.rpc("accept_work_order", { p_work_order_id: workOrderId });
      if (error || !jobId) {
        toast({ title: "Could not accept work order", description: error?.message ?? "Please try again.", variant: "destructive" });
        throw error ?? new Error("accept_work_order returned no job id");
      }
      toast({ title: "Work order accepted", description: "Job created." });
      return jobId;
    }

    const { error } = await supabase.rpc("decline_work_order", {
      p_work_order_id: workOrderId,
      p_reason: declineReason?.trim() || "Not specified",
    });
    if (error) {
      toast({ title: "Could not decline work order", description: error.message, variant: "destructive" });
      throw error;
    }
    toast({ title: "Work order declined" });
    return null;
  };

  // One transaction server-side: the previous contractor's open cost lines are
  // rejected, then the work order is dispatched to the new engagement.
  const reassignWorkOrder = async (workOrderId: string, newEngagementId: string) => {
    const { error } = await supabase.rpc("reassign_work_order", {
      p_work_order_id: workOrderId,
      p_engagement_id: newEngagementId,
    });
    if (error) {
      fail("Could not reassign work order", error);
      throw error;
    }
    toast({ title: "Work order reassigned" });
  };

  const cancelWorkOrder = async (workOrderId: string, reason?: string) => {
    const { error } = await supabase.rpc("cancel_work_order", {
      p_work_order_id: workOrderId,
      p_reason: reason ?? undefined,
    });
    if (error) {
      fail("Could not cancel work order", error);
      throw error;
    }
    toast({ title: "Work order cancelled" });
  };

  const amendWorkOrderValue = async (workOrderId: string, newValue: number) => {
    const { error } = await supabase.rpc("amend_work_order_value", {
      p_work_order_id: workOrderId,
      p_new_value: newValue,
    });
    if (error) {
      fail("Could not change the approved value", error);
      throw error;
    }
    toast({ title: "Approved value updated" });
  };

  // Mirror the server's two rules so buttons only show for people the RPCs
  // will accept. Both fail closed: an error reads as "cannot".
  // Operational (dispatch, reassign, cancel, decline a request, review costs
  // within the PO): the owner, or any active member covering the site.
  const canAct = useCallback(async (workOrderId: string): Promise<boolean> => {
    const { data, error } = await supabase.rpc("can_act_on_work_order", { p_work_order_id: workOrderId });
    if (error) {
      console.error("Error checking work order access:", error);
      return false;
    }
    return data === true;
  }, []);

  // Sign-off of a PO total (always the total after the change, never the
  // increment): the owner, or a covering member whose approval limit covers it.
  const canSignOffAmount = useCallback(async (workOrderId: string, amount: number): Promise<boolean> => {
    const { data, error } = await supabase.rpc("can_sign_off_work_order_amount", {
      p_work_order_id: workOrderId,
      p_amount: amount,
    });
    if (error) {
      console.error("Error checking sign-off:", error);
      return false;
    }
    return data === true;
  }, []);

  return {
    workOrders,
    loading,
    fetchWorkOrders,
    fetchWorkOrder,
    fetchAvailableContractors,
    fetchSuggestedValue,
    createWorkOrder,
    approveWorkOrder,
    dispatchWorkOrder,
    respondToWorkOrder,
    reassignWorkOrder,
    cancelWorkOrder,
    amendWorkOrderValue,
    canAct,
    canSignOffAmount,
  };
}
