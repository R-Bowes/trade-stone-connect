import { ChevronLeft } from "lucide-react";

const NAVY = "#1a2744";
const ORANGE = "#f07820";

/**
 * Shared navy header for every /field screen — phone-first, no bottom nav
 * (per brief). List screen passes only title/subtitle; detail screens add
 * onBack for the arrow. The coloured bar itself runs full-bleed edge to
 * edge (normal for an app header even in a centred layout); its content is
 * constrained to the same max-w-xl the page body uses, so text lines up
 * with the content below it on tablet/desktop instead of stretching wide.
 */
export default function FieldHeader({
  title,
  subtitle,
  onBack,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
}) {
  return (
    <div style={{ backgroundColor: NAVY }} className="sticky top-0 z-20">
      <div className="max-w-xl mx-auto px-4 py-4 flex items-center gap-2">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            className="shrink-0 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
            style={{ width: 44, height: 44, marginLeft: -10 }}
          >
            <ChevronLeft className="h-6 w-6 text-white" />
          </button>
        )}
        <div className="min-w-0">
          <h1
            className="text-lg font-semibold text-white truncate"
            style={{ fontFamily: "Lexend, sans-serif" }}
          >
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm mt-0.5" style={{ color: "rgba(255,255,255,0.65)" }}>
              {subtitle}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export { NAVY, ORANGE };
