-- 20260706120000_engagement_thread.sql
-- Schema for the engagement thread (Work view, phase 2): private contractor
-- worknotes attached to an engagement's furthest artefact.
--
-- issued_quotes.status: verified against every migration touching
-- issued_quotes — no CHECK constraint exists on that column (the
-- draft/sent/accepted/declined/expired CHECK lives on the legacy, unused
-- `quotes` table, not `issued_quotes`). issued_quotes.status is plain
-- `text NOT NULL DEFAULT 'draft'` with no constraint, so writing the new
-- 'lapsed' status (the archive action) requires no ALTER here.

CREATE TABLE public.engagement_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id uuid NOT NULL REFERENCES public.profiles(id),
  enquiry_id uuid REFERENCES public.enquiries(id),
  issued_quote_id uuid REFERENCES public.issued_quotes(id),
  job_id uuid REFERENCES public.jobs(id),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT engagement_notes_has_context CHECK (
    enquiry_id IS NOT NULL OR issued_quote_id IS NOT NULL OR job_id IS NOT NULL
  )
);

CREATE INDEX idx_engagement_notes_contractor ON public.engagement_notes (contractor_id);
CREATE INDEX idx_engagement_notes_enquiry ON public.engagement_notes (enquiry_id) WHERE enquiry_id IS NOT NULL;
CREATE INDEX idx_engagement_notes_quote ON public.engagement_notes (issued_quote_id) WHERE issued_quote_id IS NOT NULL;
CREATE INDEX idx_engagement_notes_job ON public.engagement_notes (job_id) WHERE job_id IS NOT NULL;

ALTER TABLE public.engagement_notes ENABLE ROW LEVEL SECURITY;

-- Private worknotes — contractor-only, every command. profiles.id ==
-- profiles.user_id == auth.uid() by construction (see CLAUDE.md), so this
-- compares directly against auth.uid() rather than a subquery. No customer
-- visibility is ever granted — no other policy exists on this table.
CREATE POLICY "Contractors manage their own engagement notes"
  ON public.engagement_notes FOR ALL
  USING (contractor_id = auth.uid())
  WITH CHECK (contractor_id = auth.uid());

CREATE TRIGGER trg_engagement_notes_updated_at
  BEFORE UPDATE ON public.engagement_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- job_conversations.context was constrained to ('enquiry', 'job') by
-- migration 20260628170000_job_conversations_enquiry_context.sql, predating
-- the issued_quote_id context column added in 20260704150000. The thread's
-- Conversation section needs quote-context rows (scheduling-stage
-- messaging via the repointed MessageDialog) — widen the CHECK to allow
-- 'quote' rather than leaving that context silently unwritable.
ALTER TABLE public.job_conversations DROP CONSTRAINT IF EXISTS job_conversations_context_check;
ALTER TABLE public.job_conversations ADD CONSTRAINT job_conversations_context_check
  CHECK (context IN ('enquiry', 'job', 'quote'));
