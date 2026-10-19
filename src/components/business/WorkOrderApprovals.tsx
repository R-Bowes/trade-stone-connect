import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useBusinessWorkItems } from "@/hooks/useBusinessWorkItems";
import { WorkItemCard } from "@/components/shared/work/WorkItemCard";
import { ErrorState } from "@/components/AsyncState";

interface WorkOrderApprovalsProps {
  companyId: string;
  profileId: string;
}

/**
 * Approvals page, top section: pending cost lines and PO increase requests,
 * ahead of quotes. Read from the same work items the dashboard uses, so who
 * sees "Needs you" is the server's sign-off rule (limit covers the new PO
 * total), not a client guess. Each opens its work order directly.
 */
export function WorkOrderApprovals({ companyId, profileId }: WorkOrderApprovalsProps) {
  const navigate = useNavigate();
  const { items, loading, error, refetch } = useBusinessWorkItems(companyId, profileId);

  if (loading) {
    return <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }
  if (error) return <ErrorState message={error} onRetry={refetch} />;

  const approvals = items
    .filter((i) => i.kind === "cost_line" || i.kind === "po_request")
    // Needs you first; within each band the shared work-item order holds.
    .sort((a, b) => (a.band === b.band ? 0 : a.band === "needs_you" ? -1 : 1));

  if (approvals.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="font-heading text-xl font-bold">Work orders</h2>
      <div className="grid gap-3">
        {approvals.map((item) => (
          <WorkItemCard
            key={item.key}
            item={item}
            onAction={(i) => navigate(`/dashboard/business?view=work-orders&workOrder=${i.actionTarget.recordId ?? ""}`)}
          />
        ))}
      </div>
    </section>
  );
}
