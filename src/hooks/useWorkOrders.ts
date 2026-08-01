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

const WORK_ORDER_SELECT = `
  *,
  site:sites(id, name),
  asset:assets(id, name),
  contractor:profiles!work_orders_dispatched_to_fkey(id, full_name, ts_profile_code)
`;

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
    let query = (supabase as any)
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
    const { data, error } = await (supabase as any)
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
    const { data: engagementRows, error } = await (supabase as any)
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
    const { data: inserted, error } = await (supabase as any)
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

  const snapshotRates = async (engagementId: string) => {
    const { data } = await supabase.rpc("effective_engagement_rates", { p_engagement_id: engagementId });
    return data ?? null;
  };

  const dispatchWorkOrder = async (workOrderId: string, contractorProfileId: string, engagementId: string) => {
    const rateSnapshot = await snapshotRates(engagementId);

    const { data: wo, error } = await (supabase as any)
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

    const siteName = (wo as any)?.site?.name ?? "site";
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

  const respondToWorkOrder = async (workOrderId: string, accept: boolean, declineReason?: string) => {
    const { data: wo, error: fetchErr } = await (supabase as any)
      .from("work_orders")
      .select("id, title, description, site_id, engagement_id, company_id, raised_by")
      .eq("id", workOrderId)
      .single();
    if (fetchErr || !wo) {
      toast({ title: "Error", description: "Work order not found", variant: "destructive" });
      throw fetchErr;
    }

    const { data: { user } } = await supabase.auth.getUser();
    const { data: contractorProfile } = user
      ? await supabase.from("profiles").select("full_name").eq("user_id", user.id).maybeSingle()
      : { data: null };
    const contractorName = contractorProfile?.full_name ?? "The contractor";

    if (accept) {
      const { data: jobId, error: calloutErr } = await supabase.rpc("raise_callout", {
        p_engagement_id: wo.engagement_id,
        p_title: wo.title,
        p_description: wo.description,
        p_site_id: wo.site_id,
      });
      if (calloutErr) {
        toast({ title: "Error", description: calloutErr.message || "Failed to create job", variant: "destructive" });
        throw calloutErr;
      }

      const { error } = await (supabase as any)
        .from("work_orders")
        .update({ response: "accepted", status: "accepted", responded_at: new Date().toISOString(), job_id: jobId })
        .eq("id", workOrderId);
      if (error) {
        toast({ title: "Error", description: "Failed to record acceptance", variant: "destructive" });
        throw error;
      }

      await supabase.from("notifications").insert({
        user_id: wo.raised_by,
        title: "Work order accepted",
        message: `Work order accepted by ${contractorName}`,
        type: "work_order_accepted",
        reference_type: "work_order",
        reference_id: workOrderId,
      });

      toast({ title: "Work order accepted", description: "Job created." });
      return jobId as string;
    }

    const { error } = await (supabase as any)
      .from("work_orders")
      .update({ response: "declined", status: "declined", responded_at: new Date().toISOString(), decline_reason: declineReason ?? null })
      .eq("id", workOrderId);
    if (error) {
      toast({ title: "Error", description: "Failed to record decline", variant: "destructive" });
      throw error;
    }

    await supabase.from("notifications").insert({
      user_id: wo.raised_by,
      title: "Work order declined",
      message: `${contractorName} declined — reason: ${declineReason || "not specified"}`,
      type: "work_order_declined",
      reference_type: "work_order",
      reference_id: workOrderId,
    });

    toast({ title: "Work order declined" });
    return null;
  };

  const reassignWorkOrder = async (workOrderId: string, newContractorId: string, newEngagementId: string) => {
    // status = 'reassigned' then 'dispatched', per the brief — two explicit
    // transitions rather than jumping straight to 'dispatched'.
    await (supabase as any)
      .from("work_orders")
      .update({ status: "reassigned", response: null })
      .eq("id", workOrderId);

    await dispatchWorkOrder(workOrderId, newContractorId, newEngagementId);
  };

  const cancelWorkOrder = async (workOrderId: string, reason?: string) => {
    // No dedicated cancel-reason column on work_orders — decline_reason is
    // reused as the general "why this stopped" field since it's the only
    // free-text status-reason column the schema provides.
    const { error } = await (supabase as any)
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
