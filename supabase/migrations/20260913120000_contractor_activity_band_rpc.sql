-- Public-profile "Active this week / this month" liveness signal.
--
-- Anonymous visitors have NO SELECT access to issued_quotes, jobs, or
-- job_photos today — every SELECT policy on all three tables is scoped to
-- `TO authenticated` with an owner/party auth.uid() check (confirmed by
-- reading every CREATE POLICY across the migration history for these three
-- tables; no anon-readable or USING(true) policy exists on any of them).
-- A plain client-side query from the public profile page would therefore
-- silently return zero rows for an anonymous viewer and the badge would
-- never appear — the same silent-empty failure mode CLAUDE.md documents
-- for tender_clarifications. A SECURITY DEFINER function is used instead so
-- RLS is bypassed deliberately, in one place, returning only a coarse band
-- (never a raw timestamp) — no row-level quote/job data is exposed to the
-- caller at any point.
--
-- Activity is real contractor platform activity, not login:
--   GREATEST(MAX(issued_quotes.created_at) for the contractor,
--            MAX(GREATEST(jobs.completed_at, jobs.actual_start)) for the
--              contractor,
--            MAX(job_photos.created_at) uploaded by the contractor on their
--              own jobs)
--
-- jobs.updated_at was deliberately NOT used here (an earlier draft used
-- it): it is bumped by ANY write to the row, including a client sign-off
-- or a company member's edit, so it can report contractor activity that
-- wasn't the contractor's. completed_at and actual_start are both written
-- exclusively from JobManagement.tsx (the contractor's own job screen) --
-- unambiguous contractor actions. Both are nullable (`string | null` in
-- the generated types); Postgres's GREATEST()/LEAST() ignore NULL
-- arguments and only return NULL if every argument is NULL (unlike a
-- plain `a > b` comparison, where a NULL operand poisons the whole
-- expression to NULL) -- so GREATEST(completed_at, actual_start) correctly
-- yields whichever of the two is set, and NULL only when a job has
-- neither yet. No null-handling workaround needed.
--
-- job_photos has no contractor_id column, so it is joined through jobs.
-- job_photos also carries uploaded_by_role ('contractor' | 'customer') --
-- filtered to 'contractor' here so a customer uploading a photo to their
-- own job (the same customer-vs-contractor distinction CLAUDE.md's spec
-- already draws for excluding service_reviews) does not count as the
-- contractor being active.
--
-- The combined last-activity timestamp is computed once in a derived
-- table (`activity`) and referenced by both CASE branches, rather than
-- repeating the three-way GREATEST/subquery block in each WHEN -- a STABLE
-- sql function only evaluates it once per call either way, so this is a
-- one-place-to-edit readability choice, not a performance one.

CREATE OR REPLACE FUNCTION public.get_contractor_activity_band(p_contractor_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN activity.last_activity >= now() - interval '7 days' THEN 'week'
    WHEN activity.last_activity >= now() - interval '30 days' THEN 'month'
    ELSE NULL
  END
  FROM (
    SELECT GREATEST(
      (SELECT MAX(created_at) FROM public.issued_quotes WHERE contractor_id = p_contractor_id),
      (SELECT MAX(GREATEST(completed_at, actual_start)) FROM public.jobs WHERE contractor_id = p_contractor_id),
      (SELECT MAX(jp.created_at)
         FROM public.job_photos jp
         JOIN public.jobs j ON j.id = jp.job_id
        WHERE j.contractor_id = p_contractor_id
          AND jp.uploaded_by_role = 'contractor')
    ) AS last_activity
  ) activity;
$$;

GRANT EXECUTE ON FUNCTION public.get_contractor_activity_band(uuid) TO anon, authenticated;
