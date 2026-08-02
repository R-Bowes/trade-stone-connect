import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { WorkOrderPriority } from "@/hooks/useWorkOrders";

export type ServiceRequestStatus = "open" | "triaged" | "dispatched" | "cancelled" | "completed";

export interface ServiceRequest {
  id: string;
  company_id: string;
  site_id: string;
  requested_by: string;
  requested_by_name: string | null;
  requested_by_role: string | null;
  category_id: string | null;
  title: string;
  description: string | null;
  priority: WorkOrderPriority;
  location_in_site: string | null;
  photos: string[];
  status: ServiceRequestStatus;
  triaged_by: string | null;
  triaged_at: string | null;
  triage_notes: string | null;
  work_order_id: string | null;
  created_at: string;
  updated_at: string;
  site?: { id: string; name: string } | null;
  category?: { id: string; name: string; trade: string | null } | null;
  work_order?: { id: string; wo_number: number; status: string } | null;
}

export interface ServiceRequestFilters {
  siteId?: string;
  categoryId?: string;
  priority?: WorkOrderPriority;
  status?: ServiceRequestStatus;
}

export interface ServiceRequestInsert {
  company_id: string;
  site_id: string;
  requested_by: string;
  requested_by_name?: string | null;
  requested_by_role?: string | null;
  category_id?: string | null;
  title: string;
  description?: string | null;
  priority: WorkOrderPriority;
  location_in_site?: string | null;
  photos?: string[];
}

const REQUEST_SELECT = `
  *,
  site:sites(id, name),
  category:service_request_categories(id, name, trade),
  work_order:work_orders(id, wo_number, status)
`;

export function useServiceRequests() {
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const fetchRequests = useCallback(async (companyId: string, filters?: ServiceRequestFilters) => {
    setLoading(true);
    let query = (supabase as any)
      .from("service_requests")
      .select(REQUEST_SELECT)
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    if (filters?.siteId) query = query.eq("site_id", filters.siteId);
    if (filters?.categoryId) query = query.eq("category_id", filters.categoryId);
    if (filters?.priority) query = query.eq("priority", filters.priority);
    if (filters?.status) query = query.eq("status", filters.status);

    const { data, error } = await query;
    if (error) {
      console.error("Error fetching service requests:", error);
      setLoading(false);
      return [];
    }
    const rows = (data ?? []) as ServiceRequest[];
    setRequests(rows);
    setLoading(false);
    return rows;
  }, []);

  // Site contacts: their own submitted requests, RLS-scoped via
  // requested_by = auth.uid() (see Slice B's service_requests_select policy,
  // unchanged from Slice A).
  const fetchMyRequests = useCallback(async (): Promise<ServiceRequest[]> => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return []; }

    const { data, error } = await (supabase as any)
      .from("service_requests")
      .select(REQUEST_SELECT)
      .eq("requested_by", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching my service requests:", error);
      setLoading(false);
      return [];
    }
    const rows = (data ?? []) as ServiceRequest[];
    setRequests(rows);
    setLoading(false);
    return rows;
  }, []);

  const createRequest = async (data: ServiceRequestInsert): Promise<ServiceRequest | null> => {
    const { data: inserted, error } = await (supabase as any)
      .from("service_requests")
      .insert({ ...data, status: "open" })
      .select(REQUEST_SELECT)
      .single();

    if (error) {
      toast({ title: "Error", description: "Failed to submit request", variant: "destructive" });
      throw error;
    }
    // The auto-dispatch trigger may have already flipped this row to
    // 'dispatched' with a work_order_id set before the INSERT even returns.
    toast({
      title: (inserted as ServiceRequest).status === "dispatched" ? "Request submitted — auto-dispatched" : "Request submitted",
    });
    return inserted as ServiceRequest;
  };

  // Acknowledge without dispatching yet.
  const triageRequest = async (id: string, triageData: { triage_notes?: string; priority?: WorkOrderPriority; category_id?: string }) => {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await (supabase as any)
      .from("service_requests")
      .update({
        ...triageData,
        status: "triaged",
        triaged_by: user?.id ?? null,
        triaged_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select(REQUEST_SELECT)
      .single();

    if (error) {
      toast({ title: "Error", description: "Failed to triage request", variant: "destructive" });
      throw error;
    }
    setRequests((cur) => cur.map((r) => (r.id === id ? (data as ServiceRequest) : r)));
    return data as ServiceRequest;
  };

  // Links a freshly created work order back to the request and marks it
  // dispatched — called by the FM triage view's "Create Work Order" action
  // after useWorkOrders().createWorkOrder()/dispatchWorkOrder() succeed.
  const linkWorkOrder = async (requestId: string, workOrderId: string) => {
    const { data, error } = await (supabase as any)
      .from("service_requests")
      .update({ work_order_id: workOrderId, status: "dispatched" })
      .eq("id", requestId)
      .select(REQUEST_SELECT)
      .single();

    if (error) {
      toast({ title: "Error", description: "Failed to link work order to request", variant: "destructive" });
      throw error;
    }
    setRequests((cur) => cur.map((r) => (r.id === requestId ? (data as ServiceRequest) : r)));
    return data as ServiceRequest;
  };

  const cancelRequest = async (id: string, reason?: string) => {
    // No dedicated cancel-reason column — triage_notes is the only
    // free-text status-reason field the schema provides, same reuse
    // pattern as work_orders.decline_reason for cancellation in Slice A.
    const { error } = await (supabase as any)
      .from("service_requests")
      .update({ status: "cancelled", triage_notes: reason ?? null })
      .eq("id", id);

    if (error) {
      toast({ title: "Error", description: "Failed to cancel request", variant: "destructive" });
      throw error;
    }
    setRequests((cur) => cur.map((r) => (r.id === id ? { ...r, status: "cancelled" as ServiceRequestStatus, triage_notes: reason ?? null } : r)));
    toast({ title: "Request cancelled" });
  };

  return {
    requests,
    loading,
    fetchRequests,
    fetchMyRequests,
    createRequest,
    triageRequest,
    linkWorkOrder,
    cancelRequest,
  };
}
