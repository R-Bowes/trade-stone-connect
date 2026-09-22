-- Remove the 14 duplicate DRAFT rows in profile_widgets for contractor
-- 425b9477-5d1b-4a31-b7f0-a91a31f5a99b.
--
-- Cause: after 20260921110000 the owner could read the published snapshot rows
-- as well as their drafts. The old editor bundle loaded every row for the owner
-- (30 = 16 drafts + 14 snapshot rows), and its Save deleted the drafts and
-- re-inserted all 30 as drafts, leaving each enabled section twice. The
-- snapshot itself was never touched.
--
-- The two rows of each pair are identical (label, meta, order, section_ref_id;
-- verified against the pre-migration backup) and section_instance_id is
-- regenerated on every save, so nothing distinguishes them; the higher id of
-- each pair is removed and the lower is kept. Explicit ids only — not matched by
-- key — because the gallery and project pairs share section_ref_id.
--
-- Replayable: on a database where none of these rows exist (db reset, branch,
-- restore) it logs a notice and does nothing. Anywhere else, nothing is deleted
-- unless the state is exactly as verified: all 14 ids exist, belong to this
-- contractor and are drafts, and the totals are 30 drafts and 14 snapshot rows.
-- Afterwards it must be 16 drafts and 14 snapshot rows, or the whole migration
-- rolls back. A partial match, or an id belonging to another contractor or to a
-- snapshot row, raises instead of being guessed at.

DO $$
DECLARE
  v_contractor constant uuid := '425b9477-5d1b-4a31-b7f0-a91a31f5a99b';
  v_ids constant uuid[] := ARRAY[
    '762556a4-0793-407d-a03b-d3eba393288c',  -- hero
    'acc931e4-3f1e-43a9-888b-3165432d83e0',  -- bio
    'eb3c6b96-719e-409c-ab02-2d52ef8d22be',  -- credentials
    'b9a19021-e4a6-4281-a73a-f624302d143c',  -- stats
    'bc4cbe26-312a-44e8-bcfb-aece9f93bd6f',  -- services
    'ee8f35da-05b2-4b10-9476-db0d01fb575a',  -- availability
    '891a1772-5942-4b8c-9226-c3436a5768f1',  -- reviews
    'f8107a27-6c9a-4571-b111-277123d648c5',  -- gallery
    '9c6d24be-8f71-4931-81e2-f82105fda764',  -- video
    'dfbac049-723d-487a-99fc-31b65df0a4fc',  -- service_area
    'cf13174c-2484-49fd-8250-63ca6b3f5808',  -- project
    '847357a1-5d97-4b22-9da8-a67b7c1830fe',  -- project
    '12c06b9c-0a42-4349-8423-b109df4787ce',  -- social
    '3f93c328-000c-4a29-84e9-fe8e68342edc'   -- cta
  ]::uuid[];
  v_present integer;
  v_matching integer;
  v_drafts integer;
  v_snapshots integer;
  v_deleted integer;
BEGIN
  -- None of the ids exist at all: a fresh database, branch or restore. Nothing
  -- to clean up, and this must not block the replay.
  SELECT count(*) INTO v_present
  FROM public.profile_widgets
  WHERE id = ANY (v_ids);

  IF v_present = 0 THEN
    RAISE NOTICE 'Skipping duplicate-draft cleanup: none of the 14 profile_widgets ids exist in this database.';
    RETURN;
  END IF;

  -- Some ids exist: all 14 must, and each must be a draft of this contractor.
  -- A partial match, another contractor's row, or a snapshot row raises.
  SELECT count(*) INTO v_matching
  FROM public.profile_widgets
  WHERE id = ANY (v_ids)
    AND contractor_id = v_contractor
    AND is_published = false;

  IF v_matching <> 14 THEN
    RAISE EXCEPTION
      'Pre-flight failed: expected all 14 ids to exist as draft rows for contractor %, but % of the ids exist and % of those are drafts of that contractor. Nothing deleted.',
      v_contractor, v_present, v_matching;
  END IF;

  -- Totals for this contractor are exactly 30 drafts and 14 snapshot rows.
  SELECT count(*) FILTER (WHERE NOT is_published),
         count(*) FILTER (WHERE is_published)
    INTO v_drafts, v_snapshots
  FROM public.profile_widgets
  WHERE contractor_id = v_contractor;

  IF v_drafts <> 30 OR v_snapshots <> 14 THEN
    RAISE EXCEPTION
      'Pre-flight failed: expected 30 draft and 14 snapshot rows for contractor %, found % draft and % snapshot. Nothing deleted.',
      v_contractor, v_drafts, v_snapshots;
  END IF;

  DELETE FROM public.profile_widgets
  WHERE id = ANY (v_ids)
    AND contractor_id = v_contractor
    AND is_published = false;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_deleted <> 14 THEN
    RAISE EXCEPTION 'Expected to delete exactly 14 rows, deleted %. Rolling back.', v_deleted;
  END IF;

  -- Post-check: 16 drafts and 14 snapshot rows remain, or everything rolls back.
  SELECT count(*) FILTER (WHERE NOT is_published),
         count(*) FILTER (WHERE is_published)
    INTO v_drafts, v_snapshots
  FROM public.profile_widgets
  WHERE contractor_id = v_contractor;

  IF v_drafts <> 16 OR v_snapshots <> 14 THEN
    RAISE EXCEPTION
      'Post-check failed: expected 16 draft and 14 snapshot rows for contractor % after cleanup, found % draft and % snapshot. Rolling back.',
      v_contractor, v_drafts, v_snapshots;
  END IF;
END $$;
