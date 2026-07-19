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

**`tsc --noEmit` caveat**: `tsconfig.app.json` has `strict: false`
(`noImplicitAny`, `strictNullChecks`, `noUnusedLocals`,
`noUnusedParameters` are all off explicitly, in both `tsconfig.json` and
`tsconfig.app.json`). A clean
`tsc --noEmit` run proves the code parses and types roughly line up — it
does NOT prove null-safety (no `strictNullChecks`) and does NOT catch
unused variables/params (no `noUnusedLocals`/`noUnusedParameters`). Treat a
clean `tsc` as "didn't break the build," not "is correct" — manual review
is still required for null-handling and dead-code cleanup. Gradual
strict-mode adoption is on LATER.md.

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

### View idioms — two, deliberately different

Two distinct patterns, both used on purpose. Know which one you're building
before writing a new view.

1. **Plain view, RLS-bypass** — `public_pro_profiles`,
   `tender_clarifications_for_contractor`. A Postgres view runs with its
   OWNER's table privileges by default (no `security_invoker`), so it reads
   past the base table's RLS entirely. The view's own `WHERE` clause is
   then **100% of the access gate** — nothing from the base table's RLS
   backs it up. Use this when the view needs to expose a genuinely
   different, narrower, or redacted slice of a row than the querying
   user's own RLS would allow them to see directly (`public_pro_profiles`:
   anon/authenticated see a public directory slice of `profiles` they
   couldn't otherwise read; `tender_clarifications_for_contractor`: a
   contractor sees other bidders' answered questions with `asked_by`
   nulled out, which their own narrowed base-table RLS policy no longer
   permits at all). Every predicate the view needs — including one that
   would otherwise live in RLS — must be written into the view's `WHERE`
   clause by hand. Get this wrong and the view either leaks rows the base
   RLS would have blocked, or the "gate" silently isn't a gate (see the
   `tender_clarifications_for_contractor` asked_by-leak incident:
   `20260710170000_tender_clarifications_asker_anonymisation.sql` shipped
   an `OR`-structured `WHERE` that didn't apply the visibility check to the
   own-row arm, caught on review before commit).
2. **`security_invoker = true` view** — `contract_expiry_radar`
   (`20260712120000_expiry_radar_and_retender.sql`). The view runs AS the
   querying user, so it inherits whatever RLS the underlying tables already
   have — no `WHERE`-clause gate needs to be re-derived in the view at all.
   Use this when the view is just a display-shaped union/join over tables
   that already have CORRECT, sufficient RLS SELECT policies for every
   party who should see the view — the view is convenience, not a new
   access boundary.

Rule of thumb: if the view needs to show a user something their own RLS
wouldn't otherwise let them read, it's pattern 1 and the `WHERE` clause is
load-bearing. If every underlying table already has the right RLS for
every consumer, it's pattern 2 and `security_invoker = true` is simpler and
safer than re-deriving the same filter by hand.

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

`auth_user_company_ids()` was retired from the `companies` SELECT policy in
20260609120000 for causing 42P17 infinite recursion when called from a policy
on `companies`. Do not resurrect it.

`companies` SELECT policy ("Companies readable") is **`USING
(is_company_member(id))`** as of `20260614174850_coverage_chunk_b_coverage_rls.sql`
— NOT `owner_id = auth.uid()` alone; that was the 20260609120000-era body and
is stale. **Correction to the recursion rule below**: `is_company_member()` →
`is_company_owner()` DOES read `companies` directly now (joins `companies` →
`profiles`), and this is safe. The actual danger that broke
`auth_user_company_ids()` and `service_visits` is a CYCLE — table A's policy
calls a function that reads table B, and table B's OWN policy calls a function
that reads table A back (companies SELECT → service_visits RLS →
service_visits policy queries companies → companies SELECT → ∞, removed in
20260609120000). A one-directional SECURITY DEFINER read of `companies`, with
nothing on companies' own policies calling back into the reading table, is
fine — that's exactly what `is_company_owner` is. Do NOT introduce a cycle;
do NOT avoid reading `companies` out of an overcorrected fear of the old bug.
Contractor reads of company rows are covered by "Companies readable by panel
contractors" instead. Any contractor with legitimate service visits should
already be in `contractor_panel`.

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

