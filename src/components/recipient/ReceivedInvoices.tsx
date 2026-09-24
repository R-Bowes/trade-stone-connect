import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { FileText, Pause, HelpCircle, Loader2, Download } from "lucide-react";
import { useReceivedInvoices, type ReceivedInvoice } from "@/hooks/useReceivedInvoices";
import { MessageDialog } from "./MessageDialog";
import { PayInvoiceButton } from "@/components/recipient/PayInvoiceButton";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { TransactionFeeNotice } from "@/components/TransactionFeeNotice";
import { generateInvoicePdf, fetchContractorProfileForPdf } from "@/lib/generateInvoicePdf";
import { formatInvoiceRef } from "@/lib/documentRefs";
import { InvoiceCard } from "@/components/shared/InvoiceCard";
import { EmptyState } from "@/components/shared/EmptyState";

const RESPONSE_BADGE: Record<string, { label: string; className: string }> = {
  paid: { label: "Paid", className: "bg-green-100 text-green-800 border-green-200" },
  stalled: { label: "Stalled", className: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  queried: { label: "Queried", className: "bg-orange-100 text-orange-800 border-orange-200" },
};

export function ReceivedInvoices() {
  const { invoices, loading, respondToInvoice, refetch } = useReceivedInvoices();
  const [messageDialog, setMessageDialog] = useState<{ open: boolean; invoice: ReceivedInvoice | null }>({
    open: false, invoice: null,
  });
  const [downloading, setDownloading] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const payment = params.get("payment");
    if (payment === "success") {
      toast({
        title: "Payment successful",
        description: "Your payment has been received. The invoice will update shortly.",
      });
      window.history.replaceState({}, "", window.location.pathname);
      const timer = setTimeout(() => refetch(), 3000);
      return () => clearTimeout(timer);
    }
    if (payment === "cancelled") {
      toast({
        title: "Payment cancelled",
        description: "Your payment was not completed.",
        variant: "destructive",
      });
      window.history.replaceState({}, "", window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDownload = async (inv: ReceivedInvoice) => {
    setDownloading(inv.id);
    try {
      const contractor = await fetchContractorProfileForPdf();
      generateInvoicePdf(inv, contractor, inv.contractor_code);
    } catch (err) {
      toast({
        title: "Download failed",
        description: "Could not generate the invoice PDF. Please try again.",
        variant: "destructive",
      });
    } finally {
      setDownloading(null);
    }
  };

  const handleStall = async (invoice: ReceivedInvoice) => {
    await respondToInvoice(invoice.id, "stalled");
    await supabase.functions.invoke("notify-invoice-quote-action", {
      body: { action_type: "stall", context_type: "invoice", context_id: invoice.id },
    }).catch(console.error);
    setMessageDialog({ open: true, invoice });
  };

  const handleQuery = async (invoice: ReceivedInvoice) => {
    await respondToInvoice(invoice.id, "queried");
    await supabase.functions.invoke("notify-invoice-quote-action", {
      body: { action_type: "query", context_type: "invoice", context_id: invoice.id },
    }).catch(console.error);
    setMessageDialog({ open: true, invoice });
  };

  const renderActions = (inv: ReceivedInvoice) =>
    inv.recipient_response === "paid" ? (
      <Button
        size="sm"
        variant="outline"
        onClick={() => handleDownload(inv)}
        disabled={downloading === inv.id}
      >
        {downloading === inv.id
          ? <Loader2 className="h-4 w-4 animate-spin" />
          : <Download className="h-4 w-4 mr-1" />}
        Download
      </Button>
    ) : (
      <>
        <PayInvoiceButton
          invoiceId={inv.id}
          status={inv.recipient_response || "pending"}
        />
        <Button size="sm" variant="outline" onClick={() => handleStall(inv)}>
          <Pause className="h-4 w-4 mr-1" />Stall
        </Button>
        <Button size="sm" variant="outline" onClick={() => handleQuery(inv)}>
          <HelpCircle className="h-4 w-4 mr-1" />Query
        </Button>
      </>
    );

  if (loading) {
    return <div className="flex justify-center items-center h-32"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      <h2 className="font-heading text-2xl font-bold">Received Invoices</h2>
      <TransactionFeeNotice />

      {invoices.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-10 w-10" />}
          message="When contractors send you invoices, they'll appear here."
        />
      ) : (
        <div className="grid gap-3">
          {invoices.map((inv) => (
            <InvoiceCard
              key={inv.id}
              invoice={inv}
              viewer="customer"
              counterparty={inv.contractor_name}
              counterpartyCode={inv.contractor_code}
              contractorCode={inv.contractor_code}
              secondaryBadge={inv.recipient_response ? RESPONSE_BADGE[inv.recipient_response] ?? null : null}
              actions={renderActions(inv)}
            />
          ))}
        </div>
      )}

      {messageDialog.invoice && (
        <MessageDialog
          open={messageDialog.open}
          onClose={() => setMessageDialog({ open: false, invoice: null })}
          contractorId={messageDialog.invoice.contractor_id}
          subject={`${formatInvoiceRef(messageDialog.invoice.invoice_number, { contractorCode: messageDialog.invoice.contractor_code ?? undefined })} - ${messageDialog.invoice.recipient_response === "stalled" ? "Stalled" : "Query"}`}
          contextType="invoice"
          contextId={messageDialog.invoice.id}
        />
      )}
    </div>
  );
}
