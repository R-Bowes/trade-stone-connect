// jobs.job_type / job_checklist_templates.job_type is CHECK-constrained to
// exactly these six values (confirmed against the live jobs_job_type_check
// constraint). Single source of truth for the readable label — previously
// duplicated ad hoc (e.g. ChecklistTemplates.tsx's own JOB_TYPES array).
export const JOB_TYPE_LABELS: Record<string, string> = {
  service_visit: "Service visit",
  repair: "Repair",
  installation: "Installation",
  inspection: "Inspection",
  emergency: "Emergency",
  other: "Other",
};

export const JOB_TYPES = Object.entries(JOB_TYPE_LABELS).map(([value, label]) => ({ value, label }));

export function jobTypeLabel(jobType: string | null): string | null {
  if (!jobType) return null;
  return JOB_TYPE_LABELS[jobType] ?? jobType;
}

/**
 * Field-view display heading for a job. Chain: location (what an engineer
 * actually needs on site) -> customer name + readable job type (still
 * meaningful when there's no address on file) -> title as a last resort
 * (never an empty/placeholder line — jobs.title is NOT NULL and, as of
 * 20260808140000, mint_job_from_quote never produces an empty one either).
 */
export function jobHeading(
  job: { location: string | null; title: string; job_type: string | null },
  customerName?: string | null,
): string {
  if (job.location) return job.location;
  if (customerName) {
    const type = jobTypeLabel(job.job_type);
    return type ? `${customerName} · ${type}` : customerName;
  }
  return job.title;
}
