import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";
import { isOverdue } from "@/lib/invoiceMoney";

export type Invoice = Database["public"]["Tables"]["invoices"]["Row"];
export type InvoiceInsert = Database["public"]["Tables"]["invoices"]["Insert"];

export type InvoiceItem = {
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
};

export type ManualPaymentMethod = "bank_transfer" | "cash" | "cheque" | "other";

export function useInvoices() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchInvoices = useCallback(async () => {
    try {
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
        toast({ title: "Error", description: "Failed to load invoices", variant: "destructive" });
      } else {
        setInvoices(data || []);
      }
    } finally {
      setLoading(false);
    }
  }, [toast]);

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

  const createInvoice = async (invoice: Omit<InvoiceInsert, "contractor_id" | "invoice_number"> & { contractor_id?: string; quote_id?: string | null }) => {
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
      } as InvoiceInsert)
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

  const MANUAL_PAYMENT_METHOD_LABELS: Record<ManualPaymentMethod, string> = {
    bank_transfer: "Bank Transfer (BACS)",
    cash: "Cash",
    cheque: "Cheque",
    other: "Other",
  };

  // Records a payment that happened outside the platform (BACS/cash/cheque).
  // Does not touch Stripe-paid invoices or the stripe-webhook flow at all —
  // this is purely an additional manual path.
  const recordManualPayment = async (
    invoice: Invoice,
    payment: { paymentDate: string; amount: number; method: ManualPaymentMethod; reference: string },
  ) => {
    if (payment.amount !== Number(invoice.total)) {
      toast({ title: "Error", description: "Partial payments are not yet supported", variant: "destructive" });
      throw new Error("Partial payments are not yet supported");
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profileRow } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!profileRow) return;

    const notes = payment.reference
      ? `${MANUAL_PAYMENT_METHOD_LABELS[payment.method]} — Ref: ${payment.reference}`
      : MANUAL_PAYMENT_METHOD_LABELS[payment.method];

    const { error: paymentError } = await supabase.from("payments").insert({
      invoice_id: invoice.id,
      amount: payment.amount,
      payer_id: invoice.recipient_id,
      payee_id: profileRow.id,
      status: "completed",
      type: "manual",
      platform_fee: 0,
      contractor_payout: payment.amount,
      stripe_payment_intent_id: null,
      notes,
    });

    if (paymentError) {
      toast({ title: "Error", description: "Failed to record payment", variant: "destructive" });
      throw paymentError;
    }

    const { error: invoiceError } = await supabase
      .from("invoices")
      .update({
        status: "paid",
        paid_date: payment.paymentDate,
        recipient_response: "paid",
        amount_due: 0,
      })
      .eq("id", invoice.id);

    if (invoiceError) {
      toast({ title: "Error", description: "Payment recorded, but failed to update the invoice", variant: "destructive" });
      throw invoiceError;
    }

    toast({ title: "Payment recorded", description: "The invoice has been marked as paid." });
    await fetchInvoices();
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
    .filter(i => isOverdue(i))
    .reduce((sum, i) => sum + Number(i.total), 0);

  return {
    invoices,
    loading,
    createInvoice,
    updateInvoice,
    deleteInvoice,
    markAsPaid,
    markAsSent,
    recordManualPayment,
    sendInvoice,
    totalRevenue,
    totalPending,
    totalOverdue,
    refetch: fetchInvoices,
  };
}
