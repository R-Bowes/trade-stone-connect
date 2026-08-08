import { ChevronLeft } from "lucide-react";

const NAVY = "#1a2744";
const ORANGE = "#f07820";

/**
 * Shared navy header for every /field screen — phone-first, no bottom nav
 * (per brief). List screen passes only title/subtitle; detail screens add
 * onBack for the arrow.
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
    <div style={{ backgroundColor: NAVY }} className="px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="shrink-0 rounded-full p-1 -ml-1 hover:bg-white/10 transition-colors"
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
          <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.6)" }}>
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}

export { NAVY, ORANGE };
