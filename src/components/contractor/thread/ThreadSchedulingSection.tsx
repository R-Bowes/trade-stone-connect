import { QuoteScheduleNegotiation } from "@/components/recipient/QuoteScheduleNegotiation";

/**
 * Mounted inline (not a dialog) when the engagement's stage is 'scheduling' —
 * the thread's design principle is one continuous vertical story, not a
 * pop-over on top of it.
 */
export function ThreadSchedulingSection({
  quoteId,
  contractorId,
  onChanged,
}: {
  quoteId: string;
  contractorId: string;
  onChanged: () => void;
}) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Scheduling</h3>
      <QuoteScheduleNegotiation
        quoteId={quoteId}
        contractorId={contractorId}
        mode="contractor"
        onJobConfirmed={onChanged}
      />
    </div>
  );
}
