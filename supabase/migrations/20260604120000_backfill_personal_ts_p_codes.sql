-- Backfill personal accounts that pre-date the prefixed code system.
-- Accounts created before 20260411 received unprefixed 6-char hex codes;
-- this run converts them to TS-P-XXXXXX using the same uniqueness-checked
-- generator used for all new signups.
-- Accounts that already carry a TS-P- prefix (including those backfilled
-- by the prior NULL-only pass) are left untouched.
UPDATE public.profiles
SET ts_profile_code = generate_ts_profile_code('personal')
WHERE user_type = 'personal'
  AND (ts_profile_code IS NULL OR ts_profile_code NOT LIKE 'TS-P-%');
