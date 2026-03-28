-- Audit and align RLS policies for core workflow tables.
-- This migration is intentionally idempotent and defensive so it can run
-- against environments with slight schema drift.

-- Ensure RLS is enabled on every target table that exists.
ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.enquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.timesheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.expenses ENABLE ROW LEVEL SECURITY;

-- Remove known-incorrect or over-permissive policies.
DROP POLICY IF EXISTS "Clients can update their job fields" ON public.jobs;
DROP POLICY IF EXISTS "Contractors can manage their own timesheets" ON public.timesheets;
DROP POLICY IF EXISTS "Anyone can create quotes" ON public.quotes;
DROP POLICY IF EXISTS "Contractors can delete their own invoices" ON public.invoices;
DROP POLICY IF EXISTS "Recipients can view their invoices" ON public.invoices;
DROP POLICY IF EXISTS "Recipients can respond to their invoices" ON public.invoices;

-- Quotes: ensure contractors can create their own rows.
CREATE POLICY "Contractors can insert their own quotes"
ON public.quotes FOR INSERT
TO authenticated
WITH CHECK (contractor_id = auth.uid());

-- Enquiries / Quotes / Timesheets / Invoices are handled defensively because
-- some environments may not yet have the required columns.
DO $$
BEGIN
  -- enquiries
  IF to_regclass('public.enquiries') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Homeowners can create their own enquiries" ON public.enquiries;
    DROP POLICY IF EXISTS "Homeowners can read their own enquiries" ON public.enquiries;
    DROP POLICY IF EXISTS "Homeowners can update their own enquiries" ON public.enquiries;
    DROP POLICY IF EXISTS "Contractors can read assigned or new unassigned enquiries" ON public.enquiries;

    EXECUTE '
      CREATE POLICY "Homeowners can create their own enquiries"
      ON public.enquiries FOR INSERT
      TO authenticated
      WITH CHECK (homeowner_id = auth.uid())
    ';

    EXECUTE '
      CREATE POLICY "Homeowners can read their own enquiries"
      ON public.enquiries FOR SELECT
      TO authenticated
      USING (homeowner_id = auth.uid())
    ';

    EXECUTE '
      CREATE POLICY "Homeowners can update their own enquiries"
      ON public.enquiries FOR UPDATE
      TO authenticated
      USING (homeowner_id = auth.uid())
      WITH CHECK (homeowner_id = auth.uid())
    ';

    EXECUTE '
      CREATE POLICY "Contractors can read assigned or new unassigned enquiries"
      ON public.enquiries FOR SELECT
      TO authenticated
      USING (
        contractor_id = auth.uid()
        OR (status = ''new'' AND contractor_id IS NULL)
      )
    ';
  END IF;

  -- quotes: client read access where client_id exists
  IF to_regclass('public.quotes') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'quotes'
         AND column_name = 'client_id'
     )
  THEN
    DROP POLICY IF EXISTS "Clients can view their quotes" ON public.quotes;

    EXECUTE '
      CREATE POLICY "Clients can view their quotes"
      ON public.quotes FOR SELECT
      TO authenticated
      USING (client_id = auth.uid())
    ';
  END IF;

  -- timesheets: worker create/update, contractor read all own timesheets,
  -- contractor update approved field (enforced by app/DB constraints + ownership).
  IF to_regclass('public.timesheets') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Contractors can view their own timesheets" ON public.timesheets;
    DROP POLICY IF EXISTS "Workers can create their own timesheets" ON public.timesheets;
    DROP POLICY IF EXISTS "Workers can update their own timesheets" ON public.timesheets;
    DROP POLICY IF EXISTS "Contractors can update approved on their timesheets" ON public.timesheets;

    EXECUTE '
      CREATE POLICY "Contractors can view their own timesheets"
      ON public.timesheets FOR SELECT
      TO authenticated
      USING (contractor_id = auth.uid())
    ';

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'timesheets'
        AND column_name = 'worker_id'
    ) THEN
      EXECUTE '
        CREATE POLICY "Workers can create their own timesheets"
        ON public.timesheets FOR INSERT
        TO authenticated
        WITH CHECK (worker_id = auth.uid())
      ';

      EXECUTE '
        CREATE POLICY "Workers can update their own timesheets"
        ON public.timesheets FOR UPDATE
        TO authenticated
        USING (worker_id = auth.uid())
        WITH CHECK (worker_id = auth.uid())
      ';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'timesheets'
        AND column_name = 'approved'
    ) THEN
      EXECUTE '
        CREATE POLICY "Contractors can update approved on their timesheets"
        ON public.timesheets FOR UPDATE
        TO authenticated
        USING (contractor_id = auth.uid())
        WITH CHECK (contractor_id = auth.uid())
      ';
    END IF;
  END IF;

  -- invoices: client read access (supports either client_id or recipient_id schema).
  IF to_regclass('public.invoices') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Clients can view their invoices" ON public.invoices;

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'invoices'
        AND column_name = 'client_id'
    ) THEN
      EXECUTE '
        CREATE POLICY "Clients can view their invoices"
        ON public.invoices FOR SELECT
        TO authenticated
        USING (client_id = auth.uid())
      ';
    ELSIF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'invoices'
        AND column_name = 'recipient_id'
    ) THEN
      EXECUTE '
        CREATE POLICY "Clients can view their invoices"
        ON public.invoices FOR SELECT
        TO authenticated
        USING (recipient_id = auth.uid())
      ';
    END IF;
  END IF;
END
$$;
