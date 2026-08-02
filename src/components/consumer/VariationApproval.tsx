import { useState } from "react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, Paperclip } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useJobVariations, type JobVariation, type VariationLineItem } from "@/hooks/useJobVariations";

const REASON_LABELS: Record<string, string> = {
  client_request: "Client requested change",
  unforeseen_works: "Unforeseen works discovered",
  design_change: "Design change",
  regulatory_requirement: "Regulatory requirement",
  material_substitution: "Material substitution",
  other: "Other",
};

const DOCUMENTS_BUCKET = "documents";

interface VariationApprovalProps {
  variation: JobVariation;
  onResponded: () => void;
}

export function VariationApproval({ variation, onResponded }: VariationApprovalProps) {
  const { respondToVariation } = useJobVariations();
  const [note, setNote] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingDecision, setPendingDecision] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fmt = (n: number) => Number(n).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const items = Array.isArray(variation.items) ? (variation.items as unknown as VariationLineItem[]) : [];
  const docs = Array.isArray(variation.supporting_documents) ? (variation.supporting_documents as unknown as string[]) : [];

  const openDoc = async (path: string) => {
    const { data } = supabase.storage.from(DOCUMENTS_BUCKET).getPublicUrl(path);
    if (data?.publicUrl) window.open(data.publicUrl, "_blank");
  };

  const handleDecision = async () => {
    if (pendingDecision === null) return;
    setSubmitting(true);
    try {
      await respondToVariation(variation.id, pendingDecision, note.trim() || undefined);
      setConfirmOpen(false);
      onResponded();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Card className="border-amber-300 bg-amber-50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Variation Request #{variation.variation_number}</CardTitle>
            <Badge variant="outline">{REASON_LABELS[variation.reason] ?? variation.reason}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="font-medium">{variation.title}</p>
            <p className="text-sm text-muted-foreground">{variation.description}</p>
          </div>

          {items.length > 0 && (
            <div className="rounded-md border bg-white overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 text-xs text-muted-foreground">
                    <th className="text-left font-medium px-3 py-2">Description</th>
                    <th className="text-right font-medium px-3 py-2">Qty</th>
                    <th className="text-right font-medium px-3 py-2">Unit price</th>
                    <th className="text-right font-medium px-3 py-2">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-3 py-2">{item.description}</td>
                      <td className="px-3 py-2 text-right">{item.quantity}</td>
                      <td className="px-3 py-2 text-right">£{fmt(item.unitPrice)}</td>
                      <td className="px-3 py-2 text-right">£{fmt(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="text-sm font-medium">
            {Number(variation.amount) >= 0 ? "+" : ""}£{fmt(variation.amount)} — revised total: £{fmt(variation.revised_contract_value)}
          </div>

          {docs.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {docs.map((path, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => openDoc(path)}
                  className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-full bg-white border hover:border-[#f07820]"
                >
                  <Paperclip className="h-3 w-3" />Document {i + 1}
                </button>
              ))}
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Response note (optional)</label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} disabled={submitting} />
          </div>

          <div className="flex gap-2">
            <Button
              className="text-white font-semibold"
              style={{ backgroundColor: "#16a34a" }}
              onClick={() => { setPendingDecision(true); setConfirmOpen(true); }}
              disabled={submitting}
            >
              Approve
            </Button>
            <Button variant="destructive" onClick={() => { setPendingDecision(false); setConfirmOpen(true); }} disabled={submitting}>
              Reject
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{pendingDecision ? "Approve this variation?" : "Reject this variation?"}</DialogTitle>
            <DialogDescription>
              {pendingDecision
                ? `Approving this variation will update the contract value from £${fmt(variation.original_contract_value)} to £${fmt(variation.revised_contract_value)}. This is a binding agreement.`
                : "The contractor will be notified that this variation was rejected."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={submitting}>Back</Button>
            <Button
              onClick={handleDecision}
              disabled={submitting}
              style={pendingDecision ? { backgroundColor: "#16a34a", color: "#fff" } : undefined}
              variant={pendingDecision ? undefined : "destructive"}
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {pendingDecision ? "Approve" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
