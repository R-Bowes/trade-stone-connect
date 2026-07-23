import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { QuoteScheduleNegotiation } from "@/components/recipient/QuoteScheduleNegotiation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Loader2, CalendarDays, Clock, List, Handshake } from "lucide-react";
import { formatQuoteRef } from "@/lib/documentRefs";
import { useSchedule, type ScheduleEvent } from "@/hooks/useSchedule";
import { WeekCalendar } from "./schedule/WeekCalendar";
import { UpcomingEvents } from "./schedule/UpcomingEvents";
import { AvailabilityManager } from "./schedule/AvailabilityManager";
import { EventFormDialog } from "./schedule/EventFormDialog";


interface AcceptedQuote {
  id: string;
  quote_number: number | null;
  title: string;
  contractor_id: string;
  recipient_response: string | null;
}

export function ScheduleManagement() {
  const { events, loading, addEvent, updateEvent, deleteEvent } = useSchedule();
  const [showForm, setShowForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState<ScheduleEvent | null>(null);
  const [defaultDate, setDefaultDate] = useState<Date | undefined>();
  const [acceptedQuotes, setAcceptedQuotes] = useState<AcceptedQuote[]>([]);
  const [contractorProfileId, setContractorProfileId] = useState("");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const innerTab = searchParams.get("tab") ?? "calendar";

  const handleSlotClick = (date: Date) => {
    setEditingEvent(null);
    setDefaultDate(date);
    setShowForm(true);
  };

  const handleEventClick = (event: ScheduleEvent) => {
    if (event.job_id) {
      navigate("/dashboard/contractor?view=jobs");
      return;
    }
    if (event.quote_id) {
      navigate("/dashboard/contractor?view=schedule&tab=quote-scheduling");
      return;
    }
    setEditingEvent(event);
    setDefaultDate(undefined);
    setShowForm(true);
  };

  const handleSave = async (data: any) => {
    if (editingEvent) {
      await updateEvent(editingEvent.id, data);
    } else {
      await addEvent(data);
    }
  };

  const handleDrop = async (eventId: string, newStart: Date, newEnd: Date) => {
    await updateEvent(eventId, {
      start_time: newStart.toISOString(),
      end_time: newEnd.toISOString(),
    });
  };

  useEffect(() => {
    const fetchAcceptedQuotes = async () => {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) return;

      const { data: profileRow } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", authData.user.id)
        .maybeSingle();

      const { data, error } = await supabase
        .from("issued_quotes")
        .select("id, quote_number, title, contractor_id, recipient_response")
        .eq("contractor_id", profileRow?.id)
        .eq("recipient_response", "accepted")
        .order("responded_at", { ascending: false });

      // A job's issued_quote_id points to whichever *version's* row id was
      // live when the job was created — not necessarily the row this query
      // just fetched. Excluding by that row's own id misses older/newer
      // sibling versions of the same quote_number that share no job link
      // themselves. Resolve jobbed row ids to their quote_number instead,
      // and exclude every row with that quote_number.
      //
      // Plain two-query client-side join rather than a `!fkey_name` embed —
      // the embed silently returns null (failing open, showing nothing
      // excluded) if the guessed constraint name doesn't match the live
      // schema, which is exactly how Q-0001/Q-0003/Q-0007/Q-0010 kept
      // rendering live panels despite already having jobs.
      const { data: jobbedRows } = await supabase
        .from("jobs")
        .select("issued_quote_id")
        .eq("contractor_id", profileRow?.id)
        .neq("status", "cancelled")
        .not("issued_quote_id", "is", null);

      const jobbedQuoteIds = [
        ...new Set((jobbedRows ?? []).map((j) => j.issued_quote_id).filter((id): id is string => id != null)),
      ];

      const jobbedQuoteNumbers = new Set<number>();
      if (jobbedQuoteIds.length) {
        const { data: jobbedQuoteRows } = await supabase
          .from("issued_quotes")
          .select("quote_number")
          .in("id", jobbedQuoteIds);
        for (const row of jobbedQuoteRows ?? []) {
          if (row.quote_number != null) jobbedQuoteNumbers.add(row.quote_number);
        }
      }

      setContractorProfileId(profileRow?.id ?? "");
      if (!error) {
        // A quote_number with a job under ANY version is done negotiating — drop it from this list.
        const withoutJob = ((data as AcceptedQuote[]) || []).filter(
          (q) => q.quote_number == null || !jobbedQuoteNumbers.has(q.quote_number),
        );
        setAcceptedQuotes(withoutJob);
      }
    };

    fetchAcceptedQuotes();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 overflow-x-hidden">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
        <h2 className="font-heading text-2xl font-bold">Schedule & Availability</h2>
        <Button onClick={() => { setEditingEvent(null); setDefaultDate(undefined); setShowForm(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          Add Event
        </Button>
      </div>

      <Tabs value={innerTab} onValueChange={(tab) => navigate(`/dashboard/contractor?view=schedule&tab=${tab}`)}>
        <TabsList className="w-full overflow-x-auto flex-nowrap justify-start">
          <TabsTrigger value="calendar" className="gap-1 shrink-0"><CalendarDays className="h-4 w-4" />Calendar</TabsTrigger>
          <TabsTrigger value="upcoming" className="gap-1 shrink-0"><List className="h-4 w-4" />Upcoming</TabsTrigger>
          <TabsTrigger value="availability" className="gap-1 shrink-0"><Clock className="h-4 w-4" />Availability</TabsTrigger>
          <TabsTrigger value="quote-scheduling" className="gap-1 shrink-0"><Handshake className="h-4 w-4" />Quote Scheduling</TabsTrigger>
        </TabsList>

        <TabsContent value="calendar" className="mt-4">
          <WeekCalendar
            events={events}
            onEventClick={handleEventClick}
            onSlotClick={handleSlotClick}
            onEventDrop={handleDrop}
          />
        </TabsContent>

        <TabsContent value="upcoming" className="mt-4">
          <UpcomingEvents events={events} onEdit={handleEventClick} onDelete={deleteEvent} />
        </TabsContent>

        <TabsContent value="availability" className="mt-4">
          <AvailabilityManager contractorId={contractorProfileId} />
        </TabsContent>

        <TabsContent value="quote-scheduling" className="mt-4 space-y-3">
          {acceptedQuotes.length === 0 && (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">
                Accepted quotes will appear here for date negotiation.
              </CardContent>
            </Card>
          )}
          {acceptedQuotes.map((quote) => (
            <div key={quote.id} className="space-y-2">
              <p className="text-sm font-medium">{quote.quote_number != null ? formatQuoteRef(quote.quote_number) : quote.id} · {quote.title}</p>
              <QuoteScheduleNegotiation quoteId={quote.id} contractorId={quote.contractor_id} mode="contractor" />
            </div>
          ))}
        </TabsContent>
      </Tabs>

      <EventFormDialog
        open={showForm}
        onClose={() => { setShowForm(false); setEditingEvent(null); }}
        onSave={handleSave}
        editingEvent={editingEvent}
        defaultDate={defaultDate}
      />
    </div>
  );
}
