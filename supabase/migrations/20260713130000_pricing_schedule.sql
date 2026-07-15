-- =============================================================================
-- 20260713130000_pricing_schedule.sql
-- Tendering Stage 2 slice 2b: pricing_schedule response-requirement kind +
-- storage for contractor-filled rates. Confirmed before this migration was
-- pushed (per your explicit request): rename 'pricing' rather than add
-- alongside it, and a new table rather than jsonb on tender_applications.
--
-- PART 1 — rename 'pricing' -> 'pricing_schedule' in the kind CHECK.
-- 'pricing' had zero live server behaviour (grepped the whole repo: only
-- the CHECK itself, one UI toggle chip, and 2a's own "coming soon"
-- placeholder referenced it; config was always written null for it) --
-- it was always meant to become this, not a sibling of it.
--
-- Ordering, corrected on review: DROP CONSTRAINT, then the backfill
-- UPDATE, then ADD CONSTRAINT. The old CHECK forbids 'pricing_schedule' --
-- backfilling before dropping it would only "work" because today's table
-- happens to have zero 'pricing' rows (an empty UPDATE can't violate
-- anything), not because the ordering is actually safe. Dropping first
-- removes the allowlist entirely so the backfill has nothing to violate,
-- then the new constraint (already including 'pricing_schedule') is added
-- back once every row already satisfies it. All three statements share
-- this migration's single transaction, so no other session ever observes
-- the column unconstrained.
--
-- PART 2 — tender_application_price_lines: one row per (application,
-- config-defined row id), rate filled by the contractor. New table, not
-- jsonb on tender_applications, matching the reasoning TENDERING-SCHEMA.md
-- already states for tender_rates_cards: "Real table, not jsonb: award
-- copies it; comparison view queries columnar" -- identical justification
-- applies here (terms_snapshot copy at award, cross-contractor rate
-- comparison at scoring). Row identity (which rows exist) is entirely
-- business-defined via the requirement row's config.rows -- the contractor
-- can never add/remove rows, only fill rate -- so unlike
-- tender_application_references there is no contractor-facing DELETE path
-- and no DELETE policy; the save flow is a plain per-row upsert keyed on
-- (application_id, row_id), not a three-bucket diff.
-- =============================================================================

ALTER TABLE public.tender_response_requirements
  DROP CONSTRAINT tender_response_requirements_kind_check;

UPDATE public.tender_response_requirements SET kind = 'pricing_schedule' WHERE kind = 'pricing';

ALTER TABLE public.tender_response_requirements
  ADD CONSTRAINT tender_response_requirements_kind_check
  CHECK (kind IN ('pricing_schedule', 'references', 'methodology', 'programme', 'subcontracting', 'declarations', 'rams'));

CREATE TABLE public.tender_application_price_lines (
  id              uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id  uuid    NOT NULL REFERENCES public.tender_applications(id) ON DELETE CASCADE,
  row_id          text    NOT NULL,
  rate            numeric NULL,
  CONSTRAINT tender_application_price_lines_application_row_key UNIQUE (application_id, row_id)
);

CREATE INDEX idx_tender_application_price_lines_application_id
  ON public.tender_application_price_lines(application_id);

ALTER TABLE public.tender_application_price_lines ENABLE ROW LEVEL SECURITY;

-- Reuses application_is_draft() and business_can_view_application(), both
-- already live (20260710180000) -- no new helper functions needed.

CREATE POLICY "tender_application_price_lines_contractor_select"
ON public.tender_application_price_lines FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.tender_applications a
    WHERE a.id = tender_application_price_lines.application_id
      AND a.contractor_id = auth.uid()
  )
);

CREATE POLICY "tender_application_price_lines_contractor_insert"
ON public.tender_application_price_lines FOR INSERT TO authenticated
WITH CHECK (application_is_draft(application_id));

CREATE POLICY "tender_application_price_lines_contractor_update"
ON public.tender_application_price_lines FOR UPDATE TO authenticated
USING       (application_is_draft(application_id))
WITH CHECK  (application_is_draft(application_id));

CREATE POLICY "tender_application_price_lines_business_select"
ON public.tender_application_price_lines FOR SELECT TO authenticated
USING (business_can_view_application(application_id));
