import { createClient } from '@supabase/supabase-js';
import { supabase } from './client';

// If VITE_SUPABASE_SERVICE_ROLE_KEY is set, use a service-role client that
// bypasses RLS for all admin dashboard queries. Otherwise fall back to the
// anon client — in that case the Supabase SQL migration
// 20260430130000_admin_rls_bypass_policies.sql must have been applied so that
// authenticated admin users can read all rows via RLS policies.
const serviceRoleKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY as string | undefined;
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;

if (!serviceRoleKey) {
  console.warn('[adminClient] VITE_SUPABASE_SERVICE_ROLE_KEY not set — falling back to anon client, RLS will block admin queries');
}

export const adminDb: ReturnType<typeof createClient> = serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : supabase;
