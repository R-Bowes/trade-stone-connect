import { formatDistanceToNow } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SlaStatusPill } from "@/components/SlaStatusPill";
import type { PipelineEngagement } from "@/hooks/useContractorPipeline";
import { InlineConfirmDate } from "./InlineConfirmDate";

interface PipelineCardProps {
  engagement: PipelineEngagement;
  contractorId: string;
  onOpenQuote: (quoteId: string) => void;
  onOpenJob: (jobId: string) => void;
  onOpenNegotiation: (quoteId: string) => void;
  onOpenEnquiry: (engagement: PipelineEngagement, dialog: "quote" | "reject" | "respond") => void;
  onRefetch: () => void;
}

export function PipelineCard({
  engagement: e,
  contractorId,
  onOpenQuote,
  onOpenJob,
  onOpenNegotiation,
  onOpenEnquiry,
  onRefetch,
}: PipelineCardProps) {
  const waitingSince = formatDistanceToNow(new Date(e.sinceIso), { addSuffix: true });

  const primaryAction = () => {
    if (e.stage === "enquiry") return null; // three explicit buttons instead
    if (e.stage === "quote_sent") {
      return (
        <Button size="sm" variant="outline" onClick={() => onOpenQuote(e.quoteId!)}>
          View quote
        </Button>
      );
    }
    if (e.stage === "scheduling") {
      if (e.confirmableProposalId) {
        return (
          <div className="flex gap-2">
            <InlineConfirmDate
              quoteId={e.quoteId!}
              contractorId={contractorId}
              proposalId={e.confirmableProposalId}
              onDone={onRefetch}
            />
            <Button size="sm" variant="outline" onClick={() => onOpenNegotiation(e.quoteId!)}>
              Counter
            </Button>
          </div>
        );
      }
      return (
        <Button size="sm" variant="outline" onClick={() => onOpenNegotiation(e.quoteId!)}>
          Open scheduling
        </Button>
      );
    }
    if (e.stage === "job" || e.stage === "invoice") {
      return (
        <Button size="sm" variant="outline" onClick={() => onOpenJob(e.jobId!)}>
          Open job
        </Button>
      );
    }
    return null;
  };

  return (
    <Card className={e.band === "needs_you" ? "border-amber-200" : undefined}>
      <CardContent className="p-4 flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium truncate">{e.clientName}</span>
            {e.clientCode && (
              <Badge variant="outline" className="font-mono text-[10px] py-0">{e.clientCode}</Badge>
            )}
            {e.reference && <span className="font-mono text-xs text-muted-foreground">{e.reference}</span>}
            <SlaStatusPill status={e.slaStatus} completionDue={e.slaCompletionDue} />
          </div>
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <Badge variant="secondary" className="text-xs">{e.stageLabel}</Badge>
            <span className={e.overdue ? "text-red-600 font-medium" : "text-muted-foreground"}>{e.action}</span>
            <span className="text-xs text-muted-foreground">· {e.band === "needs_you" ? "since" : "waiting"} {waitingSince}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {e.stage === "enquiry" ? (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => onOpenEnquiry(e, "quote")}>Send quote</Button>
              <Button size="sm" variant="outline" onClick={() => onOpenEnquiry(e, "respond")}>Request info</Button>
              <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => onOpenEnquiry(e, "reject")}>
                Decline
              </Button>
            </div>
          ) : (
            primaryAction()
          )}
        </div>
      </CardContent>
    </Card>
  );
}
