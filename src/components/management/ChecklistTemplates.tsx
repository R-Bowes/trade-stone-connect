import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Database } from "@/integrations/supabase/types";
import { JOB_TYPES } from "@/lib/jobLabels";

type TemplateRow = Database["public"]["Tables"]["job_checklist_templates"]["Row"];
type Stage = "work_started" | "final_checks";

const STAGE_LABEL: Record<Stage, string> = {
  work_started: "Work started",
  final_checks: "Final checks",
};

interface Template {
  name: string;
  jobType: string | null;
  items: TemplateRow[];
}

/**
 * Owner-only checklist template library. Templates are groups of
 * job_checklist_templates rows sharing (contractor_id, name) — the table
 * has no separate "template" entity, see 20260808120000's header comment.
 * Team members have no access here (no acting_contractor_ids() anywhere).
 */
export function ChecklistTemplates() {
  const [contractorId, setContractorId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newJobType, setNewJobType] = useState<string>("other");
  const [saving, setSaving] = useState(false);

  const [editing, setEditing] = useState<Template | null>(null);
  const [itemText, setItemText] = useState("");
  const [itemStage, setItemStage] = useState<Stage>("work_started");
  const [addingItem, setAddingItem] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", user.id).maybeSingle();
    const cId = profile?.id ?? null;
    setContractorId(cId);
    if (!cId) {
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("job_checklist_templates")
      .select("*")
      .eq("contractor_id", cId)
      .order("name")
      .order("sort_order");

    if (error) {
      console.error("Error loading checklist templates:", error);
      toast.error("Failed to load checklist templates");
      setLoading(false);
      return;
    }

    const groups: Record<string, Template> = {};
    for (const row of data ?? []) {
      const key = row.name ?? "Untitled";
      if (!groups[key]) groups[key] = { name: key, jobType: row.job_type, items: [] };
      groups[key].items.push(row);
    }
    setTemplates(Object.values(groups));
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async () => {
    if (!contractorId) return;
    const name = newName.trim();
    if (!name) {
      toast.error("Template name is required");
      return;
    }
    if (templates.some((t) => t.name === name)) {
      toast.error("A template with this name already exists");
      return;
    }
    setSaving(true);
    try {
      // A template with zero items yet is represented by nothing in the DB
      // until the first item is added — open it straight into edit mode so
      // the owner adds at least one item now.
      setCreateOpen(false);
      setEditing({ name, jobType: newJobType, items: [] });
      setNewName("");
      setNewJobType("other");
    } finally {
      setSaving(false);
    }
  };

  const handleAddItem = async () => {
    if (!contractorId || !editing) return;
    const text = itemText.trim();
    if (!text) return;
    setAddingItem(true);
    const sortOrder = editing.items.filter((i) => i.stage === itemStage).length;
    const { data, error } = await supabase
      .from("job_checklist_templates")
      .insert({
        contractor_id: contractorId,
        name: editing.name,
        job_type: editing.jobType ?? "other",
        stage: itemStage,
        item_text: text,
        sort_order: sortOrder,
      })
      .select()
      .single();
    if (error) {
      toast.error("Failed to add item");
    } else if (data) {
      setEditing((cur) => (cur ? { ...cur, items: [...cur.items, data] } : cur));
      setItemText("");
      await load();
    }
    setAddingItem(false);
  };

  const handleDeleteItem = async (item: TemplateRow) => {
    const { error } = await supabase.from("job_checklist_templates").delete().eq("id", item.id);
    if (error) {
      toast.error("Failed to remove item");
      return;
    }
    setEditing((cur) => (cur ? { ...cur, items: cur.items.filter((i) => i.id !== item.id) } : cur));
    await load();
  };

  const handleDeleteTemplate = async () => {
    if (!deleteTarget) return;
    const ids = deleteTarget.items.map((i) => i.id);
    const { error } = await supabase.from("job_checklist_templates").delete().in("id", ids);
    if (error) {
      toast.error("Failed to delete template");
      return;
    }
    toast.success("Template deleted");
    setDeleteTarget(null);
    if (editing?.name === deleteTarget.name) setEditing(null);
    await load();
  };

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <i className="ti ti-loader-2 animate-spin text-3xl text-muted-foreground" />
      </div>
    );
  }

  const stages: Stage[] = ["work_started", "final_checks"];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Checklist Templates</h2>
          <p className="text-sm text-muted-foreground">
            Build reusable checklists — apply them to any job in one click.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <i className="ti ti-plus mr-2" /> New template
        </Button>
      </div>

      {templates.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            No checklist templates yet. Create one to speed up job checklists.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => (
            <Card key={t.name} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setEditing(t)}>
              <CardContent className="p-4 space-y-2">
                <p className="font-semibold">{t.name}</p>
                <p className="text-xs text-muted-foreground capitalize">
                  {JOB_TYPES.find((j) => j.value === t.jobType)?.label ?? "General"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t.items.length} item{t.items.length === 1 ? "" : "s"}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New checklist template</DialogTitle>
            <DialogDescription>Name it, then add items on the next screen.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="template_name">Template name</Label>
              <Input
                id="template_name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Boiler service"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="template_job_type">Job type</Label>
              <Select value={newJobType} onValueChange={setNewJobType}>
                <SelectTrigger id="template_job_type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {JOB_TYPES.map((jt) => (
                    <SelectItem key={jt.value} value={jt.value}>{jt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleCreate} disabled={saving} className="w-full">
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-w-lg">
          {editing && (
            <>
              <DialogHeader>
                <DialogTitle>{editing.name}</DialogTitle>
                <DialogDescription>
                  {JOB_TYPES.find((j) => j.value === editing.jobType)?.label ?? "General"} · {editing.items.length} item{editing.items.length === 1 ? "" : "s"}
                </DialogDescription>
              </DialogHeader>

              <div className="max-h-72 overflow-y-auto space-y-3">
                {stages.map((stage) => {
                  const stageItems = editing.items.filter((i) => i.stage === stage);
                  if (stageItems.length === 0) return null;
                  return (
                    <div key={stage}>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                        {STAGE_LABEL[stage]}
                      </p>
                      <div className="space-y-1">
                        {stageItems.map((item) => (
                          <div key={item.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                            <span className="text-sm">{item.item_text}</span>
                            <button
                              type="button"
                              onClick={() => handleDeleteItem(item)}
                              className="text-muted-foreground hover:text-destructive shrink-0"
                            >
                              <i className="ti ti-trash" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
                {editing.items.length === 0 && (
                  <p className="text-sm text-muted-foreground py-2">No items yet — add your first one below.</p>
                )}
              </div>

              <div className="space-y-2 border-t pt-3">
                <div className="flex gap-1.5">
                  {stages.map((stage) => (
                    <button
                      key={stage}
                      type="button"
                      onClick={() => setItemStage(stage)}
                      className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                        itemStage === stage ? "text-white border-transparent bg-primary" : "border-input text-muted-foreground"
                      }`}
                    >
                      {STAGE_LABEL[stage]}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={itemText}
                    onChange={(e) => setItemText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddItem()}
                    placeholder="Add item…"
                  />
                  <Button onClick={handleAddItem} disabled={addingItem || !itemText.trim()}>
                    <i className="ti ti-plus" />
                  </Button>
                </div>
              </div>

              <DialogFooter>
                <Button variant="destructive" onClick={() => setDeleteTarget(editing)} className="mr-auto">
                  Delete template
                </Button>
                <Button variant="outline" onClick={() => setEditing(null)}>Done</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete template?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes "{deleteTarget?.name}" and all its items. Jobs it has already been applied to are unaffected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteTemplate}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
