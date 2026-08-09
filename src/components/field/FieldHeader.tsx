import { ChevronLeft, LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { performSignOut } from "@/lib/signOut";

const NAVY = "#1a2744";
const ORANGE = "#f07820";

/**
 * Shared navy header for every /field screen — phone-first, no bottom nav
 * (per brief). List screen passes only title/subtitle; detail screens add
 * onBack for the arrow. The coloured bar itself runs full-bleed edge to
 * edge (normal for an app header even in a centred layout); its content is
 * constrained to the same max-w-xl the page body uses, so text lines up
 * with the content below it on tablet/desktop instead of stretching wide.
 *
 * Sign-out lives here rather than on individual /field screens so it's
 * reachable from every one of them (FieldJobList and FieldJobDetail both
 * render this component) without each screen wiring it up separately.
 * Team members otherwise have no route to sign out once /dashboard/homeowner
 * is closed to them — this closes that regression in the same change.
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
  const navigate = useNavigate();

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
        <div className="min-w-0 flex-1">
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
        <button
          type="button"
          onClick={() => void performSignOut(navigate)}
          aria-label="Sign out"
          title="Sign out"
          className="shrink-0 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
          style={{ width: 44, height: 44, marginRight: -10 }}
        >
          <LogOut className="h-5 w-5 text-white" />
        </button>
      </div>
    </div>
  );
}

export { NAVY, ORANGE };
