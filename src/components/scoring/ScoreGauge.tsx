// Shared visual score indicator — filled bar, navy background / orange fill.
// Deliberately NOT a star rating (SCORING.md Section 6): this is TradeStone's
// own three-score system, not the legacy job_reviews rating. Reused across
// the contractor dashboard (full, with number), the homeowner profile view
// (compact, no number), and the B2B scorecard.

const NAVY = "#1a2744";
const ORANGE = "#f07820";

export type ScoreConfidence = "building" | "provisional" | "established";

export function confidenceLabel(confidence: ScoreConfidence | null | undefined): string {
  switch (confidence) {
    case "established": return "";
    case "provisional": return "Provisional";
    case "building": return "Building";
    default: return "Building";
  }
}

export function ScoreGauge({
  score,
  confidence,
  variant = "full",
}: {
  score: number | null;
  confidence: ScoreConfidence | null | undefined;
  variant?: "full" | "compact";
}) {
  const isBuilding = confidence === "building" || score === null;
  const fillPct = isBuilding ? 0 : Math.max(0, Math.min(100, (score! / 10) * 100));
  const height = variant === "compact" ? 6 : 10;

  return (
    <div
      role="progressbar"
      aria-valuenow={isBuilding ? undefined : score!}
      aria-valuemin={0}
      aria-valuemax={10}
      style={{
        width: "100%",
        height,
        borderRadius: height,
        background: isBuilding ? "#e5e7eb" : `${NAVY}1a`,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: `${fillPct}%`,
          height: "100%",
          borderRadius: height,
          background: isBuilding ? "transparent" : ORANGE,
          transition: "width 0.3s ease",
        }}
      />
    </div>
  );
}
