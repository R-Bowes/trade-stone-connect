import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Check, HelpCircle, Loader2, X } from "lucide-react";
import type { WorkOrderCost } from "@/lib/costLines";

type ReasonMode = "query" | "reject";

interface CostReviewActionsProps {
  line: WorkOrderCost;
  approve: (costId: string) => Promise<boolean>;
  query: (costId: string, reason: string) => Promise<boolean>;
  reject: (costId: string, reason: string) => Promise<boolean>;
  onChanged: () => void;
}

/**
 * Approve / query / reject for one cost line. A pending line can be approved,
 * queried or rejected; a queried line is with the contractor, so only reject
 * remains. Approved and rejected lines have no actions.
 */
export function CostReviewActions({ line, approve, query, reject, onChanged }: CostReviewActionsProps) {
  const [mode, setMode] = useState<ReasonMode | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  if (line.status !== "pending" && line.status !== "queried") return null;

  const close = () => {
    setMode(null);
    setReason("");
  };

  const handleApprove = async () => {
    setBusy(true);
    try {
      if (await approve(line.id)) onChanged();
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmReason = async () => {
    if (!mode || reason.trim() === "") return;
    setBusy(true);
    try {
      const ok = mode === "query" ? await query(line.id, reason.trim()) : await reject(line.id, reason.trim());
      if (ok) {
        close();
        onChanged();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {line.status === "pending" && (
        <>
          <Button size="sm" onClick={handleApprove} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
            Approve
          </Button>
          <Button size="sm" variant="outline" onClick={() => setMode("query")} disabled={busy}>
            <HelpCircle className="h-4 w-4 mr-1" />Query
          </Button>
        </>
      )}
      <Button size="sm" variant="outline" onClick={() => setMode("reject")} disabled={busy}>
        <X className="h-4 w-4 mr-1" />Reject
      </Button>

      <Dialog open={mode !== null} onOpenChange={(o) => { if (!o) close(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{mode === "query" ? "Query this cost line" : "Reject this cost line"}</DialogTitle>
            <DialogDescription>
              {mode === "query"
                ? "The contractor will see your reason and can amend and resubmit the line."
                : "A rejected line is never invoiced and cannot be resubmitted."}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={3}
            placeholder="Reason (required)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={close}>Cancel</Button>
            <Button
              variant={mode === "reject" ? "destructive" : "default"}
              onClick={handleConfirmReason}
              disabled={busy || reason.trim() === ""}
            >
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {mode === "query" ? "Send query" : "Reject line"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
