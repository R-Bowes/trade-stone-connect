-- Remove the broken/duplicate RLS policies left over from an earlier
-- migration attempt that used contractor_id = auth.uid() directly,
-- instead of the two-step profiles lookup. The correct policies
-- ("Contractors manage own X" / "Anyone can read X") remain in place.

DROP POLICY IF EXISTS "contractor_photo_galleries: owner write" ON contractor_photo_galleries;
DROP POLICY IF EXISTS "contractor_photo_galleries: public read" ON contractor_photo_galleries;
DROP POLICY IF EXISTS "contractor_projects: owner write" ON contractor_projects;
DROP POLICY IF EXISTS "contractor_projects: public read" ON contractor_projects;
