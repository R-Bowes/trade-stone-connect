import { useSignedPhotoUrls } from "@/hooks/useSignedPhotoUrls";

const PHOTO_BUCKET = "enquiry-photos";

/**
 * `enquiry-photos` is a private bucket — getPublicUrl() constructs a URL
 * that 400s against it. This fetches signed URLs instead, the only way to
 * actually load these images. Click-to-enlarge: each thumbnail opens the
 * full image in a new tab.
 *
 * FIXED 2026-07-23 (20260723120000_enquiry_photos_bucket_and_rls_fix.sql):
 * the `enquiry-photos` bucket was missing live despite
 * 20260328150000_enquiry_submission_flow.sql claiming to create it, and
 * that migration's RLS also gated on a nonexistent `homeowner_id` column
 * and an enquiry-id-first path structure that didn't match the upload
 * code. Bucket recreated and policies rewritten to an owner-prefix
 * ({userId}/{enquiryId}/{file}) pattern, matching QuoteRequestDialog's
 * upload path.
 */
export function EnquiryPhotoThumbnails({ paths, label }: { paths: string[]; label?: string }) {
  const { urls: urlMap } = useSignedPhotoUrls(PHOTO_BUCKET, paths);
  const urls = paths.map((p) => urlMap[p]).filter((u): u is string => !!u);

  if (urls.length === 0) return null;

  return (
    <div className="space-y-1">
      {label && <p className="text-xs font-medium text-muted-foreground">{label}</p>}
      <div className="flex flex-wrap gap-2">
        {urls.map((url, i) => (
          <a
            key={i}
            href={url}
            target="_blank"
            rel="noreferrer"
            className="block h-24 w-24 rounded-md overflow-hidden border hover:opacity-80 transition-opacity"
          >
            <img src={url} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
          </a>
        ))}
      </div>
    </div>
  );
}
