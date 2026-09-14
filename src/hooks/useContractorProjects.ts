import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

// contractor_projects: the live table (confirmed via information_schema
// and the regenerated types.ts, 2026-09-14) does NOT match
// 20260618120000_canvas_editor_tables.sql's CREATE TABLE — it was altered
// outside the migration system at some point (no migration anywhere
// documents the change; see CLAUDE.md's schema-change-discipline section
// for the two prior incidents of this same pattern). Live columns:
// id, contractor_id, title, description, value_label, completed_date
// (text, not date — see the "YYYY-MM" convention note on ProjectData
// below), photos (text[]), display_order, created_at, updated_at,
// group_id. There is no trade or location column. ContractorProject is derived
// from the generated Database type (not hand-written) specifically so a
// future drift like this one is a compile error, not a silent PGRST204.
// value_label exists live and is untouched here — nothing in the app
// reads or writes it; its purpose isn't established by any code or
// migration.
const BUCKET = "contractor-photos";

export type ContractorProject = Database["public"]["Tables"]["contractor_projects"]["Row"];

// completed_date: text column, no DB-level format constraint. The app is
// the only thing enforcing a shape — always "YYYY-MM" (month + year, no
// day) or null, never free text. Native <input type="month"> in
// CanvasEditor.tsx's ProjectPanelBody only ever produces that shape or
// "", so the write side here just maps "" to null rather than
// re-validating a format the input can't violate.
export type ProjectData = Pick<
  ContractorProject,
  "title" | "description" | "photos" | "group_id" | "completed_date"
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

    const { data } = await supabase
      .from("contractor_projects")
      .select("*")
      .eq("contractor_id", profile.id)
      .order("display_order", { ascending: true });

    setProjects(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const addProject = useCallback(async (data: ProjectData) => {
    if (!contractorId) return;
    if (projects.length >= 3) throw new Error("Maximum 3 projects allowed");

    const { data: inserted, error } = await supabase
      .from("contractor_projects")
      .insert({
        contractor_id: contractorId,
        title: data.title,
        description: data.description ?? null,
        photos: data.photos ?? [],
        group_id: data.group_id ?? null,
        completed_date: data.completed_date ?? null,
        display_order: projects.length,
      })
      .select()
      .single();
    if (error) throw error;
    if (inserted) setProjects(prev => [...prev, inserted]);
  }, [contractorId, projects.length]);

  const updateProject = useCallback(async (id: string, data: Partial<ProjectData>) => {
    const { data: updated, error } = await supabase
      .from("contractor_projects")
      .update(data)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    if (updated) setProjects(prev => prev.map(p => p.id === id ? updated : p));
  }, []);

  // Path convention `${user.id}/projects/{uuid}.{ext}` mirrors
  // usePhotoGalleries.ts's uploadPhoto / useBeforeAfter.ts's
  // uploadBeforeAfterPhoto — same bucket, same top-level auth.uid()-scoped
  // folder the bucket's RLS is keyed on. Unlike those two, there's no
  // per-photo table row here: the caller appends the returned URL onto
  // the project's own photos array via updateProject.
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
    const { error } = await supabase.from("contractor_projects").delete().eq("id", id);
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
        supabase
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
      const { data } = await supabase
        .from("contractor_projects")
        .select("*")
        .eq("contractor_id", contractorProfileId)
        .order("display_order", { ascending: true });
      setProjects(data ?? []);
      setLoading(false);
    };
    load();
  }, [contractorProfileId]);

  return { projects, loading };
}
