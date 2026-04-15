import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";

export type Invoice = Database["public"]["Tables"]["invoices"]["Row"];
export type InvoiceInsert = Database["public"]["Tables"]["invoices"]["Insert"];

export type InvoiceItem = {
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
};

export function useInvoices() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchInvoices = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profileRow } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    const { data, error } = await supabase
      .from("invoices")
      .select("*")
      .eq("contractor_id", profileRow?.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching invoices:", error);
    } else {
      setInvoices(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const sendInvoice = async (invoiceId: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    const response = await supabase.functions.invoke("create-payment-intent", {
      body: { action: "send_invoice", invoiceId },
      headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
    });

    if (response.error) {
      throw new Error(response.error.message || "Failed to send invoice");
    }

    await fetchInvoices();
  };

  const createInvoice = async (invoice: Omit<InvoiceInsert, "contractor_id"> & { contractor_id?: string; quote_id?: string | null }) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profileRow } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    const sendNow = invoice.status === "sent";

    const { data, error } = await supabase
      .from("invoices")
      .insert({
        ...invoice,
        status: sendNow ? "draft" : invoice.status,
        contractor_id: profileRow?.id,
      })
      .select("id")
      .single();

    if (error || !data) {
      toast({ title: "Error", description: "Failed to create invoice", variant: "destructive" });
      throw error;
    }

    if (sendNow) {
      await sendInvoice(data.id);
      toast({ title: "Invoice Sent", description: "Invoice sent and payment link emailed to client." });
    } else {
      toast({ title: "Invoice Created", description: "Your invoice has been created successfully." });
      await fetchInvoices();
    }
  };

  const updateInvoice = async (id: string, updates: Partial<InvoiceInsert>) => {
    const sendNow = updates.status === "sent";

    const { error } = await supabase
      .from("invoices")
      .update({
        ...updates,
        status: sendNow ? "draft" : updates.status,
      })
      .eq("id", id);

    if (error) {
      toast({ title: "Error", description: "Failed to update invoice", variant: "destructive" });
      throw error;
    }

    if (sendNow) {
      await sendInvoice(id);
      toast({ title: "Invoice Sent", description: "Invoice sent and payment link emailed to client." });
    } else {
      toast({ title: "Invoice Updated", description: "Invoice has been updated." });
      await fetchInvoices();
    }
  };

  const deleteInvoice = async (id: string) => {
    const { error } = await supabase.from("invoices").delete().eq("id", id);

    if (error) {
      toast({ title: "Error", description: "Failed to delete invoice", variant: "destructive" });
      throw error;
    }

    toast({ title: "Invoice Deleted", description: "Invoice has been removed." });
    fetchInvoices();
  };

  const markAsPaid = async (id: string) => {
    const today = new Date().toISOString().split("T")[0];
    await updateInvoice(id, { status: "paid", paid_date: today });
  };

  const markAsSent = async (id: string) => {
    await sendInvoice(id);
    toast({ title: "Invoice Sent", description: "Invoice sent and payment link emailed to client." });
  };

  const totalRevenue = invoices
    .filter(i => i.status === "paid")
    .reduce((sum, i) => sum + Number(i.total), 0);

  const totalPending = invoices
    .filter(i => i.status === "sent" || i.status === "draft")
    .reduce((sum, i) => sum + Number(i.total), 0);

  const totalOverdue = invoices
    .filter(i => i.status === "overdue")
    .reduce((sum, i) => sum + Number(i.total), 0);

  return {
    invoices,
    loading,
    createInvoice,
    updateInvoice,
    deleteInvoice,
    markAsPaid,
    markAsSent,
    sendInvoice,
    totalRevenue,
    totalPending,
    totalOverdue,
    refetch: fetchInvoices,
  };
}
