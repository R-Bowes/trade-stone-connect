# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# TradeStone — Claude Compliance & Project Notes

## Commands

```bash
npm run dev          # start Vite dev server
npm run build        # production build (runs tsc first)
npm run lint         # ESLint
npx tsc --noEmit     # type-check without emitting files
npx supabase gen types typescript --project-id tnvxfzmdjpsswjszwbvf --schema public > src/integrations/supabase/types.ts  # regenerate DB types
```

No test runner is configured — verify changes by running the dev server.

## Architecture

### Routing (`src/App.tsx`)
React Router v6. Three protected dashboard routes gated by `ProtectedRoute` with `requiredRole`:
- `/dashboard/contractor` → `ContractorDashboard` (role: `contractor`)
- `/dashboard/business` → `BusinessDashboard` (role: `business`)
- `/dashboard/personal` → `PersonalDashboard` (role: `personal`)

Public contractor profile: `/contractor/:code` where `:code` is `ts_profile_code`.

### Contractor Dashboard navigation pattern
`ContractorDashboard` reads `?view=xxx` from the URL (`useSearchParams`) and renders the matching `<TabsContent>` or management component. `ContractorLayout` drives sidebar navigation by calling `navigate('/dashboard/contractor?view=xxx')`. Adding a new view requires: (1) a new nav item in `ContractorLayout.tsx`, (2) a new `TabsContent` or conditional render in `ContractorDashboard.tsx`.

### Supabase client & types
`src/integrations/supabase/client.ts` — typed with `createClient<Database>`. Always import `supabase` from here. Types live in `src/integrations/supabase/types.ts` (generated — do not hand-edit). After schema changes, regenerate types with the command above.

### Data layer
- **`public_pro_profiles` view** — the only table clients and the directory can query. Exposes safe fields from `profiles` (no email/phone). Always query this view for public contractor data; never query `profiles` directly from client-facing code.
- **`profiles` table** — source of truth. Contractors read/write their own row via RLS (`user_id = auth.uid()`).

### Compliance vs credentials — two separate tables

`contractor_credentials` does NOT hold expiry dates. Columns: id,
contractor_id (-> profiles(id)), name, issuer, reference_number, verified
(bool), display_order, created_at, updated_at. Displayed credentials/badges
only.

Expiry-tracked compliance lives in `compliance_items`: contractor_id, name,
type, reference_number, issued_date, issuing_body, expiry_date, status,
document_url, alert_sent. Any compliance / cert / insurance expiry view
(including the business compliance view) must read `compliance_items`, NOT
`contractor_credentials`.

### Row-level security (RLS)

`profiles.id == profiles.user_id == auth.uid()` for every row, by
construction: migration 20260328110000 set `id = user_id` and added
`FK (id) -> auth.users(id)`; `handle_new_user` (20260427120000) writes
`id = new.id` and `user_id = new.id` on every signup.

Because of this, RLS policies compare DIRECTLY against `auth.uid()`. This is
the actual pattern throughout the codebase. Do NOT use the
`col IN (SELECT id FROM profiles WHERE user_id = auth.uid())` subquery form —
it is equivalent but is not what the code uses, and mixing the two is noise.

- User-owned tables (e.g. jobs.contractor_id, jobs.customer_id):
  `USING (contractor_id = auth.uid())`
- Owned via an intermediary (business tier, keyed on company_id):
  `USING (company_id IN (SELECT id FROM companies WHERE owner_id = auth.uid()))`
  — a subquery is unavoidable here because the row holds a company id, not a
  user id. This is the one sanctioned subquery form.

`auth_user_company_ids()` has been retired from the `companies` SELECT policy
(replaced by direct `owner_id = auth.uid()`). Do not use it in new policies —
calling it from a policy on `companies` causes 42P17 infinite recursion because
the function queries `companies` while RLS is already active on that table.

