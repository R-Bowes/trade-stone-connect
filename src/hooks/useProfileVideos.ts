import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type ProfileVideo = Database["public"]["Tables"]["profile_videos"]["Row"];
export type VideoPlatform = ProfileVideo["platform"];

export interface ExtractedVideo {
  platform: VideoPlatform;
  videoId: string | null;
}

// Extracts { platform, videoId } from any supported video URL shape:
//   YouTube: watch?v=XXX, youtu.be/XXX, /shorts/XXX
//   TikTok:  /video/XXX, /@user/video/XXX
//   Vimeo:   vimeo.com/XXX
export function extractVideoId(url: string): ExtractedVideo {
  const trimmed = url.trim();

  const youtubeMatch = trimmed.match(
    /(?:youtube\.com\/watch\?v=|youtube\.com\/shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{6,})/
  );
  if (youtubeMatch) return { platform: "youtube", videoId: youtubeMatch[1] };

  const tiktokMatch = trimmed.match(/tiktok\.com\/(?:@[\w.-]+\/)?video\/(\d+)/);
  if (tiktokMatch) return { platform: "tiktok", videoId: tiktokMatch[1] };

  const vimeoMatch = trimmed.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeoMatch) return { platform: "vimeo", videoId: vimeoMatch[1] };

  return { platform: "other", videoId: null };
}

export function useProfileVideos() {
  const [contractorId, setContractorId] = useState<string | null>(null);
  const [videos, setVideos] = useState<ProfileVideo[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchVideos = useCallback(async (forContractorId: string) => {
    const { data } = await supabase
      .from("profile_videos")
      .select("*")
      .eq("contractor_id", forContractorId)
      .eq("is_active", true)
      .order("display_order", { ascending: true });
    setVideos(data ?? []);
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

      await fetchVideos(profile.id);
      setLoading(false);
    };
    load();
  }, [fetchVideos]);

  const addVideo = useCallback(async (url: string, title?: string, description?: string) => {
    if (!contractorId) return;
    const { platform } = extractVideoId(url);

    const { data: inserted } = await supabase
      .from("profile_videos")
      .insert({
        contractor_id: contractorId,
        url: url.trim(),
        platform,
        title: title?.trim() || null,
        description: description?.trim() || null,
        display_order: videos.length,
      })
      .select()
      .single();

    if (inserted) setVideos((prev) => [...prev, inserted]);
    return inserted;
  }, [contractorId, videos.length]);

  const updateVideo = useCallback(async (id: string, updates: Partial<Pick<ProfileVideo, "title" | "description" | "url" | "platform">>) => {
    const { data: updated } = await supabase
      .from("profile_videos")
      .update(updates)
      .eq("id", id)
      .select()
      .single();
    if (updated) setVideos((prev) => prev.map((v) => (v.id === id ? updated : v)));
    return updated;
  }, []);

  const removeVideo = useCallback(async (id: string) => {
    await supabase.from("profile_videos").update({ is_active: false }).eq("id", id);
    setVideos((prev) => prev.filter((v) => v.id !== id));
  }, []);

  const reorderVideos = useCallback(async (orderedIds: string[]) => {
    const next = orderedIds
      .map((id, i) => {
        const v = videos.find((x) => x.id === id);
        return v ? { ...v, display_order: i } : null;
      })
      .filter((v): v is ProfileVideo => v !== null);
    setVideos(next);
    await Promise.all(next.map((v) => supabase.from("profile_videos").update({ display_order: v.display_order }).eq("id", v.id)));
  }, [videos]);

  return { videos, loading, addVideo, updateVideo, removeVideo, reorderVideos, fetchVideos };
}
