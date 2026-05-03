import { useMemo, useState } from "react";
import { addDays, format, startOfToday } from "date-fns";
import { CalendarClock, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useQuoteScheduling } from "@/hooks/useQuoteScheduling";
import { useAvailability } from "@/hooks/useAvailability";
import { DepositPaymentDialog } from "./DepositPaymentDialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface QuoteScheduleNegotiationProps {
  quoteId: string;
  contractorId: string;
  mode: "contractor" | "recipient";
  quoteTotal?: number;
  quoteDepositAmount?: number | null;
  contractorName?: string;
  onJobConfirmed?: () => void;
}

type SlotKey = string; // "yyyy-MM-dd-AM" | "yyyy-MM-dd-PM"

export function QuoteScheduleNegotiation({
  quoteId,
  contractorId,
  mode,
  quoteTotal,
  quoteDepositAmount,
  contractorName,
  onJobConfirmed,
}: QuoteScheduleNegotiationProps) {
  const {
    proposals,
    userId,
    hasConfirmedProposal,
    loading: proposalsLoading,
    proposeDate,
    acceptProposal,
  } = useQuoteScheduling(quoteId, contractorId);

  const { getAvailabilityForRange, loading: availabilityLoading } = useAvailability(contractorId);

  const [selectedSlots, setSelectedSlots] = useState<Set<SlotKey>>(new Set());
  const [saving, setSaving] = useState(false);
  const [confirmingJob, setConfirmingJob] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const { toast } = useToast();

  const hasDeposit = quoteDepositAmount != null && quoteDepositAmount > 0;

  // Build 14-day availability grid
  const today = startOfToday();
  const days = useMemo(
    () => Array.from({ length: 14 }, (_, i) => addDays(today, i + 1)),
    [today.toISOString()],
  );
  const rangeData = getAvailabilityForRange(days[0], days[days.length - 1]);

  const toggleSlot = (key: SlotKey) => {
    setSelectedSlots((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        if (next.size >= 3) {
          toast({ title: "Maximum 3 slots", description: "Deselect one before adding another." });
          return prev;
        }
        next.add(key);
      }
      return next;
    });
  };

  const submitSlots = async () => {
    if (selectedSlots.size === 0) return;
    setSaving(true);
    try {
      for (const key of Array.from(selectedSlots)) {
        const [date, ampm] = key.split("-").slice(0, 2).concat(key.split("-")[2] ?? "AM") as [string, string, string];
        const dateStr = key.slice(0, 10);
        const startHour = key.endsWith("AM") ? "09:00" : "13:00";
        const endHour = key.endsWith("AM") ? "12:00" : "17:00";
        const start = new Date(`${dateStr}T${startHour}`).toISOString();
        const end = new Date(`${dateStr}T${endHour}`).toISOString();
        await proposeDate({ startTime: start, endTime: end });
      }
      setSelectedSlots(new Set());
      toast({ title: "Preferences sent", description: "The contractor will confirm one of your selected slots." });
    } finally {
      setSaving(false);
    }
  };

  const confirmJobDirectly = async () => {
    setConfirmingJob(true);
    try {
      const { data: quote, error: quoteError } = await supabase
        .from("issued_quotes")
        .select("contractor_id, recipient_id, title, client_address, total")
        .eq("id", quoteId)
        .single();
      if (quoteError || !quote) throw quoteError ?? new Error("Quote not found");

      const { error: jobError } = await supabase.from("jobs").insert({
        contractor_id: quote.contractor_id,
        customer_id: quote.recipient_id,
        issued_quote_id: quoteId,
        title: quote.title,
        location: quote.client_address,
        status: "scheduled",
        contract_value: quote.total,
      });
      if (jobError) throw jobError;

      toast({ title: "Job confirmed" });
      onJobConfirmed?.();
    } catch (err) {
      console.error(err);
      toast({ title: "Error", description: "Failed to confirm job", variant: "destructive" });
    } finally {
      setConfirmingJob(false);
    }
  };

  const getAmPmLabel = (startIso: string) => {
    const h = new Date(startIso).getHours();
    if (h === 9) return "Morning (AM)";
    if (h === 13) return "Afternoon (PM)";
    return format(new Date(startIso), "p");
  };

  const loading = proposalsLoading || availabilityLoading;

  // ── Contractor view ───────────────────────────────────────────────────────
  if (mode === "contractor") {
    const pending = proposals.filter((p) => p.status === "proposed" && !p.is_confirmed);
    const confirmed = proposals.find((p) => p.is_confirmed || p.status === "accepted");

    return (
      <Card className="border-dashed">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarClock className="h-4 w-4" />
            Schedule preferences from customer
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading...
            </div>
          )}

          {confirmed && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-3 space-y-1">
              <p className="text-sm font-semibold text-green-800 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" /> Confirmed date
              </p>
              <p className="text-sm text-green-900 font-medium">
                {format(new Date(confirmed.start_time), "EEE d MMM yyyy")} · {getAmPmLabel(confirmed.start_time)}
              </p>
            </div>
          )}

          {!confirmed && pending.length === 0 && !loading && (
            <p className="text-sm text-muted-foreground">
              No date preferences received yet. The customer will select from your available slots.
            </p>
          )}

          {!confirmed && pending.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Customer&apos;s preferred slots — confirm one:</p>
              {pending.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg border p-3">
                  <p className="text-sm font-medium">
                    {format(new Date(p.start_time), "EEE d MMM yyyy")} · {getAmPmLabel(p.start_time)}
                  </p>
                  <Button size="sm" onClick={() => acceptProposal(p.id)}>
                    <CheckCircle2 className="h-4 w-4 mr-1" />
                    Confirm this date
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // ── Customer / recipient view ─────────────────────────────────────────────
  const confirmedProposal = proposals.find((p) => p.is_confirmed || p.status === "accepted");
  const pendingProposals = proposals.filter((p) => p.status === "proposed" && !p.is_confirmed);
  const alreadySubmitted = pendingProposals.length > 0;

  return (
    <>
      <Card className="border-dashed">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarClock className="h-4 w-4" />
            Choose preferred dates
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading availability...
            </div>
          )}

          {/* Confirmed state */}
          {confirmedProposal && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-3 space-y-1">
              <p className="text-sm font-semibold text-green-800 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" /> Date confirmed by contractor
              </p>
              <p className="text-sm text-green-900 font-medium">
                {format(new Date(confirmedProposal.start_time), "EEE d MMM yyyy")} · {getAmPmLabel(confirmedProposal.start_time)}
              </p>
            </div>
          )}

          {/* Already submitted, waiting */}
          {!confirmedProposal && alreadySubmitted && (
            <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
              <p className="text-sm font-medium">Preferences sent — waiting for contractor to confirm</p>
              <div className="space-y-1">
                {pendingProposals.map((p) => (
                  <div key={p.id} className="flex items-center gap-2 text-sm">
                    <Badge variant="outline" className="font-normal">
                      {format(new Date(p.start_time), "EEE d MMM")} · {getAmPmLabel(p.start_time)}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Slot picker — shown when no confirmed date and nothing submitted yet */}
          {!confirmedProposal && !alreadySubmitted && !loading && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Select up to 3 available slots. The contractor will confirm one.
              </p>
              <div className="space-y-1">
                {days.map((day) => {
                  const dateStr = format(day, "yyyy-MM-dd");
                  const dayData = rangeData[dateStr] ?? { amAvailable: false, pmAvailable: false };
                  const amKey = `${dateStr}-AM`;
                  const pmKey = `${dateStr}-PM`;
                  const dayLabel = format(day, "EEE d MMM");
                  const isWeekend = day.getDay() === 0 || day.getDay() === 6;

                  if (!dayData.amAvailable && !dayData.pmAvailable) {
                    return (
                      <div key={dateStr} className="flex items-center gap-3 py-1.5 border-b border-border/40 last:border-0">
                        <span className="text-xs text-muted-foreground w-24 shrink-0">{dayLabel}</span>
                        <span className="text-xs text-muted-foreground italic">
                          {isWeekend ? "Weekend" : "Unavailable"}
                        </span>
                      </div>
                    );
                  }

                  return (
                    <div key={dateStr} className="flex items-center gap-3 py-1.5 border-b border-border/40 last:border-0">
                      <span className="text-xs text-muted-foreground w-24 shrink-0">{dayLabel}</span>
                      <div className="flex gap-2">
                        {dayData.amAvailable && (
                          <button
                            type="button"
                            onClick={() => toggleSlot(amKey)}
                            className={`text-xs px-3 py-1 rounded-full border font-medium transition-colors ${
                              selectedSlots.has(amKey)
                                ? "bg-[#f07820] text-white border-[#f07820]"
                                : "bg-green-50 text-green-800 border-green-200 hover:border-[#f07820] hover:text-[#f07820]"
                            }`}
                          >
                            AM
                          </button>
                        )}
                        {dayData.pmAvailable && (
                          <button
                            type="button"
                            onClick={() => toggleSlot(pmKey)}
                            className={`text-xs px-3 py-1 rounded-full border font-medium transition-colors ${
                              selectedSlots.has(pmKey)
                                ? "bg-[#f07820] text-white border-[#f07820]"
                                : "bg-green-50 text-green-800 border-green-200 hover:border-[#f07820] hover:text-[#f07820]"
                            }`}
                          >
                            PM
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {selectedSlots.size > 0 && (
                <div className="pt-2 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    {selectedSlots.size} of 3 slots selected
                  </p>
                  <Button
                    size="sm"
                    disabled={saving}
                    onClick={submitSlots}
                    className="w-full"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Send {selectedSlots.size} preference{selectedSlots.size !== 1 ? "s" : ""} to contractor
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Confirm / pay deposit — shown to customer only once schedule agreed */}
          {hasConfirmedProposal && quoteTotal != null && (
            <>
              <Separator />
              <div className="rounded-lg bg-muted/40 p-4 space-y-3">
                <p className="text-sm font-semibold flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  Schedule agreed — ready to confirm the job
                </p>
                <p className="text-sm text-muted-foreground">
                  {hasDeposit
                    ? `A deposit of £${quoteDepositAmount!.toFixed(2)} is required to secure your booking.`
                    : "No deposit required — confirm the job to get started."}
                </p>
                <Button
                  className="w-full text-white font-semibold"
                  style={{ backgroundColor: "#f07820" }}
                  disabled={confirmingJob}
                  onClick={hasDeposit ? () => setDepositOpen(true) : confirmJobDirectly}
                >
                  {hasDeposit
                    ? `Approve & Pay £${quoteDepositAmount!.toFixed(2)} Deposit`
                    : confirmingJob ? "Confirming…" : "Confirm Job"}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {hasDeposit && depositOpen && quoteTotal != null && (
        <DepositPaymentDialog
          quoteId={quoteId}
          totalAmount={quoteTotal}
          depositAmount={quoteDepositAmount!}
          contractorName={contractorName ?? "Contractor"}
          open={depositOpen}
          onClose={() => setDepositOpen(false)}
          onSuccess={() => {
            setDepositOpen(false);
            onJobConfirmed?.();
          }}
        />
      )}
    </>
  );
}
