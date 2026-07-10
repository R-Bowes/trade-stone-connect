-- Tendering chunk 1c: companies duplicate-contact-fields cleanup.
--
-- Phase 1 audit (see conversation) found companies has two divergent
-- creation paths: BusinessSettings.tsx writes address_line1/address_line2
-- (never email/phone), PanelManagement.tsx ensureCompany() writes
-- email/phone (never address_line1/address_line2). contact_email/
-- contact_phone are read as the preferred half of a fallback
-- (contact_email ?? email) in BusinessRequestsView.tsx but were never
-- written anywhere — dead on the write side.
--
-- This migration moves the live contact data onto contact_email/
-- contact_phone (the columns tendering UI will read) and marks the
-- superseded columns deprecated. address_line1/address_line2 are already
-- the live pair and are untouched; BusinessSettings.tsx is untouched.

-- 1. Backfill: carry over any existing email/phone data written by the
--    PanelManagement.tsx path, only where the target is unset.
UPDATE public.companies
SET contact_email = email
WHERE contact_email IS NULL AND email IS NOT NULL;

UPDATE public.companies
SET contact_phone = phone
WHERE contact_phone IS NULL AND phone IS NOT NULL;

-- 2. Mark the superseded columns.
COMMENT ON COLUMN public.companies.address IS
  'Deprecated: unused. Superseded by address_line1/address_line2. Do not read or write.';
COMMENT ON COLUMN public.companies.email IS
  'Deprecated: superseded by contact_email. Do not read or write; retained for historical rows only.';
COMMENT ON COLUMN public.companies.phone IS
  'Deprecated: superseded by contact_phone. Do not read or write; retained for historical rows only.';
