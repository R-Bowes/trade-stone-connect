import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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
  photos: string[];
  created_at: string;
  updated_at: string;
  // joined
  site?: { id: string; name: string } | null;
  asset?: { id: string; name: string } | null;
  contractor?: { id: string; full_name: string | null; ts_profile_code: string | null } | null;
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

const WORK_ORDER_SELECT = "*, site:sites(id, name), asset:assets(id, name), contractor:profiles!work_orders_dispatched_to_fkey(id, full_name, ts_profile_code)" as const;

export function formatWoNumber(companyCode: string | null | undefined, woNumber: number): string {
  const num = String(woNumber).padStart(4, "0");
  const code = (companyCode ?? "").replace(/^TS-B-/, "");
  return code ? `WO-${code}-${num}` : `WO-${num}`;
}

export function useWorkOrders() {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

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

  const createWorkOrder = async (data: {
    // Supplied by the caller when photos were uploaded ahead of the insert,
    // since their storage path embeds the work order id.
    id?: string;
    company_id: string;
    raised_by: string;
    raised_by_name?: string | null;
    site_id?: string | null;
    asset_id?: string | null;
    title: string;
    description?: string | null;
    trade_required?: string | null;
    priority: WorkOrderPriority;
    photos?: string[];
  }): Promise<WorkOrder | null> => {
    const { data: inserted, error } = await supabase
      .from("work_orders")
      .insert({ ...data, status: "draft" })
      .select(WORK_ORDER_SELECT)
      .single();

    if (error) {
      toast({ title: "Error", description: "Failed to create work order", variant: "destructive" });
      throw error;
    }
    toast({ title: "Work order created" });
    return inserted as WorkOrder;
  };

  // Throws on a genuine RPC failure rather than swallowing it — a failed
  // lookup and "no rate is agreed yet" must not look identical to the
  // caller, since only one of them should block dispatch.
  const snapshotRates = async (engagementId: string) => {
    const { data, error } = await supabase.rpc("effective_engagement_rates", { p_engagement_id: engagementId });
    if (error) throw error;
    return data ?? null;
  };

  const dispatchWorkOrder = async (workOrderId: string, contractorProfileId: string, engagementId: string) => {
    let rateSnapshot;
    try {
      rateSnapshot = await snapshotRates(engagementId);
    } catch (err) {
      toast({ title: "Error", description: "Could not check agreed rates. Please try again.", variant: "destructive" });
      throw err;
    }

    // effective_engagement_rates returns nothing until both parties have
    // agreed a rate version (see accept_engagement_rate_version) — a real,
    // ongoing state for a direct-origin engagement between creation and
    // acceptance, not just a transient/error condition. Dispatching anyway
    // used to silently write a null rate_snapshot and proceed; both
    // WorkOrderInbox.tsx and WorkOrderDashboard.tsx would then just omit
    // the rate info box with no indication anything was wrong.
    if (!rateSnapshot) {
      toast({
        title: "Cannot dispatch",
        description: "Rates must be agreed with the contractor before a work order can be dispatched.",
        variant: "destructive",
      });
      throw new Error("Rates must be agreed with the contractor before a work order can be dispatched.");
    }

    const { data: wo, error } = await supabase
      .from("work_orders")
      .update({
        dispatched_to: contractorProfileId,
        engagement_id: engagementId,
        dispatched_at: new Date().toISOString(),
        status: "dispatched",
        response: "pending",
        rate_snapshot: rateSnapshot,
      })
      .eq("id", workOrderId)
      .select("id, title, site:sites(name)")
      .single();

    if (error) {
      toast({ title: "Error", description: "Failed to dispatch work order", variant: "destructive" });
      throw error;
    }

    const siteName = wo?.site?.name ?? "site";
    await supabase.from("notifications").insert({
      user_id: contractorProfileId,
      title: "New work order",
      message: `New work order: ${wo.title} at ${siteName}`,
      type: "work_order_dispatched",
      reference_type: "work_order",
      reference_id: workOrderId,
    });

    toast({ title: "Work order dispatched" });
  };

  // Accept and decline are single SECURITY DEFINER calls. The server locks the
  // work order, checks it is still awaiting this contractor's response, and does
  // the job creation / status change / business notification in one transaction,
  // so a failure leaves nothing half-done and a second call raises instead of
  // minting a second job. (Contractors cannot write work_orders.status directly;
  // work_orders_update only lets them update a row that stays 'dispatched'.)
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

  const reassignWorkOrder = async (workOrderId: string, newContractorId: string, newEngagementId: string) => {
    // status = 'reassigned' then 'dispatched', per the brief — two explicit
    // transitions rather than jumping straight to 'dispatched'.
    await supabase
      .from("work_orders")
      .update({ status: "reassigned", response: null })
      .eq("id", workOrderId);

    await dispatchWorkOrder(workOrderId, newContractorId, newEngagementId);
  };

  const cancelWorkOrder = async (workOrderId: string, reason?: string) => {
    // No dedicated cancel-reason column on work_orders — decline_reason is
    // reused as the general "why this stopped" field since it's the only
    // free-text status-reason column the schema provides.
    const { error } = await supabase
      .from("work_orders")
      .update({ status: "cancelled", decline_reason: reason ?? null })
      .eq("id", workOrderId);
    if (error) {
      toast({ title: "Error", description: "Failed to cancel work order", variant: "destructive" });
      throw error;
    }
    toast({ title: "Work order cancelled" });
  };

  return {
    workOrders,
    loading,
    fetchWorkOrders,
    fetchWorkOrder,
    fetchAvailableContractors,
    createWorkOrder,
    dispatchWorkOrder,
    respondToWorkOrder,
    reassignWorkOrder,
    cancelWorkOrder,
  };
}
