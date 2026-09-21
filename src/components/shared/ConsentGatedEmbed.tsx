import { useCookieConsent } from "@/hooks/useCookieConsent";
import { getEmbedUrl, getWatchUrl, type EmbedProvider } from "@/lib/videoEmbed";

const PROVIDER_NAME: Record<EmbedProvider, string> = {
  youtube: "YouTube",
  vimeo: "Vimeo",
  tiktok: "TikTok",
};

// TikTok is portrait: a 16:9 box would letterbox it, and full width would let
// it dominate the layout, so it gets 9:16 with a capped width. The placeholder
// uses the same box, so nothing jumps when consent changes.
const BOX: Record<EmbedProvider, { aspectRatio: string; maxWidth?: number }> = {
  youtube: { aspectRatio: "16 / 9" },
  vimeo: { aspectRatio: "16 / 9" },
  tiktok: { aspectRatio: "9 / 16", maxWidth: 325 },
};

interface ConsentGatedEmbedProps {
  provider: EmbedProvider;
  videoId: string;
  title: string;
  /** The URL the contractor saved, used for the "Watch on …" link when it is a web URL. */
  sourceUrl?: string | null;
}

/**
 * Renders the provider's player only with marketing consent; otherwise a
 * same-size placeholder. Withdrawing consent removes the iframe again.
 */
export function ConsentGatedEmbed({ provider, videoId, title, sourceUrl }: ConsentGatedEmbedProps) {
  const { marketing } = useCookieConsent();
  const name = PROVIDER_NAME[provider];
  const box = BOX[provider];
  const embedUrl = getEmbedUrl(provider, videoId);
  const watchUrl = sourceUrl && /^https?:\/\//i.test(sourceUrl) ? sourceUrl : getWatchUrl(provider, videoId);

  const boxStyle = {
    aspectRatio: box.aspectRatio,
    width: "100%",
    maxWidth: box.maxWidth,
    margin: box.maxWidth ? "0 auto" : undefined,
    background: "#111",
  } as const;

  if (marketing && embedUrl) {
    return (
      <div style={boxStyle}>
        <iframe
          src={embedUrl}
          title={title}
          loading="lazy"
          style={{ width: "100%", height: "100%", border: "none" }}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }

  // The placeholder keeps the video's aspect ratio but never clips or scrolls:
  // the min-height guarantees the notice and buttons fit, so in a narrow card
  // it may end up taller than the video it stands in for.
  return (
    <div
      style={{ ...boxStyle, minHeight: 190 }}
      className="flex flex-col items-center justify-center gap-2 p-3 text-center text-gray-200"
    >
      <i className="ti ti-cookie" style={{ fontSize: 22 }} aria-hidden="true" />
      <p className="text-xs leading-snug">
        This video is hosted on {name}, which uses cookies. Accept marketing cookies to watch it here.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
        {window.Cookiebot && (
          <button
            type="button"
            className="rounded bg-[#f07820] px-2.5 py-1 text-xs font-medium text-white hover:bg-[#d4651a]"
            onClick={() => window.Cookiebot?.renew()}
          >
            Change cookie settings
          </button>
        )}
        {watchUrl && (
          <a
            href={watchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-gray-300 underline hover:text-white"
          >
            Watch on {name}
          </a>
        )}
      </div>
    </div>
  );
}
