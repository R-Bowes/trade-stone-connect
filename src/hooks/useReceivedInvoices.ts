import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";

// The full Row, not a hand-picked subset — generateInvoicePdf expects the
// real invoices shape (client_phone, client_address, etc.), and building a
// narrower interface here is what forced the `as any` this replaces.
export type ReceivedInvoice = Database["public"]["Tables"]["invoices"]["Row"] & {
  contractor_name: string;
  contractor_code: string | null;
};

export function useReceivedInvoices() {
  const [invoices, setInvoices] = useState<ReceivedInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchInvoices = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .eq("recipient_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching received invoices:", error);
        toast({ title: "Error", description: "Failed to load invoices", variant: "destructive" });
        return;
      }

      const rows = data ?? [];

      const contractorIds = [...new Set(rows.map((r) => r.contractor_id).filter((id): id is string => !!id))];
      const { data: contractorRows } = contractorIds.length > 0
        ? await supabase.from("profiles").select("id, full_name, company_name, ts_profile_code").in("id", contractorIds)
        : { data: [] as { id: string; full_name: string | null; company_name: string | null; ts_profile_code: string | null }[] };
      const contractorMap = new Map((contractorRows ?? []).map((c) => [c.id, c]));

      setInvoices(rows.map((r) => {
        const contractor = contractorMap.get(r.contractor_id);
        return {
          ...r,
          contractor_name: contractor?.company_name || contractor?.full_name || "Unknown",
          contractor_code: contractor?.ts_profile_code ?? null,
        };
      }));
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const respondToInvoice = async (invoiceId: string, response: "paid" | "stalled" | "queried") => {
    const { error } = await supabase
      .from("invoices")
      .update({
        recipient_response: response,
        responded_at: new Date().toISOString(),
      })
      .eq("id", invoiceId);

    if (error) {
      toast({ title: "Error", description: "Failed to respond to invoice", variant: "destructive" });
      throw error;
    }

    toast({ title: "Response Sent", description: `Invoice marked as ${response}.` });
    fetchInvoices();
    return invoiceId;
  };

  return { invoices, loading, respondToInvoice, refetch: fetchInvoices };
}