### Fragile invariants (read before touching adjacent code)

Correctness here depends on something that isn't enforced by a type, a
constraint, or a comment anyone would trip over — easy to break without
noticing.

- **`useContractorPipeline.ts` excludes lapsed quotes by absence, not a
  filter.** The governing-quote if/else-if chain (around line 464 and the
  fallthrough comment near line 537) has no branch for
  `governing?.status === 'lapsed'` — a lapsed quote (set by
  `EngagementThread.tsx`) simply produces no pipeline card because nothing
  matches. This is intentional and is now commented inline at the
  fallthrough, but adding a new catch-all branch to that chain later would
  silently un-exclude lapsed quotes — check what falls through before
  adding one.
- **`SlotPicker.tsx`'s `WINDOW_DAYS = 42` (6-week booking window) is
  client-side only.** No DB constraint backs it — nothing stops a
  `schedule_events`/`availability_slots` row dated beyond 6 weeks out from
  being created some other way (a future API, a script, a different UI
  path). If a booking window rule ever needs to be actually enforced, it
  isn't today.
- **Contractor tender-clarifications UI must read
  `tender_clarifications_for_contractor`, never the base
  `tender_clarifications` table.** The base table's contractor SELECT
  policy is own-rows-only (narrowed in `20260710170000`) — querying it
  directly from contractor-side UI returns only the contractor's own
  questions with no error, silently hiding every answered question from
  other bidders that the sealed-clarifications feature is supposed to
  surface. Silent-empty, not a thrown error — easy to miss in testing if
  the test account happens to be the only bidder who asked anything.

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
`is_company_owner()` / `can_access_site()` SECURITY DEFINER helpers
(20260614174850 — supersedes the `is_company_member(uuid, text[])` /
`is_site_member()` pair from 20260612120000; see B2B/FM foundation below).

`jobs` carries: priority, company_id (FK formalised in 20260612120000),
site_id, asset_id, sla_rule_id, sla_response_due, sla_resolution_due,
responded_at. `enquiries` gained company_id, site_id, asset_id in
20260612120000.

`enquiries` creator column is `customer_id` (nullable uuid) — NOT
`homeowner_id` (does not exist). `project_id` also exists in the live schema
(pre-Projects experimentation) — untouched; do not assume its semantics until
Projects work begins.

`business_members` fully built in 20260612120000, then rebuilt again
(role -> coverage) in 20260614174850 (see B2B/FM foundation section below).
Previous placeholder dropped.

Dashboard-created native enums (in DB, not in migrations): asset_category,
service_contract_status, service_document_type, service_frequency,
service_visit_status. The service_* enums imply partial service-contract /
PPM scaffolding — scope UNCONFIRMED; audit before building on it.

### B2B/FM foundation (migrations 20260612120000, superseded by 20260614174850)

**SUPERSEDED 2026-06-14.** The role-based model this section originally
described (`business_members.role` IN `owner|admin|member`, an owner ROW in
`business_members`, `is_company_member(uuid, text[])` /
`is_site_member(uuid, text[])` taking a roles array) was replaced wholesale
by `20260614174850_coverage_chunk_b_coverage_rls.sql` with a coverage-based
model. Confirmed against `types.ts` (live-generated, not migration text):
`business_members` has NO `role` column. Found while building tendering
chunk 5 — a Phase-1 report earlier in that same build (chunk 4) had already
printed the stale 2-arg `is_company_member` signature from 20260612120000's
migration text, which is exactly the failure mode the "schema/policy claims
must come from the live DB" rule exists to prevent. If you find migration
text, an old doc paragraph, or a stale report describing `role`, it is wrong
— trust this section and the live schema instead.

