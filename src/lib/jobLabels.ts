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
