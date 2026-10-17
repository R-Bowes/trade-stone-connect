import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useToast } from "@/hooks/use-toast";

export type PoRequest = Database["public"]["Tables"]["work_order_po_requests"]["Row"];

// All writes go through SECURITY DEFINER RPCs (20261017120000) —
// work_order_po_requests is SELECT-only for authenticated. A contractor reads
// their own requests; a business member reads those on work orders at sites
// they cover (the owner reads all).
export function useWorkOrderPoRequests() {
  const [requestsByWorkOrder, setRequestsByWorkOrder] = useState<Record<string, PoRequest[]>>({});
  const { toast } = useToast();

  const loadRequests = useCallback(async (workOrderIds: string[]) => {
    if (workOrderIds.length === 0) {
      setRequestsByWorkOrder({});
      return;
    }
    const { data, error } = await supabase
      .from("work_order_po_requests")
      .select("*")
      .in("work_order_id", workOrderIds)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("Error loading PO increase requests:", error);
      return;
    }
    const map: Record<string, PoRequest[]> = {};
    for (const id of workOrderIds) map[id] = [];
    for (const r of data ?? []) (map[r.work_order_id] ??= []).push(r);
    setRequestsByWorkOrder(map);
  }, []);

  const fail = (title: string, error: { message?: string } | null) =>
    toast({ title, description: error?.message ?? "Please try again.", variant: "destructive" });

  const requestIncrease = async (workOrderId: string, amount: number, reason: string, photos: string[]): Promise<boolean> => {
    const { error } = await supabase.rpc("request_po_increase", {
      p_work_order_id: workOrderId,
      p_amount: amount,
      p_reason: reason,
      p_photos: photos,
    });
    if (error) { fail("Could not send the request", error); return false; }
    toast({ title: "PO increase requested" });
    return true;
  };

  const approveRequest = async (requestId: string): Promise<boolean> => {
    const { error } = await supabase.rpc("approve_po_increase", { p_request_id: requestId });
    if (error) { fail("Could not approve the increase", error); return false; }
    toast({ title: "PO increased" });
    return true;
  };

  const declineRequest = async (requestId: string, reason: string): Promise<boolean> => {
    const { error } = await supabase.rpc("decline_po_increase", { p_request_id: requestId, p_reason: reason });
    if (error) { fail("Could not decline the increase", error); return false; }
    toast({ title: "PO increase declined" });
    return true;
  };

  const withdrawRequest = async (requestId: string): Promise<boolean> => {
    const { error } = await supabase.rpc("withdraw_po_increase", { p_request_id: requestId });
    if (error) { fail("Could not withdraw the request", error); return false; }
    toast({ title: "Request withdrawn" });
    return true;
  };

  return { requestsByWorkOrder, loadRequests, requestIncrease, approveRequest, declineRequest, withdrawRequest };
}
