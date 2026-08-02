import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Plus } from "lucide-react";
import { useJobVariations, type JobVariation } from "@/hooks/useJobVariations";
import { VariationRequestForm } from "./VariationRequestForm";
import { VariationApproval } from "@/components/consumer/VariationApproval";

const STATUS_BADGE: Record<string, { label: string; style: React.CSSProperties }> = {
  pending: { label: "Pending", style: { backgroundColor: "#f59e0b", color: "#fff" } },
  approved: { label: "Approved", style: { backgroundColor: "#16a34a", color: "#fff" } },
  rejected: { label: "Rejected", style: { backgroundColor: "#dc2626", color: "#fff" } },
  withdrawn: { label: "Withdrawn", style: { backgroundColor: "#9ca3af", color: "#fff" } },
};

interface VariationsSectionProps {
  jobId: string;
  contractorId: string;
  customerId: string;
  currentContractValue: number;
  isContractor: boolean;
}

export function VariationsSection({ jobId, contractorId, customerId, currentContractValue, isContractor }: VariationsSectionProps) {
  const { variations, loading, totalApprovedVariations, fetchVariations, withdrawVariation } = useJobVariations();
  const [formOpen, setFormOpen] = useState(false);

  useEffect(() => {
    void fetchVariations(jobId);
  }, [jobId, fetchVariations]);

  if (loading && variations.length === 0 && !isContractor) return null;
  if (!isContractor && variations.length === 0) return null;

  const fmt = (n: number) => Number(n).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const originalValue = currentContractValue - totalApprovedVariations;
  const pendingVariations = variations.filter((v) => v.status === "pending");

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Variations</CardTitle>
          {isContractor && (
            <Button size="sm" style={{ backgroundColor: "#f07820" }} className="text-white" onClick={() => setFormOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" />Raise Variation
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && variations.length === 0 && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading variations...
          </div>
        )}

        {variations.length > 0 && (
          <>
            <p className="text-sm text-muted-foreground">
              Original value: £{fmt(originalValue)} | Variations: {totalApprovedVariations >= 0 ? "+" : ""}£{fmt(totalApprovedVariations)} | Current value: £{fmt(currentContractValue)}
            </p>

            {!isContractor && pendingVariations.map((v) => (
              <VariationApproval key={v.id} variation={v} onResponded={() => void fetchVariations(jobId)} />
            ))}

            <div className="space-y-2">
              {variations.filter((v) => isContractor || v.status !== "pending").map((v) => (
                <VariationRow key={v.id} variation={v} isContractor={isContractor} onWithdraw={() => withdrawVariation(v.id)} />
              ))}
            </div>
          </>
        )}

        {isContractor && variations.length === 0 && !loading && (
          <p className="text-sm text-muted-foreground">No variations raised for this job yet.</p>
        )}
      </CardContent>

      {isContractor && (
        <VariationRequestForm
          open={formOpen}
          jobId={jobId}
          contractorId={contractorId}
          customerId={customerId}
          currentContractValue={currentContractValue}
          onClose={() => setFormOpen(false)}
          onSubmitted={() => void fetchVariations(jobId)}
        />
      )}
    </Card>
  );
}

function VariationRow({ variation, isContractor, onWithdraw }: { variation: JobVariation; isContractor: boolean; onWithdraw: () => void }) {
  const badge = STATUS_BADGE[variation.status] ?? STATUS_BADGE.pending;
  const fmt = (n: number) => Number(n).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="rounded-md border p-3 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">#{variation.variation_number} {variation.title}</p>
        <p className="text-xs text-muted-foreground">
          {variation.amount >= 0 ? "+" : ""}£{fmt(variation.amount)}
          {variation.status === "approved" && variation.responded_at && ` · Approved ${format(new Date(variation.responded_at), "d MMM yyyy")}`}
          {variation.status === "rejected" && (
            <> · Rejected{variation.response_note ? `: ${variation.response_note}` : ""}</>
          )}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Badge style={badge.style}>{badge.label}</Badge>
        {isContractor && variation.status === "pending" && (
          <Button size="sm" variant="outline" onClick={onWithdraw}>Withdraw</Button>
        )}
      </div>
    </div>
  );
}
