/**
 * Display status for a homeowner project.
 *
 * projects.status is only ever set by the owner (or, later, by sign-off),
 * so the chip is derived rather than read straight from the column:
 *   - "Completed"   when projects.status is 'completed'
 *   - "In progress" when at least one job is attached to the project
 *   - "Planning"    otherwise
 * The attached-job count is passed in by the caller (jobs are loaded by the
 * project page, not here).
 */

export type ProjectDisplayStatus = "Planning" | "In progress" | "Completed";

export function projectDisplayStatus(storedStatus: string | null | undefined, attachedJobCount: number): ProjectDisplayStatus {
  if (storedStatus === "completed") return "Completed";
  if (attachedJobCount > 0) return "In progress";
  return "Planning";
}

/** Chip colours, matching the job status chips (navy / orange / green). */
export const PROJECT_STATUS_CHIP: Record<ProjectDisplayStatus, string> = {
  Planning: "bg-[#1e3a5f] text-white border-[#1e3a5f]",
  "In progress": "bg-[#f07820] text-white border-[#f07820]",
  Completed: "bg-green-600 text-white border-green-600",
};
