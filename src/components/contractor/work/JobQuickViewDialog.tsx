import { useEffect, useState, useCallback } from "react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useSubmitGuard } from "@/hooks/useSubmitGuard";
import { useInvoices } from "@/hooks/useInvoices";
import { SlaStatusPill } from "@/components/SlaStatusPill";
import { formatInvoiceRef, formatJobRef } from "@/lib/documentRefs";
import { InvoiceFormDialog, type InvoiceFormInitialData } from "@/components/management/invoices/InvoiceFormDialog";

interface JobDetail {
  id: string;
  job_number: number;
  title: string;
  status: string;
  contract_value: number | null;
  start_date: string | null;
  end_date: string | null;
  contractor_id: string;
  customer_id: string;
  issued_quote_id: string | null;
  contractor_signed_off_at: string | null;
  sla_status: string | null;
  sla_completion_due: string | null;
}

interface QuoteContact {
  client_name: string;
  client_email: string;
  client_phone: string | null;
  client_address: string | null;
}

interface InvoiceSummary {
  id: string;
  invoice_number: number;
  status: string;
}

const JOB_STATUS_LABEL: Record<string, string> = {
  scheduled: "Scheduled",
  in_progress: "In progress",
  snagging: "Snagging",
  complete: "Complete",
};

function fmtMoney(n: number): string {
  return `£${Number(n).toLocaleString("en-GB")}`;
}

export function JobQuickViewDialog({
  jobId,
  open,
  onClose,
  onChanged,
}: {
  jobId: string | null;
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [job, setJob] = useState<JobDetail | null>(null);
  const [quoteContact, setQuoteContact] = useState<QuoteContact | null>(null);
  const [invoice, setInvoice] = useState<InvoiceSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false);
  const [invoiceInitialData, setInvoiceInitialData] = useState<InvoiceFormInitialData | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();
  const { createInvoice, markAsSent } = useInvoices();
  const { pending: signOffPending, guard: guardSignOff } = useSubmitGuard();
  const { pending: sendPending, guard: guardSend } = useSubmitGuard();

  const load = useCallback(async () => {
    if (!jobId) return;
    setLoading(true);
    const { data: jobRow } = await supabase
      .from("jobs")
      .select("id, job_number, title, status, contract_value, start_date, end_date, contractor_id, customer_id, issued_quote_id, contractor_signed_off_at, sla_status, sla_completion_due")
      .eq("id", jobId)
      .single();
    setJob((jobRow as JobDetail) ?? null);

    if (jobRow?.issued_quote_id) {
      const { data: quoteRow } = await supabase
        .from("issued_quotes")
        .select("client_name, client_email, client_phone, client_address")
        .eq("id", jobRow.issued_quote_id)
        .maybeSingle();
      setQuoteContact((quoteRow as QuoteContact) ?? null);
    } else {
      setQuoteContact(null);
    }

    const { data: invoiceRows } = await supabase
      .from("invoices")
      .select("id, invoice_number, status")
      .eq("job_id", jobId)
      .neq("status", "void")
      .order("created_at", { ascending: false })
      .limit(1);
    setInvoice((invoiceRows?.[0] as InvoiceSummary) ?? null);
    setLoading(false);
  }, [jobId]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const handleSignOff = guardSignOff(async () => {
    if (!job) return;
    const { data: contractorProfile } = await supabase
      .from("profiles")
      .select("full_name, company_name")
      .eq("id", job.contractor_id)
      .maybeSingle();
    const signOffName = contractorProfile?.company_name || contractorProfile?.full_name || "Contractor";

    const { error } = await supabase
      .from("jobs")
      .update({ contractor_signed_off_at: new Date().toISOString(), contractor_signed_off_name: signOffName })
      .eq("id", job.id);

    if (error) {
      toast({ title: "Error", description: "Failed to sign off job", variant: "destructive" });
      return;
    }
    toast({ title: "Signed off" });
    await load();
    onChanged();
  });

  const openCreateInvoice = () => {
    if (!job) return;
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 14);
    setInvoiceInitialData({
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
    setInvoiceDialogOpen(true);
  };

  const handleSendInvoice = guardSend(async () => {
    if (!invoice) return;
    await markAsSent(invoice.id);
    await load();
    onChanged();
  });

  const needsSignOff = job?.status === "complete" && !job.contractor_signed_off_at;
  const needsInvoice = job?.status === "complete" && !!job.contractor_signed_off_at && !invoice;

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          {loading || !job ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              <Loader2 className="h-5 w-5 animate-spin inline mr-2" />Loading…
            </p>
          ) : (
            <>
              <DialogHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-mono text-xs text-muted-foreground mb-1">{formatJobRef(job.job_number)}</p>
                    <DialogTitle className="text-lg leading-tight">{job.title}</DialogTitle>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <Badge>{JOB_STATUS_LABEL[job.status] ?? job.status}</Badge>
                    <SlaStatusPill status={job.sla_status} completionDue={job.sla_completion_due} />
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-4 mt-2 text-sm">
                {quoteContact?.client_name && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground w-20 shrink-0">Client</span>
                    <span className="font-medium">{quoteContact.client_name}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground w-20 shrink-0">Value</span>
                  <span className="font-mono">{job.contract_value ? fmtMoney(job.contract_value) : "TBC"}</span>
                </div>
                {job.start_date && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground w-20 shrink-0">Start</span>
                    <span>{format(new Date(job.start_date), "d MMM yyyy")}</span>
                  </div>
                )}
                {job.end_date && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground w-20 shrink-0">Deadline</span>
                    <span>{format(new Date(job.end_date), "d MMM yyyy")}</span>
                  </div>
                )}

                {invoice && (
                  <div className="rounded-lg border p-3 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">Invoice</p>
                      <p className="font-mono text-sm">{formatInvoiceRef(invoice.invoice_number)}</p>
                    </div>
                    <Badge className="capitalize">{invoice.status}</Badge>
                  </div>
                )}

                <div className="flex flex-wrap justify-end gap-2 pt-2 border-t">
                  {needsSignOff && (
                    <Button size="sm" disabled={signOffPending} onClick={handleSignOff}>
                      {signOffPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                      Sign off
                    </Button>
                  )}
                  {needsInvoice && (
                    <Button size="sm" onClick={openCreateInvoice}>Create invoice</Button>
                  )}
                  {invoice?.status === "draft" && (
                    <Button size="sm" disabled={sendPending} onClick={handleSendInvoice}>
                      {sendPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                      Send invoice
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { onClose(); navigate("/dashboard/contractor?view=jobs"); }}
                  >
                    Manage in Jobs
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <InvoiceFormDialog
        open={invoiceDialogOpen}
        onClose={() => { setInvoiceDialogOpen(false); setInvoiceInitialData(null); }}
        initialData={invoiceInitialData}
        onSave={async (data) => {
          if (!job) return;
          await createInvoice({ ...data, job_id: job.id });
          setInvoiceDialogOpen(false);
          setInvoiceInitialData(null);
          await load();
          onChanged();
        }}
      />
    </>
  );
}
