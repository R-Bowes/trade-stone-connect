-- 20260817150000_structured_address_schema.sql
--
-- Structured address columns, additive only. SCHEMA ONLY -- no component, no
-- form, no application code changes here; that is a separate, later brief.
-- No existing address column is dropped, renamed, or repurposed. Every
-- existing free-text address column (sites.address, sites.address_line1/
-- address_line2/city/postcode, companies.address/address_line1/address_line2/
-- city/postcode, profiles.address/location/postcode, enquiries.location,
-- jobs.location, invoices.client_address, issued_quotes.client_address,
-- job_rams.site_address, projects.address_line_1/address_line_2/city/
-- postcode, crm_clients.address) keeps working exactly as it does today
-- until a separate backfill effort populates the new columns.
--
-- COLUMN NAMING -- addr_*, not address_*
-- Step 0 discovery found that `sites` and `companies` already have real,
-- populated-capable `address_line1`/`address_line2` columns (added in
-- 20260612120000, per CLAUDE.md's "Canonical columns formalised" note).
-- The brief's original `address_line1`/`address_line2` naming for the new
-- structured columns would have collided directly with those on exactly
-- the two tables this feature cares about most. Per direction: every new
-- column on every table in this migration uses a uniform `addr_` prefix
-- (`addr_line1`, `addr_line2`, `addr_city`, `addr_region`, `addr_postcode`,
-- `addr_country`, `addr_lat`, `addr_lng`, `addr_place_id`) rather than
-- `address_`, so:
--   (a) there is no collision with sites/companies' existing address_line1/
--       address_line2 (confirmed zero `addr_%` columns exist anywhere in
--       the schema today -- checked live before writing this file);
--   (b) the shape is uniform across every table, so one shared address
--       form component (the next brief) can map to identical field names
--       everywhere, rather than sites/companies differing from the rest.
-- `addr_place_id` is source-neutral by design -- this migration does NOT
-- assume Google Places or any other specific geocoding provider. It is
-- reserved for whatever the eventual autocomplete/re-resolution provider
-- turns out to be, unpopulated until then.
--
-- WHY NULLABLE, NO DEFAULT -- the opposite of 20260817140000
-- 20260817140000 (country/currency integrity) used
-- `country_code text NOT NULL DEFAULT 'GB'` throughout, because every row
-- on those tables genuinely IS a UK record today and the default recorded
-- that known fact. The columns added here are different in kind: they
-- record what a human (or, later, an address-lookup provider) explicitly
-- entered for a SPECIFIC address, not a platform-wide operating
-- assumption. An address whose country has not yet been captured is
-- unknown, not GB -- defaulting `addr_country` to 'GB' would silently
-- assert a fact nobody has confirmed. All nine addr_* columns and
-- sites.country_code are therefore NULLABLE with NO DEFAULT, unconditionally,
-- on every table.
--
-- No new RLS policies are added by this migration -- these are new
-- columns on existing tables, and existing row-level SELECT/INSERT/UPDATE
-- policies already scope access by row (contractor_id / company_id /
-- is_company_member() etc.), which is column-independent. No new table is
-- created here, so the two-step RLS pattern constraint does not apply to
-- anything in this file.
--
-- SCOPE -- which tables got the addr_* columns and which did not
-- Step 0's "at least" list (sites, profiles, companies, enquiries, jobs,
-- invoices, issued_quotes) was expanded after a schema-wide sweep for any
-- address-shaped column found three more genuine address-bearing tables:
-- crm_clients.address, job_rams.site_address, projects.address_line_1/_2.
-- Ten tables get the addr_* columns: companies, crm_clients, enquiries,
-- invoices, issued_quotes, job_rams, jobs, profiles, projects, sites.
-- Two location-shaped columns found in the same sweep were deliberately
-- EXCLUDED as not being addresses: `marketplace_listings.location` (a
-- short area/region descriptor on a listing, not a postal address) and
-- `schedule_events.location` (a scheduling display string, not a
-- structured location of its own -- it mirrors the related job's
-- location). `public_pro_profiles` is a view over `profiles`, not a base
-- table -- it inherits `profiles`' new addr_* columns automatically if a
-- future migration chooses to expose them in the view's SELECT list; not
-- done here, as this migration is additive-schema-only and the view's
-- current column list is a deliberate public-facing allowlist (see
-- CLAUDE.md's "View idioms" -- `public_pro_profiles` is a pattern-1,
-- RLS-bypass view, so widening it is a visibility decision, not a schema
-- one, and belongs with the forms/exposure brief, not this one).
--
-- Idempotent throughout -- every ADD COLUMN uses IF NOT EXISTS, every
-- ADD CONSTRAINT and CREATE INDEX is wrapped in an existence check. A
-- partial failure can be re-run from the top safely.

