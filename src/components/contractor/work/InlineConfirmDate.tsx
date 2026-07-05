import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuoteScheduling } from "@/hooks/useQuoteScheduling";
import { useSubmitGuard } from "@/hooks/useSubmitGuard";

/**
 * One-click "Confirm this date" for a pipeline card — mounts its own
 * useQuoteScheduling instance so it goes through the same confirm path
 * (submit guard + jobExists guard) as the full negotiation dialog, without
 * pulling in the rest of that dialog's UI.
 */
export function InlineConfirmDate({
  quoteId,
  contractorId,
  proposalId,
  onDone,
}: {
  quoteId: string;
  contractorId: string;
  proposalId: string;
  onDone: () => void;
}) {
  const { acceptProposal, jobExists, loading } = useQuoteScheduling(quoteId, contractorId);
  const { pending, guard } = useSubmitGuard();

  const handleConfirm = guard(async () => {
    if (jobExists) return;
    await acceptProposal(proposalId);
    onDone();
  });

  return (
    <Button
      size="sm"
      style={{ backgroundColor: "#f07820", color: "#fff" }}
      disabled={loading || pending || jobExists}
      onClick={handleConfirm}
    >
      {pending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
      Confirm date
    </Button>
  );
}
