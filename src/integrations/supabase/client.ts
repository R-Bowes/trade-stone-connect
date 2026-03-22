import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});
```

---

## File 2 — `.env`
Select all, delete, paste:
```
VITE_SUPABASE_PROJECT_ID="tnvxfzmdjpsswjszwbvf"
VITE_SUPABASE_PUBLISHABLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRudnhmem1kanBzc3dqc3p3YnZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc4NzI3NjYsImV4cCI6MjA3MzQ0ODc2Nn0.rzTUVRPxybLJZ9asE04lOg-5pjFp6FZXWT3JzvshI8A"
VITE_SUPABASE_URL="https://tnvxfzmdjpsswjszwbvf.supabase.co"
VITE_SUPABASE_CAPTCHA_SITE_KEY="655c03cc-6ee2-461e-bdde-a5de327c18a4"
VITE_SUPABASE_CAPTCHA_PROVIDER="hcaptcha"
VITE_DEV_TEST_PASSWORD="TradeStoneDev#9pV"
