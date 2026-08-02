import type { VideoPlatform } from "@/hooks/useProfileVideos";

// Builds the iframe src for a given platform + extracted video id.
// Returns null for 'other' or when the id couldn't be extracted — callers
// should fall back to a plain link in that case.
export function getEmbedUrl(platform: VideoPlatform, videoId: string | null): string | null {
  if (!videoId) return null;
  switch (platform) {
    case "youtube": return `https://www.youtube.com/embed/${videoId}`;
    case "tiktok": return `https://www.tiktok.com/embed/v2/${videoId}`;
    case "vimeo": return `https://player.vimeo.com/video/${videoId}`;
    default: return null;
  }
}
