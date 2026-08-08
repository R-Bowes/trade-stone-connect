import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSignedPhotoUrls } from "@/hooks/useSignedPhotoUrls";
import { Camera, Loader2 } from "lucide-react";
import { ORANGE } from "./FieldHeader";
import type { Database } from "@/integrations/supabase/types";

type JobPhoto = Database["public"]["Tables"]["job_photos"]["Row"];

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.72;

/**
 * Downscales + re-encodes as JPEG before upload — site photos over mobile
 * data are a real cost and a real wait (brief, Part A). Falls back to the
 * original file if canvas encoding fails for any reason (e.g. an
 * unsupported format) rather than blocking the upload entirely.
 */
async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );
    if (!blob) return file;

    const stem = file.name.replace(/\.[^./]+$/, "");
    return new File([blob], `${stem}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

/**
 * Insert shape mirrors JobPhotosTab.tsx's uploadOne() — same bucket, same
 * path convention (uploader's own auth.uid() as the first path segment,
 * required by storage.objects RLS), same column defaults.
 *
 * Signature captures are job_photos rows too (tags: ['signature'], see
 * FieldSignatureCapture.tsx) but are NOT a job photo — excluded from this
 * strip. A customer's signature must never surface as a photo anywhere.
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
      .not("tags", "cs", '{signature}')
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

  const handleFile = async (fileIn: File) => {
    setUploading(true);
    try {
      const file = await compressImage(fileIn);
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${ownProfileId}/${jobId}/${Date.now()}.${ext}`;

      const { error: storageError } = await supabase.storage.from("job-photos").upload(path, file);
      if (storageError) throw storageError;

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
        throw dbError;
      }
      await load();
    } catch (err) {
      toast.error("Photo didn't upload", {
        description: "Check your signal and try again.",
        action: { label: "Retry", onClick: () => handleFile(fileIn) },
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <div className="flex gap-3 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="shrink-0 rounded-lg border-2 border-dashed flex items-center justify-center disabled:opacity-60"
          style={{ height: 84, width: 84, borderColor: ORANGE }}
        >
          {uploading ? (
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: ORANGE }} />
          ) : (
            <Camera className="h-7 w-7" style={{ color: ORANGE }} />
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
          <div className="flex items-center justify-center shrink-0" style={{ height: 84, width: 84 }}>
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          photos.map((photo) => (
            <div
              key={photo.id}
              className="shrink-0 rounded-lg overflow-hidden bg-muted border"
              style={{ height: 84, width: 84 }}
            >
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
