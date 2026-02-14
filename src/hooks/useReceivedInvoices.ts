import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface ReceivedInvoice {
  id: string;
  invoice_number: string | null;
  client_name: string;
  client_email: string;
  contractor_id: string;
  recipient_id: string | null;
  recipient_response: string | null;
  responded_at: string | null;
  items: any;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  status: string;
  issued_date: string;
  due_date: string;
  paid_date: string | null;
  notes: string | null;
  created_at: string;
}

export function useReceivedInvoices() {
  const [invoices, setInvoices] = useState<ReceivedInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchInvoices = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("invoices")
      .select("*")
      .eq("recipient_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching received invoices:", error);
    } else {
      setInvoices((data || []) as unknown as ReceivedInvoice[]);
    }
    setLoading(false);
  }, []);

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
