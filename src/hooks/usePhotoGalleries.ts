import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

// contractor_photo_galleries is created by migration 20260618120000.
// gallery_id column added to contractor_photos by the same migration.
// Neither is in generated types.ts until regenerated — cast as needed.

export interface ContractorPhotoGallery {
  id: string;
  contractor_id: string;
  title: string;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface ContractorPhoto {
  id: string;
  contractor_id: string;
  gallery_id: string | null;
  photo_url: string;
  title: string | null;
  description: string | null;
  is_featured: boolean;
  display_order: number;
  project_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface GalleryWithPhotos extends ContractorPhotoGallery {
  photos: ContractorPhoto[];
}

// ── usePhotoGalleries ─────────────────────────────────────────────────────────
// Manages the authenticated contractor's gallery list.
// Two-step lookup for contractor_id (FK → profiles.id).
// Max 3 galleries enforced here; addGallery throws if already at limit.
export function usePhotoGalleries() {
  const [contractorId, setContractorId] = useState<string | null>(null);
  const [galleries, setGalleries] = useState<ContractorPhotoGallery[]>([]);
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
      .from("contractor_photo_galleries")
      .select("*")
      .eq("contractor_id", profile.id)
      .order("display_order", { ascending: true });

    setGalleries((data ?? []) as ContractorPhotoGallery[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const addGallery = useCallback(async (title: string): Promise<string | null> => {
    if (!contractorId) return null;
    if (galleries.length >= 3) throw new Error("Maximum 3 galleries allowed");

    const { data: inserted, error } = await (supabase as any)
      .from("contractor_photo_galleries")
      .insert({ contractor_id: contractorId, title, display_order: galleries.length })
      .select()
      .single();
    if (error) throw error;
    if (inserted) setGalleries(prev => [...prev, inserted as ContractorPhotoGallery]);
    return inserted ? (inserted as ContractorPhotoGallery).id : null;
  }, [contractorId, galleries.length]);

  const updateGallery = useCallback(async (id: string, title: string) => {
    const { data: updated, error } = await (supabase as any)
      .from("contractor_photo_galleries")
      .update({ title })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    if (updated) {
      setGalleries(prev => prev.map(g => g.id === id ? updated as ContractorPhotoGallery : g));
    }
  }, []);

  // Deleting a gallery sets gallery_id = NULL on its photos (ON DELETE SET NULL),
  // so the photos are orphaned rather than deleted.
  const deleteGallery = useCallback(async (id: string) => {
    const { error } = await (supabase as any)
      .from("contractor_photo_galleries")
      .delete()
      .eq("id", id);
    if (error) throw error;
    setGalleries(prev => prev.filter(g => g.id !== id));
  }, []);

  return { galleries, loading, addGallery, updateGallery, deleteGallery };
}

// ── useGalleryPhotos ──────────────────────────────────────────────────────────
// Manages photos within a single gallery.
// contractor_photos.contractor_id → profiles.user_id: use auth.uid() directly
// (same exception as documented in CLAUDE.md for contractor_photos).
export function useGalleryPhotos(galleryId: string | null) {
  const [photos, setPhotos] = useState<ContractorPhoto[]>([]);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    if (!galleryId) { setPhotos([]); return; }
    const { data } = await (supabase as any)
      .from("contractor_photos")
      .select("*")
      .eq("gallery_id", galleryId)
      .order("display_order", { ascending: true });
    setPhotos((data ?? []) as ContractorPhoto[]);
  }, [galleryId]);

  useEffect(() => { load(); }, [load]);

  const uploadPhoto = useCallback(async (file: File) => {
    if (!galleryId) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "jpg";
      const filePath = `${user.id}/${galleryId}/${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("contractor-photos")
        .upload(filePath, file);
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("contractor-photos")
        .getPublicUrl(filePath);

      const nextOrder = photos.reduce((m, p) => Math.max(m, p.display_order), -1) + 1;

      const { error: insertError } = await (supabase as any)
        .from("contractor_photos")
        .insert({
          contractor_id: user.id,   // FK → profiles.user_id; use user.id directly
          gallery_id: galleryId,
          photo_url: publicUrl,
          display_order: nextOrder,
          is_featured: false,
        });
      if (insertError) throw insertError;
      await load();
    } finally {
      setUploading(false);
    }
  }, [galleryId, photos, load]);

  const deletePhoto = useCallback(async (id: string) => {
    const photo = photos.find(p => p.id === id);
    if (!photo) return;

    // Best-effort storage removal — don't fail the delete if the file is missing.
    const urlParts = photo.photo_url.split("/contractor-photos/");
    const storagePath = urlParts[1]?.split("?")[0];
    if (storagePath) {
      await supabase.storage.from("contractor-photos").remove([storagePath]);
    }

    const { error } = await (supabase as any).from("contractor_photos").delete().eq("id", id);
    if (error) throw error;
    setPhotos(prev => prev.filter(p => p.id !== id));
  }, [photos]);

  const reorderPhotos = useCallback(async (from: number, to: number) => {
    const reordered = [...photos];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    const updated = reordered.map((p, i) => ({ ...p, display_order: i }));
    setPhotos(updated);
    await Promise.all(
      updated.map(p =>
        (supabase as any)
          .from("contractor_photos")
          .update({ display_order: p.display_order })
          .eq("id", p.id)
      )
    );
  }, [photos]);

  return { photos, uploading, uploadPhoto, deletePhoto, reorderPhotos };
}

// ── usePublicGalleries ────────────────────────────────────────────────────────
// Reads galleries with nested photos for the public contractor profile.
// contractorProfileId is profiles.id.
export function usePublicGalleries(contractorProfileId: string) {
  const [galleries, setGalleries] = useState<GalleryWithPhotos[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!contractorProfileId) return;
    const load = async () => {
      const { data: galleryRows } = await (supabase as any)
        .from("contractor_photo_galleries")
        .select("*")
        .eq("contractor_id", contractorProfileId)
        .order("display_order", { ascending: true });

      const rows = (galleryRows ?? []) as ContractorPhotoGallery[];
      if (rows.length === 0) {
        setGalleries([]);
        setLoading(false);
        return;
      }

      const galleryIds = rows.map(g => g.id);
      const { data: photoRows } = await (supabase as any)
        .from("contractor_photos")
        .select("*")
        .in("gallery_id", galleryIds)
        .order("display_order", { ascending: true });

      const photosByGallery = new Map<string, ContractorPhoto[]>();
      for (const photo of (photoRows ?? []) as ContractorPhoto[]) {
        if (!photo.gallery_id) continue;
        const bucket = photosByGallery.get(photo.gallery_id) ?? [];
        bucket.push(photo);
        photosByGallery.set(photo.gallery_id, bucket);
      }

      setGalleries(rows.map(g => ({ ...g, photos: photosByGallery.get(g.id) ?? [] })));
      setLoading(false);
    };
    load();
  }, [contractorProfileId]);

  return { galleries, loading };
}
