import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Batch-signs a set of storage paths against a private bucket. Shared by
 * every photo-thumbnail surface (EnquiryPhotoThumbnails, JobPhotosTab,
 * ClientJobsView's Photos tab) — extracted once a third consumer needed
 * the identical pattern EnquiryPhotoThumbnails already had: getPublicUrl()
 * constructs a URL that 400s against a private bucket, so createSignedUrl()
 * is the only way to actually load these images.
 *
 * Returns a { path -> signedUrl } map rather than an ordered array so
 * callers can look up a specific photo's URL directly instead of relying
 * on array-index alignment with their own list.
 */
export function useSignedPhotoUrls(
  bucket: string,
  paths: string[],
  expirySeconds = 3600,
): { urls: Record<string, string>; loading: boolean } {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const key = paths.join("|");

  useEffect(() => {
    if (paths.length === 0) {
      setUrls({});
      return;
    }

    let cancelled = false;
    setLoading(true);

    Promise.all(
      paths.map(async (path) => {
        const { data } = await supabase.storage.from(bucket).createSignedUrl(path, expirySeconds);
        return [path, data?.signedUrl ?? null] as const;
      }),
    ).then((resolved) => {
      if (cancelled) return;
      const map: Record<string, string> = {};
      for (const [path, url] of resolved) {
        if (url) map[path] = url;
      }
      setUrls(map);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bucket, key, expirySeconds]);

  return { urls, loading };
}
