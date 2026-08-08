import { useEffect, useState } from "react";
import { toast } from "sonner";
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

  // Optimistic toggle: on bad signal a tick must show instantly and never
  // silently vanish — flip local state first, roll back with a retryable
  // error toast if the write fails.
  const toggle = async (item: ChecklistItem) => {
    const nextChecked = !item.is_checked;
    setItems((cur) => cur.map((i) => (i.id === item.id ? { ...i, is_checked: nextChecked } : i)));

    const { error } = await supabase
      .from("job_checklist_items")
      .update({
        is_checked: nextChecked,
        checked_by: nextChecked ? ownProfileId : null,
        checked_at: nextChecked ? new Date().toISOString() : null,
      })
      .eq("id", item.id);

    if (error) {
      setItems((cur) => cur.map((i) => (i.id === item.id ? { ...i, is_checked: !nextChecked } : i)));
      toast.error("Couldn't save that tick", {
        description: "Check your signal and try again.",
        action: { label: "Retry", onClick: () => toggle(item) },
      });
    }
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
    if (error) {
      toast.error("Couldn't add item", { description: "Check your signal and try again." });
    } else if (data) {
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
            <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
              {STAGE_LABEL[stage]}
            </p>
            <div className="divide-y border-y">
              {stageItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => toggle(item)}
                  className="w-full flex items-center gap-3 py-3 px-1 text-left"
                  style={{ minHeight: 44 }}
                >
                  <span
                    className="shrink-0 rounded border-2 flex items-center justify-center"
                    style={{
                      width: 28,
                      height: 28,
                      ...(item.is_checked
                        ? { backgroundColor: ORANGE, borderColor: ORANGE }
                        : { borderColor: "#cbd5e1" }),
                    }}
                  >
                    {item.is_checked && <Check className="h-4 w-4 text-white" />}
                  </span>
                  <span className={`text-base ${item.is_checked ? "line-through text-muted-foreground" : ""}`}>
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
        <div className="flex gap-2">
          {stages.map((stage) => (
            <button
              key={stage}
              type="button"
              onClick={() => setNewStage(stage)}
              className="rounded-full border font-medium transition-colors"
              style={{
                minHeight: 36,
                padding: "0 14px",
                fontSize: 14,
                ...(newStage === stage
                  ? { backgroundColor: "#1a2744", borderColor: "#1a2744", color: "#fff" }
                  : { borderColor: "#cbd5e1", color: "#6b7280" }),
              }}
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
            className="flex-1 rounded-md border px-3"
            style={{ fontSize: 16, minHeight: 44 }}
          />
          <button
            type="button"
            onClick={addItem}
            disabled={adding || !newText.trim()}
            className="shrink-0 rounded-md flex items-center justify-center disabled:opacity-50"
            style={{ backgroundColor: ORANGE, color: "#fff", width: 44, height: 44 }}
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
