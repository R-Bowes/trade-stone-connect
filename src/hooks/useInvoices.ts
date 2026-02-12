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

    const { data, error } = await supabase
      .from("invoices")
      .select("*")
      .eq("contractor_id", user.id)
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

  const createInvoice = async (invoice: Omit<InvoiceInsert, "contractor_id">) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from("invoices").insert({
      ...invoice,
      contractor_id: user.id,
    });

    if (error) {
      toast({ title: "Error", description: "Failed to create invoice", variant: "destructive" });
      throw error;
    }

    toast({ title: "Invoice Created", description: "Your invoice has been created successfully." });
    fetchInvoices();
  };

  const updateInvoice = async (id: string, updates: Partial<InvoiceInsert>) => {
    const { error } = await supabase.from("invoices").update(updates).eq("id", id);

    if (error) {
      toast({ title: "Error", description: "Failed to update invoice", variant: "destructive" });
      throw error;
    }

    toast({ title: "Invoice Updated", description: "Invoice has been updated." });
    fetchInvoices();
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
    await updateInvoice(id, { status: "sent" });
  };

  // Stats
  const totalRevenue = invoices
    .filter(i => i.status === "paid")
    .reduce((sum, i) => sum + Number(i.total), 0);

  const totalPending = invoices
    .filter(i => i.status === "sent" || i.status === "draft")
    .reduce((sum, i) => sum + Number(i.total), 0);

  const totalOverdue = invoices
    .filter(i => {
      if (i.status === "paid") return false;
      return new Date(i.due_date) < new Date();
    })
    .reduce((sum, i) => sum + Number(i.total), 0);

  return {
    invoices,
    loading,
    createInvoice,
    updateInvoice,
    deleteInvoice,
    markAsPaid,
    markAsSent,
    totalRevenue,
    totalPending,
    totalOverdue,
    refetch: fetchInvoices,
  };
}
