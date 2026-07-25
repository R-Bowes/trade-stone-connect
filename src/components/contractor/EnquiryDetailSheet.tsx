import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format, parseISO } from "date-fns";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useSignedPhotoUrls } from "@/hooks/useSignedPhotoUrls";
import { getOrCreateEngagementConversation } from "@/lib/engagementConversation";
import { formatQuoteRef, formatJobRef } from "@/lib/documentRefs";

export type EnquiryDetail = {
  id: string;
  title: string | null;
  job_description: string;
  job_type: string | null;
  priority: string | null;
  access_notes: string | null;
  location: string;
  status: string | null;
  created_at: string | null;
  contractor_id: string | null;
  customer_id: string | null;
  budget_range: string | null;
  preferred_timeline: string | null;
  photo_urls: string[] | null;
};

interface EnquiryDetailSheetProps {
  enquiry: EnquiryDetail | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSendQuote: (enquiry: EnquiryDetail) => void;
  onDecline: (enquiry: EnquiryDetail) => void;
}

type CustomerInfo = {
  full_name: string | null;
  ts_profile_code: string | null;
  user_type: string | null;
};

type QuoteInfo = {
  id: string;
  quote_number: number;
  version: number;
  total: number;
  status: string;
  accepted_at: string | null;
  rejected_at: string | null;
  created_at: string;
};

type JobInfo = {
  job_number: number;
  created_at: string;
};

const JOB_TYPE_LABELS: Record<string, string> = {
  repair: "Repair",
  service: "Service",
  installation: "Installation",
  inspection: "Inspection",
  emergency_callout: "Emergency callout",
  other: "Other",
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  emergency: "Emergency",
};

const PRIORITY_BADGE: Record<string, string> = {
  low: "bg-blue-50 text-blue-700 border-blue-200",
  medium: "bg-amber-50 text-amber-800 border-amber-200",
  high: "bg-red-50 text-red-700 border-red-200",
  emergency: "bg-red-600 text-white border-red-700",
};

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  new:       { label: "New",       className: "bg-amber-50 text-amber-800 border-amber-200" },
  replied:   { label: "Replied",   className: "bg-blue-50 text-blue-700 border-blue-200" },
  converted: { label: "Converted", className: "bg-green-50 text-green-800 border-green-200" },
  declined:  { label: "Declined",  className: "bg-red-50 text-red-700 border-red-200" },
  archived:  { label: "Archived",  className: "bg-muted text-muted-foreground border-border" },
};

