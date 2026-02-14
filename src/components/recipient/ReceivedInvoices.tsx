import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileText, CreditCard, Pause, HelpCircle, Loader2 } from "lucide-react";
import { useReceivedInvoices, type ReceivedInvoice } from "@/hooks/useReceivedInvoices";
import { MessageDialog } from "./MessageDialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

export function ReceivedInvoices() {
  const { invoices, loading, respondToInvoice } = useReceivedInvoices();
  const [messageDialog, setMessageDialog] = useState<{ open: boolean; invoice: ReceivedInvoice | null }>({
    open: false, invoice: null,
  });
  const [payingId, setPayingId] = useState<string | null>(null);
  const { toast } = useToast();

  const handlePay = async (invoice: ReceivedInvoice) => {
    setPayingId(invoice.id);
    try {
      const { data, error } = await supabase.functions.invoke("create-invoice-payment", {
        body: { invoice_id: invoice.id },
      });

      if (error) throw error;
      if (data?.url) {
        window.open(data.url, "_blank");
      }

      // Also notify
      await supabase.functions.invoke("notify-invoice-quote-action", {
        body: { action_type: "pay", context_type: "invoice", context_id: invoice.id },
      }).catch(console.error);

      await respondToInvoice(invoice.id, "paid");
    } catch (error: any) {
      toast({ title: "Payment Error", description: error.message || "Failed to initiate payment", variant: "destructive" });
    } finally {
      setPayingId(null);
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
                    {!inv.recipient_response && (
                      <div className="flex justify-end gap-1">
                        <Button size="sm" onClick={() => handlePay(inv)} disabled={payingId === inv.id}>
                          {payingId === inv.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4 mr-1" />}
                          Pay
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleStall(inv)}>
                          <Pause className="h-4 w-4 mr-1" />Stall
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleQuery(inv)}>
                          <HelpCircle className="h-4 w-4 mr-1" />Query
                        </Button>
                      </div>
                    )}
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
