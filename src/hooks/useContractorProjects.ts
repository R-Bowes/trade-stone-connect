import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

// contractor_projects is created by migration 20260618120000.
// Not yet in generated types.ts — cast as needed until regenerated.

export interface ContractorProject {
  id: string;
  contractor_id: string;
  title: string;
  description: string | null;
  trade: string | null;
  location: string | null;
  completion_date: string | null;
  photo_urls: string[];
  display_order: number;
  created_at: string;
  updated_at: string;
}

export type ProjectData = Pick<
  ContractorProject,
  "title" | "description" | "trade" | "location" | "completion_date" | "photo_urls"
>;

// For the authenticated contractor managing their own projects.
// Two-step lookup: profiles.user_id → profiles.id (contractor_id FK → profiles.id).
// Max 3 projects enforced here; addProject throws if already at the limit.
export function useContractorProjects() {
  const [contractorId, setContractorId] = useState<string | null>(null);
  const [projects, setProjects] = useState<ContractorProject[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .single();
    if (!profile) { setLoading(false); return; }
    setContractorId(profile.id);

    const { data } = await (supabase as any)
      .from("contractor_projects")
      .select("*")
      .eq("contractor_id", profile.id)
      .order("display_order", { ascending: true });

    setProjects((data ?? []) as ContractorProject[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const addProject = useCallback(async (data: ProjectData) => {
    if (!contractorId) return;
    if (projects.length >= 3) throw new Error("Maximum 3 projects allowed");

    const { data: inserted, error } = await (supabase as any)
      .from("contractor_projects")
      .insert({
        contractor_id: contractorId,
        title: data.title,
        description: data.description ?? null,
        trade: data.trade ?? null,
        location: data.location ?? null,
        completion_date: data.completion_date ?? null,
        photo_urls: data.photo_urls ?? [],
        display_order: projects.length,
      })
      .select()
      .single();
    if (error) throw error;
    if (inserted) setProjects(prev => [...prev, inserted as ContractorProject]);
  }, [contractorId, projects.length]);

  const updateProject = useCallback(async (id: string, data: Partial<ProjectData>) => {
    const { data: updated, error } = await (supabase as any)
      .from("contractor_projects")
      .update(data)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    if (updated) setProjects(prev => prev.map(p => p.id === id ? updated as ContractorProject : p));
  }, []);

  const deleteProject = useCallback(async (id: string) => {
    const { error } = await (supabase as any).from("contractor_projects").delete().eq("id", id);
    if (error) throw error;
    setProjects(prev => {
      const remaining = prev.filter(p => p.id !== id);
      return remaining.map((p, i) => ({ ...p, display_order: i }));
    });
  }, []);

  const reorderProjects = useCallback(async (from: number, to: number) => {
    const reordered = [...projects];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    const updated = reordered.map((p, i) => ({ ...p, display_order: i }));
    setProjects(updated);
    await Promise.all(
      updated.map(p =>
        (supabase as any)
          .from("contractor_projects")
          .update({ display_order: p.display_order })
          .eq("id", p.id)
      )
    );
  }, [projects]);

  return { projects, loading, addProject, updateProject, deleteProject, reorderProjects };
}

// For reading another contractor's projects on the public profile page.
export function usePublicContractorProjects(contractorProfileId: string) {
  const [projects, setProjects] = useState<ContractorProject[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!contractorProfileId) return;
    const load = async () => {
      const { data } = await (supabase as any)
        .from("contractor_projects")
        .select("*")
        .eq("contractor_id", contractorProfileId)
        .order("display_order", { ascending: true });
      setProjects((data ?? []) as ContractorProject[]);
      setLoading(false);
    };
    load();
  }, [contractorProfileId]);

  return { projects, loading };
}
