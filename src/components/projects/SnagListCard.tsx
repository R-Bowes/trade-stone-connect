import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { ProjectPackage, ProjectSnag } from "@/hooks/useProjectDetail";
import { orderPackages } from "@/lib/projectPackages";
import { isSnagOpen } from "@/lib/projectSignOff";
import { formatDate } from "@/lib/formatDate";
import { messageOf } from "./projectErrors";

type Props = {
  snags: ProjectSnag[];
  packages: ProjectPackage[];
  readOnly: boolean;
  addSnag: (description: string, packageId: string | null) => Promise<void>;
  resolveSnag: (snagId: string) => Promise<void>;
};

const WHOLE_PROJECT = "__project__";

/** A light snag list: open snags first, resolved ones folded away under a count. */
export function SnagListCard({ snags, packages, readOnly, addSnag, resolveSnag }: Props) {
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const open = snags.filter(isSnagOpen);
  const resolved = snags.filter((s) => !isSnagOpen(s));
  const packageTitle = (id: string | null) => (id ? packages.find((p) => p.id === id)?.title : undefined);

  const handleResolve = async (snagId: string) => {
    setResolvingId(snagId);
    try {
      await resolveSnag(snagId);
    } catch (err) {
      toast({ title: "Snag not updated", description: messageOf(err), variant: "destructive" });
    } finally {
      setResolvingId(null);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-3">
        <div className="space-y-1">
          <CardTitle className="font-heading text-lg">Snags</CardTitle>
          <p className="text-sm text-muted-foreground">{open.length === 0 ? "None open" : `${open.length} open`}</p>
        </div>
        {!readOnly && (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <i className="ti ti-plus mr-1" aria-hidden="true" />
            Add a snag
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {open.length > 0 && (
          <ul className="divide-y rounded-md border text-sm">
            {open.map((snag) => (
              <li key={snag.id} className="flex items-start justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="break-words">{snag.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {packageTitle(snag.package_id) ?? "Whole project"} · raised {formatDate(snag.created_at)}
                  </p>
                </div>
                {!readOnly && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 whitespace-nowrap"
                    disabled={resolvingId === snag.id}
                    onClick={() => void handleResolve(snag.id)}
                  >
                    {resolvingId === snag.id && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                    Mark resolved
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        {resolved.length > 0 && (
          <div>
            <Button variant="link" className="h-auto p-0 text-sm text-muted-foreground" onClick={() => setShowResolved((v) => !v)}>
              <i className={`ti ${showResolved ? "ti-chevron-down" : "ti-chevron-right"} mr-1`} aria-hidden="true" />
              {resolved.length} resolved
            </Button>
            {showResolved && (
              <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
                {resolved.map((snag) => (
                  <li key={snag.id}>
                    <span className="line-through">{snag.description}</span>
                    <span className="block text-xs">
                      {packageTitle(snag.package_id) ?? "Whole project"}
                      {snag.resolved_at && ` · resolved ${formatDate(snag.resolved_at)}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {snags.length === 0 && (
          <p className="text-sm text-muted-foreground">Note anything that needs putting right before you sign off.</p>
        )}
      </CardContent>

      <AddSnagDialog open={adding} packages={packages} onClose={() => setAdding(false)} onSave={addSnag} />
    </Card>
  );
}

function AddSnagDialog({
  open, packages, onClose, onSave,
}: {
  open: boolean;
  packages: ProjectPackage[];
  onClose: () => void;
  onSave: (description: string, packageId: string | null) => Promise<void>;
}) {
  const [description, setDescription] = useState("");
  const [packageId, setPackageId] = useState(WHOLE_PROJECT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDescription("");
    setPackageId(WHOLE_PROJECT);
    setError(null);
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      setError("Describe the snag.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(description.trim(), packageId === WHOLE_PROJECT ? null : packageId);
      onClose();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !saving && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">Add a snag</DialogTitle>
          <DialogDescription>Something that needs putting right, such as a cracked tile or a door that sticks.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="snag-description">Description</Label>
            <Textarea
              id="snag-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={500}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Package (optional)</Label>
            <Select value={packageId} onValueChange={setPackageId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={WHOLE_PROJECT}>Whole project</SelectItem>
                {orderPackages(packages).map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add snag
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
