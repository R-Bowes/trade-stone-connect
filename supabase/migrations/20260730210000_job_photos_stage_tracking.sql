-- SCORING.md Phase 2 Step 8: job_photos has no working stage tracking today
-- — stage_id uuid exists but has no FK and is never read/written anywhere
-- in the app (dead column, left alone here). tags text[] is free-form user
-- text, not a structured stage. Adding a proper checked column instead of
-- resurrecting stage_id. Nullable — existing photos and any upload path
-- that doesn't set it keep working unchanged.

ALTER TABLE public.job_photos
  ADD COLUMN IF NOT EXISTS photo_stage text
    CHECK (photo_stage IN ('before', 'during', 'after', 'completion'));