`companies` SELECT policy ("Companies readable") uses only `owner_id = auth.uid()`.
A `service_visits` subquery was removed in migration 20260609120000 — it created
mutual recursion: companies SELECT → service_visits RLS → service_visits policy
queries companies → companies SELECT → ∞. Do NOT add subqueries on tables whose
own RLS policies query back to `companies`. Contractor reads of company rows are
covered by "Companies readable by panel contractors" instead. Any contractor with
legitimate service visits should already be in `contractor_panel`.

### Hook conventions (`src/hooks/`)
- Hooks that serve the contractor's own data do a two-step lookup internally; callers don't need to pass a profile ID.
- `useAvailability(contractorId)` — read-only, safe for public pages; takes `profiles.id`.
- `useContractorAvailabilityManager(contractorId)` — extends above with write helpers.
- `useContractors` / `useContractorByCode` — use `@tanstack/react-query`; query `public_pro_profiles`.
- Management hooks (`useInvoices`, `useJobs`, `useCRM`, etc.) handle their own auth internally.

### Icons
Tabler Icons load from CDN (see `index.html`). Use `<i className="ti ti-icon-name" />` — do **not** import from `@tabler/icons-react`. Lucide icons (`lucide-react`) are used in some existing components; prefer Tabler for all new UI.

### Styling
Tailwind + shadcn/ui components. Inline `style={{}}` objects are used extensively in dashboard/sidebar components alongside Tailwind classes — both patterns are acceptable. The `cn()` utility (`src/lib/utils.ts`) merges class names. No CSS modules.

### Business tier — PARTIALLY BUILT (live DB, not in migration history)

The business tier is not greenfield. These already exist in the live
database, created via the Supabase dashboard and therefore absent from the
migration files — the DB cannot currently be rebuilt from migrations alone:

- `companies` — the business/organisation root. owner_id, name, address
  fields, contact details, logo_url, industry, company_size. `owner_id` is
  the link to the business user (-> profiles(id), being formalised with FK +
  backfill).
- `sites` — company_id -> companies(id)
- `assets` — company_id -> companies(id), site_id -> sites(id);
  `category` is the `asset_category` enum
- `contractor_panel` — company_id -> companies(id)
- `sla_rules` (NOT sla_policies) — company_id -> companies(id); has `name`
  and `applies_to_trade`. Wired into jobs via sla_rule_id, sla_response_due,
  sla_resolution_due, responded_at.

Ownership root for ALL business-tier data is `companies(id)`, not
`profiles(id)` directly. RLS keys through `companies.owner_id`.

`jobs` already carries: priority, company_id, sla_rule_id, sla_response_due,
sla_resolution_due, responded_at. The business-tier migration adds only
`site_id` and `asset_id`.

`business_members` does not yet exist — forward-compatible placeholder added
by the business-tier migration; owner-only in v1, multi-user RLS deferred.

Dashboard-created native enums (in DB, not in migrations): asset_category,
service_contract_status, service_document_type, service_frequency,
service_visit_status. The service_* enums imply partial service-contract /
PPM scaffolding — scope UNCONFIRMED; audit before building on it.

## Edge Function secrets
- `SITE_URL` is the canonical origin env var for Edge Functions; `PUBLIC_URL` and
  `PUBLIC_APP_URL` are set to the same value for legacy compatibility — new functions
  must use `SITE_URL` only. Standardising the old two is captured in LATER.md.
- `LOVABLE_API_KEY` secret retired (Lovable fully retired).

## Critical Rules (read every session)
- No emojis in UI
- No fake placeholder data anywhere
- GBP only, UK date format (d MMM yyyy)
- Read full file before modifying — preserve all existing logic
- Fix broken features before building new ones
- Core job flow first: enquiry → quote → schedule → job → invoice → payment
- Platform name is **TradeStone** — never "TradeStone Connect", "TradeStone Marketplace", or any other suffix

## Stack
- Frontend: React/TypeScript, Vite, shadcn/ui, Tailwind
- Backend: Supabase (Postgres, RLS, Edge Functions, Deno)
- Payments: Stripe Connect (Express, UK, 3.5% platform fee)
- Hosting: Vercel (auto-deploy from GitHub main branch)
- Repo: R-Bowes/trade-stone-connect
- Domain: tradesltd.co.uk

