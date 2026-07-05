-- Quote revisions are new rows sharing quote_number with the parent
-- (Q-0008 v1, v2...). Uniqueness must therefore be per (contractor, number, version).

UPDATE public.issued_quotes SET version = 1 WHERE version IS NULL;

ALTER TABLE public.issued_quotes
  ALTER COLUMN version SET DEFAULT 1,
  ALTER COLUMN version SET NOT NULL;

ALTER TABLE public.issued_quotes
  DROP CONSTRAINT issued_quotes_contractor_quote_number_key,
  ADD CONSTRAINT issued_quotes_contractor_number_version_key
    UNIQUE (contractor_id, quote_number, version);