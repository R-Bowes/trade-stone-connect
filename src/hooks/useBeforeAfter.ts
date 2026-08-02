import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type BeforeAfterPair = Database["public"]["Tables"]["profile_before_after"]["Row"];

const BUCKET = "contractor-photos";

export function useBeforeAfter() {
  const [contractorId, setContractorId] = useState<string | null>(null);
  const [pairs, setPairs] = useState<BeforeAfterPair[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const fetchPairs = useCallback(async (forContractorId: string) => {
    const { data } = await supabase
      .from("profile_before_after")
      .select("*")
      .eq("contractor_id", forContractorId)
      .eq("is_active", true)
      .order("display_order", { ascending: true });
    setPairs(data ?? []);
  }, []);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .single();
      if (!profile) { setLoading(false); return; }
      setContractorId(profile.id);

      await fetchPairs(profile.id);
      setLoading(false);
    };
    load();
  }, [fetchPairs]);

  // Path convention `${user.id}/before-after/{uuid}.{ext}` mirrors
  // usePhotoGalleries.ts's uploadPhoto — same bucket, same top-level
  // auth.uid()-scoped folder the bucket's RLS is keyed on.
  const uploadBeforeAfterPhoto = useCallback(async (file: File): Promise<string> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "jpg";
      const filePath = `${user.id}/before-after/${crypto.randomUUID()}.${ext}`;

      const { error } = await supabase.storage.from(BUCKET).upload(filePath, file);
      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(filePath);
      return publicUrl;
    } finally {
      setUploading(false);
    }
  }, []);

  const addPair = useCallback(async (
    beforeUrl: string,
    afterUrl: string,
    title?: string,
    description?: string,
    jobId?: string,
  ) => {
    if (!contractorId) return;
    const { data: inserted } = await supabase
      .from("profile_before_after")
      .insert({
        contractor_id: contractorId,
        before_photo_url: beforeUrl,
        after_photo_url: afterUrl,
        title: title?.trim() || null,
        description: description?.trim() || null,
        job_id: jobId ?? null,
        display_order: pairs.length,
      })
      .select()
      .single();

    if (inserted) setPairs((prev) => [...prev, inserted]);
    return inserted;
  }, [contractorId, pairs.length]);

  const updatePair = useCallback(async (id: string, updates: Partial<Pick<BeforeAfterPair, "title" | "description" | "before_photo_url" | "after_photo_url" | "job_id">>) => {
    const { data: updated } = await supabase
      .from("profile_before_after")
      .update(updates)
      .eq("id", id)
      .select()
      .single();
    if (updated) setPairs((prev) => prev.map((p) => (p.id === id ? updated : p)));
    return updated;
  }, []);

  const removePair = useCallback(async (id: string) => {
    await supabase.from("profile_before_after").update({ is_active: false }).eq("id", id);
    setPairs((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const reorderPairs = useCallback(async (orderedIds: string[]) => {
    const next = orderedIds
      .map((id, i) => {
        const p = pairs.find((x) => x.id === id);
        return p ? { ...p, display_order: i } : null;
      })
      .filter((p): p is BeforeAfterPair => p !== null);
    setPairs(next);
    await Promise.all(next.map((p) => supabase.from("profile_before_after").update({ display_order: p.display_order }).eq("id", p.id)));
  }, [pairs]);

  return { pairs, loading, uploading, fetchPairs, addPair, updatePair, removePair, reorderPairs, uploadBeforeAfterPhoto };
}
