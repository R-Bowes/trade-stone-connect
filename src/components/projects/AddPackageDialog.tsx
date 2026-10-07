import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { CONTRACTOR_TRADES } from "@/constants/trades";
import type { PackageFormValues, ProjectPackage } from "@/hooks/useProjectDetail";
import { messageOf } from "./projectErrors";

type Props = {
  open: boolean;
  onClose: () => void;
  /** When set, the dialog edits this package instead of adding one. */
  pkg?: ProjectPackage | null;
  onSave: (values: PackageFormValues) => Promise<void>;
};

const NO_TRADE = "__none__";

export function AddPackageDialog({ open, onClose, pkg, onSave }: Props) {
  const [title, setTitle] = useState("");
  const [trade, setTrade] = useState<string>(NO_TRADE);
  const [neededFrom, setNeededFrom] = useState("");
  const [neededTo, setNeededTo] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(pkg?.title ?? "");
    setTrade(pkg?.trade ?? NO_TRADE);
    setNeededFrom(pkg?.needed_from ?? "");
    setNeededTo(pkg?.needed_to ?? "");
    setError(null);
  }, [open, pkg]);

  // A package saved before the standard list changed keeps its own trade.
  const tradeOptions = pkg?.trade && !CONTRACTOR_TRADES.includes(pkg.trade as (typeof CONTRACTOR_TRADES)[number])
    ? [pkg.trade, ...CONTRACTOR_TRADES]
    : [...CONTRACTOR_TRADES];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Give the package a title.");
      return;
    }
    if (neededFrom && neededTo && neededTo < neededFrom) {
      setError("'Needed to' can't be before 'needed from'.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        title: title.trim(),
        trade: trade === NO_TRADE ? null : trade,
        needed_from: neededFrom || null,
        needed_to: neededTo || null,
      });
      onClose();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setSaving(false);
    }
  };

  const isEdit = !!pkg;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !saving && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading">{isEdit ? "Edit package" : "Add a package"}</DialogTitle>
          <DialogDescription>
            A package is one piece of the work, such as the electrics or the plastering, done by one contractor.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="package-title">Title</Label>
            <Input
              id="package-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Rewire ground floor"
              maxLength={120}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Trade (optional)</Label>
            <Select value={trade} onValueChange={setTrade}>
              <SelectTrigger><SelectValue placeholder="Choose a trade" /></SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value={NO_TRADE}>No trade</SelectItem>
                {tradeOptions.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="package-from">Needed from (optional)</Label>
              <Input id="package-from" type="date" value={neededFrom} onChange={(e) => setNeededFrom(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="package-to">Needed to (optional)</Label>
              <Input
                id="package-to"
                type="date"
                value={neededTo}
                min={neededFrom || undefined}
                onChange={(e) => setNeededTo(e.target.value)}
              />
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isEdit ? "Save changes" : "Add package"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
