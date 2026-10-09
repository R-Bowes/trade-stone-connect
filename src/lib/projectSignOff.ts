/**
 * What still stands between a project and sign-off. Mirrors the checks in
 * sign_off_project (migration 20261008100000) so the card can say why the
 * button is disabled; the database remains the authority and re-checks
 * everything when the button is pressed.
 */
import { jobStatusChip } from "@/lib/jobStatus";
import { orderPackages } from "@/lib/projectPackages";

interface SignOffPackage {
  title: string;
  job_id: string | null;
  trade: string | null;
  sort_order: number;
  created_at: string;
}

interface SignOffJob {
  status: string;
}

interface SignOffSnag {
  status: string;
}

export function isSnagOpen(snag: SignOffSnag): boolean {
  return snag.status !== "resolved";
}

/** Plain-English reasons sign-off is blocked. Empty when it can go ahead. */
export function signOffBlockers(
  projectStatus: string,
  packages: SignOffPackage[],
  jobs: Record<string, SignOffJob>,
  snags: SignOffSnag[],
): string[] {
  if (projectStatus === "completed") return [];
  if (projectStatus === "cancelled") return ["This project is cancelled."];

  const blockers: string[] = [];
  if (packages.length === 0) blockers.push("Add at least one package of work.");

  for (const pkg of orderPackages(packages)) {
    if (!pkg.job_id) {
      blockers.push(`${pkg.title} has no contractor yet.`);
      continue;
    }
    const job = jobs[pkg.job_id];
    if (!job) blockers.push(`${pkg.title}: the job's details are not available.`);
    else if (job.status !== "complete") blockers.push(`${pkg.title}: the job is ${jobStatusChip(job.status).label.toLowerCase()}, not complete.`);
  }

  const open = snags.filter(isSnagOpen).length;
  if (open > 0) blockers.push(open === 1 ? "1 snag is still open." : `${open} snags are still open.`);

  return blockers;
}
