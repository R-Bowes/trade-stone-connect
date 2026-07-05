import { useState } from "react";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useInvoices } from "@/hooks/useInvoices";
import { useSubmitGuard } from "@/hooks/useSubmitGuard";
import { formatInvoiceRef } from "@/lib/documentRefs";
import { InvoiceFormDialog, type InvoiceFormInitialData } from "@/components/management/invoices/InvoiceFormDialog";

export interface ThreadJobForInvoice {
  id: string;
  title: string;
  contract_value: number | null;
  contractor_id: string;
  customer_id: string;
  issued_quote_id: string | null;
}

export interface ThreadInvoice {
  id: string;
  invoice_number: number;
  status: string;
  total: number;
  due_date: string;
  sent_at: string | null;
  paid_date: string | null;
}

interface QuoteContact {
  client_name: string;
  client_email: string;
  client_phone: string | null;
  client_address: string | null;
}

function fmtMoney(n: number): string {
  return `£${Number(n).toLocaleString("en-GB")}`;
}

/** State + Create/Send actions, per the pipeline's invoice-stage rules (draft -> send, sent/overdue -> awaiting payment). */
export function ThreadInvoiceSection({
  job,
  invoice,
  quoteContact,
  onChanged,
}: {
  job: ThreadJobForInvoice;
  invoice: ThreadInvoice | null;
  quoteContact: QuoteContact | null;
  onChanged: () => void;
}) {
  const { createInvoice, markAsSent } = useInvoices();
  const { pending: sendPending, guard: guardSend } = useSubmitGuard();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [initialData, setInitialData] = useState<InvoiceFormInitialData | null>(null);

  const openCreate = () => {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 14);
    setInitialData({
      client_name: quoteContact?.client_name || "",
      client_email: quoteContact?.client_email || "",
      client_phone: quoteContact?.client_phone || "",
      client_address: quoteContact?.client_address || "",
      notes: `Generated from completed job: ${job.title}`,
      items: [{ description: job.title, quantity: 1, unit_price: job.contract_value ?? 0, total: job.contract_value ?? 0 }],
      defaultDueDate: dueDate.toISOString().slice(0, 10),
      contractorId: job.contractor_id,
      clientId: job.customer_id,
      quoteId: job.issued_quote_id,
    });
    setDialogOpen(true);
  };

  const handleSend = guardSend(async () => {
    if (!invoice) return;
    await markAsSent(invoice.id);
    onChanged();
  });

  return (
    <>
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Invoice</h3>

        {!invoice ? (
          <div className="flex items-center justify-between rounded-lg border p-3">
            <p className="text-sm text-muted-foreground">Job complete and signed off — ready to invoice.</p>
            <Button size="sm" onClick={openCreate}>Create invoice</Button>
          </div>
        ) : (
          <div className="rounded-lg border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-sm">{formatInvoiceRef(invoice.invoice_number)}</span>
              <Badge className="capitalize">{invoice.status}</Badge>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="font-mono">{fmtMoney(invoice.total)}</span>
              <span className="text-muted-foreground">Due {format(new Date(invoice.due_date), "d MMM yyyy")}</span>
            </div>
            {invoice.status === "draft" && (
              <div className="flex justify-end">
                <Button size="sm" disabled={sendPending} onClick={handleSend}>
                  {sendPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}Send invoice
                </Button>
              </div>
            )}
            {(invoice.status === "sent" || invoice.status === "overdue") && (
              <p className={`text-xs ${invoice.status === "overdue" ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                Awaiting payment
              </p>
            )}
          </div>
        )}
      </div>

      <InvoiceFormDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setInitialData(null); }}
        initialData={initialData}
        onSave={async (data) => {
          await createInvoice({ ...data, job_id: job.id });
          setDialogOpen(false);
          setInitialData(null);
          onChanged();
        }}
      />
    </>
  );
}
