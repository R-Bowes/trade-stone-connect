import { cn } from "@/lib/utils";

interface WordmarkProps {
  /** "light" = navy text, for use on a paper/white background (Header).
   *  "dark" = white text, for use on a navy background (Footer). */
  theme?: "light" | "dark";
  className?: string;
  /** Bar height in px — width and gap are derived from this. */
  size?: number;
}

// Orange bar ratio 1:1.86 (w:h), gap to wordmark = bar width minus 4px.
export function Wordmark({ theme = "light", className, size = 28 }: WordmarkProps) {
  const barWidth = Math.round(size / 1.86);
  const gap = barWidth - 4;
  const textColor = theme === "dark" ? "#ffffff" : "#1a2744";

  return (
    <span className={cn("inline-flex items-center", className)}>
      <span
        aria-hidden="true"
        style={{
          display: "inline-block",
          width: barWidth,
          height: size,
          backgroundColor: "#f07820",
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
