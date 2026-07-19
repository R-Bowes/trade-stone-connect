-- Build-phase B1 (job execution surfaces): job_photos has been built
-- twice against two incompatible shapes. JobPhotosTab.tsx (contractor,
-- live in JobManagement.tsx) writes storage_path/caption/tags/visibility/
-- portfolio/file_type/uploaded_by_role/approval columns and derives
-- display URLs from storage_path via getPublicUrl() — it never sets
-- photo_url. useJobPhotos (client, useJobs.ts) writes/reads photo_url
-- directly and knows nothing of the other columns. photo_url is
-- `text NOT NULL` with no default (20260308192308...sql:118) — every
-- contractor upload has been failing that constraint since the day this
-- table shipped a second write path. Verified live via curl against the
-- anon REST endpoint schema introspection is not available without a
-- service key, but the migration text + generated types.ts agree.
--
-- Decision (storage_path canonical, photo_url dropped to nullable and no
-- longer written): the job-photos bucket is PUBLIC (`public: true`,
-- `INSERT INTO storage.buckets` + "Anyone can view job photos" ON
-- storage.objects FOR SELECT TO public — 20260308192308...sql:184-204).
-- This is NOT the enquiry-photos precedent (that bucket is private,
-- hence EnquiryPhotoThumbnails' signed-URL dance). Against a public
-- bucket, getPublicUrl(storage_path) is a synchronous, free, local
-- string construction — no signing round-trip, no expiry to manage. It
-- is strictly cheaper than deriving/storing a URL at insert time, and
-- JobPhotosTab.tsx already derives display URLs this way (it just never
-- wrote to the NOT NULL column). Making photo_url nullable is the
-- smallest fix that unblocks every caller; no code needs to populate it
-- going forward.
--
-- Known, accepted limitation (flagged, not fixed here): because the
-- bucket is public, visibility='internal' only ever controlled whether
-- JobPhotosTab's own UI *offered* the file — nothing enforced it at the
-- storage layer, and this migration doesn't change that. A photo's raw
-- URL is fetchable by anyone who has it, regardless of visibility, once
-- the object exists. The RLS fix below makes visibility meaningful at
-- the row/metadata layer (whether the client's own queries return the
-- row at all, e.g. the gallery grid), which is the real internal/
-- customer distinction this feature needs day-to-day — it does not make
-- individual files cryptographically private. True storage-level lockdown
-- (private bucket + signed URLs everywhere) would also need to be
-- reconciled with job_photos.portfolio/photo_approval_status, which
-- strongly implies approved portfolio photos are meant to be public-
-- facing on the contractor's profile — flipping the whole bucket private
-- would need that feature audited first. Left as a LATER.md item.

ALTER TABLE public.job_photos ALTER COLUMN photo_url DROP NOT NULL;

-- The live "Clients can view job photos" policy has no visibility
-- predicate at all — any row for a job the client owns is returned,
-- 'internal' or not. Replacing it with one that actually reads the
-- column the UI already exposes as a privacy toggle.
DROP POLICY IF EXISTS "Clients can view job photos" ON public.job_photos;
CREATE POLICY "Clients can view job photos"
ON public.job_photos FOR SELECT TO authenticated
USING (
  visibility = 'customer'
  AND EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = job_photos.job_id
    AND j.customer_id = auth.uid()
  )
);

-- job_team_members: repointed away from in this build phase (B5) — the
-- contractor's actual worker-assignment UI (JobManagement.tsx's Workers
-- section) writes job_assignments, a separate table; job_team_members
-- has never had a writer anywhere in the app (its own assignMember/
-- removeMember hook methods exist but are never called from any
-- component). Deprecated-pending-drop, same treatment as
-- job_scheduling_proposals (20260717120000_offer_with_slots_accept_flow.
-- sql:411-414) — flagged only, not dropped here.