## Typography
- **Wordmark**: TRADE in navy (`#1e3a5f`), STONE in orange (`#f07820`), Barlow Condensed 700 uppercase — set via inline style in `Header.tsx`
- **Headings (h1/h2/h3)**: Barlow Condensed — 700 for h1/h2, 600 for h3, uppercase, letter-spacing 0.03em — set globally in `src/index.css` `@layer base`; all h1/h2 elements also carry `font-heading` class
- **UI/Body (`font-sans`)**: Lexend 400/500/600/700
- **Descriptions/Testimonials (`font-serif`)**: Source Serif 4 400; italic for pull-quotes
- **Monospace (`font-mono`)**: Roboto Mono — use for TS codes and financial figures
- **Google Fonts imports** (`src/index.css` lines 1–4): Barlow Condensed, Lexend, Source Serif 4, Roboto Mono
- `Privacy.tsx` and `Terms.tsx` excluded from `font-heading` sweep — legal docs left in default browser styling

## Key IDs (test accounts)
- Contractor: TS-C-4AE203, profiles.id = 425b9477-5d1b-4a31-b7f0-a91a31f5a99b
- Contractor Stripe: acct_1TDourAB5sLPnZb9
## Session 2 — 3 May 2026

### Completed
- `public_pro_profiles` view rebuilt to expose `id`, `rating`, `review_count`, `is_verified`, `years_experience`, `completed_jobs`
- `useContractors` hook updated to select all four fields `ContractorCard` depends on
- Contractor directory cards now show real data — no fake placeholder values anywhere
- Contractor profile page (`ContractorProfile.tsx`) fully rewritten — all hardcoded stats, certifications, portfolio, and reviews removed; real DB data throughout
- Photo upload in `QuoteRequestDialog` capped at 5 images with validation
- Scheduling flow rebuilt — customer sees contractor's real 14-day availability grid (AM/PM slots), selects up to 3, contractor confirms one, job created on confirmation
- RLS policy on `availability_slots` fixed — added public SELECT policy so customers can read contractor availability
- `notify_quote_issued` trigger fixed — contractor name lookup was using `user_id` instead of `id`, causing "TradeStone" to appear instead of contractor name
- Invoice PDF improved — contractor logo (fetched as base64), contractor details, navy table header, "Powered by TradeStone" footer
- Platform fee corrected from 2% to 3.5% in `TransactionFeeNotice.tsx` and `Terms.tsx`
- VAT Registration card added to `ProfileManagement.tsx` — toggle + VAT number field + amber warning
- `vat_registered`, `vat_number`, `vat_registration_date` columns added to `profiles` table

### Key decisions
- VAT is contractor self-declared — platform does not auto-enforce threshold based on platform turnover alone
- Scheduling flow: contractor availability drives slot picker, customer picks up to 3, contractor confirms one
- Client-side PDF generation (jsPDF) retained — server-side only needed when emailing PDFs automatically
- Invoice tax rate defaults to 20% for VAT-registered contractors, 0% otherwise (already wired in `InvoiceFormDialog`)

### Known issues / parked
- Stage progression bug (all jobs moving simultaneously) — could not reproduce reliably; needs a test case with multiple jobs in different states
- `schedule_events` table stores proposals but `job_scheduling_proposals` table also exists — may be redundant, audit before next build

### Backlog (priority order)
1. Stage progression bug — root-cause and fix
2. Stripe Checkout — replace blocked embedded Elements payment flow
3. Business dashboard — build the UI; schema spine live (see Architecture)
4. Team management — contractor side (adding workers, assigning to jobs, timesheets by worker)
5. First real contractor onboarding
6. PDF quote generation (invoices done, quotes still PDF-less)
7. Portfolio images on contractor profile (upload up to 5, display in Portfolio tab)
8. MTD VAT submission via HMRC API
9. Open Banking reconciliation via TrueLayer or Plaid
10. Contractor health score and verified review system