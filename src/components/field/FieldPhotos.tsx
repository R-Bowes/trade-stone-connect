import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSignedPhotoUrls } from "@/hooks/useSignedPhotoUrls";
import { Camera, Loader2 } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type JobPhoto = Database["public"]["Tables"]["job_photos"]["Row"];

/**
 * Insert shape mirrors JobPhotosTab.tsx's uploadOne() exactly — same bucket,
 * same path convention (uploader's own auth.uid() as the first path
 * segment, required by storage.objects RLS), same column defaults.
 */
export default function FieldPhotos({
  jobId,
  ownProfileId,
}: {
  jobId: string;
  ownProfileId: string;
}) {
  const [photos, setPhotos] = useState<JobPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("job_photos")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false });
    if (!error) setPhotos(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  const imagePaths = useMemo(
    () => photos.filter((p) => p.file_type === "image" && p.storage_path).map((p) => p.storage_path as string),
    [photos],
  );
  const { urls: signedUrls } = useSignedPhotoUrls("job-photos", imagePaths);

  const handleFile = async (file: File) => {
    setUploading(true);
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${ownProfileId}/${jobId}/${Date.now()}.${ext}`;

    const { error: storageError } = await supabase.storage.from("job-photos").upload(path, file);
    if (storageError) {
      setUploading(false);
      return;
    }

    const { error: dbError } = await supabase.from("job_photos").insert({
      job_id: jobId,
      uploaded_by: ownProfileId,
      uploaded_by_role: "contractor",
      storage_path: path,
      file_type: file.type === "application/pdf" ? "pdf" : "image",
      visibility: "internal",
      portfolio: false,
      photo_approval_status: "not_requested",
    });

    if (dbError) {
      await supabase.storage.from("job-photos").remove([path]);
    } else {
      await load();
    }
    setUploading(false);
  };

  return (
    <div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="shrink-0 h-20 w-20 rounded-lg border-2 border-dashed flex items-center justify-center disabled:opacity-60"
          style={{ borderColor: "#f07820" }}
        >
          {uploading ? (
            <Loader2 className="h-5 w-5 animate-spin" style={{ color: "#f07820" }} />
          ) : (
            <Camera className="h-6 w-6" style={{ color: "#f07820" }} />
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
            e.target.value = "";
          }}
        />

        {loading ? (
          <div className="flex items-center justify-center h-20 w-20 shrink-0">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          photos.map((photo) => (
            <div key={photo.id} className="shrink-0 h-20 w-20 rounded-lg overflow-hidden bg-muted border">
              {photo.storage_path && signedUrls[photo.storage_path] ? (
                <img
                  src={signedUrls[photo.storage_path]}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
