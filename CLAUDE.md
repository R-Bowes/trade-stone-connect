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

### RLS / PostgREST failure modes

- **STABLE helper functions are blind to same-statement inserts.** A `STABLE`
  self-referential helper used in a SELECT policy takes a snapshot and will
  not see rows inserted earlier in the same statement (the RETURNING/snapshot
  issue). Never use a STABLE self-referential helper in a SELECT policy that
  must see rows inserted in the same statement — use SECURITY DEFINER or
  inline the check instead. (Origin: `job_conversations` SELECT policy bug.)
- **Zero-row RLS UPDATEs fail silently.** PostgREST returns success with no
  rows affected when an RLS policy blocks the update — there is no error to
  catch. Every claimed RLS fix must be verified with SQL evidence showing the
  row actually changed, not just that the client call returned 200.
- **Bad FK-hint embeds fail silently.** A PostgREST embed referencing a wrong
  or stale FK hint returns an empty embed with no error. Verify embed hints
  against actual FK names in the live schema before trusting a query.
- **Two-party tables need write policies for both parties.** Any table
  written by two different parties (e.g. `schedule_events`,
  `contractor_availability_overrides`) needs explicit write policies for BOTH
  parties — the recipient's write path is never automatic just because the
  initiator's is covered.
- **`profiles.id == profiles.user_id` is enforced by `CHECK (id = user_id)`
  with `user_id NOT NULL`** — under this constraint the two columns are
  interchangeable, and direct `auth.uid()` comparison against profiles-keyed
  columns is the house pattern (see RLS section above). HISTORICAL CONTEXT, do
  not delete: before this CHECK existed, policies comparing `auth.uid()`
  directly against profiles FK columns caused real bugs, and the defensive
  two-step lookup (`id IN (SELECT id FROM profiles WHERE user_id =
  auth.uid())`) was mandatory. If the CHECK constraint is ever relaxed, or a
  policy targets a table whose FK references a profile id that is NOT
  guaranteed equal to a user id, the two-step pattern becomes mandatory again
  for that policy.

### Deliberately public / known-broad RLS policies (reviewed, not bugs)

Found during the baseline-migration audit (see
`20260709140000_baseline_dashboard_created_tables.sql` and
`supabase/archive/baseline_extraction/`). These are broad on purpose — do not
"fix" them without checking the public-facing feature they back first:

- **`contractor_credentials`** — "Anyone can read credentials" is
  `USING (true)`, no role restriction (includes anon). Intentional: these are
  the displayed credential badges on public contractor profile pages.
- **`profile_widgets`** — "Anyone can read profile widgets" is `USING (true)`,
  no role restriction. Intentional: public profile canvas content.
- **`contractor_availability_overrides`** — "Authenticated users read
  overrides" is `USING (auth.role() = 'authenticated')`, so any logged-in user
  can read every contractor's override rows, including the free-text `reason`
  column. This is broader than a per-contractor scope and the `reason` field
  is flagged for future scoping (e.g. restrict to the contractor themselves
  plus parties with a live/confirmed booking) — not fixed here because the
  booking-slot picker's current behaviour depends on the broad read. Revisit
  under LATER.md before adding any free-text field here that could carry PII
  beyond a scheduling note.

