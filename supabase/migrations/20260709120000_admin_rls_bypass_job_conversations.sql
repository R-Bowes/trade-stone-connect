-- Admin RLS bypass policies for job_conversations / job_messages.
-- job_conversations and job_messages currently have only participant-scoped
-- SELECT policies — no admin bypass — confirmed via pg_policies. Modeled
-- exactly on the admin_select_* policies in
-- 20260430130000_admin_rls_bypass_policies.sql (public.is_platform_admin(),
-- which checks admin_users). That file is an applied migration and is not
-- modified here; this is a new, additive file.

-- ---------------------------------------------------------------------------
-- job_conversations
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='job_conversations' AND policyname='admin_select_job_conversations') THEN
    CREATE POLICY "admin_select_job_conversations" ON public.job_conversations
      FOR SELECT USING (public.is_platform_admin());
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- job_messages
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='job_messages' AND policyname='admin_select_job_messages') THEN
    CREATE POLICY "admin_select_job_messages" ON public.job_messages
      FOR SELECT USING (public.is_platform_admin());
  END IF;
END $$;