-- ============================================================================
-- PART A — structured address columns (addr_*) on every address-bearing table
-- ============================================================================

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'companies', 'crm_clients', 'enquiries', 'invoices', 'issued_quotes',
    'job_rams', 'jobs', 'profiles', 'projects', 'sites'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS addr_line1 text', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS addr_line2 text', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS addr_city text', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS addr_region text', t); -- county / state / province
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS addr_postcode text', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS addr_country text', t); -- ISO 3166-1 alpha-2, factual record of what was captured
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS addr_lat numeric(9,6)', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS addr_lng numeric(9,6)', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS addr_place_id text', t); -- reserved for a future geocoding/autocomplete provider id; unpopulated today, no provider integration exists yet

    -- addr_country format CHECK: must be NULL or exactly two uppercase
    -- letters. Deliberately does NOT enumerate GB/US/CA or any other
    -- specific country list -- this column is a factual record of what an
    -- address capture returned, not a statement of where the platform
    -- operates. (Contrast sites.country_code in Part B, which DOES
    -- enumerate GB/US/CA, because that column IS a business-rule
    -- statement about supported operating countries.)
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = t || '_addr_country_format_check'
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (addr_country IS NULL OR addr_country ~ ''^[A-Z]{2}$'')',
        t, t || '_addr_country_format_check'
      );
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- PART B — country_code on sites
-- ============================================================================

-- sites has no country_code today (confirmed live, Step 0.2). NULLABLE, no
-- default -- unlike the profiles/companies/jobs/enquiries/issued_quotes/
-- invoices/payments country_code columns from 20260811090000 (all
-- NOT NULL DEFAULT 'GB', because every existing row on those tables really
-- is a known-UK record), sites.country_code records something that has NOT
-- yet been determined for existing rows and must not be asserted by a
-- default. This enumerates GB/US/CA deliberately (unlike addr_country in
-- Part A) because it IS the same operating-country business rule as the
-- 20260811090000 columns, just not yet backfilled.

ALTER TABLE public.sites
  ADD COLUMN IF NOT EXISTS country_code text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sites_country_code_check'
  ) THEN
    ALTER TABLE public.sites
      ADD CONSTRAINT sites_country_code_check
      CHECK (country_code IS NULL OR country_code = ANY (ARRAY['GB', 'US', 'CA']));
  END IF;
END $$;

-- DEFERRED, deliberately not done here: a composite FK from
-- enquiries.site_id / jobs.site_id to sites(id, country_code), mirroring
-- Part A of 20260817140000. sites.country_code is nullable and, as of this
-- migration, 0/1 sites have it populated -- a composite FK today would
-- either reject every enquiry/job that references a site (since
-- sites.country_code IS NULL fails a MATCH SIMPLE composite FK the moment
-- the referencing row's own country_code is NOT NULL, which
-- enquiries.country_code and jobs.country_code both already are, NOT NULL,
-- per 20260811090000) or would require sites.country_code to be backfilled
-- first. Add this FK in a follow-up migration once sites.country_code
-- backfill is complete; until then enquiries_site_id_fkey and
-- jobs_site_id_fkey remain the existing single-column
-- `FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE SET NULL` (confirmed
-- live, Step 0.4) -- untouched by this migration.

-- ============================================================================
-- PART C — partial indexes
-- ============================================================================

-- sites(country_code) -- required by the brief regardless of current row
-- count (sites is the table Part B is about).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'sites_country_code_idx'
  ) THEN
    CREATE INDEX sites_country_code_idx
      ON public.sites (country_code)
      WHERE country_code IS NOT NULL;
  END IF;
END $$;

-- addr_country partial indexes on the tables Step 0 showed a meaningful
-- (non-zero) row count for today: companies (1), enquiries (20),
-- invoices (4), issued_quotes (22), jobs (15), profiles (7), sites (1).
-- Every addr_country value is NULL immediately after this migration (no
-- backfill happens here), so each of these indexes starts empty -- they
-- exist so lookups are fast from the first row a future backfill/entry
-- path writes, without needing another migration later.
-- crm_clients, job_rams, and projects are all 0 rows today (Step 0.3) and
-- are deliberately skipped -- an index on an empty table indexes nothing;
-- add the same index for these three once they hold real data.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'companies', 'enquiries', 'invoices', 'issued_quotes', 'jobs', 'profiles', 'sites'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public' AND indexname = t || '_addr_country_idx'
    ) THEN
      EXECUTE format(
        'CREATE INDEX %I ON public.%I (addr_country) WHERE addr_country IS NOT NULL',
        t || '_addr_country_idx', t
      );
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- POST-APPLY VERIFICATION — run after this migration is pushed, not before.
-- Not executed as part of the migration itself.
-- ============================================================================

-- -- Confirm every target table got all nine addr_* columns:
-- select table_name, column_name, data_type
-- from information_schema.columns
-- where table_schema = 'public'
--   and column_name like 'addr\_%' escape '\'
--   and table_name in (
--     'companies', 'crm_clients', 'enquiries', 'invoices', 'issued_quotes',
--     'job_rams', 'jobs', 'profiles', 'projects', 'sites'
--   )
-- order by table_name, column_name;

-- -- Confirm sites.country_code + its CHECK:
-- select column_name, data_type, is_nullable, column_default
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'sites' and column_name = 'country_code';
--
-- select conname, pg_get_constraintdef(oid)
-- from pg_constraint
-- where conname = 'sites_country_code_check';

-- -- Confirm all addr_country_format_check constraints exist:
-- select conrelid::regclass as tbl, conname, pg_get_constraintdef(oid) as def
-- from pg_constraint
-- where conname like '%_addr_country_format_check'
-- order by tbl;

-- -- Confirm the partial indexes:
-- select schemaname, tablename, indexname, indexdef
-- from pg_indexes
-- where schemaname = 'public'
--   and (indexname = 'sites_country_code_idx' or indexname like '%_addr_country_idx')
-- order by tablename;
