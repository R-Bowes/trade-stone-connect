import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Copy } from "lucide-react";
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

// Templates are groups of job_checklist_templates rows sharing `name` —
// the table has no separate "template" entity. Used for both the
// contractor's own rows and the global (company_id IS NULL AND
// contractor_id IS NULL) rows — same grouping shape, different source scope.
function groupByName(rows: TemplateRow[]): Template[] {
  const groups: Record<string, Template> = {};
  for (const row of rows) {
    const key = row.name ?? "Untitled";
    if (!groups[key]) groups[key] = { name: key, jobType: row.job_type, items: [] };
    groups[key].items.push(row);
  }
  return Object.values(groups);
}

// "Name (copy)", then "Name (copy 2)", "Name (copy 3)"... until a name that
// doesn't collide with the contractor's existing template names is found.
// Never silently merges into an existing template of the same name.
function resolveCollisionName(desiredName: string, existingNames: Set<string>): string {
  if (!existingNames.has(desiredName)) return desiredName;
  let candidate = `${desiredName} (copy)`;
  let n = 2;
  while (existingNames.has(candidate)) {
    candidate = `${desiredName} (copy ${n})`;
    n++;
  }
  return candidate;
}

/**
 * Checklist template library. "My Templates" (contractor_id = self) is
 * fully editable. "TradeStone Templates" (company_id IS NULL AND
 * contractor_id IS NULL — the global tier the RLS SELECT policy already
 * exposes to every contractor) is read-only here, mirroring
 * RamsTemplateManagement.tsx's structure: platform rows are never written
 * to directly, only copied into an owned template via "Copy to my
 * templates". Team members have no access here (no acting_contractor_ids()
 * anywhere).
 */
export function ChecklistTemplates() {
  const [contractorId, setContractorId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [globalTemplates, setGlobalTemplates] = useState<Template[]>([]);
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
  const [copyingName, setCopyingName] = useState<string | null>(null);

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

    const [ownRes, globalRes] = await Promise.all([
      supabase
        .from("job_checklist_templates")
        .select("*")
        .eq("contractor_id", cId)
        .order("name")
        .order("sort_order"),
      supabase
        .from("job_checklist_templates")
        .select("*")
        .is("company_id", null)
        .is("contractor_id", null)
        .order("name")
        .order("sort_order"),
    ]);

    if (ownRes.error) {
      console.error("Error loading checklist templates:", ownRes.error);
      toast.error("Failed to load checklist templates");
      setLoading(false);
      return;
    }
    if (globalRes.error) {
      // Non-fatal — own templates still loaded fine, just no shared library.
      console.error("Error loading shared checklist templates:", globalRes.error);
    }

    setTemplates(groupByName(ownRes.data ?? []));
    setGlobalTemplates(groupByName(globalRes.data ?? []));
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

  // Copies a global (TradeStone) template's rows into the contractor's own
  // library. Reads only from the global template passed in — never writes
  // to it. Collision-safe name resolution; never merges into an existing
  // template of the same name.
  const handleCopyGlobalTemplate = async (template: Template) => {
    if (!contractorId) return;
    setCopyingName(template.name);
    try {
      const existingNames = new Set(templates.map((t) => t.name));
      const newName = resolveCollisionName(template.name, existingNames);
      const rows = template.items.map((item) => ({
        contractor_id: contractorId,
        company_id: null,
        name: newName,
        job_type: item.job_type,
        stage: item.stage,
        item_text: item.item_text,
        sort_order: item.sort_order,
      }));
      const { error } = await supabase.from("job_checklist_templates").insert(rows);
      if (error) throw error;
      toast.success(`Copied to My Templates as "${newName}"`);
      await load();
    } catch (error) {
      console.error("Error copying checklist template:", error);
      toast.error("Failed to copy template");
    } finally {
      setCopyingName(null);
    }
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

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">My Templates</h3>
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
      </section>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">TradeStone Templates</h3>
        {globalTemplates.length === 0 ? (
          <p className="text-sm text-muted-foreground">No shared templates available.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {globalTemplates.map((t) => (
              <Card key={t.name}>
                <CardContent className="p-4 space-y-2">
                  <p className="font-semibold">{t.name}</p>
                  <p className="text-xs text-muted-foreground capitalize">
                    {JOB_TYPES.find((j) => j.value === t.jobType)?.label ?? "General"}
                  </p>
                  <Badge variant="outline" className="text-[10px]">
                    {t.items.length} item{t.items.length === 1 ? "" : "s"}
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={copyingName === t.name}
                    onClick={() => handleCopyGlobalTemplate(t)}
                  >
                    {copyingName === t.name ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                    ) : (
                      <Copy className="h-3.5 w-3.5 mr-1" />
                    )}
                    Copy to my templates
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

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
