import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const supabaseUrl = "https://tnvxfzmdjpsswjszwbvf.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRudnhmem1kanBzc3dqc3p3YnZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc4NzI3NjYsImV4cCI6MjA3MzQ0ODc2Nn0.rzTUVRPxybLJZ9asE04lOg-5pjFp6FZXWT3JzvshI8A";

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});
