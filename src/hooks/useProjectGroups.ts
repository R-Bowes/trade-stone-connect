import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

// contractor_project_groups is created by migration 20260913130000 — NOT
// YET PUSHED. This hook mirrors usePhotoGalleries.ts's container half
// (galleries list + add/update/delete) exactly, for the same reason:
// one profile_widgets row (widget_key='project') points its section_ref_id
// at one row here, and contractor_projects.group_id scopes individual
// projects to it — see the migration file and CanvasEditor.tsx's A2 wiring.
// Not yet in generated types.ts — cast as needed until regenerated.

export interface ContractorProjectGroup {
  id: string;
  contractor_id: string;
  title: string;
  display_order: number;
  created_at: string;
  updated_at: string;
}

// For the authenticated contractor managing their own project groups.
// Two-step lookup for contractor_id (FK → profiles.id), same as
// usePhotoGalleries/useContractorProjects.
export function useProjectGroups() {
  const [contractorId, setContractorId] = useState<string | null>(null);
  const [groups, setGroups] = useState<ContractorProjectGroup[]>([]);
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
      .from("contractor_project_groups")
      .select("*")
      .eq("contractor_id", profile.id)
      .order("display_order", { ascending: true });

    setGroups((data ?? []) as ContractorProjectGroup[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // No cap enforced here — SECTION_DEFS.project.max / projectSections.length
  // (CanvasEditor.tsx) already gate how many project sections (and thus
  // groups) can be created; this hook doesn't need its own copy of that
  // number.
  const addGroup = useCallback(async (title: string): Promise<string | null> => {
    if (!contractorId) return null;

    const { data: inserted, error } = await (supabase as any)
      .from("contractor_project_groups")
      .insert({ contractor_id: contractorId, title, display_order: groups.length })
      .select()
      .single();
    if (error) throw error;
    if (inserted) setGroups(prev => [...prev, inserted as ContractorProjectGroup]);
    return inserted ? (inserted as ContractorProjectGroup).id : null;
  }, [contractorId, groups.length]);

  const updateGroup = useCallback(async (id: string, title: string) => {
    const { data: updated, error } = await (supabase as any)
      .from("contractor_project_groups")
      .update({ title })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    if (updated) {
      setGroups(prev => prev.map(g => g.id === id ? updated as ContractorProjectGroup : g));
    }
  }, []);

  // Deleting a group sets group_id = NULL on its projects (ON DELETE SET
  // NULL), so the projects are orphaned rather than deleted — matching
  // usePhotoGalleries.ts's deleteGallery comment for the same reason.
  const deleteGroup = useCallback(async (id: string) => {
    const { error } = await (supabase as any)
      .from("contractor_project_groups")
      .delete()
      .eq("id", id);
    if (error) throw error;
    setGroups(prev => prev.filter(g => g.id !== id));
  }, []);

  return { groups, loading, addGroup, updateGroup, deleteGroup };
}
