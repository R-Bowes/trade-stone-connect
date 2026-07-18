import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const PHOTO_BUCKET = "enquiry-photos";

/**
 * `enquiry-photos` is a private bucket — getPublicUrl() constructs a URL
 * that 400s against it. This fetches signed URLs instead, the only way to
 * actually load these images. Click-to-enlarge: each thumbnail opens the
 * full image in a new tab.
 *
 * No current enquiry-creation flow actually uploads to this bucket
 * (QuoteRequestDialog collects files into local state but never calls
 * storage.upload()) — any photo_urls that render here came from manual
 * seeding/testing or a since-removed upload path, not live submissions.
 */
export function EnquiryPhotoThumbnails({ paths, label }: { paths: string[]; label?: string }) {
  const [urls, setUrls] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      paths.map(async (path) => {
        const { data } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(path, 3600);
        return data?.signedUrl ?? null;
      }),
    ).then((resolved) => {
      if (!cancelled) setUrls(resolved.filter((u): u is string => !!u));
    });
    return () => {
      cancelled = true;
    };
  }, [paths]);

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
