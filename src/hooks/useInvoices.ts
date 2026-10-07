import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";
import { summariseInvoices } from "@/lib/invoiceMoney";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";

export type Invoice = Database["public"]["Tables"]["invoices"]["Row"];
export type InvoiceInsert = Database["public"]["Tables"]["invoices"]["Insert"];

export type InvoiceItem = {
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
};

export type ManualPaymentMethod = "bank_transfer" | "cash" | "cheque" | "other";

// Invoice invariants (CLAUDE.md): a client writes content columns only.
// Status, payment, deposit and Stripe columns are server-owned and are
// rejected by the column grants, so payloads are built from these lists,
// never by spreading form data.
const INSERT_COLUMNS = [
  "recipient_id", "quote_id", "job_id",
  "client_name", "client_email", "client_phone", "client_address",
  "due_date", "items", "subtotal", "tax_rate", "tax_amount", "total", "notes",
] as const;

const UPDATE_COLUMNS = [
  "client_name", "client_email", "client_phone", "client_address",
  "due_date", "items", "subtotal", "tax_rate", "tax_amount", "total", "notes",
] as const;

function pickColumns(source: Record<string, unknown>, columns: readonly string[]) {
  const out: Record<string, unknown> = {};
  for (const column of columns) {
    if (source[column] !== undefined) out[column] = source[column];
  }
  return out;
}

// Resolves a client email to their profile id: email -> TS code through
// lookup_ts_codes_by_email (profiles.email is not client-readable), then
// TS code -> profiles.id. Returns null when there is no single match, so the
// invoice simply stays unlinked rather than being sent to the wrong person.
async function resolveRecipientId(email: string | null | undefined): Promise<string | null> {
  const trimmed = email?.trim();
  if (!trimmed) return null;

  const { data: codes, error: codeError } = await supabase.rpc("lookup_ts_codes_by_email", { p_emails: [trimmed] });
  if (codeError) {
    console.error("lookup_ts_codes_by_email failed:", codeError);
    return null;
  }
  const tsCodes = [...new Set((codes ?? []).map((row) => row.ts_profile_code).filter(Boolean))];
  if (tsCodes.length !== 1) return null;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id")
    .eq("ts_profile_code", tsCodes[0])
    .maybeSingle();
  if (profileError) {
    console.error("Recipient profile lookup failed:", profileError);
    return null;
  }
  return profile?.id ?? null;
}

/** Form data for an invoice. `status: "sent"` means "send it once saved". */
export type InvoiceFormData = Partial<InvoiceInsert> & { status?: string };

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

  const createInvoice = async (invoice: InvoiceFormData) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profileRow } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    // Every invoice is created as a draft (the column default); "send" is a
    // separate server step through create-payment-intent.
    const sendNow = invoice.status === "sent";

    // The job-based paths pass recipient_id (clientId). The blank Create
    // Invoice form does not, and without it the invoice never reaches the
    // client's Received Invoices list, so link it by email when the client
    // is on TradeStone. No match leaves it NULL (an off-platform client).
    const recipientId = invoice.recipient_id ?? await resolveRecipientId(invoice.client_email);

    const { data, error } = await supabase
      .from("invoices")
      .insert({
        ...pickColumns(invoice, INSERT_COLUMNS),
        recipient_id: recipientId,
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
      toast({ title: "Invoice Sent", description: "Invoice sent. The client can open it in their TradeStone dashboard and pay it there." });
    } else {
      toast({ title: "Invoice Created", description: "Your invoice has been created successfully." });
      await fetchInvoices();
    }
  };

  // Drafts only: the database refuses changes to a sent invoice, which is
  // corrected by voiding it and issuing a new one.
  const updateInvoice = async (id: string, updates: InvoiceFormData) => {
    const sendNow = updates.status === "sent";

    const { error } = await supabase
      .from("invoices")
      .update(pickColumns(updates, UPDATE_COLUMNS))
      .eq("id", id);

    if (error) {
      toast({ title: "Error", description: "Failed to update invoice", variant: "destructive" });
      throw error;
    }

    if (sendNow) {
      await sendInvoice(id);
      toast({ title: "Invoice Sent", description: "Invoice sent. The client can open it in their TradeStone dashboard and pay it there." });
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

  // Records a payment that happened outside the platform (BACS, cash,
  // cheque) through record_manual_payment: one payments row for whatever is
  // still payable, and the invoice marked paid, in one server transaction.
  // The server works out the amount; nothing here sets it.
  const recordManualPayment = async (invoice: Invoice, notes: string) => {
    const { error } = await supabase.rpc("record_manual_payment", {
      p_invoice_id: invoice.id,
      p_notes: notes,
    });

    if (error) {
      toast({ title: "Payment not recorded", description: error.message, variant: "destructive" });
      throw error;
    }

    toast({ title: "Payment recorded", description: "The invoice has been marked as paid." });
    await fetchInvoices();
  };

  // Voids an unpaid sent invoice through the void-invoice edge function,
  // which cancels any open card payment first.
  const voidInvoice = async (invoice: Invoice, reason: string) => {
    try {
      await invokeEdgeFunction("void-invoice", { body: { invoiceId: invoice.id, reason } });
    } catch (error) {
      toast({
        title: "Invoice not voided",
        description: error instanceof Error ? error.message : "Could not void this invoice.",
        variant: "destructive",
      });
      throw error;
    }

    toast({ title: "Invoice voided", description: "Create a new invoice to replace it." });
    await fetchInvoices();
  };

  const markAsSent = async (id: string) => {
    await sendInvoice(id);
    toast({ title: "Invoice Sent", description: "Invoice sent. The client can open it in their TradeStone dashboard and pay it there." });
  };

  const { outstanding, outstandingCount, overdue, overdueCount, paid } = summariseInvoices(invoices);

  return {
    invoices,
    loading,
    createInvoice,
    updateInvoice,
    deleteInvoice,
    markAsSent,
    recordManualPayment,
    voidInvoice,
    sendInvoice,
    paid,
    outstanding,
    outstandingCount,
    overdue,
    overdueCount,
    refetch: fetchInvoices,
  };
}
