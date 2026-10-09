import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import type { HomeownerProject, ProjectFormValues } from "@/hooks/useHomeownerProjects";
import { messageOf } from "./projectErrors";

export interface ProjectDialogValues extends ProjectFormValues {
  /** Business projects only — the sites selected in the picker below. */
  siteIds?: string[];
}

export interface ProjectSiteOption {
  id: string;
  name: string;
}

type Props = {
  open: boolean;
  onClose: () => void;
  /** When set, the dialog edits this project instead of creating one. */
  project?: HomeownerProject | null;
  /**
   * Business projects only. When provided (and not editing), a site
   * picker is shown and at least one site is required.
   */
  sites?: ProjectSiteOption[];
  /** Saves the values; throws with a message the dialog shows on failure. */
  onSave: (values: ProjectDialogValues) => Promise<void>;
};


export function CreateProjectDialog({ open, onClose, project, sites, onSave }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [budget, setBudget] = useState("");
  const [targetStart, setTargetStart] = useState("");
  const [targetEnd, setTargetEnd] = useState("");
  const [siteIds, setSiteIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = !!project;
  const showSitePicker = !!sites && !isEdit;

  useEffect(() => {
    if (!open) return;
    setTitle(project?.title ?? "");
    setDescription(project?.description ?? "");
    setBudget(project?.budget != null ? String(project.budget) : "");
    setTargetStart(project?.target_start ?? "");
    setTargetEnd(project?.target_end ?? "");
    setSiteIds([]);
    setError(null);
  }, [open, project]);

  const toggleSite = (id: string) => {
    setSiteIds((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  };

  const validate = (): string | null => {
    if (!title.trim()) return "Give the project a name.";
    if (budget.trim() !== "") {
      const n = Number(budget);
      if (!Number.isFinite(n) || n < 0) return "The budget must be zero or more.";
    }
    if (targetStart && targetEnd && targetEnd < targetStart) {
      return "The target finish can't be before the target start.";
    }
    if (showSitePicker && siteIds.length === 0) {
      return "Select at least one site.";
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        title: title.trim(),
        description: description.trim() || null,
        budget: budget.trim() === "" ? null : Number(budget),
        target_start: targetStart || null,
        target_end: targetEnd || null,
        ...(showSitePicker ? { siteIds } : {}),
      });
      onClose();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !saving && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading">{isEdit ? "Edit project" : "New project"}</DialogTitle>
          <DialogDescription>
            A project groups the jobs for one piece of work so you can see the dates and costs together.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="project-title">Name</Label>
            <Input
              id="project-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Kitchen extension"
              maxLength={120}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="project-description">Description (optional)</Label>
            <Textarea
              id="project-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="project-budget">Budget (£, optional)</Label>
            <Input
              id="project-budget"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              className="font-mono"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="project-start">Target start (optional)</Label>
              <Input id="project-start" type="date" value={targetStart} onChange={(e) => setTargetStart(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-end">Target finish (optional)</Label>
              <Input
                id="project-end"
                type="date"
                value={targetEnd}
                min={targetStart || undefined}
                onChange={(e) => setTargetEnd(e.target.value)}
              />
            </div>
          </div>

          {showSitePicker && (
            <div className="space-y-2">
              <Label>Sites ({siteIds.length} selected)</Label>
              {sites!.length === 0 ? (
                <p className="text-sm text-muted-foreground">No sites in your company yet.</p>
              ) : (
                <div className="max-h-48 overflow-y-auto border border-input rounded-md p-1">
                  {sites!.map((s) => (
                    <label
                      key={s.id}
                      className="flex items-center gap-2 cursor-pointer py-1.5 px-2 rounded hover:bg-muted"
                    >
                      <input
                        type="checkbox"
                        checked={siteIds.includes(s.id)}
                        onChange={() => toggleSite(s.id)}
                        style={{ accentColor: "#f07820", width: 14, height: 14 }}
                      />
                      <span className="text-sm">{s.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isEdit ? "Save changes" : "Create project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
