import { useMemo, useState } from "react";
import { addMinutes, format } from "date-fns";
import { CalendarCheck2, CalendarClock, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { useQuoteScheduling } from "@/hooks/useQuoteScheduling";
import { DepositPaymentDialog } from "./DepositPaymentDialog";

interface QuoteScheduleNegotiationProps {
  quoteId: string;
  contractorId: string;
  mode: "contractor" | "recipient";
  quoteTotal?: number;
  quoteDepositAmount?: number | null;
  contractorName?: string;
  onJobConfirmed?: () => void;
}

const timeToMinutes = (time: string) => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

const isWithinSlot = (startIso: string, endIso: string, daySlotStart: string, daySlotEnd: string) => {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const startMinutes = start.getHours() * 60 + start.getMinutes();
  const endMinutes = end.getHours() * 60 + end.getMinutes();
  return startMinutes >= timeToMinutes(daySlotStart) && endMinutes <= timeToMinutes(daySlotEnd);
};

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
    availability,
    userId,
    hasConfirmedProposal,
    loading,
    proposeDate,
    acceptProposal,
  } = useQuoteScheduling(quoteId, contractorId);

  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);

  const hasDeposit = quoteDepositAmount != null && quoteDepositAmount > 0;

  const availabilityByDay = useMemo(
    () =>
      availability.reduce<Record<number, { start_time: string; end_time: string; is_available: boolean }[]>>((acc, slot) => {
        if (!acc[slot.day_of_week]) acc[slot.day_of_week] = [];
        acc[slot.day_of_week].push(slot);
        return acc;
      }, {}),
    [availability],
  );

  const getAvailabilityStatus = (proposalStart: string, proposalEnd: string) => {
    const proposalDate = new Date(proposalStart);
    const daySlots = availabilityByDay[proposalDate.getDay()] || [];
    const hasAvailableSlot = daySlots.some(
      (slot) => slot.is_available && isWithinSlot(proposalStart, proposalEnd, slot.start_time, slot.end_time),
    );
    if (hasAvailableSlot) {
      return { label: "Within contractor availability", variant: "default" as const };
    }
    return { label: "Outside stated availability", variant: "secondary" as const };
  };

  const submitProposal = async () => {
    if (!startTime) return;
    setSaving(true);
    try {
      const calculatedEnd = endTime || format(addMinutes(new Date(startTime), 120), "yyyy-MM-dd'T'HH:mm");
      await proposeDate({
        startTime: new Date(startTime).toISOString(),
        endTime: new Date(calculatedEnd).toISOString(),
        note,
      });
      setStartTime("");
      setEndTime("");
      setNote("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Card className="border-dashed">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarClock className="h-4 w-4" />
            Schedule negotiation
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading && <p className="text-sm text-muted-foreground">Loading schedule discussion…</p>}

          {proposals.length === 0 && !loading && (
            <p className="text-sm text-muted-foreground">
              {mode === "contractor"
                ? "No dates proposed yet. Suggest a few options for your client."
                : "Waiting for contractor to suggest dates. You can still send alternatives below."}
            </p>
          )}

          <div className="space-y-2">
            {proposals.map((proposal) => {
              const availabilityStatus = getAvailabilityStatus(proposal.start_time, proposal.end_time);
              const isMine = proposal.proposed_by === userId;
              const isConfirmed = proposal.is_confirmed || proposal.status === "accepted";

              return (
                <div key={proposal.id} className="rounded-lg border p-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={isConfirmed ? "default" : "outline"}>
                      {isConfirmed ? "Confirmed" : proposal.status}
                    </Badge>
                    <Badge variant={availabilityStatus.variant}>{availabilityStatus.label}</Badge>
                    <Badge variant="secondary">{isMine ? "Proposed by you" : "Proposed by counterparty"}</Badge>
                  </div>
                  <p className="font-medium text-sm">
                    {format(new Date(proposal.start_time), "EEE d MMM yyyy, p")} –{" "}
                    {format(new Date(proposal.end_time), "p")}
                  </p>
                  {proposal.description && (
                    <p className="text-sm text-muted-foreground">{proposal.description}</p>
                  )}
                  {mode === "recipient" && !hasConfirmedProposal && !isMine && proposal.status === "proposed" && (
                    <Button size="sm" onClick={() => acceptProposal(proposal.id)}>
                      <CheckCircle2 className="h-4 w-4 mr-1" />
                      Accept this date
                    </Button>
                  )}
                </div>
              );
            })}
          </div>

          {!hasConfirmedProposal && (
            <div className="grid gap-2 rounded-lg bg-muted/30 p-3">
              <p className="text-sm font-medium flex items-center gap-1">
                <CalendarCheck2 className="h-4 w-4" />
                {mode === "contractor" ? "Propose available dates" : "Propose an alternative"}
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  type="datetime-local"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
                <Input
                  type="datetime-local"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  placeholder="End time (optional)"
                />
              </div>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add context (e.g. access windows, parking constraints, etc.)"
                rows={2}
              />
              <Button
                size="sm"
                className="w-fit"
                disabled={!startTime || saving}
                onClick={submitProposal}
              >
                {saving ? "Saving…" : mode === "contractor" ? "Send proposed date" : "Send alternative"}
              </Button>
            </div>
          )}

          {/* Confirm / pay deposit — shown to customer only once schedule agreed */}
          {hasConfirmedProposal && mode === "recipient" && quoteTotal != null && (
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
                  onClick={() => setDepositOpen(true)}
                >
                  {hasDeposit
                    ? `Approve & Pay £${quoteDepositAmount!.toFixed(2)} Deposit`
                    : "Confirm Job"}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {depositOpen && quoteTotal != null && (
        <DepositPaymentDialog
          quoteId={quoteId}
          totalAmount={quoteTotal}
          depositAmount={hasDeposit ? quoteDepositAmount! : undefined}
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
