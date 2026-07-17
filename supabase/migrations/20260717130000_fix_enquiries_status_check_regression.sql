-- 20260717130000_fix_enquiries_status_check_regression.sql
--
-- Corrective fix. 20260717120000's enquiries_status_check
-- (status IN ('new','declined','converted')) was verified only against
-- currently-STORED data (SELECT DISTINCT status), not against every value
-- the application actually WRITES -- exactly the mistake the "verify
-- against live behaviour, not just current rows" principle exists to catch.
-- RejectDialog.tsx writes status='archived' and RespondDialog.tsx writes
-- status='replied', neither in that list: both dialogs (Decline enquiry,
-- Request Info) would throw a CHECK violation on their very next use, and
-- useContractorPipeline.ts's `.in("status", ["new","replied"])` pipeline
-- query would never again show an enquiry that had been replied to.
--
-- Fixed by widening the CHECK to the real vocabulary. RejectDialog.tsx is
-- separately updated (application code, this same Phase D pass) to write
-- 'declined' instead of 'archived' going forward -- these were always the
-- same concept under two names, and 'declined' is the name this build's
-- D2 slice standardises on. 'archived' stays a legal value here purely for
-- any historical rows already written with it; nothing rewrites them.

ALTER TABLE public.enquiries
  DROP CONSTRAINT enquiries_status_check;

ALTER TABLE public.enquiries
  ADD CONSTRAINT enquiries_status_check
  CHECK (status IN ('new', 'replied', 'archived', 'declined', 'converted'));
