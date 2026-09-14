import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

// contractor_projects is created by migration 20260618120000.
// Not yet in generated types.ts — cast as needed until regenerated.

const BUCKET = "contractor-photos";

export interface ContractorProject {
  id: string;
  contractor_id: string;
  title: string;
  description: string | null;
  trade: string | null;
  location: string | null;
  completion_date: string | null;
  photo_urls: string[];
  // group_id -> contractor_project_groups(id). Added by migration
  // 20260913130000 — NOT YET PUSHED. Scopes a project to the one project
  // section (SectionInstance.sectionRefId) it belongs to, mirroring
  // contractor_photos.gallery_id. Nullable: existing projects predating
  // this column are NULL (ungrouped) and, per the same-shape-as-galleries
  // convention, won't appear in any project section until reassigned —
  // see CanvasEditor.tsx's ProjectPanelContent "not linked" handling.
  group_id: string | null;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export type ProjectData = Pick<
  ContractorProject,
  "title" | "description" | "trade" | "location" | "completion_date" | "photo_urls" | "group_id"
>;

// For the authenticated contractor managing their own projects.
// Two-step lookup: profiles.user_id → profiles.id (contractor_id FK → profiles.id).
// Max 3 projects enforced here; addProject throws if already at the limit.
export function useContractorProjects() {
  const [contractorId, setContractorId] = useState<string | null>(null);
  const [projects, setProjects] = useState<ContractorProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

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
        group_id: data.group_id ?? null,
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

  // Path convention `${user.id}/projects/{uuid}.{ext}` mirrors
  // usePhotoGalleries.ts's uploadPhoto / useBeforeAfter.ts's
  // uploadBeforeAfterPhoto — same bucket, same top-level auth.uid()-scoped
  // folder the bucket's RLS is keyed on. Unlike those two, there's no
  // per-photo table row here: the caller appends the returned URL onto
  // the project's own photo_urls array via updateProject.
  const uploadProjectPhoto = useCallback(async (file: File): Promise<string> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "jpg";
      const filePath = `${user.id}/projects/${crypto.randomUUID()}.${ext}`;

      const { error } = await supabase.storage.from(BUCKET).upload(filePath, file);
      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(filePath);
      return publicUrl;
    } finally {
      setUploading(false);
    }
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

  return { projects, loading, uploading, addProject, updateProject, deleteProject, reorderProjects, uploadProjectPhoto };
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
