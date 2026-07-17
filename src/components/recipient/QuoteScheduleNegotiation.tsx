import { useState } from "react";
import { format } from "date-fns";
import { CalendarClock, CheckCircle2, Loader2, MessageCircle, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
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
import { useQuoteScheduling } from "@/hooks/useQuoteScheduling";
import { useSubmitGuard } from "@/hooks/useSubmitGuard";
import { SlotPicker } from "./SlotPicker";
import { DepositPaymentDialog } from "./DepositPaymentDialog";
import { MessageDialog } from "./MessageDialog";
import { confirmQuoteSlot } from "@/lib/confirmQuoteSlot";
import { useToast } from "@/hooks/use-toast";

interface QuoteScheduleNegotiationProps {
  quoteId: string;
  contractorId: string;
  mode: "contractor" | "recipient";
  quoteTotal?: number;
  quoteDepositAmount?: number | null;
  contractorName?: string;
  onJobConfirmed?: () => void;
}

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
    userId,
    otherPartyId,
    otherPartyName,
    jobExists,
    loading: proposalsLoading,
    hasConfirmedProposal,
    confirmedProposal,
    pendingFromOther,
    pendingFromMe,
    postExhaustionProposal,
    myTurnsUsed,
    myTurnsRemaining,
    maxTurnsPerCycle,
    bothExhausted,
    awaitingBackoutResubmission,
    submitProposals,
    submitPostExhaustionProposal,
    acceptProposal,
    declineProposal,
    requestDifferentDate,
    cancelScheduling,
  } = useQuoteScheduling(quoteId, contractorId);

  const [depositOpen, setDepositOpen] = useState(false);
  const [showCounterPicker, setShowCounterPicker] = useState(false);
  const [messageOpen, setMessageOpen] = useState(false);
  const { toast } = useToast();

  const { pending: acceptPending, guard: guardAccept } = useSubmitGuard();
  const { pending: declinePending, guard: guardDecline } = useSubmitGuard();
  const { pending: backoutPending, guard: guardBackout } = useSubmitGuard();
  const { pending: confirmJobPending, guard: guardConfirmJob } = useSubmitGuard();

  const hasDeposit = quoteDepositAmount != null && quoteDepositAmount > 0;
  // The contractor's name is already correctly resolved via public_pro_profiles
  // in the recipient-side prop chain (useReceivedQuotes.ts) — prefer it over
  // the hook's own fetch for recipient mode so a stale/blank raw-profiles
  // value can never leak the platform name into this copy instead.
  const otherPartyLabel =
    mode === "recipient"
      ? contractorName ?? otherPartyName ?? "the contractor"
      : otherPartyName ?? "the customer";

  const handleAcceptProposal = guardAccept(async (proposalId: string) => {
    await acceptProposal(proposalId);
  });

  const handleDeclineProposal = guardDecline(async (proposalId: string) => {
    await declineProposal(proposalId);
  });

  const handleRequestDifferentDate = guardBackout(async () => {
    await requestDifferentDate();
  });

  const handleCancelScheduling = guardBackout(async () => {
    await cancelScheduling();
  });

  const handleConfirmJobDirectly = guardConfirmJob(async () => {
    if (!confirmedProposal) return;
    try {
      // No deposit due — mint_job_from_quote runs inside the RPC and the
      // jobs-insert trigger (block_date_on_job_confirmed) blocks the
      // contractor's calendar server-side; nothing to do here.
      await confirmQuoteSlot(quoteId, confirmedProposal.id);
      toast({ title: "Job confirmed" });
      onJobConfirmed?.();
    } catch (err) {
      console.error(err);
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to confirm job", variant: "destructive" });
    }
  });

  const getAmPmLabel = (startIso: string) => {
    const h = new Date(startIso).getHours();
    if (h === 9) return "Morning (AM)";
    if (h === 13) return "Afternoon (PM)";
    return format(new Date(startIso), "p");
  };

  const turnIndicator = (
    <p className="text-xs text-muted-foreground">
      Your proposals: {myTurnsUsed} of {maxTurnsPerCycle} used
    </p>
  );

  const backoutActions = !jobExists && (
    <div className="flex flex-wrap gap-2 pt-1">
      <Button variant="outline" size="sm" disabled={backoutPending} onClick={handleRequestDifferentDate}>
        {mode === "contractor" ? "Release this date" : "Request a different date"}
      </Button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
            disabled={backoutPending}
          >
            Cancel scheduling
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel scheduling?</AlertDialogTitle>
            <AlertDialogDescription>
              The quote stays accepted — you can restart scheduling any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep scheduling</AlertDialogCancel>
            <AlertDialogAction disabled={backoutPending} onClick={handleCancelScheduling}>
              Cancel scheduling
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );

  const messageDialog = otherPartyId && (
    <MessageDialog
      open={messageOpen}
      onClose={() => setMessageOpen(false)}
      contractorId={otherPartyId}
      subject="Let's agree a date"
      contextType="quote"
      contextId={quoteId}
    />
  );

  let body: JSX.Element;

  if (proposalsLoading) {
    body = (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading...
      </div>
    );
  } else if (bothExhausted && !hasConfirmedProposal) {
    // ── A4: dead-end panel — both parties out of turns, nothing confirmed ──
    body = (
      <>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
          <p className="text-sm font-semibold text-amber-900">You've each proposed twice</p>
          <p className="text-sm text-amber-800">
            Message {otherPartyLabel} to agree a date, or propose one final date below.
          </p>
          {otherPartyId && (
            <Button size="sm" variant="outline" onClick={() => setMessageOpen(true)}>
              <MessageCircle className="h-4 w-4 mr-1.5" />
              Message {otherPartyLabel}
            </Button>
          )}
        </div>

        {/* A live ordinary proposal from the other party's final turn is still
            confirmable/declinable even once both parties are exhausted — it
            must never be hidden behind the dead-end panel. */}
        {pendingFromOther.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">{otherPartyLabel}&apos;s proposed slots:</p>
            {pendingFromOther.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg border p-3">
                <p className="text-sm font-medium">
                  {format(new Date(p.start_time), "EEE d MMM yyyy")} · {getAmPmLabel(p.start_time)}
                </p>
                <div className="flex gap-2 shrink-0">
                  <Button size="sm" disabled={acceptPending} onClick={() => handleAcceptProposal(p.id)}>
                    <CheckCircle2 className="h-4 w-4 mr-1" />
                    Confirm this date
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={declinePending}
                    onClick={() => handleDeclineProposal(p.id)}
                  >
                    <XCircle className="h-4 w-4 mr-1" />
                    Decline
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {postExhaustionProposal && postExhaustionProposal.proposed_by !== userId && (
          <div className="rounded-lg border p-3 flex items-center justify-between gap-3">
            <p className="text-sm font-medium">
              {otherPartyLabel} proposed: {format(new Date(postExhaustionProposal.start_time), "EEE d MMM yyyy")} ·{" "}
              {getAmPmLabel(postExhaustionProposal.start_time)}
            </p>
            <div className="flex gap-2 shrink-0">
              <Button size="sm" disabled={acceptPending} onClick={() => handleAcceptProposal(postExhaustionProposal.id)}>
                <CheckCircle2 className="h-4 w-4 mr-1" />
                Confirm this date
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={declinePending}
                onClick={() => handleDeclineProposal(postExhaustionProposal.id)}
              >
                <XCircle className="h-4 w-4 mr-1" />
                Decline
              </Button>
            </div>
          </div>
        )}

        {postExhaustionProposal && postExhaustionProposal.proposed_by === userId && (
          <div className="rounded-lg border bg-muted/40 p-3">
            <p className="text-sm">
              Waiting for {otherPartyLabel} to confirm your proposed date (
              {format(new Date(postExhaustionProposal.start_time), "EEE d MMM yyyy")} ·{" "}
              {getAmPmLabel(postExhaustionProposal.start_time)}).
            </p>
          </div>
        )}

        {!postExhaustionProposal && (
          <SlotPicker
            contractorId={contractorId}
            maxSlots={1}
            helperText="Propose one final date to agree on."
            submitLabel={() => "Propose agreed date"}
            onSubmit={async (slots) => {
              await submitPostExhaustionProposal(slots[0]);
            }}
          />
        )}
      </>
    );
  } else if (hasConfirmedProposal && confirmedProposal) {
    // ── Confirmed state ──
    body = (
      <>
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 space-y-1">
          <p className="text-sm font-semibold text-green-800 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" /> Date confirmed
          </p>
          <p className="text-sm text-green-900 font-medium">
            {format(new Date(confirmedProposal.start_time), "EEE d MMM yyyy")} ·{" "}
            {getAmPmLabel(confirmedProposal.start_time)}
          </p>
        </div>

        {mode === "recipient" && quoteTotal != null && (
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
                disabled={confirmJobPending}
                onClick={hasDeposit ? () => setDepositOpen(true) : handleConfirmJobDirectly}
              >
                {hasDeposit
                  ? `Approve & Pay £${quoteDepositAmount!.toFixed(2)} Deposit`
                  : confirmJobPending
                  ? "Confirming…"
                  : "Confirm Job"}
              </Button>
            </div>
          </>
        )}

        {backoutActions}
      </>
    );
  } else if (pendingFromOther.length > 0) {
    // ── Other party has proposed — confirm one, or counter if turns remain ──
    body = (
      <>
        {turnIndicator}
        <div className="space-y-2">
          <p className="text-sm font-medium">{otherPartyLabel}&apos;s proposed slots:</p>
          {pendingFromOther.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-lg border p-3">
              <p className="text-sm font-medium">
                {format(new Date(p.start_time), "EEE d MMM yyyy")} · {getAmPmLabel(p.start_time)}
              </p>
              <Button size="sm" disabled={acceptPending} onClick={() => handleAcceptProposal(p.id)}>
                <CheckCircle2 className="h-4 w-4 mr-1" />
                Confirm this date
              </Button>
            </div>
          ))}
        </div>

        {myTurnsRemaining > 0 ? (
          <div className="space-y-2">
            {!showCounterPicker ? (
              <Button variant="outline" size="sm" onClick={() => setShowCounterPicker(true)}>
                Propose alternative dates
              </Button>
            ) : (
              <SlotPicker
                contractorId={contractorId}
                maxSlots={3}
                helperText="Select up to 3 alternative slots."
                submitLabel={(count) => `Send ${count} alternative${count !== 1 ? "s" : ""}`}
                onSubmit={async (slots) => {
                  await submitProposals(slots);
                  setShowCounterPicker(false);
                }}
              />
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            You've used both your proposal turns — confirm one of the dates above.
          </p>
        )}
      </>
    );
  } else if (pendingFromMe.length > 0) {
    // ── Waiting on my own proposal ──
    body = (
      <>
        {turnIndicator}
        <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
          <p className="text-sm font-medium">Preferences sent — waiting for {otherPartyLabel} to respond</p>
          <div className="space-y-1">
            {pendingFromMe.map((p) => (
              <div key={p.id} className="flex items-center gap-2 text-sm">
                <Badge variant="outline" className="font-normal">
                  {format(new Date(p.start_time), "EEE d MMM")} · {getAmPmLabel(p.start_time)}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      </>
    );
  } else {
    // ── Nothing proposed yet ── also reached right after a backout release
    // ("Request a different date" / "Release this date"), in which case the
    // next submission is exempt from the cap — otherwise this is an ordinary
    // fresh negotiation and must not render the picker once out of turns.
    body = (
      <>
        {turnIndicator}
        {myTurnsRemaining > 0 || awaitingBackoutResubmission ? (
          <SlotPicker
            contractorId={contractorId}
            maxSlots={3}
            helperText={`Select up to 3 available slots. ${otherPartyLabel} will confirm one.`}
            onSubmit={async (slots) => {
              await submitProposals(slots);
            }}
          />
        ) : (
          <p className="text-xs text-muted-foreground">
            You've used both your proposal turns — message {otherPartyLabel} to continue.
          </p>
        )}
      </>
    );
  }

  return (
    <>
      <Card className="border-dashed">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarClock className="h-4 w-4" />
            Schedule negotiation
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">{body}</CardContent>
      </Card>

      {hasDeposit && depositOpen && quoteTotal != null && confirmedProposal && (
        <DepositPaymentDialog
          quoteId={quoteId}
          eventId={confirmedProposal.id}
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

      {messageDialog}
    </>
  );
}
