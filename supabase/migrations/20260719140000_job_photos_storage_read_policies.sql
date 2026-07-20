-- Reconciliation: the job-photos bucket is confirmed live PRIVATE
-- (public: false) — 20260719100000's migration comment assumed
-- public: true from the original 20260308192308 migration text, which
-- was wrong; live wins. DECISION: keep the bucket private (do not flip
-- public). The display-side fix (signed URLs instead of getPublicUrl)
-- is a frontend-only change, no migration needed for that half.
--
-- This migration is the storage.objects half: createSignedUrl() still
-- requires the caller to have SELECT permission on the object under RLS
-- (bucket privacy alone does not grant read access to authenticated
-- callers — that's what storage.objects policies are for). The original
-- migration's "Anyone can view job photos" policy
-- (USING (bucket_id = 'job-photos'), TO public, no owner/folder
-- restriction — 20260308192308...sql) was written under the public-
-- bucket assumption and is a genuine security hole independent of the
-- bucket's own public/private flag: ANY caller who has or derives a
-- storage_path — not just the job's own contractor or customer — could
-- sign a URL for it, bypassing the visibility='customer' gate the
-- job_photos TABLE's RLS already enforces (20260719100000).
-- Storage-object RLS and table RLS are two separate authorization
-- layers; fixing one does not fix the other.
--
-- LIVE NAMES DIVERGED FROM MIGRATION TEXT (confirmed via live
-- pg_policies, 2026-07-19) — dashboard drift, same class as the
-- bucket's public flag being wrong. The migration-text policy was never
-- actually named "Anyone can view job photos" live; the two policies
-- actually doing the over-permissive job are:
--   - "Public can view job photos" (TO public, qual: bucket_id =
--     'job-photos' only — anon included)
--   - "Authenticated users can view job photos" (TO public, qual:
--     bucket_id = 'job-photos' AND auth.role() = 'authenticated')
-- All three names (the two live ones plus the migration-text name, in
-- case a third environment still has that exact one) are dropped below
-- — belt and braces, since we now know migration text cannot be trusted
-- for this table's live policy names.
--
-- Verified-kept, untouched by this migration (confirmed via live
-- pg_policies, both passes — the second pass covers INSERT, invisible
-- to the first since it filtered on `qual`, which is null for
-- WITH CHECK-only policies):
--   - "Contractors can delete job photos" (DELETE, own-prefix
--     ((storage.foldername(name))[1] = auth.uid()::text) — correct,
--     matches the pattern this migration mirrors for SELECT.
--   - TWO live INSERT policies: one correctly own-prefix-scoped
--     (matches the DELETE policy's pattern), and one broad policy
--     allowing any authenticated user to upload into the bucket at all,
--     not scoped to job ownership. Both left untouched here — this
--     migration only replaces SELECT policies — but the broad one is a
--     real gap, logged in LATER.md's job_photos RLS consolidation entry
--     for the same follow-up pass as the table-RLS cleanup.
--
-- Replaces the over-permissive SELECT policies with two that mirror the
-- job_photos table's own access rules exactly: the contractor (own-
-- prefix, matching the kept DELETE policy's pattern) and the customer
-- (scoped through job_photos + jobs, requiring visibility='customer' —
-- the same predicate the table-level SELECT policy uses).

DROP POLICY IF EXISTS "Anyone can view job photos" ON storage.objects;
DROP POLICY IF EXISTS "Public can view job photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view job photos" ON storage.objects;

CREATE POLICY "Contractors can view own job photos"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'job-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Customers can view visible job photos"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'job-photos'
  AND EXISTS (
    SELECT 1 FROM public.job_photos jp
    JOIN public.jobs j ON j.id = jp.job_id
    WHERE jp.storage_path = storage.objects.name
      AND j.customer_id = auth.uid()
      AND jp.visibility = 'customer'
  )
);
