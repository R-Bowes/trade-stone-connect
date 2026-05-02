# CLAUDE.md

This file is read automatically by Claude Code at the start of every session.
Follow every rule here without exception unless explicitly told otherwise in the current prompt.

---

## Project overview

TradeStone Connect is a UK-based multi-sided platform for the trades industry.
Stack: React + TypeScript, Supabase (Postgres + RLS + Edge Functions), Stripe Connect, Vercel.
Repo: R-Bowes/trade-stone-connect
Brand: Cream/light backgrounds for the main customer-facing site, navy dark backgrounds for the
contractor/admin dashboard, orange accent #f07820, no emojis in UI, simple and clear.
---

## Critical rules — never deviate

### 1. profiles.id vs profiles.user_id
These are different columns. This distinction causes the most bugs in this codebase.

- `profiles.user_id` — the Supabase auth UID (matches `auth.uid()`)
- `profiles.id` — the platform profile UUID used as FK in all other tables

NEVER use `auth.uid()` directly as a `contractor_id`, `customer_id`, or any FK to profiles.
ALWAYS use the two-step lookup pattern:

```ts
const { data: profile } = await supabase
  .from('profiles')
  .select('id')
  .eq('user_id', user.id)
  .maybeSingle();
// then use profile.id as the FK
```

In RLS policies, NEVER write `auth.uid() = contractor_id`.
ALWAYS write:
```sql
contractor_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
```

### 2. When modifying existing components
- Read the full file before making any changes
- Preserve all existing logic unless explicitly told to remove it
- Never remove imports that are unrelated to your change
- Never reformat or reorder code outside the area you are changing
- If the file is longer than 200 lines, summarise what you are changing and why before making the change

### 3. One change at a time
- Make only the change requested in the current prompt
- Do not fix unrelated issues you notice unless asked
- Do not add unrequested features or improvements
- State what you changed and what you left untouched

### 4. Before writing any code
- State which file(s) you are modifying
- State what you are adding, changing, or removing
- Flag any side effects or dependencies that could be affected
- If uncertain about anything, ask rather than guess

---

## Architecture patterns

### Supabase queries
- Always use `.maybeSingle()` not `.single()` unless you are certain the row exists
- Always handle the error case — never assume success
- Use `select('only, the, columns, you, need')` — never `select('*')` in production code

### RLS — Row Level Security
All tables have RLS enabled. Policies use the subquery pattern above.
Never bypass RLS. Never use the service role key on the frontend.

### Foreign keys
All FK constraints on tables referencing `profiles(id)` are deferrable.
New migrations must follow this pattern:
```sql
REFERENCES profiles(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
```

### Edge Functions
Runtime: Deno. No Node.js APIs.
Resend is temporarily removed — do not re-add without being asked.
Always include CORS headers in Edge Functions.

---

## Brand and UI rules

- No emojis anywhere in the UI
- Main site (customer-facing, marketplace, contractor profiles): cream/light background
- Contractor and admin dashboards: navy dark background
- Orange accent colour: #f07820
- No placeholder or fake data in production components
- Ratings, review counts, and distances must come from real data or be hidden if null
- All monetary values are in GBP (£)
- Dates use UK format: d MMM yyyy (e.g. 3 May 2026)
- TS codes are the visible identity — never show raw emails between parties
- No placeholder or fake data in production components
- Ratings, review counts, and distances must come from real data or be hidden if null
- All monetary values are in GBP (£)
- Dates use UK format: d MMM yyyy (e.g. 3 May 2026)
- TS codes are the visible identity — never show raw emails between parties

---

## Current status (as of May 2026)

Core flow: enquiry → quote → job → invoice → payment
Payment: Stripe Checkout (hosted pages) — embedded Elements was blocked by CSP
Known issues to fix before adding new features:
- Stage progression bug (all jobs moving to complete simultaneously) — not yet root-caused
- Debug console.log statements remain in JobManagement.tsx and create-payment-intent Edge Function
- SendQuoteDialog shows raw email — should show TS code

---

## File structure notes

- Hooks: src/hooks/
- Pages: src/pages/
- Components: src/components/
  - management/ — contractor-facing management UI
  - recipient/ — customer-facing quote/invoice views
  - personal/ — customer dashboard components
  - ui/ — shadcn primitives, do not modify
- Supabase types: src/integrations/supabase/types.ts — regenerate after schema changes
- Migrations: supabase/migrations/ — always create a migration file for schema changes

---

## Git discipline

- Features go on branches: feature/name
- Bug fixes go on branches: fix/name  
- Never commit directly to main without testing
- Commit messages: conventional commits format (feat:, fix:, chore:, refactor:)
- Always run the app and verify the change works before committing