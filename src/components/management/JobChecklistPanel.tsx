import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Check, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type ChecklistItem = Database["public"]["Tables"]["job_checklist_items"]["Row"];
type Template = Database["public"]["Tables"]["job_checklist_templates"]["Row"];
type Stage = "work_started" | "final_checks";

const STAGE_LABEL: Record<Stage, string> = {
  work_started: "Work started",
  final_checks: "Final checks",
};

type TemplateScope = "own" | "global";

interface TemplateGroup {
  scope: TemplateScope;
  // Unique picker key — name alone isn't unique once own + global templates
  // can share a name (e.g. after a global template is copied unedited).
  key: string;
  name: string;
  jobType: string | null;
  items: Template[];
}

function groupByName(rows: Template[], scope: TemplateScope): TemplateGroup[] {
  const groups: Record<string, TemplateGroup> = {};
  for (const row of rows) {
    const key = row.name ?? "Untitled";
    if (!groups[key]) groups[key] = { scope, key: `${scope}:${key}`, name: key, jobType: row.job_type, items: [] };
    groups[key].items.push(row);
  }
  return Object.values(groups);
}

export function JobChecklistPanel({
  jobId,
  contractorId,
}: {
  jobId: string;
  contractorId: string;
}) {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [templates, setTemplates] = useState<TemplateGroup[]>([]);
  const [globalTemplates, setGlobalTemplates] = useState<TemplateGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [applyingTemplate, setApplyingTemplate] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [newText, setNewText] = useState("");
  const [newStage, setNewStage] = useState<Stage>("work_started");
  const [adding, setAdding] = useState(false);

  const load = async () => {
    setLoading(true);
    const [itemsRes, ownTemplatesRes, globalTemplatesRes] = await Promise.all([
      supabase.from("job_checklist_items").select("*").eq("job_id", jobId).order("stage").order("sort_order"),
      supabase
        .from("job_checklist_templates")
        .select("*")
        .eq("contractor_id", contractorId)
        .eq("is_active", true)
        .order("name")
        .order("sort_order"),
      supabase
        .from("job_checklist_templates")
        .select("*")
        .is("company_id", null)
        .is("contractor_id", null)
        .eq("is_active", true)
        .order("name")
        .order("sort_order"),
    ]);

    if (!itemsRes.error) setItems(itemsRes.data ?? []);
    if (!ownTemplatesRes.error) setTemplates(groupByName(ownTemplatesRes.data ?? [], "own"));
    if (!globalTemplatesRes.error) setGlobalTemplates(groupByName(globalTemplatesRes.data ?? [], "global"));

    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, contractorId]);

  const toggle = async (item: ChecklistItem) => {
    const nextChecked = !item.is_checked;
    const { error } = await supabase
      .from("job_checklist_items")
      .update({ is_checked: nextChecked, checked_at: nextChecked ? new Date().toISOString() : null })
      .eq("id", item.id);
    if (!error) {
      setItems((cur) => cur.map((i) => (i.id === item.id ? { ...i, is_checked: nextChecked } : i)));
    }
  };

  const deleteItem = async (item: ChecklistItem) => {
    const { error } = await supabase.from("job_checklist_items").delete().eq("id", item.id);
    if (!error) setItems((cur) => cur.filter((i) => i.id !== item.id));
  };

  const addItem = async () => {
    const text = newText.trim();
    if (!text) return;
    setAdding(true);
    const sortOrder = items.filter((i) => i.stage === newStage).length;
    const { data, error } = await supabase
      .from("job_checklist_items")
      .insert({ job_id: jobId, stage: newStage, item_text: text, sort_order: sortOrder, is_contractor_added: true })
      .select()
      .single();
    if (error) {
      toast.error("Failed to add item");
    } else if (data) {
      setItems((cur) => [...cur, data]);
      setNewText("");
    }
    setAdding(false);
  };

  // Works identically for an own or a global (TradeStone) template — both
  // are just job_checklist_templates rows being copied into
  // job_checklist_items client-side; the source scope only changes which
  // list the group was read from.
  const applyTemplate = async () => {
    const group = [...templates, ...globalTemplates].find((t) => t.key === selectedTemplate);
    if (!group) return;
    setApplyingTemplate(true);
    try {
      const stageCounts: Record<string, number> = {};
      for (const i of items) stageCounts[i.stage] = (stageCounts[i.stage] ?? 0) + 1;

      const rows = group.items.map((templateItem) => {
        const sortOrder = stageCounts[templateItem.stage] ?? 0;
        stageCounts[templateItem.stage] = sortOrder + 1;
        return {
          job_id: jobId,
          stage: templateItem.stage,
          item_text: templateItem.item_text,
          sort_order: sortOrder,
          is_contractor_added: false,
        };
      });

      const { data, error } = await supabase.from("job_checklist_items").insert(rows).select();
      if (error) throw error;
      setItems((cur) => [...cur, ...(data ?? [])]);
      toast.success(`Applied "${group.name}" (${rows.length} item${rows.length === 1 ? "" : "s"})`);
      setSelectedTemplate("");
    } catch (error) {
      console.error("Error applying template:", error);
      toast.error("Failed to apply template");
    } finally {
      setApplyingTemplate(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const stages: Stage[] = ["work_started", "final_checks"];
  const hasTemplates = templates.length > 0 || globalTemplates.length > 0;

  return (
    <div className="space-y-4">
      {hasTemplates && (
        <div className="flex gap-2">
          <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Apply a saved template…" />
            </SelectTrigger>
            <SelectContent>
              {templates.length > 0 && (
                <SelectGroup>
                  <SelectLabel>My Templates</SelectLabel>
                  {templates.map((t) => (
                    <SelectItem key={t.key} value={t.key}>
                      {t.name} ({t.items.length} item{t.items.length === 1 ? "" : "s"})
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
              {globalTemplates.length > 0 && (
                <SelectGroup>
                  <SelectLabel>TradeStone Templates</SelectLabel>
                  {globalTemplates.map((t) => (
                    <SelectItem key={t.key} value={t.key}>
                      {t.name} ({t.items.length} item{t.items.length === 1 ? "" : "s"})
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
            </SelectContent>
          </Select>
          <Button onClick={applyTemplate} disabled={!selectedTemplate || applyingTemplate} variant="outline">
            {applyingTemplate ? "Applying…" : "Apply"}
          </Button>
        </div>
      )}

      {stages.map((stage) => {
        const stageItems = items.filter((i) => i.stage === stage);
        if (stageItems.length === 0) return null;
        return (
          <div key={stage}>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
              {STAGE_LABEL[stage]}
            </p>
            <div className="space-y-1.5">
              {stageItems.map((item) => (
                <div key={item.id} className="flex items-center gap-2 rounded-md border px-3 py-2">
                  <button
                    type="button"
                    onClick={() => toggle(item)}
                    className="shrink-0 h-5 w-5 rounded border-2 flex items-center justify-center"
                    style={
                      item.is_checked
                        ? { backgroundColor: "#f07820", borderColor: "#f07820" }
                        : { borderColor: "#cbd5e1" }
                    }
                  >
                    {item.is_checked && <Check className="h-3.5 w-3.5 text-white" />}
                  </button>
                  <span className={`flex-1 text-sm ${item.is_checked ? "line-through text-muted-foreground" : ""}`}>
                    {item.item_text}
                  </span>
                  <button
                    type="button"
                    onClick={() => deleteItem(item)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {items.length === 0 && (
        <p className="text-sm text-muted-foreground">No checklist items on this job yet.</p>
      )}

      <div className="flex gap-1.5">
        {stages.map((stage) => (
          <button
            key={stage}
            type="button"
            onClick={() => setNewStage(stage)}
            className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
              newStage === stage ? "text-white border-transparent bg-primary" : "border-input text-muted-foreground"
            }`}
          >
            {STAGE_LABEL[stage]}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addItem()}
          placeholder="Add a one-off item…"
        />
        <Button onClick={addItem} disabled={adding || !newText.trim()} size="icon">
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
