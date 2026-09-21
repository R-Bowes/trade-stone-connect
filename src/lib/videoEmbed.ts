import type { VideoPlatform } from "@/hooks/useProfileVideos";

// Platforms that have an embeddable player. 'other' has none — callers fall
// back to a plain link.
export type EmbedProvider = "youtube" | "vimeo" | "tiktok";

export function isEmbeddable(platform: VideoPlatform): platform is EmbedProvider {
  return platform === "youtube" || platform === "vimeo" || platform === "tiktok";
}

// Builds the iframe src for a given platform + extracted video id.
// Returns null for 'other' or when the id couldn't be extracted — callers
// should fall back to a plain link in that case.
//
// youtube-nocookie.com and Vimeo's dnt=1 reduce what the players set, but both
// still use device storage once loaded — this supplements the consent gate
// (ConsentGatedEmbed), it does not replace it.
export function getEmbedUrl(platform: VideoPlatform, videoId: string | null): string | null {
  if (!videoId) return null;
  switch (platform) {
    case "youtube": return `https://www.youtube-nocookie.com/embed/${videoId}`;
    case "tiktok": return `https://www.tiktok.com/embed/v2/${videoId}`;
    case "vimeo": return `https://player.vimeo.com/video/${videoId}?dnt=1`;
    default: return null;
  }
}

// The video's own page on the provider's site, for the "Watch on …" link.
// TikTok has no page that can be built from the id alone (it is only detected
// from a full saved URL), so it returns null and the link is omitted.
export function getWatchUrl(provider: EmbedProvider, videoId: string): string | null {
  switch (provider) {
    case "youtube": return `https://www.youtube.com/watch?v=${videoId}`;
    case "vimeo": return `https://vimeo.com/${videoId}`;
    case "tiktok": return null;
  }
}
