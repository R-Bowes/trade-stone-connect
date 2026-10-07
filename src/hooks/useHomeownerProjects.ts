import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type ProjectRow = Database["public"]["Tables"]["projects"]["Row"];

const PROJECT_SELECT =
  "id, title, description, budget, status, target_start, target_end, created_at, updated_at" as const;

export type HomeownerProject = Pick<
  ProjectRow,
  "id" | "title" | "description" | "budget" | "status" | "target_start" | "target_end" | "created_at" | "updated_at"
>;

/** The only fields a homeowner edits in this slice. */
export interface ProjectFormValues {
  title: string;
  description: string | null;
  budget: number | null;
  target_start: string | null;
  target_end: string | null;
}

// Supabase returns a zero-row UPDATE/DELETE blocked by RLS as success, so
// every write selects the affected row back and treats "no row" as a
// failure rather than reporting success (CLAUDE.md RLS failure modes).
const NOT_CHANGED = "The project was not changed. It may have been removed, or you may not have access to it.";

/**
 * The signed-in homeowner's own personal projects, newest first.
 * Projects are owner-only in this slice (RLS: posted_by = auth.uid() for a
 * personal project), so this never returns anyone else's.
 */
export function useHomeownerProjects() {
  const [projects, setProjects] = useState<HomeownerProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) throw new Error("You are not signed in.");

      const { data, error: queryError } = await supabase
        .from("projects")
        .select(PROJECT_SELECT)
        .eq("posted_by", user.id)
        .eq("account_type", "personal")
        .order("created_at", { ascending: false });
      if (queryError) throw queryError;

      setProjects((data ?? []) as HomeownerProject[]);
    } catch (err) {
      console.error("Error loading projects:", err);
      setError(err instanceof Error ? err.message : "Could not load your projects.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchProjects();
  }, [fetchProjects]);

  /** Creates a personal project owned by the caller. Throws on any failure. */
  const createProject = useCallback(async (values: ProjectFormValues): Promise<HomeownerProject> => {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;
    if (!user) throw new Error("You are not signed in.");

    const { data, error: insertError } = await supabase
      .from("projects")
      .insert({
        posted_by: user.id,
        account_type: "personal",
        title: values.title,
        description: values.description,
        budget: values.budget,
        target_start: values.target_start,
        target_end: values.target_end,
      })
      .select(PROJECT_SELECT)
      .single();
    if (insertError) throw insertError;

    const created = data as HomeownerProject;
    setProjects((prev) => [created, ...prev]);
    return created;
  }, []);

  /** Updates title, description, budget and target dates only. Throws on any failure. */
  const updateProject = useCallback(async (id: string, values: ProjectFormValues): Promise<HomeownerProject> => {
    const { data, error: updateError } = await supabase
      .from("projects")
      .update({
        title: values.title,
        description: values.description,
        budget: values.budget,
        target_start: values.target_start,
        target_end: values.target_end,
      })
      .eq("id", id)
      .select(PROJECT_SELECT);
    if (updateError) throw updateError;
    if (!data || data.length === 0) throw new Error(NOT_CHANGED);

    const updated = data[0] as HomeownerProject;
    setProjects((prev) => prev.map((p) => (p.id === id ? updated : p)));
    return updated;
  }, []);

  /**
   * Deletes the project. The database refuses this while jobs are attached
   * (jobs.project_id references it); that message is passed through as-is.
   */
  const deleteProject = useCallback(async (id: string): Promise<void> => {
    const { data, error: deleteError } = await supabase
      .from("projects")
      .delete()
      .eq("id", id)
      .select("id");
    if (deleteError) throw deleteError;
    if (!data || data.length === 0) throw new Error(NOT_CHANGED);

    setProjects((prev) => prev.filter((p) => p.id !== id));
  }, []);

  return { projects, loading, error, refetch: fetchProjects, createProject, updateProject, deleteProject };
}
