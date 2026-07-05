import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface EngagementNote {
  id: string;
  content: string;
  created_at: string;
  updated_at: string;
}

interface EngagementContext {
  enquiryId?: string | null;
  quoteId?: string | null;
  jobId?: string | null;
}

/**
 * Private, contractor-only worknotes for one engagement — never visible to
 * the client (engagement_notes has a single contractor-only RLS policy, no
 * customer-facing read path exists anywhere).
 */
export function useEngagementNotes({ enquiryId, quoteId, jobId }: EngagementContext) {
  const [notes, setNotes] = useState<EngagementNote[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchNotes = useCallback(async () => {
    setLoading(true);
    let query = supabase.from("engagement_notes").select("id, content, created_at, updated_at");

    if (jobId) query = query.eq("job_id", jobId);
    else if (quoteId) query = query.eq("issued_quote_id", quoteId);
    else if (enquiryId) query = query.eq("enquiry_id", enquiryId);
    else {
      setNotes([]);
      setLoading(false);
      return;
    }

    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) {
      console.error("Failed to load engagement notes", error);
      setNotes([]);
    } else {
      setNotes(data ?? []);
    }
    setLoading(false);
  }, [enquiryId, quoteId, jobId]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const addNote = useCallback(
    async (content: string) => {
      const trimmed = content.trim();
      if (!trimmed) return;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profileRow } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!profileRow?.id) return;

      const { error } = await supabase.from("engagement_notes").insert({
        contractor_id: profileRow.id,
        enquiry_id: enquiryId ?? null,
        issued_quote_id: quoteId ?? null,
        job_id: jobId ?? null,
        content: trimmed,
      });
      if (error) {
        toast({ title: "Error", description: "Failed to save note", variant: "destructive" });
        throw error;
      }
      await fetchNotes();
    },
    [enquiryId, quoteId, jobId, fetchNotes, toast],
  );

  const updateNote = useCallback(
    async (noteId: string, content: string) => {
      const trimmed = content.trim();
      if (!trimmed) return;
      const { error } = await supabase
        .from("engagement_notes")
        .update({ content: trimmed })
        .eq("id", noteId);
      if (error) {
        toast({ title: "Error", description: "Failed to update note", variant: "destructive" });
        throw error;
      }
      await fetchNotes();
    },
    [fetchNotes, toast],
  );

  const deleteNote = useCallback(
    async (noteId: string) => {
      const { error } = await supabase.from("engagement_notes").delete().eq("id", noteId);
      if (error) {
        toast({ title: "Error", description: "Failed to delete note", variant: "destructive" });
        throw error;
      }
      await fetchNotes();
    },
    [fetchNotes, toast],
  );

  return { notes, loading, addNote, updateNote, deleteNote, refetch: fetchNotes };
}
