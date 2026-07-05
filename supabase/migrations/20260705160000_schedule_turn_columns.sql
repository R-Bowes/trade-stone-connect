-- 20260705160000_schedule_turn_columns.sql
-- Formalises scheduling turn/cycle state as real columns on schedule_events,
-- replacing the client-side inference (minute-truncated batch grouping,
-- marker-row-created_at cycle boundaries, title-based post-exhaustion
-- detection) that useQuoteScheduling.ts previously relied on.
--
-- No backfill: test data only, defaults suffice.

ALTER TABLE public.schedule_events
  ADD COLUMN cycle integer NOT NULL DEFAULT 1,
  ADD COLUMN turn_kind text NOT NULL DEFAULT 'negotiation'
    CHECK (turn_kind IN ('negotiation', 'post_exhaustion', 'backout', 'marker')),
  ADD COLUMN batch_id uuid;