#### Table shape (current, live)

`business_members` — company membership registry, coverage-scoped.

| column | notes |
|---|---|
| company_id | FK → companies(id) ON DELETE CASCADE |
| profile_id | NULL while invited; set on accept |
| status | `invited` \| `active` \| `removed` |
| coverage_kind | `national` \| `group` \| `site` — replaces `role` entirely |
| coverage_group_id | FK → site_groups(id); set only when coverage_kind='group' |
| coverage_site_id | FK → sites(id); set only when coverage_kind='site' |
| invited_email | display only — NOT used for matching |
| invite_token | single-use UUID; NULL after acceptance |
| invite_expires_at | 7-day window from creation |

**The owner has NO row in `business_members` at all.** Owner identity is
exclusively `companies.owner_id`. The coverage migration deleted every
owner's own membership row (`DELETE ... WHERE bm.profile_id = c.owner_id`)
and dropped `role` outright. There is no role-based write/manage
distinction among non-owner members anymore — v1 permissions are "owner can
do everything; any active member can read/write within their coverage
scope." Fine-grained member permission tiers (was: role hierarchy) are still
deferred to LATER.md, now under the coverage model instead of a role model.

#### Membership helpers (current signatures — NOT the 2-arg role-array form)

- `is_company_owner(p_company_id uuid) RETURNS boolean` — checks
  `companies.owner_id` via a `profiles.user_id = auth.uid()` join. New in the
  coverage migration.
- `is_company_member(p_company_id uuid) RETURNS boolean` — **1-arg, no
  `p_roles` parameter.** The 2-arg `is_company_member(uuid, text[])` from
  20260612120000 was explicitly DROPPED (`DROP FUNCTION IF EXISTS
  public.is_company_member(uuid, text[])`) before this one was created. Body:
  `is_company_owner(p_company_id) OR EXISTS(active business_members row for
  auth.uid())`.
- `can_access_site(p_site_id uuid) RETURNS boolean` — replaces
  `is_site_member(uuid, text[])`, which was DROPPED entirely. Resolves the
  site's company; owner → always true; else checks the member's
  `coverage_kind` (`national` → true; `site` → `coverage_site_id` matches;
  `group` → the site is in `coverage_group_id` via `site_group_members`).

Any policy calling the old 2-arg `is_company_member(id, ARRAY[...])` form or
`is_site_member` is calling a function that no longer exists — this fails
loudly at migration-apply time (function does not exist), not silently.
Always use the 1-arg `is_company_member(company_id)` for member-wide checks,
`is_company_owner(company_id)` for owner-only checks, `can_access_site
(site_id)` for site-scoped checks.

Tendering (chunks 2–5) was built entirely against the 1-arg form already —
every call is `is_company_member(company_id)`, no roles array — so none of
that SQL needed retroactive fixing when this divergence was found; only this
doc section and one Phase-1 report were wrong.

#### RLS one-direction rule — still holds, refined

Companies, sites, assets, jobs, and enquiries policies MUST check membership
ONLY via `is_company_member()` / `is_company_owner()` / `can_access_site()`.
See the corrected recursion note in the Row-level security section above:
these DO read `companies` internally now (`is_company_owner` joins
`companies` → `profiles`), and that is safe — the real danger is a CYCLE
(table A's policy → function reads table B → table B's own policy →
function reads table A back), not merely "a function reads companies."

#### DB-enforced invariants (current)

- **Owner is immutable via this table**: there is no "last owner" business
  rule to enforce anymore, because there is no owner row to protect —
  `prevent_last_owner_removal()` and its trigger were DROPPED in the
  coverage migration. Owner identity changes only via `companies.owner_id`
  (no UI path exists for this today).
- **Assets without a site**: assets with `site_id IS NULL` are invisible to
  company members via RLS (`can_access_site` returns false for NULL). Assign
  assets to a site before they appear in the business dashboard.
