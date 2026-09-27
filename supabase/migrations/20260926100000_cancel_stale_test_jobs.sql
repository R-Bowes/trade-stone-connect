-- 20260926100000_cancel_stale_test_jobs.sql
--
-- Cancels 11 stale test jobs for contractor 425b9477-5d1b-4a31-b7f0-a91a31f5a99b
-- (job numbers 1,2,3,4,5,6,8,9,11,12,15). Explicit ids only — never by
-- title or engagement, which could catch a legitimate job. Status only,
-- never DELETE — same pattern as 20260921100000's four-job cleanup.
--
-- Keep, do not touch: J-0007, J-0010, J-0013, J-0020, and J-0016 to J-0019
-- (already cancelled by 20260921100000).
--
-- J-0015 is the job behind Q-0007 (an accepted quote later marked
-- 'expired' outside the application — see LATER.md, "Three issued_quotes
-- rows hold status = 'expired'"). J-0003 is `complete`; its sign-off
-- columns are both null, so enforce_job_status_transition's "cannot
-- cancel a fully signed-off job" guard does not block it.
--
-- Cancelling fires on_job_status_change, which notifies the customer and
-- the contractor of "Job ... is now Cancelled" once per job — 11 jobs,
-- so 22 notifications. Accepted noise; the trigger is not touched.
--
-- No ended_reason / cancellation_reason column exists on jobs (checked
-- against the generated Database type, 2026-09-26) — this comment block
-- is the only place the reason is recorded: test-data cleanup.
--
-- Replayable: on a database where none of these 11 ids exist (a fresh
-- reset, branch, or restore — this is live production data, not seeded
-- by any migration), this is a silent no-op. A partial match — some but
-- not all 11 present, in the expected status, for this contractor — is
-- treated as drift and fails loudly with the actual count rather than
-- cancelling a subset.

DO $$
DECLARE
  v_target_ids uuid[] := ARRAY[
    '497b5819-6c4f-4afe-b9a0-0a3760c01b11', -- J-0001
    'be198d91-1692-4e19-9db6-102bff1300a1', -- J-0002
    '153aa3e5-530a-4da0-af66-5425e61a7b81', -- J-0003
    '83a70ea3-de6e-4cbf-a3c2-9aab9123b413', -- J-0004
    '452a28d0-8edd-4aa2-b284-7d1449e41bed', -- J-0005
    '939173a6-5465-4325-a213-326192bb691f', -- J-0006
    'b915ae2c-684b-4f56-89dd-6062e593b7be', -- J-0008
    '5170334d-d593-4a95-8256-20550a62e8ef', -- J-0009
    'd386fb6c-c098-4ee2-b73b-56a600f1fbe6', -- J-0011
    'f836cb6d-27ee-4d30-bcb7-65aef9bbcda2', -- J-0012
    'e440ae94-8fa2-4792-ad95-78397df0874d'  -- J-0015
  ];
  v_expected_count  integer := 11;
  v_contractor_id   uuid := '425b9477-5d1b-4a31-b7f0-a91a31f5a99b';
  v_found_count     integer;
  v_eligible_count  integer;
  v_signed_off_count integer;
  v_cancelled_count integer;
  v_total_cancelled integer;
BEGIN
  -- Replayability gate: none of the 11 present at all is expected on a
  -- fresh reset/branch/restore — skip silently rather than fail.
  SELECT count(*) INTO v_found_count
  FROM public.jobs
  WHERE id = ANY(v_target_ids);

  IF v_found_count = 0 THEN
    RAISE NOTICE 'cancel_stale_test_jobs: none of the 11 target job ids exist on this database — skipping (expected on a fresh reset/branch/restore).';
    RETURN;
  END IF;

  -- Pre-flight: all 11 must exist, belong to the contractor, and sit in a
  -- live status. Any partial match — wrong contractor, wrong status, or
  -- simply missing — fails loudly with the real count instead of silently
  -- cancelling a subset.
  SELECT count(*) INTO v_eligible_count
  FROM public.jobs
  WHERE id = ANY(v_target_ids)
    AND contractor_id = v_contractor_id
    AND status IN ('scheduled', 'in_progress', 'complete');

  IF v_eligible_count <> v_expected_count THEN
    RAISE EXCEPTION 'cancel_stale_test_jobs: expected all % target jobs to exist for contractor %, in scheduled/in_progress/complete — found %. Resolve manually before applying.',
      v_expected_count, v_contractor_id, v_eligible_count;
  END IF;

  -- Mirrors enforce_job_status_transition's own block ("Cannot cancel a
  -- fully signed-off job") so a mismatch fails here with a clear
  -- diagnostic rather than as a raw trigger exception mid-UPDATE. Kept
  -- even though today's data has no sign-offs on any of the 11 — this
  -- must still hold if sign-off state differs on a future replay.
  SELECT count(*) INTO v_signed_off_count
  FROM public.jobs
  WHERE id = ANY(v_target_ids)
    AND signed_off_at IS NOT NULL
    AND contractor_signed_off_at IS NOT NULL;

  IF v_signed_off_count > 0 THEN
    RAISE EXCEPTION 'cancel_stale_test_jobs: % of the target jobs are fully signed off and cannot be cancelled (enforce_job_status_transition would reject them). Resolve manually before applying.',
      v_signed_off_count;
  END IF;

  UPDATE public.jobs
  SET status = 'cancelled'
  WHERE id = ANY(v_target_ids);

  -- Post-check: the 11 are cancelled, and the contractor's total cancelled
  -- count matches the expected 15 (4 already cancelled by 20260921100000
  -- plus these 11). Any mismatch rolls the whole migration back.
  SELECT count(*) INTO v_cancelled_count
  FROM public.jobs
  WHERE id = ANY(v_target_ids) AND status = 'cancelled';

  IF v_cancelled_count <> v_expected_count THEN
    RAISE EXCEPTION 'cancel_stale_test_jobs: expected all % target jobs to be cancelled, found %. Rolling back.',
      v_expected_count, v_cancelled_count;
  END IF;

  SELECT count(*) INTO v_total_cancelled
  FROM public.jobs
  WHERE contractor_id = v_contractor_id AND status = 'cancelled';

  IF v_total_cancelled <> 15 THEN
    RAISE EXCEPTION 'cancel_stale_test_jobs: expected contractor % to have 15 cancelled jobs in total after this migration, found %. Rolling back.',
      v_contractor_id, v_total_cancelled;
  END IF;

  RAISE NOTICE 'cancel_stale_test_jobs: cancelled % stale test jobs for contractor %; contractor now has % cancelled jobs in total.',
    v_expected_count, v_contractor_id, v_total_cancelled;
END $$;
