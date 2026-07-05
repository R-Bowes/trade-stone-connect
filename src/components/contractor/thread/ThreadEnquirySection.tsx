import { useEffect, useState } from "react";
import { MapPin, Calendar, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export interface ThreadEnquiry {
  id: string;
  job_description: string;
  location: string;
  budget_range: string | null;
  preferred_timeline: string | null;
  photo_urls: string[] | null;
  created_at: string | null;
}

const PHOTO_BUCKET = "enquiry-photos";

/**
 * Enquiry photo uploads have no working storage trail anywhere in this
 * codebase — QuoteRequestDialog collects files into local state but never
 * uploads them, so `photo_urls` is never actually populated by any current
 * flow (see engagement-thread build notes). Rendered defensively via signed
 * URLs (the `enquiry-photos` bucket is private) in case rows exist from
 * manual seeding/testing or a future upload path lands.
 */
function EnquiryPhotos({ paths }: { paths: string[] }) {
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
    <div className="flex flex-wrap gap-2">
      {urls.map((url, i) => (
        <a key={i} href={url} target="_blank" rel="noreferrer" className="block h-20 w-20 rounded-md overflow-hidden border">
          <img src={url} alt={`Enquiry photo ${i + 1}`} className="h-full w-full object-cover" />
        </a>
      ))}
    </div>
  );
}

export function ThreadEnquirySection({ enquiry }: { enquiry: ThreadEnquiry }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Enquiry</h3>
      <p className="text-sm whitespace-pre-wrap">{enquiry.job_description}</p>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{enquiry.location}</span>
        {enquiry.budget_range && (
          <span className="flex items-center gap-1"><Wallet className="h-3.5 w-3.5" />{enquiry.budget_range}</span>
        )}
        {enquiry.preferred_timeline && (
          <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{enquiry.preferred_timeline}</span>
        )}
      </div>
      {enquiry.photo_urls && enquiry.photo_urls.length > 0 && (
        <EnquiryPhotos paths={enquiry.photo_urls} />
      )}
    </div>
  );
}
