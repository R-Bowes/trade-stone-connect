import { useState } from "react";
import { format } from "date-fns";
import { Loader2, Lock, Pencil, Plus, Trash2, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useEngagementNotes } from "@/hooks/useEngagementNotes";

interface ThreadWorknotesSectionProps {
  enquiryId?: string | null;
  quoteId?: string | null;
  jobId?: string | null;
}

export function ThreadWorknotesSection({ enquiryId, quoteId, jobId }: ThreadWorknotesSectionProps) {
  const { notes, loading, addNote, updateNote, deleteNote } = useEngagementNotes({ enquiryId, quoteId, jobId });
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    if (!draft.trim()) return;
    setSaving(true);
    try {
      await addNote(draft);
      setDraft("");
      setAdding(false);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (id: string) => {
    if (!editDraft.trim()) return;
    setSaving(true);
    try {
      await updateNote(id, editDraft);
      setEditingId(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Worknotes</h3>
          <Badge variant="outline" className="text-[10px] gap-1 py-0"><Lock className="h-2.5 w-2.5" />Private — never visible to the client</Badge>
        </div>
        {!adding && (
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" />Add note
          </Button>
        )}
      </div>

      {adding && (
        <div className="space-y-2 rounded-lg border p-3">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Note to yourself about this engagement..."
            rows={3}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => { setAdding(false); setDraft(""); }}>Cancel</Button>
            <Button size="sm" disabled={saving || !draft.trim()} onClick={handleAdd}>
              {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}Save
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
      ) : notes.length === 0 && !adding ? (
        <p className="text-sm text-muted-foreground py-2">No worknotes yet.</p>
      ) : (
        <div className="space-y-2">
          {notes.map((note) => (
            <div key={note.id} className="rounded-lg border p-3 space-y-1.5">
              {editingId === note.id ? (
                <>
                  <Textarea value={editDraft} onChange={(e) => setEditDraft(e.target.value)} rows={3} autoFocus />
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}><X className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" disabled={saving || !editDraft.trim()} onClick={() => handleUpdate(note.id)}>
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">
                      {format(new Date(note.updated_at), "d MMM yyyy, HH:mm")}
                      {note.updated_at !== note.created_at ? " (edited)" : ""}
                    </span>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => { setEditingId(note.id); setEditDraft(note.content); }}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                        onClick={() => deleteNote(note.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
