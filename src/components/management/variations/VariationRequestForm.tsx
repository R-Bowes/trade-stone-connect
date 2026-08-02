import { useState, useCallback } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Trash2, Paperclip, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useJobVariations, type VariationLineItem } from "@/hooks/useJobVariations";
import type { Database } from "@/integrations/supabase/types";

type VariationReason = Database["public"]["Tables"]["job_variations"]["Row"]["reason"];

const REASON_LABELS: Record<VariationReason, string> = {
  client_request: "Client requested change",
  unforeseen_works: "Unforeseen works discovered",
  design_change: "Design change",
  regulatory_requirement: "Regulatory requirement",
  material_substitution: "Material substitution",
  other: "Other",
};

interface Line extends VariationLineItem {
  key: string;
}

function blankLine(): Line {
  return { key: crypto.randomUUID(), description: "", quantity: 1, unitPrice: 0, total: 0 };
}

interface VariationRequestFormProps {
  open: boolean;
  jobId: string;
  contractorId: string;
  customerId: string;
  currentContractValue: number;
  onClose: () => void;
  onSubmitted: () => void;
}

const DOCUMENTS_BUCKET = "documents";

export function VariationRequestForm({
  open, jobId, contractorId, customerId, currentContractValue, onClose, onSubmitted,
}: VariationRequestFormProps) {
  const { submitVariation } = useJobVariations();
  const { toast } = useToast();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [reason, setReason] = useState<VariationReason>("client_request");
  const [lines, setLines] = useState<Line[]>([blankLine()]);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const reset = useCallback(() => {
    setTitle("");
    setDescription("");
    setReason("client_request");
    setLines([blankLine()]);
    setFiles([]);
  }, []);

  const updateLine = (key: string, patch: Partial<Omit<Line, "key">>) => {
    setLines((prev) => prev.map((l) => {
      if (l.key !== key) return l;
      const next = { ...l, ...patch };
      next.total = next.quantity * next.unitPrice;
      return next;
    }));
  };

  const removeLine = (key: string) => setLines((prev) => prev.filter((l) => l.key !== key));
  const addLine = () => setLines((prev) => [...prev, blankLine()]);

  const amount = lines.reduce((sum, l) => sum + l.total, 0);
  const revisedValue = currentContractValue + amount;
  const fmt = (n: number) => n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const handleSubmit = async () => {
    const filledLines = lines.filter((l) => l.description.trim());
    if (!title.trim()) {
      toast({ title: "Title required", variant: "destructive" });
      return;
    }
    if (!description.trim()) {
      toast({ title: "Description required", variant: "destructive" });
      return;
    }
    if (filledLines.length === 0) {
      toast({ title: "At least one line item required", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      let uploadedPaths: string[] = [];
      if (files.length > 0) {
        setUploading(true);
        const uploads = await Promise.all(files.map(async (file) => {
          const ext = file.name.split(".").pop();
          const path = `variations/${contractorId}/${jobId}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
          const { error } = await supabase.storage.from(DOCUMENTS_BUCKET).upload(path, file);
          if (error) throw error;
          return path;
        }));
        uploadedPaths = uploads;
        setUploading(false);
      }

      await submitVariation({
        jobId,
        contractorId,
        customerId,
        title: title.trim(),
        description: description.trim(),
        reason,
        items: filledLines.map(({ key, ...rest }) => rest),
        amount,
        currentContractValue,
        supportingDocuments: uploadedPaths,
      });

      reset();
      onSubmitted();
      onClose();
    } catch (err) {
      console.error("Failed to submit variation:", err);
    } finally {
      setSubmitting(false);
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Raise Variation Request</DialogTitle>
          <DialogDescription>Formalise a scope change for customer approval.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <Label>Reason</Label>
            <Select value={reason} onValueChange={(v) => setReason(v as VariationReason)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(REASON_LABELS) as VariationReason[]).map((r) => (
                  <SelectItem key={r} value={r}>{REASON_LABELS[r]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="variation-title">Title</Label>
            <Input
              id="variation-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Additional plastering — damp behind tiles"
              disabled={submitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="variation-description">Description</Label>
            <Textarea
              id="variation-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What changed and why..."
              className="min-h-20"
              disabled={submitting}
            />
          </div>

          <div className="space-y-2">
            <Label>Line items</Label>
            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_72px_104px_88px_32px] gap-2 px-1 text-xs font-medium text-muted-foreground">
                <span>Description</span>
                <span className="text-right">Qty</span>
                <span className="text-right">Unit price (£)</span>
                <span className="text-right">Total</span>
                <span />
              </div>
              {lines.map((line) => (
                <div key={line.key} className="grid grid-cols-[1fr_72px_104px_88px_32px] gap-2 items-center">
                  <Input
                    value={line.description}
                    onChange={(e) => updateLine(line.key, { description: e.target.value })}
                    placeholder="Item description"
                    disabled={submitting}
                  />
                  <Input
                    type="number"
                    min={0}
                    value={line.quantity}
                    onChange={(e) => updateLine(line.key, { quantity: Number(e.target.value) })}
                    className="text-right"
                    disabled={submitting}
                  />
                  <Input
                    type="number"
                    step={0.01}
                    value={line.unitPrice}
                    onChange={(e) => updateLine(line.key, { unitPrice: Number(e.target.value) })}
                    className="text-right"
                    disabled={submitting}
                  />
                  <span className="text-right text-sm">£{fmt(line.total)}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => removeLine(line.key)}
                    disabled={submitting || lines.length === 1}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addLine} disabled={submitting}>
                <Plus className="h-4 w-4 mr-2" />Add line
              </Button>
            </div>
          </div>

          <div className="rounded-md border p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{amount >= 0 ? "Additional cost" : "Reduction"}</span>
              <span className={amount >= 0 ? "font-medium" : "font-medium text-green-700"}>
                {amount >= 0 ? "+" : ""}£{fmt(amount)}
              </span>
            </div>
            <div className="flex justify-between font-semibold border-t pt-2">
              <span>Revised contract value</span>
              <span>£{fmt(revisedValue)} <span className="text-xs font-normal text-muted-foreground">(was £{fmt(currentContractValue)})</span></span>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Supporting documents (optional)</Label>
            <div className="flex flex-wrap gap-2">
              {files.map((f, i) => (
                <span key={i} className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-full bg-muted border">
                  <Paperclip className="h-3 w-3" />{f.name}
                  <button type="button" onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <Input
              type="file"
              multiple
              accept="image/*,.pdf"
              onChange={(e) => setFiles((prev) => [...prev, ...Array.from(e.target.files ?? [])])}
              disabled={submitting}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button onClick={() => void handleSubmit()} disabled={submitting} style={{ backgroundColor: "#f07820" }} className="text-white">
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {uploading ? "Uploading..." : "Submit Variation Request"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
