-- Two unscoped legacy policies on storage.objects for the enquiry-photos
-- bucket predate 20260723120000_enquiry_photos_bucket_and_rls_fix.sql's
-- owner-prefix / contractor-join policies and were never cleaned up. RLS is
-- OR'd across policies, so their presence let ANY authenticated user read or
-- upload into any enquiry's photo path regardless of ownership — the scoped
-- policies added real restrictions but couldn't override these broader ones.
-- Confirmed via pg_policies (audit 2026-07-26) that the scoped set already
-- covers every legitimate access pattern (uploader owner-prefix, contractor
-- via enquiries.contractor_id join), so these two are pure excess surface.
DROP POLICY IF EXISTS "Authenticated users can view enquiry photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload enquiry photos" ON storage.objects;
