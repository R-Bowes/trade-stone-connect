import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Lock } from "lucide-react";
import { ORANGE } from "./FieldHeader";
import type { Database } from "@/integrations/supabase/types";

type EngagementNote = Database["public"]["Tables"]["engagement_notes"]["Row"];

/**
 * Internal-only job notes, via engagement_notes — NOT job_notes, which is
 * the CUSTOMER's own notes channel (RLS lets customer_id read/write it;
 * ThreadWorknotesSection.tsx labels it "Client notes"). engagement_notes is
 * already contractor-private, never client-visible — confirmed against
 * live RLS before reuse. Customer-visible notes are a deliberately
 * deferred decision, not built here.
 */
export default function FieldNotes({
  jobId,
  contractorId,
  ownProfileId,
}: {
  jobId: string;
  contractorId: string;
  ownProfileId: string;
}) {
  const [notes, setNotes] = useState<EngagementNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("engagement_notes")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false });
    if (!error) setNotes(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  const handleAdd = async () => {
    const content = draft.trim();
    if (!content) return;
    setSaving(true);

    // Optimistic: on bad signal, the engineer must see the note land
    // immediately and not lose it silently if the request is slow — the
    // row is inserted into local state before the round-trip resolves,
    // and rolled back with a retryable error if it fails.
    const optimisticId = `optimistic-${Date.now()}`;
    const optimisticNote: EngagementNote = {
      id: optimisticId,
      contractor_id: contractorId,
      job_id: jobId,
      enquiry_id: null,
      issued_quote_id: null,
      author_id: ownProfileId,
      content,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setNotes((cur) => [optimisticNote, ...cur]);
    setDraft("");

    const { data, error } = await supabase
      .from("engagement_notes")
      .insert({ contractor_id: contractorId, job_id: jobId, author_id: ownProfileId, content })
      .select()
      .single();

    setSaving(false);
    if (error || !data) {
      setNotes((cur) => cur.filter((n) => n.id !== optimisticId));
      setDraft(content);
      toast.error("Note didn't save", {
        description: "Check your signal and try again.",
        action: { label: "Retry", onClick: () => handleAdd() },
      });
      return;
    }
    setNotes((cur) => cur.map((n) => (n.id === optimisticId ? data : n)));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Lock className="h-3.5 w-3.5" />
        <span className="text-sm">Internal only — never visible to the customer</span>
      </div>

      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          placeholder="Add a note for the office…"
          className="flex-1 rounded-md border px-3"
          style={{ fontSize: 16, minHeight: 44 }}
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={saving || !draft.trim()}
          className="rounded-lg font-semibold text-white disabled:opacity-60"
          style={{ backgroundColor: ORANGE, minHeight: 44, padding: "0 18px", fontSize: 16 }}
        >
          Add
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : notes.length === 0 ? (
        <p className="text-sm text-muted-foreground py-1">No notes yet.</p>
      ) : (
        <div className="space-y-2">
          {notes.map((note) => (
            <div key={note.id} className="border-b pb-2">
              <p className="text-sm whitespace-pre-wrap">{note.content}</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                {new Date(note.created_at).toLocaleString("en-GB", {
                  day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                })}
                {note.id.startsWith("optimistic-") && " · saving…"}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
