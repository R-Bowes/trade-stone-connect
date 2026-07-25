-- title, job_type, priority already exist live (confirmed via information_schema /
-- types.ts) — only access_notes is missing, for the enquiries detail-view build.
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS access_notes TEXT;
