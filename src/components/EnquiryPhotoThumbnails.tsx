import { useSignedPhotoUrls } from "@/hooks/useSignedPhotoUrls";

const PHOTO_BUCKET = "enquiry-photos";

/**
 * `enquiry-photos` is a private bucket — getPublicUrl() constructs a URL
 * that 400s against it. This fetches signed URLs instead, the only way to
 * actually load these images. Click-to-enlarge: each thumbnail opens the
 * full image in a new tab.
 *
 * KNOWN BROKEN as of 2026-07-19: the `enquiry-photos` bucket does not
 * exist in the live bucket list, despite a migration
 * (20260328150000_enquiry_submission_flow.sql) that should have created
 * it. createSignedUrl() against a nonexistent bucket returns no URL, and
 * this component's own empty-state (`if (urls.length === 0) return
 * null`) means every consumer (SendQuoteDialog, ThreadEnquirySection,
 * JobOriginSection) has always silently rendered nothing, with no visible
 * error — not just "nothing uploads here" as previously documented, but
 * "even manually-seeded photo_urls could never have displayed." Flagged
 * for the upcoming enquiry-upload slice, not fixed here.
 *
 * No current enquiry-creation flow actually uploads to this bucket
 * (QuoteRequestDialog collects files into local state but never calls
 * storage.upload()) — any photo_urls that render here came from manual
 * seeding/testing or a since-removed upload path, not live submissions.
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
            className="block h-16 w-16 rounded-md overflow-hidden border hover:opacity-80 transition-opacity"
          >
            <img src={url} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
          </a>
        ))}
      </div>
    </div>
  );
}
