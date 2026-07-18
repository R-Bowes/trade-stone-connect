import type { PresenterTone } from "./statusPresenter";

/** Shared tone -> badge colour, so every surface using the presenter looks the same. */
export const TONE_BADGE_CLASS: Record<PresenterTone, string> = {
  action: "bg-amber-100 text-amber-800",
  waiting: "bg-blue-100 text-blue-800",
  neutral: "bg-gray-100 text-gray-600",
  done: "bg-green-100 text-green-800",
};
