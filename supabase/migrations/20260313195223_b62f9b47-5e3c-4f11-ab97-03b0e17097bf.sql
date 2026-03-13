
-- Create notifications table
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  type text NOT NULL DEFAULT 'info',
  reference_type text,
  reference_id uuid,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notifications"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can update their own notifications"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own notifications"
  ON public.notifications FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- System can insert notifications (via triggers with SECURITY DEFINER)
CREATE POLICY "System can insert notifications"
  ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Index for fast queries
CREATE INDEX idx_notifications_user_unread ON public.notifications (user_id, is_read) WHERE is_read = false;

-- Enable Realtime on notifications table
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Trigger function: notify on job status change
CREATE OR REPLACE FUNCTION public.notify_job_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  job_title text;
  status_label text;
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    job_title := NEW.title;
    
    CASE NEW.status
      WHEN 'in_progress' THEN status_label := 'In Progress';
      WHEN 'completed' THEN status_label := 'Completed';
      WHEN 'not_started' THEN status_label := 'Not Started';
      ELSE status_label := NEW.status;
    END CASE;

    -- Notify the client
    INSERT INTO public.notifications (user_id, title, message, type, reference_type, reference_id)
    VALUES (
      NEW.client_id,
      'Job Status Updated',
      'Job "' || job_title || '" is now ' || status_label,
      'job_status',
      'job',
      NEW.id
    );

    -- Notify the contractor (if update came from client side)
    IF NEW.contractor_id != auth.uid() THEN
      INSERT INTO public.notifications (user_id, title, message, type, reference_type, reference_id)
      VALUES (
        NEW.contractor_id,
        'Job Status Updated',
        'Job "' || job_title || '" is now ' || status_label,
        'job_status',
        'job',
        NEW.id
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_job_status_change
  AFTER UPDATE ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_job_status_change();

-- Trigger function: notify on new job note
CREATE OR REPLACE FUNCTION public.notify_job_note_added()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  job_record RECORD;
  author_name text;
BEGIN
  SELECT id, title, contractor_id, client_id INTO job_record
  FROM public.jobs WHERE id = NEW.job_id;

  SELECT COALESCE(full_name, email, 'Someone') INTO author_name
  FROM public.profiles WHERE user_id = NEW.author_id;

  -- Notify the other party
  IF NEW.author_id = job_record.contractor_id THEN
    INSERT INTO public.notifications (user_id, title, message, type, reference_type, reference_id)
    VALUES (
      job_record.client_id,
      'New Note on Job',
      author_name || ' added a note to "' || job_record.title || '"',
      'job_note',
      'job',
      job_record.id
    );
  ELSE
    INSERT INTO public.notifications (user_id, title, message, type, reference_type, reference_id)
    VALUES (
      job_record.contractor_id,
      'New Note on Job',
      author_name || ' added a note to "' || job_record.title || '"',
      'job_note',
      'job',
      job_record.id
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_job_note_added
  AFTER INSERT ON public.job_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_job_note_added();
