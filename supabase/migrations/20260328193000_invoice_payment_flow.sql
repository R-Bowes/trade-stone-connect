-- Invoice/payment flow support
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS is_approved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_rechargeable boolean NOT NULL DEFAULT false;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS job_id uuid,
  ADD COLUMN IF NOT EXISTS client_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'invoices_job_id_fkey'
      AND conrelid = 'public.invoices'::regclass
  ) THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_job_id_fkey
      FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'invoices_client_id_fkey'
      AND conrelid = 'public.invoices'::regclass
  ) THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_client_id_fkey
      FOREIGN KEY (client_id) REFERENCES public.profiles(user_id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('invoice-overdue-check')
WHERE EXISTS (
  SELECT 1
  FROM cron.job
  WHERE jobname = 'invoice-overdue-check'
);

SELECT cron.schedule(
  'invoice-overdue-check',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url', true) || '/functions/v1/mark-overdue-invoices',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb
  );
  $$
);