function formatDateTime(iso: string | null): string {
  if (!iso) return "";
  try { return format(parseISO(iso), "d MMM yyyy 'at' HH:mm"); } catch { return ""; }
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function firstNameLastInitial(fullName: string | null): string {
  if (!fullName) return "Client";
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Client";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

export function EnquiryDetailSheet({ enquiry, open, onOpenChange, onSendQuote, onDecline }: EnquiryDetailSheetProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [customer, setCustomer] = useState<CustomerInfo | null>(null);
  const [quote, setQuote] = useState<QuoteInfo | null>(null);
  const [job, setJob] = useState<JobInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [messaging, setMessaging] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const photoPaths = enquiry?.photo_urls ?? [];
  const { urls: photoUrlMap } = useSignedPhotoUrls("enquiry-photos", photoPaths);

  useEffect(() => {
    if (!open || !enquiry) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setCustomer(null);
      setQuote(null);
      setJob(null);

      if (enquiry.customer_id) {
        const { data } = await supabase
          .from("profiles")
          .select("full_name, ts_profile_code, user_type")
          .eq("id", enquiry.customer_id)
          .maybeSingle();
        if (!cancelled) setCustomer(data ?? null);
      }

      const { data: quoteRow } = await supabase
        .from("issued_quotes")
        .select("id, quote_number, version, total, status, accepted_at, rejected_at, created_at")
        .eq("enquiry_id", enquiry.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!cancelled && quoteRow) {
        setQuote(quoteRow as QuoteInfo);

        const { data: jobRow } = await supabase
          .from("jobs")
          .select("job_number, created_at")
          .eq("issued_quote_id", quoteRow.id)
          .maybeSingle();
        if (!cancelled) setJob((jobRow as JobInfo) ?? null);
      }

      if (!cancelled) setLoading(false);
    };

    load();
    return () => { cancelled = true; };
  }, [open, enquiry]);

  if (!enquiry) return null;

  const statusInfo = STATUS_BADGE[enquiry.status ?? "new"] ?? { label: enquiry.status ?? "New", className: "bg-muted text-muted-foreground border-border" };
  const canAct = enquiry.status !== "converted" && enquiry.status !== "declined";

  const handleMessageClient = async () => {
    setMessaging(true);
    try {
      await getOrCreateEngagementConversation({ enquiryId: enquiry.id });
      onOpenChange(false);
      navigate("/dashboard/contractor?view=messages");
    } catch (error) {
      console.error("Failed to open conversation:", error);
      toast({ title: "Could not open messages", description: "Please try again.", variant: "destructive" });
    } finally {
      setMessaging(false);
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="sm:max-w-[640px] w-full overflow-y-auto p-0">
          <div className="sticky top-0 z-10 bg-background border-b p-6">
            <SheetHeader className="text-left space-y-1">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <SheetTitle className="text-lg font-medium leading-snug">
                      {enquiry.title ?? enquiry.job_description.slice(0, 60)}
                    </SheetTitle>
                    <Badge variant="outline" className={statusInfo.className}>{statusInfo.label}</Badge>
                  </div>
                  <SheetDescription>
                    Received {formatDateTime(enquiry.created_at)}
                  </SheetDescription>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                <Button
                  size="sm"
                  disabled={!canAct}
                  onClick={() => onSendQuote(enquiry)}
                  style={{ background: "#f07820", borderColor: "#f07820" }}
                  className="text-white hover:opacity-90"
                >
                  <i className="ti ti-send mr-1.5" style={{ fontSize: 15 }} />Send quote
                </Button>
                <Button size="sm" variant="outline" disabled={messaging} onClick={() => void handleMessageClient()}>
                  <i className="ti ti-message mr-1.5" style={{ fontSize: 15 }} />Message client
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!canAct}
                  className="text-destructive hover:text-destructive"
                  onClick={() => onDecline(enquiry)}
                >
                  <i className="ti ti-ban mr-1.5" style={{ fontSize: 15 }} />Decline
                </Button>
              </div>
            </SheetHeader>
          </div>

          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* Client section */}
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="h-11 w-11 rounded-full bg-muted flex items-center justify-center font-heading text-sm shrink-0">
                    {initials(customer?.full_name ?? "?")}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{firstNameLastInitial(customer?.full_name ?? null)}</p>
                    {customer?.ts_profile_code && (
                      <p className="text-xs font-mono text-muted-foreground">{customer.ts_profile_code}</p>
                    )}
                  </div>
                </div>
                {customer?.user_type && (
                  <Badge variant="secondary" className="capitalize">{customer.user_type}</Badge>
                )}
                <div className="rounded-md bg-muted p-3 flex items-start gap-2 text-xs text-muted-foreground">
                  <i className="ti ti-lock mt-0.5 shrink-0" style={{ fontSize: 14 }} />
                  <span>Contact details are shared after the job is confirmed. Use &ldquo;Message client&rdquo; to communicate.</span>
                </div>
              </div>

              {/* Job details */}
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <i className="ti ti-map-pin text-muted-foreground" style={{ fontSize: 16 }} />
                  <span>{enquiry.location || "—"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <i className="ti ti-tool text-muted-foreground" style={{ fontSize: 16 }} />
                  <span>{enquiry.job_type ? (JOB_TYPE_LABELS[enquiry.job_type] ?? enquiry.job_type) : "—"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <i className="ti ti-clock text-muted-foreground" style={{ fontSize: 16 }} />
                  <span>{enquiry.preferred_timeline || "—"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <i className="ti ti-currency-pound text-muted-foreground" style={{ fontSize: 16 }} />
                  <span>{enquiry.budget_range || "—"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <i className="ti ti-flag text-muted-foreground" style={{ fontSize: 16 }} />
                  {enquiry.priority ? (
                    <Badge variant="outline" className={PRIORITY_BADGE[enquiry.priority] ?? ""}>
                      {PRIORITY_LABELS[enquiry.priority] ?? enquiry.priority}
                    </Badge>
                  ) : <span>—</span>}
                </div>
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Description</p>
              <p className="text-sm whitespace-pre-wrap">{enquiry.job_description}</p>
            </div>

            {enquiry.access_notes && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Access and site notes</p>
                <p className="text-sm whitespace-pre-wrap">{enquiry.access_notes}</p>
              </div>
            )}

            {photoPaths.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Photos from client</p>
                <div className="flex flex-wrap gap-2">
                  {photoPaths.map((path) => {
                    const url = photoUrlMap[path];
                    if (!url) return null;
                    return (
                      <button
                        key={path}
                        type="button"
                        onClick={() => setLightboxUrl(url)}
                        className="block h-20 w-[100px] rounded-md overflow-hidden border hover:opacity-80 transition-opacity"
                      >
                        <img src={url} alt="Client photo" className="h-full w-full object-cover" />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Activity</p>
              <div className="space-y-4 border-l border-border pl-4">
                <TimelineEntry
                  dotClass="bg-blue-500"
                  text="Enquiry received"
                  timestamp={formatDateTime(enquiry.created_at)}
                />
                {quote && (
                  <TimelineEntry
                    dotClass="bg-blue-500"
                    text={`Quote sent — ${formatQuoteRef(quote.quote_number, { version: quote.version })} (£${quote.total.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`}
                    timestamp={formatDateTime(quote.created_at)}
                  />
                )}
                {quote?.accepted_at && (
                  <TimelineEntry dotClass="bg-green-500" text="Client accepted" timestamp={formatDateTime(quote.accepted_at)} />
                )}
                {quote?.rejected_at && (
                  <TimelineEntry dotClass="bg-red-500" text="Client declined" timestamp={formatDateTime(quote.rejected_at)} />
                )}
                {job && (
                  <TimelineEntry
                    dotClass="bg-green-500"
                    text={`Job created — ${formatJobRef(job.job_number)}`}
                    timestamp={formatDateTime(job.created_at)}
                  />
                )}
                {loading && <p className="text-xs text-muted-foreground">Loading activity…</p>}
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={!!lightboxUrl} onOpenChange={(o) => !o && setLightboxUrl(null)}>
        <DialogContent className="max-w-3xl p-2">
          {lightboxUrl && <img src={lightboxUrl} alt="Client photo full size" className="w-full h-auto rounded" />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function TimelineEntry({ dotClass, text, timestamp }: { dotClass: string; text: string; timestamp: string }) {
  return (
    <div className="relative">
      <span className={`absolute -left-[1.32rem] top-1 h-2.5 w-2.5 rounded-full ${dotClass}`} />
      <p className="text-sm">{text}</p>
      <p className="text-xs text-muted-foreground">{timestamp}</p>
    </div>
  );
}
