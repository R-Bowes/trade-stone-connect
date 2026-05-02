import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, ChevronLeft, MapPin, Calendar, MessageCircle, Clock } from "lucide-react";
import { format, parseISO, addDays, startOfToday } from "date-fns";
import { useAvailability } from "@/hooks/useAvailability";

type Enquiry = {
  id: string;
  title: string | null;
  job_description: string;
  location: string;
  status: string | null;
  created_at: string | null;
  contractor_id: string | null;
  contractor: {
    full_name: string | null;
    company_name: string | null;
    ts_profile_code: string | null;
  } | null;
};

type Message = {
  id: string;
  content: string;
  created_at: string;
  sender_id: string;
  is_mine: boolean;
};

type ConversationWithMessages = {
  id: string;
  subject: string;
  last_message_at: string | null;
  messages: Message[];
};

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  new:       { label: "Sent",      variant: "secondary" },
  viewed:    { label: "Viewed",    variant: "default" },
  responded: { label: "Responded", variant: "default" },
  accepted:  { label: "Accepted",  variant: "default" },
  declined:  { label: "Declined",  variant: "destructive" },
  closed:    { label: "Closed",    variant: "outline" },
};

function statusBadge(status: string | null) {
  const s = STATUS_LABELS[status ?? "new"] ?? { label: status ?? "Sent", variant: "secondary" as const };
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

function formatDate(iso: string | null) {
  if (!iso) return "";
  try { return format(parseISO(iso), "d MMM yyyy"); } catch { return ""; }
}

// Availability panel — only rendered when contractor_id is known
function ContractorAvailabilityPanel({ contractorId }: { contractorId: string }) {
  const { getSlotForDate, getAvailabilityForRange, loading } = useAvailability(contractorId);

  const today = startOfToday();
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i + 1));
  const rangeData = getAvailabilityForRange(days[0], days[days.length - 1]);

  const slotClass = (available: boolean, isJob: boolean) => {
    if (isJob) return "bg-amber-50 text-amber-800 border border-amber-200";
    if (available) return "bg-green-50 text-green-800 border border-green-200";
    return "bg-muted text-muted-foreground border border-border";
  };

  const slotLabel = (available: boolean) => available ? "free" : "blocked";

  if (loading) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading availability...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Calendar className="h-4 w-4" /> Contractor availability
        </CardTitle>
        <p className="text-xs text-muted-foreground">Next two weeks</p>
      </CardHeader>
      <CardContent className="space-y-1">
        {days.map((day) => {
          const key = format(day, "yyyy-MM-dd");
          const slot = rangeData[key] ?? { amAvailable: false, pmAvailable: false };
          const dayLabel = format(day, "EEE d MMM");

          // Check if blocked by a confirmed job by checking the override reason
          // We treat amber (job) as both blocked — visually distinct
          const isWeekend = day.getDay() === 0 || day.getDay() === 6;

          return (
            <div
              key={key}
              className="flex items-center gap-3 py-1.5 border-b border-border/50 last:border-0"
            >
              <span className="text-xs text-muted-foreground w-24 shrink-0">{dayLabel}</span>
              <div className="flex gap-2">
                <span className={`text-xs px-2 py-0.5 rounded font-medium ${slotClass(slot.amAvailable, false)}`}>
                  AM {slotLabel(slot.amAvailable)}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded font-medium ${slotClass(slot.pmAvailable, false)}`}>
                  PM {slotLabel(slot.pmAvailable)}
                </span>
              </div>
              {isWeekend && !slot.amAvailable && !slot.pmAvailable && (
                <span className="text-xs text-muted-foreground italic">Weekend</span>
              )}
            </div>
          );
        })}

        <div className="flex gap-4 pt-3 flex-wrap">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-block px-2 py-0.5 rounded bg-green-50 text-green-800 border border-green-200 text-xs font-medium">free</span>
            Available
          </span>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-block px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border text-xs font-medium">blocked</span>
            Unavailable
          </span>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-block px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 text-xs font-medium">blocked</span>
            Confirmed job
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

interface EnquiryListProps {
  profileId: string;
  myUserId: string;
  refreshKey?: number;
}

export function EnquiryList({ profileId, myUserId, refreshKey = 0 }: EnquiryListProps) {
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Enquiry | null>(null);
  const [conversation, setConversation] = useState<ConversationWithMessages | null>(null);
  const [convLoading, setConvLoading] = useState(false);

  const fetchEnquiries = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("enquiries")
      .select(`
        id, title, job_description, location, status, created_at, contractor_id,
        contractor:profiles!enquiries_contractor_id_fkey (
          full_name, company_name, ts_profile_code
        )
      `)
      .eq("customer_id", profileId)
      .order("created_at", { ascending: false });

    if (err) { setError("Could not load your enquiries."); }
    else { setEnquiries((data as Enquiry[]) ?? []); }
    setLoading(false);
  }, [profileId]);

  useEffect(() => {
    fetchEnquiries();
  }, [fetchEnquiries, refreshKey]);

  const openDetail = useCallback(async (enquiry: Enquiry) => {
    setSelected(enquiry);
    setConversation(null);

    if (!enquiry.contractor_id) return;

    setConvLoading(true);
    const { data: convData } = await supabase
      .from("conversations")
      .select("id, subject, last_message_at")
      .or(`initiator_id.eq.${profileId},recipient_id.eq.${profileId}`)
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!convData) { setConvLoading(false); return; }

    const { data: msgData } = await supabase
      .from("messages")
      .select("id, content, created_at, sender_id")
      .eq("conversation_id", convData.id)
      .order("created_at", { ascending: true });

    setConversation({
      ...convData,
      messages: (msgData ?? []).map((m) => ({ ...m, is_mine: m.sender_id === myUserId })),
    });
    setConvLoading(false);
  }, [profileId, myUserId]);

  // Detail view
  if (selected) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setSelected(null)} className="gap-1 -ml-2">
          <ChevronLeft className="h-4 w-4" /> Back to enquiries
        </Button>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-4">
              <CardTitle className="text-lg leading-snug">
                {selected.title ?? selected.job_description.slice(0, 60)}
              </CardTitle>
              {statusBadge(selected.status)}
            </div>
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground pt-1">
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" /> {selected.location}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" /> Sent {formatDate(selected.created_at)}
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium mb-1">Description</p>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{selected.job_description}</p>
            </div>

            {selected.contractor ? (
              <div className="rounded-lg border p-3 space-y-0.5">
                <p className="text-sm font-medium">Contractor</p>
                <p className="text-sm">
                  {selected.contractor.company_name ?? selected.contractor.full_name ?? "Unknown"}
                </p>
                {selected.contractor.ts_profile_code && (
                  <p className="text-xs text-muted-foreground font-mono">{selected.contractor.ts_profile_code}</p>
                )}
              </div>
            ) : (
              <div className="rounded-lg border p-3">
                <p className="text-sm text-muted-foreground">This enquiry has not yet been assigned to a contractor.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {selected.contractor_id && (
          <ContractorAvailabilityPanel contractorId={selected.contractor_id} />
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageCircle className="h-4 w-4" /> Messages
            </CardTitle>
          </CardHeader>
          <CardContent>
            {convLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading messages...
              </div>
            ) : !conversation || conversation.messages.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">
                No messages yet. The contractor will respond here once they review your enquiry.
              </p>
            ) : (
              <div className="space-y-3">
                {conversation.messages.map((msg) => (
                  <div key={msg.id} className={`flex ${msg.is_mine ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                      msg.is_mine
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground"
                    }`}>
                      <p>{msg.content}</p>
                      <p className={`text-xs mt-1 ${msg.is_mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                        {formatDate(msg.created_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // List view
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading your enquiries...
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-destructive py-4">{error}</p>;
  }

  if (enquiries.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <Clock className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium mb-1">No enquiries yet</p>
          <p className="text-sm text-muted-foreground">Your submitted enquiries will appear here.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {enquiries.map((enq) => (
        <Card
          key={enq.id}
          className="cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => openDetail(enq)}
        >
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1 min-w-0">
                <p className="font-medium text-sm leading-snug truncate">
                  {enq.title ?? enq.job_description.slice(0, 60)}
                </p>
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> {enq.location}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> {formatDate(enq.created_at)}
                  </span>
                  {enq.contractor && (
                    <span className="flex items-center gap-1">
                      {enq.contractor.company_name ?? enq.contractor.full_name}
                    </span>
                  )}
                </div>
              </div>
              {statusBadge(enq.status)}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}