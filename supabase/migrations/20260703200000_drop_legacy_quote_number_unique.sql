-- 20260703200000_drop_legacy_quote_number_unique.sql
-- Legacy single-column unique on quote_number predates per-contractor numbering.
-- It blocks revision rows (same number, higher version) and would collide
-- distinct contractors at the same counter value. Correct uniqueness is
-- already enforced by issued_quotes_contractor_number_version_key
-- UNIQUE (contractor_id, quote_number, version).

ALTER TABLE public.issued_quotes
  DROP CONSTRAINT issued_quotes_quote_number_key;