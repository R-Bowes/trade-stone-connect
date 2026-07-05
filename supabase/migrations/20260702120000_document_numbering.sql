-- Document numbering: per-contractor sequential numbers for quotes, jobs, invoices.
-- Replaces the legacy invoice number trigger (INV-{contractor TS}-{customer TS}-#####)
-- and the client-side QTE- string composition.
-- Display format is composed in the frontend: Q-4AE203-0008 / J-4AE203-0012 / INV-4AE203-0034.

-- 1. Race-safe counters table (no client access; written only via SECURITY DEFINER fn)
CREATE TABLE public.contractor_counters (
  contractor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  entity        text NOT NULL CHECK (entity IN ('quote', 'job', 'invoice')),
  next_value    integer NOT NULL DEFAULT 1,
  PRIMARY KEY (contractor_id, entity)
);

ALTER TABLE public.contractor_counters ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies: clients can never read or write counters directly.

-- 2. Atomic number allocator (single upsert statement = no MAX()+1 race)
CREATE OR REPLACE FUNCTION public.next_document_number(p_contractor_id uuid, p_entity text)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO contractor_counters (contractor_id, entity, next_value)
  VALUES (p_contractor_id, p_entity, 2)
  ON CONFLICT (contractor_id, entity)
  DO UPDATE SET next_value = contractor_counters.next_value + 1
  RETURNING next_value - 1;
$$;

REVOKE ALL ON FUNCTION public.next_document_number(uuid, text) FROM PUBLIC, anon, authenticated;

-- 3. Quotes: number + revision (table currently empty, no backfill needed)
ALTER TABLE public.quotes
  ADD COLUMN quote_number integer,
  ADD COLUMN revision integer NOT NULL DEFAULT 1;

CREATE OR REPLACE FUNCTION public.assign_quote_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.quote_number IS NULL THEN
    NEW.quote_number := next_document_number(NEW.contractor_id, 'quote');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER assign_quote_number_trigger
  BEFORE INSERT ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.assign_quote_number();

ALTER TABLE public.quotes
  ALTER COLUMN quote_number SET NOT NULL,
  ADD CONSTRAINT quotes_contractor_quote_number_key UNIQUE (contractor_id, quote_number);

-- 4. Jobs: drop the never-used text stub, recreate as integer
ALTER TABLE public.jobs DROP COLUMN job_number;
ALTER TABLE public.jobs ADD COLUMN job_number integer;

WITH numbered AS (
  SELECT id, row_number() OVER (PARTITION BY contractor_id ORDER BY created_at, id) AS rn
  FROM public.jobs
)
UPDATE public.jobs j
SET job_number = n.rn
FROM numbered n
WHERE j.id = n.id;

INSERT INTO public.contractor_counters (contractor_id, entity, next_value)
SELECT contractor_id, 'job', MAX(job_number) + 1
FROM public.jobs
GROUP BY contractor_id;

CREATE OR REPLACE FUNCTION public.assign_job_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.job_number IS NULL THEN
    NEW.job_number := next_document_number(NEW.contractor_id, 'job');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER assign_job_number_trigger
  BEFORE INSERT ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.assign_job_number();

ALTER TABLE public.jobs
  ALTER COLUMN job_number SET NOT NULL,
  ADD CONSTRAINT jobs_contractor_job_number_key UNIQUE (contractor_id, job_number);

-- 5. Invoices: retire legacy trigger/function/column, join the counters system
DROP TRIGGER generate_invoice_number_trigger ON public.invoices;
DROP FUNCTION public.generate_invoice_number();

ALTER TABLE public.invoices DROP COLUMN invoice_number;
ALTER TABLE public.invoices ADD COLUMN invoice_number integer;

WITH numbered AS (
  SELECT id, row_number() OVER (PARTITION BY contractor_id ORDER BY created_at, id) AS rn
  FROM public.invoices
)
UPDATE public.invoices i
SET invoice_number = n.rn
FROM numbered n
WHERE i.id = n.id;

INSERT INTO public.contractor_counters (contractor_id, entity, next_value)
SELECT contractor_id, 'invoice', MAX(invoice_number) + 1
FROM public.invoices
GROUP BY contractor_id;

CREATE OR REPLACE FUNCTION public.assign_invoice_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.invoice_number IS NULL THEN
    NEW.invoice_number := next_document_number(NEW.contractor_id, 'invoice');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER assign_invoice_number_trigger
  BEFORE INSERT ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.assign_invoice_number();

ALTER TABLE public.invoices
  ALTER COLUMN invoice_number SET NOT NULL,
  ADD CONSTRAINT invoices_contractor_invoice_number_key UNIQUE (contractor_id, invoice_number);