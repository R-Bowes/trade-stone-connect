import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { formatGBP } from "@/lib/formatGBP";
import { COST_KIND_LABEL, round2, type WorkOrderCost } from "@/lib/costLines";
import { readRateSnapshot } from "@/components/shared/WorkOrderCard";
import type { CostInput } from "@/hooks/useWorkOrderCosts";

type CalloutChoice = "none" | "callout_standard" | "callout_ooh";

interface PreviewLine {
  label: string;
  amount: number;
}

const numOrNull = (value: string): number | null => {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

// ── Record costs (create: several components at once) ──────────────────────

export function RecordCostsDialog({
  open,
  onOpenChange,
  workOrderTitle,
  rateSnapshot,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workOrderTitle: string;
  rateSnapshot: Record<string, unknown> | null;
  /** Records one component; resolves true on success. Called once per component, in order. */
  onSubmit: (input: CostInput) => Promise<boolean>;
}) {
  const rates = readRateSnapshot(rateSnapshot);
  const [callout, setCallout] = useState<CalloutChoice>("none");
  const [hours, setHours] = useState("");
  const [materials, setMaterials] = useState("");
  const [otherDescription, setOtherDescription] = useState("");
  const [otherAmount, setOtherAmount] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setCallout("none");
    setHours("");
    setMaterials("");
    setOtherDescription("");
    setOtherAmount("");
  };

  // Mirrors the server's pricing (_price_cost_line) so the total is visible as
  // they type; the server recomputes from the snapshot regardless.
  const { preview, components, problem } = useMemo(() => {
    const lines: PreviewLine[] = [];
    const comps: CostInput[] = [];
    let issue: string | null = null;

    if (!rates) {
      return { preview: lines, components: comps, problem: "This work order has no agreed rates on record." };
    }

    if (callout === "callout_standard" && rates.calloutStandard != null) {
      lines.push({ label: COST_KIND_LABEL.callout_standard, amount: rates.calloutStandard });
      comps.push({ kind: "callout_standard" });
    } else if (callout === "callout_ooh" && rates.calloutOoh != null) {
      lines.push({ label: COST_KIND_LABEL.callout_ooh, amount: rates.calloutOoh });
      comps.push({ kind: "callout_ooh" });
    }

    const h = numOrNull(hours);
    if (h != null) {
      if (h <= 0) issue = "Hours must be greater than zero.";
      else if (rates.hourlyRate != null) {
        lines.push({ label: `Labour: ${h} hrs × ${formatGBP(rates.hourlyRate)}`, amount: round2(h * rates.hourlyRate) });
        comps.push({ kind: "hours", quantity: h });
      }
    }

    const m = numOrNull(materials);
    if (m != null) {
      if (m < 0) issue = "Materials cost cannot be negative.";
      else if (rates.materialsMarkupPct != null) {
        lines.push({
          label: `Materials: ${formatGBP(m)} + ${rates.materialsMarkupPct}% markup`,
          amount: round2(m * (1 + rates.materialsMarkupPct / 100)),
        });
        comps.push({ kind: "materials", unitCost: m });
      }
    }

    const o = numOrNull(otherAmount);
    if (o != null || otherDescription.trim() !== "") {
      if (o == null || o < 0) issue = "Enter an amount for the other cost.";
      else if (otherDescription.trim() === "") issue = "Describe the other cost.";
      else {
        lines.push({ label: `Other — ${otherDescription.trim()}`, amount: round2(o) });
        comps.push({ kind: "other", unitCost: o, description: otherDescription.trim() });
      }
    }

    return { preview: lines, components: comps, problem: issue };
  }, [rates, callout, hours, materials, otherAmount, otherDescription]);

  const total = round2(preview.reduce((sum, l) => sum + l.amount, 0));

  const handleSubmit = async () => {
    if (components.length === 0 || problem) return;
    setSaving(true);
    try {
      for (const component of components) {
        const ok = await onSubmit(component);
        if (!ok) return; // the caller toasts; lines already recorded stay recorded
      }
      reset();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Record costs</DialogTitle>
          <DialogDescription>{workOrderTitle}. Priced from the rates agreed when this work order was dispatched.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Call-out</Label>
            <Select value={callout} onValueChange={(v) => setCallout(v as CalloutChoice)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No call-out</SelectItem>
                <SelectItem value="callout_standard">
                  Standard call-out{rates?.calloutStandard != null ? ` — ${formatGBP(rates.calloutStandard)}` : ""}
                </SelectItem>
                <SelectItem value="callout_ooh">
                  Out-of-hours call-out{rates?.calloutOoh != null ? ` — ${formatGBP(rates.calloutOoh)}` : ""}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Hours worked{rates?.hourlyRate != null ? ` (at ${formatGBP(rates.hourlyRate)} an hour)` : ""}</Label>
            <Input type="number" min={0} step="0.25" value={hours} onChange={(e) => setHours(e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label>
              Materials cost (£){rates?.materialsMarkupPct != null ? ` — ${rates.materialsMarkupPct}% markup is added` : ""}
            </Label>
            <Input type="number" min={0} step="0.01" value={materials} onChange={(e) => setMaterials(e.target.value)} />
          </div>

          <div className="space-y-2 rounded-md border p-3">
            <Label>Anything else (optional)</Label>
            <Input placeholder="Description" value={otherDescription} onChange={(e) => setOtherDescription(e.target.value)} />
            <Input type="number" min={0} step="0.01" placeholder="Amount (£)" value={otherAmount} onChange={(e) => setOtherAmount(e.target.value)} />
          </div>

          <div className="rounded-md bg-muted/50 p-3 text-sm space-y-1">
            {preview.length === 0 ? (
              <p className="text-muted-foreground">Add a call-out, hours or materials to see the total.</p>
            ) : (
              <>
                {preview.map((l, i) => (
                  <div key={i} className="flex justify-between gap-3">
                    <span>{l.label}</span>
                    <span>{formatGBP(l.amount)}</span>
                  </div>
                ))}
                <div className="flex justify-between gap-3 border-t pt-1 font-semibold">
                  <span>Total</span>
                  <span>{formatGBP(total)}</span>
                </div>
              </>
            )}
            {problem && <p className="text-destructive">{problem}</p>}
          </div>
          <p className="text-xs text-muted-foreground">
            Each line goes to the business for approval unless it falls under their approval limit.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving || components.length === 0 || !!problem}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Submit costs
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Amend / resubmit one line ───────────────────────────────────────────────

export function AmendCostDialog({
  line,
  rateSnapshot,
  onOpenChange,
  onSubmit,
}: {
  line: WorkOrderCost | null;
  rateSnapshot: Record<string, unknown> | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (costId: string, input: Omit<CostInput, "kind">) => Promise<boolean>;
}) {
  const rates = readRateSnapshot(rateSnapshot);
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [seenLineId, setSeenLineId] = useState<string | null>(null);

  // Re-seed the fields whenever a different line is opened.
  if (line && line.id !== seenLineId) {
    setSeenLineId(line.id);
    setQuantity(line.kind === "hours" ? String(Number(line.quantity)) : "");
    setUnitCost(line.kind === "materials" || line.kind === "other" ? String(Number(line.unit_rate)) : "");
    setDescription(line.description ?? "");
  }
  if (!line && seenLineId) setSeenLineId(null);

  if (!line) return null;

  const h = numOrNull(quantity);
  const c = numOrNull(unitCost);
  let newTotal: number | null = null;
  if (line.kind === "callout_standard") newTotal = rates?.calloutStandard ?? null;
  else if (line.kind === "callout_ooh") newTotal = rates?.calloutOoh ?? null;
  else if (line.kind === "hours" && h != null && rates?.hourlyRate != null) newTotal = round2(h * rates.hourlyRate);
  else if (line.kind === "materials" && c != null && rates?.materialsMarkupPct != null) {
    newTotal = round2(Number(line.quantity) * c * (1 + rates.materialsMarkupPct / 100));
  } else if (line.kind === "other" && c != null) newTotal = round2(Number(line.quantity) * c);

  const invalid =
    (line.kind === "hours" && (h == null || h <= 0)) ||
    ((line.kind === "materials" || line.kind === "other") && (c == null || c < 0)) ||
    (line.kind === "other" && description.trim() === "");

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const ok = await onSubmit(line.id, {
        quantity: line.kind === "hours" ? (h ?? undefined) : Number(line.quantity),
        unitCost: line.kind === "materials" || line.kind === "other" ? (c ?? undefined) : undefined,
        description: description.trim() || undefined,
      });
      if (ok) onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Amend and resubmit</DialogTitle>
          <DialogDescription>
            {COST_KIND_LABEL[line.kind as keyof typeof COST_KIND_LABEL] ?? line.kind}. The line goes back to the business for approval.
          </DialogDescription>
        </DialogHeader>

        {line.status === "queried" && line.queried_reason && (
          <div className="rounded-md border border-orange-200 bg-orange-50 p-3 text-sm text-orange-900">
            Query: {line.queried_reason}
          </div>
        )}

        <div className="space-y-3">
          {line.kind === "hours" && (
            <div className="space-y-1">
              <Label>Hours worked</Label>
              <Input type="number" min={0} step="0.25" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </div>
          )}
          {(line.kind === "materials" || line.kind === "other") && (
            <div className="space-y-1">
              <Label>{line.kind === "materials" ? "Materials cost (£)" : "Amount (£)"}</Label>
              <Input type="number" min={0} step="0.01" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
            </div>
          )}
          <div className="space-y-1">
            <Label>{line.kind === "other" ? "Description" : "Note (optional)"}</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          {newTotal != null && (
            <div className="rounded-md bg-muted/50 p-3 text-sm flex justify-between font-semibold">
              <span>Line total</span>
              <span>{formatGBP(newTotal)}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving || invalid}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Resubmit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
