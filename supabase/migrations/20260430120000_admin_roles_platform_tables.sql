-- =============================================================================
-- Admin roles, platform settings, activity log, disputes
-- Run in Supabase SQL editor (requires service role / dashboard access)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Extend admin_users with role + created_at
-- ---------------------------------------------------------------------------
ALTER TABLE admin_users
  ADD COLUMN IF NOT EXISTS role       text        NOT NULL DEFAULT 'admin',
  ADD COLUMN IF NOT EXISTS created_at timestamptz          DEFAULT now();

UPDATE admin_users
SET role = 'super_admin'
WHERE email = 'rb.tradestone@gmail.com';

-- ---------------------------------------------------------------------------
-- 2. Extend profiles with columns used by admin dashboard
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_active   boolean NOT NULL DEFAULT true;

-- ---------------------------------------------------------------------------
-- 3. platform_settings — key/value store for commission rates, etc.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_settings (
  key        text        PRIMARY KEY,
  value      text        NOT NULL,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid        REFERENCES admin_users(id) ON DELETE SET NULL
);

INSERT INTO public.platform_settings (key, value) VALUES
  ('commission_tier_1',    '6'),
  ('commission_tier_2',    '4'),
  ('commission_tier_3',    '2.5'),
  ('maintenance_mode',     'false'),
  ('platform_email_name',  'TradeStone'),
  ('platform_email_address','noreply@tradestone.com')
ON CONFLICT (key) DO NOTHING;

-- RLS
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_read_platform_settings"
  ON public.platform_settings FOR SELECT
  USING (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()));

CREATE POLICY "admin_write_platform_settings"
  ON public.platform_settings FOR ALL
  USING (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- 4. admin_activity_log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_activity_log (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id    uuid        REFERENCES admin_users(id) ON DELETE SET NULL,
  action      text        NOT NULL,
  target_type text,
  target_id   text,
  details     jsonb,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE public.admin_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_read_activity_log"
  ON public.admin_activity_log FOR SELECT
  USING (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()));

CREATE POLICY "admin_insert_activity_log"
  ON public.admin_activity_log FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- 5. disputes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.disputes (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id     uuid        REFERENCES public.jobs(id) ON DELETE SET NULL,
  raised_by  uuid        REFERENCES admin_users(id) ON DELETE SET NULL,
  status     text        NOT NULL DEFAULT 'open',
  notes      text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_manage_disputes"
  ON public.disputes FOR ALL
  USING (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- 6. admin_users — ensure SELECT is available to authenticated admins
--    (If the table has no RLS or a permissive policy already, skip this)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'admin_users' AND policyname = 'admin_read_admin_users'
  ) THEN
    ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
    EXECUTE $p$
      CREATE POLICY "admin_read_admin_users"
        ON admin_users FOR SELECT
        USING (EXISTS (SELECT 1 FROM admin_users au WHERE au.user_id = auth.uid()))
    $p$;
  END IF;
END $$;
