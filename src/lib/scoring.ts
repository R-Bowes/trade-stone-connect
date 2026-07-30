// Shared helpers for the score display layer (SCORING.md Phase 4).

export type ScoreConfidence = "building" | "provisional" | "established";
export type ScoreTrend = "up" | "down" | "stable" | "new";

export interface ScoreHistoryRow {
  score_type: "craft" | "service" | "value";
  score_value: number | null;
  confidence: ScoreConfidence | null;
  recorded_at: string;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Compares the current score to the closest history snapshot at least 30
 * days old. "New" means no snapshot exists yet from 30+ days ago — the
 * common case immediately after Phase 3 goes live.
 */
export function computeTrend(
  currentScore: number | null,
  history: ScoreHistoryRow[],
  scoreType: "craft" | "service" | "value",
): ScoreTrend {
  if (currentScore === null) return "new";

  const cutoff = Date.now() - THIRTY_DAYS_MS;
  const priorRows = history
    .filter((h) => h.score_type === scoreType && h.score_value !== null && new Date(h.recorded_at).getTime() <= cutoff)
    .sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime());

  if (priorRows.length === 0) return "new";

  const priorValue = priorRows[0].score_value!;
  const diff = currentScore - priorValue;
  if (Math.abs(diff) < 0.1) return "stable";
  return diff > 0 ? "up" : "down";
}

export const SCORE_EXPLANATIONS: Record<"craft" | "service" | "value", string> = {
  craft: "Measures the quality of their work based on inspections, callbacks, and professional peer review — not customer opinions.",
  service: "Measures communication, reliability, and professionalism — based on reviews from clients like you.",
  value: "Measures pricing transparency and whether the final cost matched what was agreed.",
};
