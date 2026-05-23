import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileText, Pause, HelpCircle, Loader2, Download } from "lucide-react";
import { useReceivedInvoices, type ReceivedInvoice } from "@/hooks/useReceivedInvoices";
import { MessageDialog } from "./MessageDialog";
import { PayInvoiceButton } from "@/components/recipient/PayInvoiceButton";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { TransactionFeeNotice } from "@/components/TransactionFeeNotice";
import { generateInvoicePdf, type ContractorProfile } from "@/lib/generateInvoicePdf";

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
  }, []);

  const handleDownload = async (inv: ReceivedInvoice) => {
    setDownloading(inv.id);
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, company_name, email, phone, address, ts_profile_code, logo_url")
        .eq("id", inv.contractor_id)
        .single();

      let contractor: ContractorProfile & { _logoBase64?: string } = {
        full_name: profile?.full_name ?? null,
        company_name: profile?.company_name ?? null,
        email: profile?.email ?? null,
        phone: profile?.phone ?? null,
        address: profile?.address ?? null,
        ts_profile_code: profile?.ts_profile_code ?? null,
        logo_url: profile?.logo_url ?? null,
      };

      if (profile?.logo_url) {
        try {
          const response = await fetch(profile.logo_url);
          const blob = await response.blob();
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve((reader.result as string).split(",")[1]);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
          (contractor as any)._logoBase64 = base64;
        } catch {
          // logo fetch failed — continue without it
        }
      }

      const invoiceForPdf = {
        ...inv,
        issued_date: inv.issued_date ?? inv.created_at,
        client_phone: null,
        client_address: null,
      } as any;

      generateInvoicePdf(invoiceForPdf, contractor);
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

  const getResponseBadge = (invoice: ReceivedInvoice) => {
    if (invoice.recipient_response === "paid") return <Badge className="bg-green-100 text-green-800">Paid</Badge>;
    if (invoice.recipient_response === "stalled") return <Badge className="bg-yellow-100 text-yellow-800">Stalled</Badge>;
    if (invoice.recipient_response === "queried") return <Badge className="bg-orange-100 text-orange-800">Queried</Badge>;
    return <Badge variant="outline">Pending</Badge>;
  };

  if (loading) {
    return <div className="flex justify-center items-center h-32"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  if (invoices.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No Invoices Received</h3>
          <p className="text-muted-foreground">When contractors send you invoices, they'll appear here.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Received Invoices</h2>
      <TransactionFeeNotice />
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>From</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-medium">{inv.invoice_number || "—"}</TableCell>
                  <TableCell>{inv.client_name}</TableCell>
                  <TableCell>{format(new Date(inv.due_date), "dd MMM yyyy")}</TableCell>
                  <TableCell className="text-right font-bold">£{Number(inv.total).toFixed(2)}</TableCell>
                  <TableCell>{getResponseBadge(inv)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {inv.recipient_response === "paid" ? (
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
                            amount={Number(inv.total)}
                            status={inv.recipient_response || "pending"}
                            onPaymentComplete={() => refetch()}
                          />
                          <Button size="sm" variant="outline" onClick={() => handleStall(inv)}>
                            <Pause className="h-4 w-4 mr-1" />Stall
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleQuery(inv)}>
                            <HelpCircle className="h-4 w-4 mr-1" />Query
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {messageDialog.invoice && (
        <MessageDialog
          open={messageDialog.open}
          onClose={() => setMessageDialog({ open: false, invoice: null })}
          contractorId={messageDialog.invoice.contractor_id}
          subject={`Invoice ${messageDialog.invoice.invoice_number || messageDialog.invoice.id} - ${messageDialog.invoice.recipient_response === "stalled" ? "Stalled" : "Query"}`}
          contextType="invoice"
          contextId={messageDialog.invoice.id}
        />
      )}
    </div>
  );
}