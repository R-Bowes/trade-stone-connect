-- Migration: add enquiry context to job_conversations
-- Allows pre-job enquiry threads to live alongside job threads in one inbox

ALTER TABLE job_conversations
  ADD COLUMN IF NOT EXISTS enquiry_id uuid REFERENCES enquiries(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS context text NOT NULL DEFAULT 'job'
    CHECK (context IN ('enquiry', 'job'));

-- Allow job_id to be null for enquiry-stage conversations
ALTER TABLE job_conversations
  ALTER COLUMN job_id DROP NOT NULL;

-- Index for enquiry lookups
CREATE INDEX IF NOT EXISTS idx_job_conversations_enquiry
  ON job_conversations (enquiry_id)
  WHERE enquiry_id IS NOT NULL;

-- Update existing rows to context = 'job' (already the default, but explicit)
UPDATE job_conversations SET context = 'job' WHERE context IS NULL;