Two policies that were NOT in this category — genuinely broken, fixed in
`20260709170000_security_fix_notifications_and_gdpr_log.sql`:
`job_message_notifications` ("System can insert notifications" was
`WITH CHECK (true)` with no ownership tie — no trigger backs this table, so it
was a real open write) and `gdpr_erasure_log` ("Only admins can view erasure
log" checked `performed_by = auth.uid()`, not an actual admin role).

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
  the link to the business user (-> profiles(id), FK formalised in 20260606120000).
- `sites` — company_id -> companies(id). Canonical columns formalised in
  20260612120000 (reference, address_line1/2, city, postcode, notes, status,
  created_by).
- `assets` — company_id NOT NULL -> companies(id), site_id NOT NULL -> sites(id)
  (both NOT NULL in live schema). `category` is the `asset_category` enum.
  Live columns include: make, description, location_note, model, serial_number,
  install_date, status (operational/faulty/decommissioned). `is_active` column
  also exists but is NOT canonical — do not use it; flagged for cleanup.
  `reference` added in 20260612120000.
- `contractor_panel` — company_id -> companies(id)
- `sla_rules` (NOT sla_policies) — company_id -> companies(id); has `name`
  and `applies_to_trade`. Wired into jobs via sla_rule_id, sla_response_due,
  sla_resolution_due, responded_at.

Ownership root for ALL business-tier data is `companies(id)`, not
`profiles(id)` directly. RLS now keys through `is_company_member()` /
`is_site_member()` SECURITY DEFINER helpers (20260612120000).

`jobs` carries: priority, company_id (FK formalised in 20260612120000),
site_id, asset_id, sla_rule_id, sla_response_due, sla_resolution_due,
responded_at. `enquiries` gained company_id, site_id, asset_id in
20260612120000.

`enquiries` creator column is `customer_id` (nullable uuid) — NOT
`homeowner_id` (does not exist). `project_id` also exists in the live schema
(pre-Projects experimentation) — untouched; do not assume its semantics until
Projects work begins.

`business_members` fully built in 20260612120000 (see B2B/FM foundation
section below). Previous placeholder dropped.

Dashboard-created native enums (in DB, not in migrations): asset_category,
service_contract_status, service_document_type, service_frequency,
service_visit_status. The service_* enums imply partial service-contract /
PPM scaffolding — scope UNCONFIRMED; audit before building on it.

### B2B/FM foundation (migration 20260612120000)

#### Table shapes and role semantics

`business_members` — company membership registry.

| column | notes |
|---|---|
| company_id | FK → companies(id) ON DELETE CASCADE |
| profile_id | NULL while invited; set on accept |
| role | `owner` \| `admin` \| `member` |
| status | `invited` \| `active` \| `removed` |
| invited_email | display only — NOT used for matching |
| invite_token | single-use UUID; NULL after acceptance |
| invite_expires_at | 7-day window from creation |

v1 permissions are coarse: `owner` and `admin` can INSERT/UPDATE/DELETE
members, sites, assets; `member` gets read-only access. Fine-grained
permissions (site-scoped access, approval workflows) are deferred to LATER.md.

#### RLS one-direction rule — never cross the boundary

Companies, sites, assets, jobs, and enquiries policies MUST check membership
ONLY via the `is_company_member()` or `is_site_member()` SECURITY DEFINER
helpers. These helpers have a fixed table allowlist:

- `is_company_member(p_company_id, p_roles)` — queries ONLY `business_members`
- `is_site_member(p_site_id, p_roles)` — queries ONLY `sites` + `business_members`

**NEVER add `companies` to either function.** That would recreate the 42P17
infinite recursion that retired `auth_user_company_ids()` (see Row-level
security section above).

`business_members` policies MAY call `is_company_member()` — safe because the
function is SECURITY DEFINER and bypasses `business_members` RLS, so no
self-recursion occurs.

#### DB-enforced invariants

- **Owner-row protection**: the `business_members` write policies include
  `(role <> 'owner' OR is_company_member(company_id, ARRAY['owner']))`. Only an
  existing owner can INSERT, UPDATE, or DELETE an owner-role row. Demoting the last
  owner is blocked at the DB level — no app guard required.
- **Assets without a site**: assets with `site_id IS NULL` are invisible to
  company members via RLS (`is_site_member` returns false for NULL). Assign
  assets to a site before they appear in the business dashboard.

#### App-enforced invariants (NOT enforced by DB constraints)

- **Cross-table consistency**: when creating a job or enquiry with
  `asset_id` set, the app must verify `asset.site_id → site.company_id =
  job.company_id`. The DB enforces individual FKs only.
- **B2B enquiry contractor assignment**: business-created enquiries should have
  `contractor_id` set (a panel contractor pick) at creation. There is no
  open/unassigned contractor SELECT arm on the live enquiries table — the v1
  flow reason is UX clarity, not a leak risk. No DB constraint enforces this
  in v1 — revisit under Projects/tendering work.

#### Invite flow

Link-based, single-use token, 7-day expiry.

1. Owner/admin INSERTs a `business_members` row with `status='invited'`,
   `invited_email`, `profile_id=NULL`. `invite_token` defaults to
   `gen_random_uuid()`.
2. Invitee opens the invite link (token in URL), frontend calls
   `accept_business_invite(token)` RPC.
3. RPC validates: token exists, `status='invited'`, not expired, caller has a
   profile, no existing active membership for that company.
4. On success: sets `profile_id=auth.uid()`, `status='active'`,
   `accepted_at=now()`, clears `invite_token` and `invite_expires_at`.
5. Returns `company_id`. Raises clear exceptions on each failure mode.

Invite token visibility: pending rows (status = `invited`) are visible in SELECT
only to `owner`/`admin` members and the row's own `profile_id`. Regular `member`
rows can see the roster of active members but not pending invite tokens.

#### assets.status — canonical values ratified

`assets.status` values `operational | faulty | decommissioned` are canonical.
`decommissioned` is the end-of-life/archive state; no separate lifecycle column
is needed. Do not add `active | archived` values — the conflict is closed.

#### Deferred to LATER.md

- Asset service schedules, PPM calendars, document storage
- Consolidated billing per company
- Approval workflows for B2B job requests
- Rate cards per contractor/company
- Fine-grained permissions (site-scoped member access, role hierarchy)
- Clean up `assets.is_active` column (present in live DB, not canonical)
- Consolidate the 11 overlapping `enquiries` RLS policies (two generations:
  older direct-equality + newer two-step/is_platform_admin) into one canonical
  set — verify with pg_policies before touching

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
- **Schema/policy claims must come from the live DB.** Never reconstruct column
  names, policy bodies, or table shapes from migration files, code, or memory —
  migrations may not reflect live state. Use `information_schema.columns` and
  `pg_policies` output pasted directly from the Supabase SQL editor. Two
  confirmed drift incidents: `client_id` vs `customer_id` on jobs; `homeowner_id`
  vs `customer_id` on enquiries.
- **Schema-change discipline**: all schema SQL (functions, triggers, tables,
  policies, grants, column additions) goes into a migration file in
  `supabase/migrations/` and is applied via `npx supabase db push` ONLY. The
  Supabase SQL editor is for read-only checks (SELECT / information_schema /
  pg_policies / counts) only. This rule was breached twice (accept_business_invite
  RPC and prevent_last_owner_removal trigger applied via editor), requiring drift
  repair migration 20260613XXXXXX_b2b_invite_accept_modes.
- **Migration git ritual**: run `git status` after every migration push; every
  migration file must be explicitly committed.

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
3. Team management — contractor side (adding workers, assigning to jobs, timesheets by worker)
4. First real contractor onboarding
5. PDF quote generation (invoices done, quotes still PDF-less)
6. Portfolio images on contractor profile (upload up to 5, display in Portfolio tab)
7. MTD VAT submission via HMRC API
8. Open Banking reconciliation via TrueLayer or Plaid
9. Contractor health score and verified review system

## Session 3 — 13 Jun 2026

### Completed
- B2B/FM foundation migration (20260612120000) — business_members rebuild, sites/assets
  FK formalisation, SECURITY DEFINER membership helpers, RLS policies, accept_business_invite RPC
- BusinessDashboard: membership-aware company resolution (owner → active member → pending invite)
- BusinessDashboard: currentRole derived and passed to views; pendingInvites state for TS-Code path
- BusinessTeamView (`src/components/business/BusinessTeamView.tsx`): active roster with role-gated
  controls, pending invites panel, invite creation (Path A link / Path B TS-Code)
- InvitePage (`src/pages/InvitePage.tsx`): public `/invite?token=` route; authed → RPC
  accept_business_invite(p_token); unauthed → localStorage + sign-in prompt
- Dashboard.tsx: localStorage `pending_invite_token` check before role redirect
- BusinessLayout: Team nav item (ti-users, before Settings, Account group)
- CLAUDE.md: schema-change discipline rule added; B2B team/invite system documented

### Business team / invite system reference

**`BusinessTeamView`** — `src/components/business/BusinessTeamView.tsx`
Props: `{ companyId, profileId, currentRole }`. Rendered at `view=team`.
- Active roster: `business_members` joined to `profiles(full_name, email, ts_profile_code)`,
  status='active'. Shows name, email, TS code (Roboto Mono), role badge.
- Role controls (owner/admin): role Select (owners only may assign 'owner'), Remove button.
  DB enforces last-owner protection — surface the error message verbatim if raised.
- Pending invites (owner/admin only via RLS): shows invited_email/role; Copy Link if
  invite_token is not null; Cancel button.
- Invite creation — Path A (link): INSERT business_members without profile_id; DB generates
  invite_token; build `${origin}/invite?token=...` and show with Copy button.
- Invite creation — Path B (TS code): lookup profiles.ts_profile_code → check active
  membership → INSERT with profile_id set, invite_token: null.

**`InvitePage`** — `src/pages/InvitePage.tsx` — public route `/invite?token=`
- Authed: `supabase.rpc('accept_business_invite', { p_token: token })` → success → navigate
  to /dashboard/business.
- Unauthed: show sign-in prompt; on button click: `localStorage.setItem('pending_invite_token',
  token)` then navigate to /login.

**Post-login token completion** — `src/pages/Dashboard.tsx`
On mount, after auth check: if `localStorage.pending_invite_token` is set, remove it and
navigate to `/invite?token=...` before the role redirect.

**RPC call signatures** (from live DB / types.ts):
- `supabase.rpc('accept_business_invite', { p_token: string })` — used by InvitePage
- `supabase.rpc('accept_business_invite', { p_invite_id: string })` — used by in-dashboard prompt
Both return `string` (company_id on success); raise exceptions on failure.

**Role-gating mirror of RLS** (app-enforced, no DB constraint):
- `owner` only: may assign/modify owner rows; may see and offer 'owner' in role options.
- `admin`: may manage non-owner rows; role options are admin/member only.
- `member`: read-only roster; no invite or manage UI rendered.
DB enforces the owner invariant via the write policies — DB error surfaces verbatim on violation.

**V1 known limitations**:
- TS-Code path: `handleCodeLookup` guards `user_type === 'business'` — non-business codes
  are rejected with a clear error. This is enforced in the UI only (not the DB).
- Link path: anyone with the link can call `accept_business_invite(p_token)` via the RPC.
  The RPC accepts any authenticated user (no user_type guard in the DB function). InvitePage
  checks user_type post-auth and blocks non-business accounts before calling the RPC. The clean
  fix is membership-aware ProtectedRoute + business dashboard access for non-business types →
  deferred to LATER.md.
- Company name in in-dashboard invite prompt shows "A company" (fallback) because the
  `companies(name)` embed is RLS-filtered to null for non-members. Proper fix needs a
  `get_invite_details` SECURITY DEFINER RPC → LATER.md.

### LATER.md additions (from this session)
- Cross-user-type business access: membership-aware ProtectedRoute so non-business profile_type
  users who are active business_members can access the business dashboard (v1 assumes business-type).
- Decline-invite flow: v1 has no decline; add RPC + UI button.
- Multi-company membership UI: v1 picks first active membership; need company switcher.
- `get_invite_details` SECURITY DEFINER RPC: returns company name (and optionally invited_by
  name) for a given invite_token/invite_id, bypassing RLS so non-members can see the company
  name before accepting.
- Scope the profiles SELECT policy down from `USING (true)` — ensure roster embed still works
  for fellow company members when policy is tightened.

  ## Document reference system (quotes, jobs, invoices)

- `issued_quotes.quote_number`, `jobs.job_number`, `invoices.invoice_number` are
  `integer NOT NULL`, per-contractor sequential. Assigned by BEFORE INSERT triggers
  via `contractor_counters` (atomic upsert — race-safe). NEVER generate document
  numbers client-side; never include them in insert payloads.
- `contractor_counters` has RLS enabled with no policies — written only by the
  SECURITY DEFINER allocator `next_document_number()`. Do not add client policies.
- Display strings are composed in the frontend via `src/lib/documentRefs.ts`
  (`formatQuoteRef` / `formatJobRef` / `formatInvoiceRef`):
  short form (`Q-0008`) in the contractor's own UI; full form (`Q-4AE203-0008`)
  on customer-facing surfaces, PDFs, emails, Stripe metadata.
- Quote revisions use `issued_quotes.version` (shown as `.{version}` when > 1).
  There is no `revision` column.
- Edge functions (Deno) duplicate the format inline — they cannot import from
  `src/lib`. Any format change must be applied in BOTH `documentRefs.ts` and the
  edge functions that build references.
- The `quotes` table is LEGACY and empty — the live table is `issued_quotes`.
  Never query or build against `quotes`.
- Legacy string formats (`QTE-TS-C-...`, `INV-TS-C-...-TS-P-...`) and their
  generator triggers are retired. If either pattern reappears in a grep, it's a
  regression.