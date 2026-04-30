-- =============================================================================
-- Admin RLS bypass policies
-- Allows authenticated admin users to read/write all rows in core tables.
-- Run in Supabase SQL editor.
--
-- NOTE: If you set VITE_SUPABASE_SERVICE_ROLE_KEY in your .env the frontend
-- will use a service-role client that bypasses RLS automatically. These
-- policies are needed only when using the anon key.
-- =============================================================================

-- Helper: is the current authenticated user an admin?
-- Using a SECURITY DEFINER function avoids recursive policy checks.
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM admin_users WHERE user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='profiles' AND policyname='admin_select_profiles') THEN
    CREATE POLICY "admin_select_profiles" ON public.profiles
      FOR SELECT USING (public.is_platform_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='profiles' AND policyname='admin_update_profiles') THEN
    CREATE POLICY "admin_update_profiles" ON public.profiles
      FOR UPDATE USING (public.is_platform_admin())
      WITH CHECK (public.is_platform_admin());
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- enquiries
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='enquiries' AND policyname='admin_select_enquiries') THEN
    CREATE POLICY "admin_select_enquiries" ON public.enquiries
      FOR SELECT USING (public.is_platform_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='enquiries' AND policyname='admin_update_enquiries') THEN
    CREATE POLICY "admin_update_enquiries" ON public.enquiries
      FOR UPDATE USING (public.is_platform_admin())
      WITH CHECK (public.is_platform_admin());
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- jobs
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='jobs' AND policyname='admin_select_jobs') THEN
    CREATE POLICY "admin_select_jobs" ON public.jobs
      FOR SELECT USING (public.is_platform_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='jobs' AND policyname='admin_update_jobs') THEN
    CREATE POLICY "admin_update_jobs" ON public.jobs
      FOR UPDATE USING (public.is_platform_admin())
      WITH CHECK (public.is_platform_admin());
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- invoices
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='invoices' AND policyname='admin_select_invoices') THEN
    CREATE POLICY "admin_select_invoices" ON public.invoices
      FOR SELECT USING (public.is_platform_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='invoices' AND policyname='admin_update_invoices') THEN
    CREATE POLICY "admin_update_invoices" ON public.invoices
      FOR UPDATE USING (public.is_platform_admin())
      WITH CHECK (public.is_platform_admin());
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- conversations
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='conversations' AND policyname='admin_select_conversations') THEN
    CREATE POLICY "admin_select_conversations" ON public.conversations
      FOR SELECT USING (public.is_platform_admin());
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- messages
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='messages' AND policyname='admin_select_messages') THEN
    CREATE POLICY "admin_select_messages" ON public.messages
      FOR SELECT USING (public.is_platform_admin());
  END IF;
END $$;
