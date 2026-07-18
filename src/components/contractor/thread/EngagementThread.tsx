import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { PipelineEngagement } from "@/hooks/useContractorPipeline";
import { ThreadEnquirySection, type ThreadEnquiry } from "./ThreadEnquirySection";
import { ThreadConversationSection } from "./ThreadConversationSection";
import { ThreadWorknotesSection } from "./ThreadWorknotesSection";
import { ThreadQuoteSection, type ThreadQuote, type ThreadQuoteVersion } from "./ThreadQuoteSection";
import { ThreadSchedulingSection } from "./ThreadSchedulingSection";
import { ThreadJobSection, type ThreadJob } from "./ThreadJobSection";
import { ThreadInvoiceSection, type ThreadInvoice } from "./ThreadInvoiceSection";

interface EngagementDetail {
  enquiry: ThreadEnquiry | null;
  quote: (ThreadQuote & { enquiry_id: string | null }) | null;
  quoteVersions: ThreadQuoteVersion[];
  job: (ThreadJob & { customer_id: string; issued_quote_id: string | null }) | null;
  invoice: ThreadInvoice | null;
  quoteContact: { client_name: string; client_email: string; client_phone: string | null; client_address: string | null } | null;
}

async function fetchEngagementDetail(engagement: PipelineEngagement): Promise<EngagementDetail> {
  let job: EngagementDetail["job"] = null;
  let quote: EngagementDetail["quote"] = null;
  let quoteVersions: ThreadQuoteVersion[] = [];
  let enquiry: ThreadEnquiry | null = null;
  let invoice: ThreadInvoice | null = null;
  let quoteContact: EngagementDetail["quoteContact"] = null;

  if (engagement.jobId) {
    const { data } = await supabase
      .from("jobs")
      .select(
        "id, job_number, title, status, contract_value, start_date, end_date, customer_id, issued_quote_id, contractor_id, contractor_signed_off_at, sla_status, sla_completion_due",
      )
      .eq("id", engagement.jobId)
      .maybeSingle();
    job = data ?? null;
  }

  const quoteId = engagement.quoteId ?? job?.issued_quote_id ?? null;
  if (quoteId) {
    const { data } = await supabase
      .from("issued_quotes")
      .select(
        "id, quote_number, version, title, client_name, client_email, client_phone, client_address, status, total, subtotal, tax_amount, tax_rate, items, sent_at, responded_at, accepted_at, rejected_at, deposit_required, deposit_amount, enquiry_id, contractor_id",
      )
      .eq("id", quoteId)
      .maybeSingle();
    if (data) {
      quote = {
        ...data,
        items: Array.isArray(data.items) ? (data.items as unknown as ThreadQuote["items"]) : [],
      };
      quoteContact = {
        client_name: data.client_name,
        client_email: data.client_email,
        client_phone: data.client_phone,
        client_address: data.client_address,
      };
      const { data: versions } = await supabase
        .from("issued_quotes")
        .select("id, version, status, created_at")
        .eq("quote_number", data.quote_number)
        .eq("contractor_id", data.contractor_id)
        .order("version", { ascending: true });
      quoteVersions = versions ?? [];
    }
  }

  const enquiryId = engagement.enquiryRef?.id ?? quote?.enquiry_id ?? null;
  if (enquiryId) {
    const { data } = await supabase
      .from("enquiries")
      .select("id, job_description, location, budget_range, preferred_timeline, preferred_time_of_day, preferred_window_start, preferred_window_end, photo_urls, created_at")
      .eq("id", enquiryId)
      .maybeSingle();
    enquiry = data ?? null;
  }

  if (engagement.invoiceId) {
    const { data } = await supabase
      .from("invoices")
      .select("id, invoice_number, status, total, due_date, sent_at, paid_date")
      .eq("id", engagement.invoiceId)
      .maybeSingle();
    invoice = data ?? null;
  }

  return { enquiry, quote, quoteVersions, job, invoice, quoteContact };
}

export function EngagementThread({
  engagement,
  contractorId,
  open,
  onClose,
  onChanged,
}: {
  engagement: PipelineEngagement | null;
  contractorId: string;
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<EngagementDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const { toast } = useToast();

  const load = useCallback(async () => {
    if (!engagement) return;
    setLoading(true);
    const d = await fetchEngagementDetail(engagement);
    setDetail(d);
    setLoading(false);
  }, [engagement]);

  useEffect(() => {
    if (open && engagement) load();
    if (!open) setDetail(null);
  }, [open, engagement, load]);

  const handleChanged = useCallback(() => {
    load();
    onChanged();
  }, [load, onChanged]);

  const handleArchive = async () => {
    if (!detail?.quote) return;
    setArchiving(true);
    const { error } = await supabase.from("issued_quotes").update({ status: "lapsed" }).eq("id", detail.quote.id);
    setArchiving(false);
    if (error) {
      toast({ title: "Error", description: "Failed to archive engagement", variant: "destructive" });
      return;
    }
    toast({ title: "Engagement archived" });
    onChanged();
    onClose();
  };

  const canArchive = !!detail?.quote && !detail?.job && detail.quote.status !== "lapsed";

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto p-0" side="right">
        {!engagement || loading || !detail ? (
          <div className="flex items-center justify-center h-full py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="p-6 space-y-6">
            {/* Header */}
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{engagement.clientName}</span>
                  {engagement.clientCode && (
                    <Badge variant="outline" className="font-mono text-[10px] py-0">{engagement.clientCode}</Badge>
                  )}
                  {engagement.reference && (
                    <span className="font-mono text-xs text-muted-foreground">{engagement.reference}</span>
                  )}
                </div>
                {canArchive && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" className="text-destructive hover:text-destructive shrink-0">
                        Archive engagement
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Archive this engagement?</AlertDialogTitle>
                        <AlertDialogDescription>
                          The quote is marked lapsed and this engagement leaves your pipeline. This can't be undone
                          from here.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Keep it</AlertDialogCancel>
                        <AlertDialogAction disabled={archiving} onClick={handleArchive}>
                          {archiving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}Archive
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
              <Badge variant="secondary">{engagement.stageLabel}</Badge>
            </div>

            <Separator />

            {detail.enquiry && (
              <>
                <ThreadEnquirySection enquiry={detail.enquiry} />
                <Separator />
              </>
            )}

            <ThreadConversationSection
              enquiryId={engagement.enquiryRef?.id}
              quoteId={detail.quote?.id}
              jobId={detail.job?.id}
            />
            <Separator />

            <ThreadWorknotesSection
              enquiryId={engagement.enquiryRef?.id}
              quoteId={detail.quote?.id}
              jobId={detail.job?.id}
            />

            {detail.quote && (
              <>
                <Separator />
                <ThreadQuoteSection quote={detail.quote} versions={detail.quoteVersions} />
              </>
            )}

            {engagement.stage === "scheduling" && detail.quote && (
              <>
                <Separator />
                <ThreadSchedulingSection quoteId={detail.quote.id} contractorId={contractorId} onChanged={handleChanged} />
              </>
            )}

            {detail.job && (
              <>
                <Separator />
                <ThreadJobSection job={detail.job} onChanged={handleChanged} />
              </>
            )}

            {detail.job && (detail.invoice || engagement.stage === "invoice" || (detail.job.status === "complete" && detail.job.contractor_signed_off_at)) && (
              <>
                <Separator />
                <ThreadInvoiceSection
                  job={detail.job}
                  invoice={detail.invoice}
                  quoteContact={detail.quoteContact}
                  onChanged={handleChanged}
                />
              </>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
