import { cn } from "@/lib/utils";
import tradestoneMark from "@/assets/tradestone-mark.png";
import tradestoneMarkLight from "@/assets/tradestone-mark-light.png";

interface WordmarkProps {
  /** "light" = navy text + the navy-bodied mark, for use on a paper/white
   *  background (Header). "dark" = white text + the paper-bodied mark
   *  variant, for use on a navy background (Footer) — the navy-bodied mark
   *  disappears into a navy background otherwise. */
  theme?: "light" | "dark";
  className?: string;
  /** Wordmark font-size in px — the mark's height and the gap between them
   *  are both derived from this. */
  size?: number;
}

// Both mark variants are 845x711 (~1.19:1, wider than tall), transparent
// background. Sized by height to the wordmark's cap height (roughly 0.85 of
// font-size for Barlow Condensed) or slightly taller, width auto. Gap
// formula is unchanged from the orange-bar version it replaced, so
// header/footer spacing doesn't shift.
const MARK_ASPECT_RATIO = 845 / 711;

export function Wordmark({ theme = "light", className, size = 28 }: WordmarkProps) {
  const markHeight = Math.round(size * 0.85);
  const gap = Math.round(size / 1.86) - 4;
  const textColor = theme === "dark" ? "#ffffff" : "#1a2744";
  const markSrc = theme === "dark" ? tradestoneMarkLight : tradestoneMark;

  return (
    <span className={cn("inline-flex items-center", className)}>
      <img
        src={markSrc}
        alt=""
        aria-hidden="true"
        style={{
          display: "block",
          height: markHeight,
          width: markHeight * MARK_ASPECT_RATIO,
          marginRight: gap,
          flexShrink: 0,
        }}
      />
      <span
        style={{
          fontFamily: "'Barlow Condensed', sans-serif",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.03em",
          fontSize: size,
          lineHeight: 1,
          color: textColor,
          whiteSpace: "nowrap",
        }}
      >
        TRADESTONE
      </span>
    </span>
  );
}
