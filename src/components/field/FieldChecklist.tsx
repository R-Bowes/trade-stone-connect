import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Check, Loader2, Plus } from "lucide-react";
import { ORANGE } from "./FieldHeader";
import type { Database } from "@/integrations/supabase/types";

type ChecklistItem = Database["public"]["Tables"]["job_checklist_items"]["Row"];
type Stage = "work_started" | "final_checks";

const STAGE_LABEL: Record<Stage, string> = {
  work_started: "Work started",
  final_checks: "Final checks",
};

export default function FieldChecklist({
  jobId,
  ownProfileId,
}: {
  jobId: string;
  ownProfileId: string;
}) {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newText, setNewText] = useState("");
  const [newStage, setNewStage] = useState<Stage>("work_started");
  const [adding, setAdding] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("job_checklist_items")
      .select("*")
      .eq("job_id", jobId)
      .order("stage", { ascending: true })
      .order("sort_order", { ascending: true });
    if (!error) setItems(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  const toggle = async (item: ChecklistItem) => {
    setSavingId(item.id);
    const nextChecked = !item.is_checked;
    const { error } = await supabase
      .from("job_checklist_items")
      .update({
        is_checked: nextChecked,
        checked_by: nextChecked ? ownProfileId : null,
        checked_at: nextChecked ? new Date().toISOString() : null,
      })
      .eq("id", item.id);
    if (!error) {
      setItems((cur) =>
        cur.map((i) =>
          i.id === item.id
            ? { ...i, is_checked: nextChecked, checked_by: nextChecked ? ownProfileId : null }
            : i,
        ),
      );
    }
    setSavingId(null);
  };

  const addItem = async () => {
    const text = newText.trim();
    if (!text) return;
    setAdding(true);
    const sortOrder = items.filter((i) => i.stage === newStage).length;
    const { data, error } = await supabase
      .from("job_checklist_items")
      .insert({
        job_id: jobId,
        stage: newStage,
        item_text: text,
        sort_order: sortOrder,
        is_contractor_added: true,
      })
      .select()
      .single();
    if (!error && data) {
      setItems((cur) => [...cur, data]);
      setNewText("");
    }
    setAdding(false);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const stages: Stage[] = ["work_started", "final_checks"];

  return (
    <div className="space-y-4">
      {stages.map((stage) => {
        const stageItems = items.filter((i) => i.stage === stage);
        if (stageItems.length === 0) return null;
        return (
          <div key={stage}>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
              {STAGE_LABEL[stage]}
            </p>
            <div className="divide-y border-y">
              {stageItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => toggle(item)}
                  disabled={savingId === item.id}
                  className="w-full flex items-center gap-3 px-1 py-2.5 text-left disabled:opacity-60"
                >
                  <span
                    className="shrink-0 h-5 w-5 rounded border-2 flex items-center justify-center"
                    style={
                      item.is_checked
                        ? { backgroundColor: ORANGE, borderColor: ORANGE }
                        : { borderColor: "#cbd5e1" }
                    }
                  >
                    {item.is_checked && <Check className="h-3.5 w-3.5 text-white" />}
                  </span>
                  <span className={`text-sm ${item.is_checked ? "line-through text-muted-foreground" : ""}`}>
                    {item.item_text}
                  </span>
                </button>
              ))}
            </div>
          </div>
        );
      })}

      {items.length === 0 && (
        <p className="text-sm text-muted-foreground py-2">No checklist items yet.</p>
      )}

      <div className="pt-2 space-y-2">
        <div className="flex gap-1.5">
          {stages.map((stage) => (
            <button
              key={stage}
              type="button"
              onClick={() => setNewStage(stage)}
              className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                newStage === stage
                  ? "text-white border-transparent"
                  : "border-muted-foreground/30 text-muted-foreground"
              }`}
              style={newStage === stage ? { backgroundColor: "#1a2744" } : undefined}
            >
              {STAGE_LABEL[stage]}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addItem();
            }}
            placeholder="Add item…"
            className="flex-1 rounded-md border px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={addItem}
            disabled={adding || !newText.trim()}
            className="shrink-0 rounded-md px-3 flex items-center justify-center disabled:opacity-50"
            style={{ backgroundColor: ORANGE, color: "#fff" }}
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
