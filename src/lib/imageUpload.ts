// Client-side image preparation before upload: HEIC -> JPEG (iOS), then
// downscale + re-encode. HEIC handling mirrors JobPhotosTab.tsx; compression
// mirrors FieldPhotos.tsx.

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.72;

// iOS reports HEIC inconsistently — sometimes "image/heic"/"image/heif",
// sometimes a blank type when the file arrives via the Files app. Checking the
// extension too catches a browser that mis-reports.
export function isHeic(file: File): boolean {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  return type === "image/heic" || type === "image/heif" || name.endsWith(".heic") || name.endsWith(".heif");
}

async function convertHeicToJpeg(file: File): Promise<File> {
  const heic2any = (await import("heic2any")).default;
  const result = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.85 });
  const blob = Array.isArray(result) ? result[0] : result;
  const stem = file.name.replace(/\.[^./]+$/, "");
  return new File([blob], `${stem}.jpg`, { type: "image/jpeg" });
}

// Falls back to the original file if canvas encoding fails for any reason,
// rather than blocking the upload.
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

    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    if (!blob) return file;

    const stem = file.name.replace(/\.[^./]+$/, "");
    return new File([blob], `${stem}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export async function prepareImageForUpload(file: File): Promise<File> {
  const converted = isHeic(file) ? await convertHeicToJpeg(file) : file;
  return compressImage(converted);
}
