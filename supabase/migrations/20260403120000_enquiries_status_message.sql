-- Allow direct-message rows stored as enquiries when the messages path is unavailable.
ALTER TABLE public.enquiries DROP CONSTRAINT IF EXISTS enquiries_status_check;
ALTER TABLE public.enquiries ADD CONSTRAINT enquiries_status_check
  CHECK (status IN ('new', 'replied', 'converted', 'archived', 'message'));