- **Coverage consistency**: `business_members_coverage_check` CHECK enforces
  exactly one of `(national, group_id NULL, site_id NULL)` /
  `(group, group_id set, site_id NULL)` / `(site, site_id set, group_id
  NULL)` — the DB rejects mismatched combinations outright.

#### App-enforced invariants (NOT enforced by DB constraints)

- **Cross-table consistency**: when creating a job or enquiry with
  `asset_id` set, the app must verify `asset.site_id → site.company_id =
  job.company_id`. The DB enforces individual FKs only.
- **B2B enquiry contractor assignment**: business-created enquiries should have
  `contractor_id` set (a panel contractor pick) at creation. There is no
  open/unassigned contractor SELECT arm on the live enquiries table — the v1
  flow reason is UX clarity, not a leak risk. No DB constraint enforces this
  in v1 — revisit under Projects/tendering work.

#### Invite flow (coverage-based, current)

Link-based, single-use token, 7-day expiry — mechanics unchanged from
20260612120000, but invites now state COVERAGE, not a role.

1. Owner INSERTs a `business_members` row with `status='invited'`,
   `invited_email`, `profile_id=NULL`, and an explicit `coverage_kind` (+
   `coverage_group_id`/`coverage_site_id` as the CHECK constraint requires —
   `coverage_kind` lost its default in the coverage migration specifically
   so new invites must state coverage explicitly). `invite_token` defaults
   to `gen_random_uuid()`.
2. Invitee opens the invite link (token in URL), frontend calls
   `accept_business_invite(token)` RPC.
3. RPC validates: token exists, `status='invited'`, not expired, caller has a
   profile, no existing active membership for that company.
4. On success: sets `profile_id=auth.uid()`, `status='active'`,
   `accepted_at=now()`, clears `invite_token` and `invite_expires_at`.
5. Returns `company_id`. Raises clear exceptions on each failure mode.

Invite token visibility: pending rows (status = `invited`) are visible in
SELECT only to the owner and the row's own `profile_id`. Regular active
members can see the roster but not pending invite tokens (RLS:
`business_members_select`, 20260614174850).

Confirmed while writing this correction: `BusinessTeamView.tsx` (frontend)
already uses `coverage_kind`/`coverage_group_id`/`coverage_site_id`
exclusively — no `role` reference anywhere in it. The app code was already
consistent with the live schema; only this documentation had not caught up.

#### assets.status — canonical values ratified

`assets.status` values `operational | faulty | decommissioned` are canonical.
`decommissioned` is the end-of-life/archive state; no separate lifecycle column
is needed. Do not add `active | archived` values — the conflict is closed.

#### Deferred to LATER.md

- Asset service schedules, PPM calendars, document storage
- Consolidated billing per company
- Approval workflows for B2B job requests
- Rate cards per contractor/company
- Fine-grained member permissions beyond coverage scope (was: role hierarchy)
- Clean up `assets.is_active` column (present in live DB, not canonical)
- Consolidate the 11 overlapping `enquiries` RLS policies (two generations:
  older direct-equality + newer two-step/is_platform_admin) into one canonical
  set — verify with pg_policies before touching

## Edge Function secrets
- `SITE_URL` is the canonical origin env var for Edge Functions; `PUBLIC_URL` and
  `PUBLIC_APP_URL` are set to the same value for legacy compatibility — new functions
  must use `SITE_URL` only. Standardising the old two is captured in LATER.md.
- `LOVABLE_API_KEY` secret retired (Lovable fully retired).

## Scheduled jobs / cron infrastructure
- `pg_cron` (lives in `pg_catalog`, Supabase's mandated location) and
  `pg_net` (in `extensions`) were dashboard-enabled 2026-07-11. They did
  NOT exist before that despite `20260328193000_invoice_payment_flow.sql`'s
  `CREATE EXTENSION IF NOT EXISTS pg_cron` recording as applied back in
  March — `cron.job` was confirmed EMPTY when this was investigated for
  tendering chunk 6, meaning `invoice-overdue-check` never actually
  registered and neither invoice overdue marking nor SLA breach checking
  ever ran live before `20260711130000_term_engagements_and_watchers.sql`
  re-created all cron entries fresh.
- Live cron entries (all via `net.http_post` to an edge function, or a
  direct SQL call, per the established `cron.unschedule`-then-`schedule`
  idiom): `invoice-overdue-check` (daily, → `mark-overdue-invoices`),
  `sla-clock-check` (hourly, → `sla-clock` `{action:'check'}`),
  `tendering-scheduled-runner` (daily, → `run_tendering_scheduled_tasks()`
  directly — no HTTP hop, compliance watcher + PPM generator + expiry radar
  are all plain SQL).
- Cron secrets (`app.settings.supabase_url`, `app.settings.service_role_key`)
  currently live as database GUCs (`ALTER DATABASE ... SET app.settings.*`),
  read via `current_setting(..., true)`. Migrating these to
  `supabase_vault` is on LATER.md — until then, any new HTTP-calling cron
  body or SECURITY DEFINER function must guard for either setting being
  NULL (see `create_callout_job()` in `20260711130000` for the
  fire-and-forget-with-guard pattern: missing settings or a failed
  `net.http_post` call are caught and `RAISE WARNING`'d, never allowed to
  raise past the calling function).

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

**SUPERSEDED 2026-06-14** by `20260614174850_coverage_chunk_b_coverage_rls.sql`
— this subsection is a same-day session log of the ORIGINAL role-based
build and is left as-is for history, but its role/`owner`/`admin`/`member`
references are stale. See "B2B/FM foundation" above for the current
coverage-based model; `BusinessTeamView.tsx` itself was updated to match and
no longer references `role` anywhere.

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
- **Tendering (T-/TA-/TE-) is a deliberately different numbering
  convention** — see TENDERING-SCHEMA.md's Conventions header for the full
  rationale. Short version: party-coded families that cross a company/
  contractor boundary at creation (`T-`, `TA-`, `TE-`) store the FULL
  composed string in the number column itself, trigger-minted
  (`assign_tender_number_trigger` etc. call `next_business_document_number`/
  `next_document_number` and compose the string server-side) — no
  `documentRefs.ts`-style render-time composition for these. Intra-
  contractor families (`Q-`/`J-`/`INV-`, this section) keep the
  integer-column + render-time-compose pattern above. Do not conflate the
  two when adding a new document family — check whether it crosses a party
  boundary before picking a convention.

## Quote → job creation sequence (job creation is a manual mint, not a trigger)

Investigated 2026-07-16 after production data showed a gap that looked like a
missing/broken automation: `issued_quotes.status='accepted'`, then a
`schedule_events` proposal reaching `status='accepted'`/`is_confirmed=true`,
then `jobs` row minted several minutes later with no obvious cause. Confirmed:
**there is no DB trigger, cron job, or edge function anywhere that inserts
into `jobs` off a quote or schedule event.** Grepped every migration for
`INSERT INTO jobs` and every edge function for a jobs insert — the only two
places a `jobs` row is ever created client-side are `src/lib/createJobFromQuote.ts`
and a one-off tender/term-engagement path (see below). Job creation is always
a deliberate, separate button click by the recipient — the gap between
schedule confirmation and job creation is human reaction time, not a hidden
async process.

**The real sequence, three independent steps, each a separate user action:**

1. **Quote acceptance** — recipient clicks Accept in `ReceivedQuotes.tsx`
   (`handleAccept` → `useReceivedQuotes.ts`'s `respondToQuote`). This ONLY
   updates `issued_quotes.status = 'accepted'` (+ `recipient_response`,
   `responded_at`). It does not touch `schedule_events` or `jobs` at all.
   Immediately opens the schedule-negotiation dialog
   (`QuoteScheduleNegotiation.tsx`).
2. **Schedule confirmation** — either party calls `acceptProposal` in
   `src/hooks/useQuoteScheduling.ts`, which updates a `schedule_events` row to
   `status='accepted', is_confirmed=true`, blocks the contractor's calendar
   half-day, and declines sibling proposals. **This still does not create a
   job.** The UI's own toast at this point says it explicitly: "Schedule
   confirmed — proceed to confirm the job below."
3. **Job confirmation — the actual mint** — only once the schedule is
   confirmed does `QuoteScheduleNegotiation.tsx` render a distinct "Confirm
   Job" button (no-deposit quotes, `mode === "recipient"` only —
   `handleConfirmJobDirectly` → `createJobFromQuote(quoteId)` directly) or an
   "Approve & Pay Deposit" button (deposit quotes → `DepositPaymentDialog.tsx`
   → Stripe payment succeeds → `createJobFromQuote(quoteId)` inside
   `CheckoutForm.handlePay`). **This click is the only thing that ever inserts
   a `jobs` row for the quote flow.** There is no automatic path from
   "schedule confirmed" to "job created" — if the recipient closes the dialog
   after confirming the date without clicking this second button, the job
   simply never gets created, indefinitely.

`createJobFromQuote.ts`'s insert column list (confirmed from source): reads
`contractor_id, recipient_id, title, client_name, client_address, total,
enquiry_id` off `issued_quotes`, resolves `company_id`/`site_id`/`asset_id` off
the source `enquiries` row (if any) and the confirmed `schedule_events` row's
`start_time` for `start_date`, then inserts `{contractor_id, customer_id,
issued_quote_id, title, location, status: 'scheduled', contract_value,
start_date, company_id, site_id, asset_id}` into `jobs`. It is reachable from
exactly two live UI paths (`DepositPaymentDialog.tsx`,
`QuoteScheduleNegotiation.tsx`'s direct-confirm button) — both gated behind
schedule confirmation as described above.

The only OTHER `INSERT INTO jobs` in the codebase is the term-engagement
call-out path in `20260711130000_term_engagements_and_watchers.sql` (a
SECURITY DEFINER function mirroring `createJobFromQuote`'s insert shape for
`engagement_id`-based call-outs, which skip the quote phase entirely) — unrelated
to this sequence, not a second path for quote-driven jobs.

**FIXED (confirmed 2026-07-18, readiness-audit A3/A5 pass):** the paragraph
below described `supabase/functions/accept-quote/index.ts` as still querying
the legacy, always-empty `quotes` table, breaking every deposit payment.
Re-read in full during the audit: it queries `issued_quotes` exclusively
(confirmed via repo-wide grep for `.from("quotes")` across
`supabase/functions` — zero matches) and has its own header comment stating
this explicitly. Left the original note below for history/context, but do
not act on its "100% broken" conclusion — it no longer reflects the code.

<details>
<summary>Original note (stale, kept for history)</summary>

`supabase/functions/accept-quote/index.ts`
(the edge function `DepositPaymentDialog.tsx` calls to set up the Stripe
deposit PaymentIntent) still queries `.from("quotes")` — the legacy, always-empty
table this file already documents above ("The `quotes` table is LEGACY and
empty — the live table is `issued_quotes`. Never query or build against
`quotes`."). Every real `quote_id` passed in comes from `issued_quotes`, so
`.eq("id", quote_id).single()` against `quotes` can never match, and the
function always returns 400 "Quote not found" before Stripe is even reached.
**Any quote with a deposit requirement cannot currently be paid/scheduled into
a job at all** — the failure is loud (a toast), not silent, but the deposit
path is 100% broken in production today. Traced via `git log`: commit
`0624d622` ("refactor: unified document reference system", 2026-07-02)
explicitly removed dead `from('quotes')` reads from `ContractorDashboard` and
`BusinessManagement` as part of the `issued_quotes` migration cleanup, but
missed this edge function — it was never updated off the legacy table.

</details>