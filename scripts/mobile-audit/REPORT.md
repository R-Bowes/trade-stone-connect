# Mobile layout audit — report

Date: 18 Oct 2026. Scope: layout, Tailwind classes and responsive markup only. No data fetching, queries, RLS, edge functions, Stripe, money calculations, status machines or copy meaning changed. Nothing committed.

## Result

110 audit targets: 97 routes (21 public, 40 contractor, 26 business, 10 personal) and 13 scripted dialogs/sheets. Each target was checked at 320, 375, 390 and 430, so 440 mobile checks in total.

| | Pass | Fail | Not reached |
|---|---|---|---|
| Before, mobile widths | 367 | 61 | 8 |
| **After, mobile widths** | **440** | **0** | **0** |
| Before, 768 / 1280 | 164 | 52 | 4 |
| After, 768 / 1280 | 166 | 50 | 4 |

- "Before" was measured against a snapshot of the working tree taken before any change, served on port 8081, using the same sessions.
- **Pass** means `document.documentElement.scrollWidth <= clientWidth` and no element sticks out past the viewport. The only exception is content inside a deliberate horizontal scroller (`overflow-x-auto`), which rule 5 allows for tables.
- **Desktop has no regressions.** Every failure at 768/1280 after the fixes also fails in the baseline, with the same cause. Three baseline desktop failures now pass.
- **Your phone report is fixed.** The baseline reproduced it exactly: the J-0020 dialog content ran to 540px at every width. After the fixes the dialog is full-screen and covers the job list, all 4 stepper steps are visible at 320, the header has one left edge, and Value and Origin wrap in full. The RAMS editor's section cards, PPM "Add" row and bottom content all fit.

### Re-run of the dialogs that were "not reached"

Each was run on its own, not in parallel. The earlier timeouts were the scripted click failing under parallel browser load, not a layout problem.

| Dialog | 390 | 430 |
|---|---|---|
| RAMS editor (J-0020) | pass | pass |
| Quote view | pass | pass (also 320, 375) |
| Create invoice | pass | pass |

The same three at 1280 also pass. At 768 they fail only on the pre-existing Header overflow on the page behind the dialog (see below).

## Flag only: Value field, no change made

The Value field reads **"£491.25 — £290.00 approved"**. The word "approved" was always there; it was being cut off on the right. `formatJobValue` in `src/lib/jobValue.ts` builds it for an engagement job whose work order has no PO:

- **£491.25**: the total of the work order's cost lines, excluding rejected lines.
- **£290.00 approved**: the part of that total that has been approved.

The wording is your call.

## Pre-existing, out of scope (fail in the baseline too, not changed)

| Failure | Where | Root cause |
|---|---|---|
| Logged-in Header right cluster overflows by 4–5px | 768 only: every contractor route (34) and personal route (9), plus 4 dialogs at 768 whose page behind has the same Header | `Header.tsx` line 127, `div.hidden.md:flex.items-center.gap-3` (notification count, avatar, name). At `md` the desktop nav and this cluster don't fit in the main column beside the 220px sidebar. |
| Canvas editor "Save section" bar extends past the viewport | `view=canvas-editor` at 768 and 1280 | Profile editor's section action bar (`CanvasEditor.tsx`) |
| Finance tabs list too wide | `view=finance-settings` at 768 | The `TabsList` (Dashboard, Expenses, Mileage, P&L, VAT, Profitability, …) is a single non-wrapping row |
| "More" / "Open menu" not reached | 768 and 1280 | By design: these are mobile-only controls. Not a failure. |

The admin dashboard (`/admin`) was not audited: there is no admin session. One admin fixed width was capped anyway (see files).

## Lint and build

- `npx tsc --noEmit -p tsconfig.app.json`: passes.
- `npm run build`: passes.
- `npm run lint`: **1002 errors repo-wide before this work, all pre-existing, none added.** Each changed file was linted against its pre-change copy: 86 errors before, 86 after.

## Incident: audit wrote to the test personal account

An early version of the dialog opener clicked **"Query"** on the personal invoices page. That button calls `respond_to_invoice` on click, so invoice **INV-4AE203-0004** (personal test account) went from **stalled** (set 7 Oct) to **queried** at 09:47 UTC on 18 Oct. Later clicks, the last at 16:28 UTC, re-ran it. Each click also called `notify-invoice-quote-action`, which emails the contractor and the customer on every call. The message dialog was never submitted. I made no DB write to revert it.

The opener has been removed. The scripts are now read-only by construction:
- `routes.mjs` holds a click **allowlist** (`SAFE_OPENERS`, each entry checked in source). All clicks go through `safeClick()`, which refuses anything not listed.
- `audit.mjs` blocks every non-GET/HEAD request to Supabase and every non-GET request to Stripe, with three exceptions on Supabase:
  - RPCs whose every live overload is declared STABLE or IMMUTABLE in `supabase/migrations` (worked out by `rpcVolatility.mjs`); `log_search_appearance` is always blocked
  - storage signed-URL requests
  - auth token refresh

  Edge functions get nothing but GET. Stripe telemetry beacons (`r.stripe.com`, `m.stripe.com`) are aborted silently. Any other blocked request is recorded in `blocked.json` and makes the run exit non-zero.
- **Expected blocks.** Four known on-load requests are on `EXPECTED_BLOCKS` in `audit.mjs`:
  - `POST /rest/v1/rpc/log_search_appearance`
  - `POST /functions/v1/create-payment-intent`
  - `POST /rest/v1/rpc/get_contractor_availability`
  - `POST /rest/v1/rpc/check_contractor_compliance`

  They are still aborted, but they are recorded as `expected-block` (on the request in `blocked.json` and on the row in `results.json`) and do not fail the run. A row whose only blocks are expected ones is `expected-block` if its layout passes and `fail` if it doesn't; any unexpected block makes the row `blocked-write`. The two RPCs come off the list once a migration marks them STABLE (see "Read RPCs declared VOLATILE" below).

## Guarded run, 375 only (19 Oct, fresh sessions)

| | Count |
|---|---|
| Targets reached | 109 of 109 (97 routes, 12 dialogs) |
| Pass on layout | 109 |
| Rows with no blocked request | 103 |
| Rows with a blocked request (`blocked-write`) | 6 |
| Not reached | 0 |
| Blocked requests | 10 |

The run exits non-zero because of the 10 blocked requests. That is the intended loud failure.

**Allowed through:**
- 12 STABLE RPCs, e.g. `enquiry_has_multiple_recipients` (800 calls, about 20 per contractor page) and `project_money`
- 2 storage signed-URL requests
- no auth refreshes were needed

628 Stripe telemetry beacons were aborted silently.

**Blocked, by row:**

| Request | Rows | Kind |
|---|---|---|
| `rpc/log_search_appearance` | public `/contractors`, personal `view=hire` | Genuine write: adds to `search_appearance_daily` for each listed contractor |
| `functions/v1/create-payment-intent` | public `/pay/<dummy id>` | Write path: the pay page calls it on load. With the dummy invoice ID it stops at "Invoice not found" before reaching Stripe. |
| `rpc/get_contractor_availability` | `/contractors`, `/contractor/TS-C-4AE203`, public Contact dialog, personal `view=hire` | Read, declared VOLATILE (see below) |
| `rpc/check_contractor_compliance` | `/contractor/TS-C-4AE203`, public Contact dialog, contractor `view=verification` | Read, declared VOLATILE (see below) |

Because these two reads are blocked, the availability and compliance blocks on those pages render without their data. Their layout was measured in that state.

## Read RPCs declared VOLATILE (candidates to mark STABLE)

Pages call these on load, and they are blocked only because no volatility is declared, so Postgres treats them as VOLATILE. Going by their migration text, neither body contains INSERT, UPDATE, DELETE or PERFORM. Live definitions could differ (check `pg_proc.provolatile` before changing anything). No function was changed.

| RPC | Latest definition | Called from |
|---|---|---|
| `get_contractor_availability(uuid, date, date)` | `20260727130000_contractor_working_patterns_and_absences.sql` (plpgsql, SECURITY DEFINER, no volatility keyword) | Contractor directory, public profile, enquiry dialog, personal hire view |
| `check_contractor_compliance(uuid)` | `20260730120000_compliance_gate_function.sql` (plpgsql, SECURITY DEFINER, no volatility keyword) | Public profile, enquiry dialog, contractor Verification |

## Still open (not layout failures)

- **Inputs under 16px (rule 10, iOS zoom on focus)**, on 3 routes. All are hand-styled inputs that don't use the shared `Input`:
  - `/admin/login` (2)
  - `view=business-card-editor` (5)
  - business `view=groups` (1)

  Down from 7 routes before.
- **Not automatable here:** the iOS safe areas and how the bottom nav sits over the home indicator need a check on a real iPhone. The code uses `env(safe-area-inset-*)` with `viewport-fit=cover`.
- **Logic changes needed:** none.

## What changed and why

### Shared primitives (Phase 2)

- **`ui/dialog.tsx`**
  - The root cause of the J-0020 overflow: `DialogContent` is `display:grid` with an implicit `auto` column, which grows to fit long unbreakable mono text. It now uses `grid-cols-[minmax(0,1fr)]`.
  - Below `sm` the dialog is full-screen: `100dvh`, scrolls itself, covers the page and the bottom nav, `px-4`, padding for the safe areas.
  - The close button is 44px on mobile.
  - `DialogHeader` is always left-aligned (it was `text-center` on mobile, which caused the header misalignment you saw) and has `pr-8` so it clears the close button.
  - `DialogFooter` gets a gap between stacked buttons.
- **`ui/sheet.tsx`**
  - The right-side sheet is full width below `sm`, `100dvh`, scrolls itself, and has safe-area padding.
  - Header left-aligned, 44px close button.
  - Callers that pass `p-0` keep their own padding.
- **`ui/alert-dialog.tsx`**: a bottom sheet below `sm` (scrolls itself, safe-area padding), with the same grid-track fix and a left-aligned header.
- **`ui/drawer.tsx`**: `max-h-[100dvh]`, scrolls itself, safe-area bottom padding.
- **`ui/button.tsx`**
  - Below `sm`, buttons wrap their text and are at least 44px tall. Long labels such as "Declined — reassign or find another contractor" and "Approve and amend PO-…" were overflowing.
  - The `link` variant keeps its natural height.
  - Icon buttons are at least 44px wide.
- **`ui/input.tsx`, `ui/select.tsx`, `ui/textarea.tsx`**
  - Added `min-w-0`. An input's intrinsic minimum width is what pushed buttons in input + button rows off-screen, including RAMS "Add custom PPE item".
  - Select and Textarea now use 16px text below `md` (Input already did).
- **`ui/table.tsx`**: the wrapper is now an explicit `overflow-x-auto`.

### Layout shells

- **`index.html`**: added `viewport-fit=cover`.
- **`ContractorLayout.tsx`, `layout/HomeownerLayout.tsx`**
  - The bottom tab bar's height now includes the safe-area inset, and the content's bottom padding clears it (`72px + inset`).
  - `100vh` became `100dvh`.
  - 16px mobile gutter and 44px header buttons.
  - The contractor title wraps.
- **`layout/BusinessLayout.tsx`**: same `100dvh`, gutter and 44px changes, plus safe-area bottom padding on `main`.
- **`OnboardingTour.tsx`**: the tooltip was 340px wide, wider than a 320px screen. Its width is capped to the viewport; the JS clamps its position using the measured width, so no logic change was needed.
- **`help/HelpModal.tsx`**: the 360px panel gets `maxWidth: 100vw`.

### Job detail, stepper, RAMS (Phase 3, reported issues)

- **`JobStageStrip.tsx`**: smaller circles and labels below `sm`, and connectors that can shrink, so all 4 steps fit at 320.
- **`management/rams/RamsEditor.tsx`**
  - The `<fieldset>` around the sections gets `min-w-0`. A fieldset defaults to a min-content width, so it refused to shrink.
  - Hazard and method-step bodies get `min-w-0`.
  - The risk selects stack below `sm`.
  - The PPE "Add" row and the "Save as My Template" row wrap.
- **`shared/AddressInput.tsx`**: region and postcode stack below `sm`.
- **`shared/RecordCard.tsx`**: the full-density key/value fields stack below `sm` and wrap.
- **`management/ClientJobsView.tsx`**: the job card and job detail header rows wrap, as do the mono reference lines.
- **`management/JobManagement.tsx`** (shared file):
  - the reference line wraps
  - the location wraps
  - the info grid is one column below `sm`
  - Value and Origin wrap
  - the footer action row wraps

### Custom sheets

`EnquiryDetailSheet.tsx`, `thread/EngagementThread.tsx` and `BusinessPrequalView.tsx`: the body padding goes from `p-6` to `px-4 sm:p-6`, so it lines up with the 16px navy back bar.

### Tables

- `VariationApproval.tsx`: `overflow-hidden` became `overflow-x-auto`. The old class silently clipped a wide money column.
- `thread/ThreadQuoteSection.tsx` and `recipient/QuoteBreakdownSummary.tsx`: each table is wrapped in its own `overflow-x-auto`.
- `BusinessSpendView.tsx` (shared file): same wrapping.

### Form and info grids (rule 4)

In 30 files, `grid grid-cols-2|3` became `grid grid-cols-1 sm:grid-cols-2|3`. These are form-field pairs, key/value `dl`s and 3-up stat cards. Those files contain no other change.

Deliberately left as they are:
- segmented controls and Yes/No pairs
- tab lists
- thumbnail grids
- the purpose-built 4-up enquiry stats

### Page-specific rows

- **`financials/FinanceDashboard.tsx`**: the transaction rows wrap, and the amount stays on one line.
- **`ServiceCategoryManager.tsx`**, **`SiteContactManager.tsx`**, **`PpmComplianceDashboard.tsx`**: their header or action rows wrap.
- **`BusinessTeamView.tsx`**: the member row (approval limit, coverage, Edit/Remove) wraps, and the gutter is 16px on mobile.
- **`BusinessCardEditor.tsx`**: the controls and previews stack below `sm`, the 300px canvases scale down, and the download buttons wrap.
- **`TeamManagement.tsx`**: the filter chips and "Add team member" row wrap, and the form grids stack.
- **`AdminDashboard.tsx`** (shared file): the side panel's `minWidth` is `min(380px, 100vw)`.

### Audit tooling

- `scripts/mobile-audit/routes.mjs`: route inventory and dialog openers.
- `login.mjs`: headed manual sign-in that saves the session to `.auth/`. No credentials in code.
- `audit.mjs`: screenshots, the overflow check and offenders. Flags: `--only=`, `--desktop`, `--desktop-only`, `--dialogs-only`, `--dialog=`, `--widths=`.
- `report.mjs`: builds the tables below.
- `.gitignore`: ignores `.auth/`, `before/` and `after/`.
- Playwright 1.48.2 added as a devDependency.

To re-run:

```
node scripts/mobile-audit/login.mjs                  # sign in, once per session expiry
node scripts/mobile-audit/audit.mjs after --desktop
node scripts/mobile-audit/report.mjs
```

The pre-fix snapshot lives at `C:\Users\richa\tradestone-mobile-baseline`, outside the repo. Serve it with `npx vite` (port 8081), then run with `AUDIT_BASE_URL=http://localhost:8081`. Delete it when you're done.

## Per-route results

Screenshots are in `before/` and `after/`, named `<account>/<route>@<width>.png`.

| Account | Route | Before (320/375/390/430) | Before offenders | After | After offenders |
|---|---|---|---|---|---|
| public | `/` | pass |  | pass |  |
| public | `/contractors` | pass |  | pass |  |
| public | `/contracts` | pass |  | pass |  |
| public | `/how-it-works` | pass |  | pass |  |
| public | `/contractor/TS-C-4AE203` | pass |  | pass |  |
| public | `/marketplace` | pass |  | pass |  |
| public | `/marketplace/materials` | pass |  | pass |  |
| public | `/marketplace/equipment` | pass |  | pass |  |
| public | `/marketplace/tools` | pass |  | pass |  |
| public | `/marketplace/item/00000000-0000-0000-0000-000000000000` | pass |  | pass |  |
| public | `/auth` | pass |  | pass |  |
| public | `/login` | pass |  | pass |  |
| public | `/terms` | pass |  | pass |  |
| public | `/privacy` | pass |  | pass |  |
| public | `/cookies` | pass |  | pass |  |
| public | `/about` | pass |  | pass |  |
| public | `/pay/00000000-0000-0000-0000-000000000000` | pass |  | pass |  |
| public | `/reset-password` | pass |  | pass |  |
| public | `/invite` | pass |  | pass |  |
| public | `/admin/login` | pass |  | pass |  |
| public | `/this-route-does-not-exist` | pass |  | pass |  |
| contractor | `/dashboard/contractor?view=dashboard` | 320:fail | div.fixed.z-[10000].w-[340px].bg-card.border.border-border "WELCOME TO YOUR DASHBOARD! This is your command ce<br>div.hidden.md:flex.items-center.gap-3 "16 Richard Bowes" | pass |  |
| contractor | `/dashboard/contractor?view=enquiries` | 320:fail | div.fixed.z-[10000].w-[340px].bg-card.border.border-border "WELCOME TO YOUR DASHBOARD! This is your command ce<br>div.hidden.md:flex.items-center.gap-3 "16 Richard Bowes" | pass | div.hidden.md:flex.items-center.gap-3 "16 Richard Bowes" |
| contractor | `/dashboard/contractor?view=issued-quotes` | 320:fail | div.fixed.z-[10000].w-[340px].bg-card.border.border-border "WELCOME TO YOUR DASHBOARD! This is your command ce<br>div.hidden.md:flex.items-center.gap-3 "16 Richard Bowes" | pass | div.hidden.md:flex.items-center.gap-3 "16 Richard Bowes" |
| contractor | `/dashboard/contractor?view=jobs` | 320:fail | div.fixed.z-[10000].w-[340px].bg-card.border.border-border "WELCOME TO YOUR DASHBOARD! This is your command ce<br>div.hidden.md:flex.items-center.gap-3 "16 Richard Bowes" | pass | div.hidden.md:flex.items-center.gap-3 "16 Richard Bowes" |
| contractor | `/dashboard/contractor?view=projects` | 320:fail | div.fixed.z-[10000].w-[340px].bg-card.border.border-border "WELCOME TO YOUR DASHBOARD! This is your command ce<br>div.hidden.md:flex.items-center.gap-3 "16 Richard Bowes" | pass | div.hidden.md:flex.items-center.gap-3 "16 Richard Bowes" |
| contractor | `/dashboard/contractor?view=work-orders` | 320:fail | div.fixed.z-[10000].w-[340px].bg-card.border.border-border "WELCOME TO YOUR DASHBOARD! This is your command ce<br>div.hidden.md:flex.items-center.gap-3 "16 Richard Bowes" | pass | div.hidden.md:flex.items-center.gap-3 "16 Richard Bowes" |
| contractor | `/dashboard/contractor?view=engagements` | pass | div.hidden.md:flex.items-center.gap-3 "16 Richard Bowes" | pass | div.hidden.md:flex.items-center.gap-3 "16 Richard Bowes" |
| contractor | `/dashboard/contractor?view=messages` | 320:fail | div.fixed.z-[10000].w-[340px].bg-card.border.border-border "WELCOME TO YOUR DASHBOARD! This is your command ce<br>div.hidden.md:flex.items-center.gap-3 "16 Richard Bowes" | pass | div.hidden.md:flex.items-center.gap-3 "16 Richard Bowes" |
| contractor | `/dashboard/contractor?view=rams-templates` | 320:fail | div.fixed.z-[10000].w-[340px].bg-card.border.border-border "WELCOME TO YOUR DASHBOARD! This is your command ce<br>div.hidden.md:flex.items-center.gap-3 "16 Richard Bowes" | pass | div.hidden.md:flex.items-center.gap-3 "Richard Bowes" |
| contractor | `/dashboard/contractor?view=checklist-templates` | pass | div.hidden.md:flex.items-center.gap-3 "16 Richard Bowes" | pass | div.hidden.md:flex.items-center.gap-3 "16 Richard Bowes" |
| contractor | `/dashboard/contractor?view=schedule` | 320:fail | div.fixed.z-[10000].w-[340px].bg-card.border.border-border "WELCOME TO YOUR DASHBOARD! This is your command ce<br>div.hidden.md:flex.items-center.gap-3 "16 Richard Bowes" | pass | div.hidden.md:flex.items-center.gap-3 "16 Richard Bowes" |
| contractor | `/dashboard/contractor?view=service-visits` | 320:fail 375:fail | div "0 Completed"<br>div.fixed.z-[10000].w-[340px].bg-card.border.border-border "WELCOME TO YOUR DASHBOARD! This is your command ce<br>div.hidden.md:flex.items-center.gap-3 "16 Richard Bowes" | pass | div.hidden.md:flex.items-center.gap-3 "16 Richard Bowes" |
| contractor | `/dashboard/contractor?view=team` | 320:fail 390:fail | div.fixed.z-[10000].w-[340px].bg-card.border.border-border "WELCOME TO YOUR DASHBOARD! This is your command ce<br>button.inline-flex.items-center.justify-center.gap-2.whitespace-nowrap.rounded-md "Add team member"<br>div.hidden.md:flex.items-center.gap-3 "16 Richard Bowes" | pass | div.hidden.md:flex.items-center.gap-3 "16 Richard Bowes" |
| contractor | `/dashboard/contractor?view=availability` | 320:fail | div.fixed.z-[10000].w-[340px].bg-card.border.border-border "WELCOME TO YOUR DASHBOARD! This is your command ce<br>div.hidden.md:flex.items-center.gap-3 "16 Richard Bowes" | pass | div.hidden.md:flex.items-center.gap-3 "16 Richard Bowes" |
| contractor | `/dashboard/contractor?view=timesheets` | 320:fail | div.fixed.z-[10000].w-[340px].bg-card.border.border-border "WELCOME TO YOUR DASHBOARD! This is your command ce<br>div.hidden.md:flex.items-center.gap-3 "16 Richard Bowes" | pass | div.hidden.md:flex.items-center.gap-3 "16 Richard Bowes" |
| contractor | `/dashboard/contractor?view=inventory` | 320:fail | div.fixed.z-[10000].w-[340px].bg-card.border.border-border "WELCOME TO YOUR DASHBOARD! This is your command ce<br>div.hidden.md:flex.items-center.gap-3 "16 Richard Bowes" | pass | div.hidden.md:flex.items-center.gap-3 "16 Richard Bowes" |
| contractor | `/dashboard/contractor?view=invoices` | 320:fail | div.fixed.z-[10000].w-[340px].bg-card.border.border-border "WELCOME TO YOUR DASHBOARD! This is your command ce<br>div.hidden.md:flex.items-center.gap-3 "16 Richard Bowes" | pass | div.hidden.md:flex.items-center.gap-3 "16 Richard Bowes" |
| contractor | `/dashboard/contractor?view=finance-settings` | 320:fail | span.text-green-600.font-medium "+£3,200.00"<br>div.fixed.z-[10000].w-[340px].bg-card.border.border-border "WELCOME TO YOUR DASHBOARD! This is your command ce<br>div.hidden.md:flex.items-center.gap-3 "16 Richard Bowes" | pass | div.hidden.md:flex.items-center.gap-3 "16 Richard Bowes"<br>div.h-10.items-center.rounded-md.bg-muted.p-1.text-muted-foreground "Dashboard Expenses Mileage P&L VAT Profit |
| contractor | `/dashboard/contractor?view=clients` | 320:fail | div.fixed.z-[10000].w-[340px].bg-card.border.border-border "WELCOME TO YOUR DASHBOARD! This is your command ce<br>div.hidden.md:flex.items-center.gap-3 "16 Richard Bowes" | pass | div.hidden.md:flex.items-center.gap-3 "16 Richard Bowes" |
| contractor | `/dashboard/contractor?view=photos` | 320:fail | div.fixed.z-[10000].w-[340px].bg-card.border.border-border "WELCOME TO YOUR DASHBOARD! This is your command ce<br>div.hidden.md:flex.items-center.gap-3 "16 Richard Bowes" | pass | div.hidden.md:flex.items-center.gap-3 "16 Richard Bowes" |
| contractor | `/dashboard/contractor?view=documents` | 320:fail | div.fixed.z-[10000].w-[340px].bg-card.border.border-border "WELCOME TO YOUR DASHBOARD! This is your command ce<br>div.hidden.md:flex.items-center.gap-3 "16 Richard Bowes" | pass | div.hidden.md:flex.items-center.gap-3 "16 Richard Bowes" |
| contractor | `/dashboard/contractor?view=canvas-editor` | 320:fail | div.fixed.z-[10000].w-[340px].bg-card.border.border-border "WELCOME TO YOUR DASHBOARD! This is your command ce<br>div "Save section"<br>div.hidden.md:flex.items-center.gap-3 "16 Richard Bowes" | pass | div.hidden.md:flex.items-center.gap-3 "16 Richard Bowes"<br>div "Save section" |
| contractor | `/dashboard/contractor?view=share-profile` | 320:fail | div.fixed.z-[10000].w-[340px].bg-card.border.border-border "WELCOME TO YOUR DASHBOARD! This is your command ce<br>div.hidden.md:flex.items-center.gap-3 "16 Richard Bowes" | pass | div.hidden.md:flex.items-center.gap-3 "16 Richard Bowes" |
| contractor | `/dashboard/contractor?view=business-card-editor` | 320:fail 375:fail 390:fail 430:fail | div "FRONT BACK Download PNG Download PDF Reset"<br>div.fixed.z-[10000].w-[340px].bg-card.border.border-border "WELCOME TO YOUR DASHBOARD! This is your command ce<br>div.hidden.md:flex.items-center.gap-3 "16 Richard Bowes" | pass | div.hidden.md:flex.items-center.gap-3 "16 Richard Bowes" |
| contractor | `/dashboard/contractor?view=verification` | 320:fail | div.fixed.z-[10000].w-[340px].bg-card.border.border-border "WELCOME TO YOUR DASHBOARD! This is your command ce<br>div.hidden.md:flex.items-center.gap-3 "16 Richard Bowes" | pass | div.hidden.md:flex.items-center.gap-3 "16 Richard Bowes" |
| contractor | `/dashboard/contractor?view=my-scores` | 320:fail | div.fixed.z-[10000].w-[340px].bg-card.border.border-border "WELCOME TO YOUR DASHBOARD! This is your command ce<br>div.hidden.md:flex.items-center.gap-3 "16 Richard Bowes" | pass | div.hidden.md:flex.items-center.gap-3 "16 Richard Bowes" |
| contractor | `/dashboard/contractor?view=tenders` | 320:fail | div.fixed.z-[10000].w-[340px].bg-card.border.border-border "WELCOME TO YOUR DASHBOARD! This is your command ce<br>div.hidden.md:flex.items-center.gap-3 "16 Richard Bowes" | pass | div.hidden.md:flex.items-center.gap-3 "16 Richard Bowes" |
| contractor | `/dashboard/contractor?view=contracts` | 320:fail | div.fixed.z-[10000].w-[340px].bg-card.border.border-border "WELCOME TO YOUR DASHBOARD! This is your command ce<br>div.hidden.md:flex.items-center.gap-3 "16 Richard Bowes" | pass | div.hidden.md:flex.items-center.gap-3 "16 Richard Bowes" |
| contractor | `/dashboard/contractor?view=panel-invites` | 320:fail | div.fixed.z-[10000].w-[340px].bg-card.border.border-border "WELCOME TO YOUR DASHBOARD! This is your command ce<br>div.hidden.md:flex.items-center.gap-3 "16 Richard Bowes" | pass | div.hidden.md:flex.items-center.gap-3 "16 Richard Bowes" |
| contractor | `/dashboard/contractor?view=panel-compliance` | 320:fail | div.fixed.z-[10000].w-[340px].bg-card.border.border-border "WELCOME TO YOUR DASHBOARD! This is your command ce<br>div.hidden.md:flex.items-center.gap-3 "Richard Bowes" | pass | div.hidden.md:flex.items-center.gap-3 "16 Richard Bowes" |
| contractor | `/dashboard/contractor?view=ppm-visits` | 320:fail 375:fail | div "0 Completed"<br>div.fixed.z-[10000].w-[340px].bg-card.border.border-border "WELCOME TO YOUR DASHBOARD! This is your command ce<br>div.hidden.md:flex.items-center.gap-3 "16 Richard Bowes" | pass | div.hidden.md:flex.items-center.gap-3 "16 Richard Bowes" |
| contractor | `/dashboard/contractor?view=profile` | 320:fail | div.fixed.z-[10000].w-[340px].bg-card.border.border-border "WELCOME TO YOUR DASHBOARD! This is your command ce<br>div.hidden.md:flex.items-center.gap-3 "16 Richard Bowes" | pass | div.hidden.md:flex.items-center.gap-3 "Richard Bowes" |
| contractor | `/dashboard/contractor?view=settings` | pass | div.hidden.md:flex.items-center.gap-3 "16 Richard Bowes" | pass | div.hidden.md:flex.items-center.gap-3 "16 Richard Bowes" |
| contractor | `/kpi-insights` | pass | div.hidden.md:flex.items-center.gap-3 "16 Richard Bowes" | pass | div.hidden.md:flex.items-center.gap-3 "16 Richard Bowes" |
| contractor | `/business` | pass |  | pass |  |
| contractor | `/notifications` | pass |  | pass |  |
| contractor | `/onboarding/contractor` | pass |  | pass |  |
| contractor | `/field` | 320:fail | div.fixed.z-[10000].w-[340px].bg-card.border.border-border "WELCOME TO YOUR DASHBOARD! This is your command ce<br>div.hidden.md:flex.items-center.gap-3 "16 Richard Bowes" | pass | div.hidden.md:flex.items-center.gap-3 "16 Richard Bowes" |
| contractor | `/site-portal` | pass |  | pass |  |
| business | `/dashboard/business?view=dashboard` | 320:fail | button.inline-flex.items-center.justify-center.gap-2.whitespace-nowrap.text-sm "Declined — reassign or find an | pass |  |
| business | `/dashboard/business?view=jobs` | pass |  | pass |  |
| business | `/dashboard/business?view=projects` | pass |  | pass |  |
| business | `/dashboard/business?view=work-orders` | pass | table.w-full.caption-bottom.text-sm "WO # Site Title Priority Approved value Dispatched To Status" | pass |  |
| business | `/dashboard/business?view=service-requests` | pass |  | pass |  |
| business | `/dashboard/business?view=requests` | pass |  | pass |  |
| business | `/dashboard/business?view=approvals` | pass |  | pass |  |
| business | `/dashboard/business?view=tenders` | pass |  | pass |  |
| business | `/dashboard/business?view=tender-form` | pass |  | pass |  |
| business | `/dashboard/business?view=sites` | pass |  | pass |  |
| business | `/dashboard/business?view=assets` | pass |  | pass |  |
| business | `/dashboard/business?view=groups` | pass |  | pass |  |
| business | `/dashboard/business?view=ppm-compliance` | 320:fail 375:fail 390:fail 430:fail | table.w-full.caption-bottom.text-sm "Site Total Completed Overdue Compliance HQ 1 0 1 0%"<br>table.w-full.caption-bottom.text-sm "Asset Site Contractor Due Date Days Overdue Actions Fire Ala" | pass |  |
| business | `/dashboard/business?view=site-autonomy` | 320:fail | table.w-full.caption-bottom.text-sm "Site Level Spend limit Override HQ Level 1 — Default" | pass |  |
| business | `/dashboard/business?view=service-categories` | 320:fail | div.rounded-lg.border.bg-card.text-card-foreground.shadow-sm "Plumbing Emergancy Plumbing · Default priority:  | pass |  |
| business | `/dashboard/business?view=site-contacts` | 320:fail | div.flex.gap-2 "All sites Invite Contact" | pass |  |
| business | `/dashboard/business?view=panel` | pass |  | pass |  |
| business | `/dashboard/business?view=invoices` | pass |  | pass |  |
| business | `/dashboard/business?view=billing` | pass |  | pass |  |
| business | `/dashboard/business?view=spend` | pass |  | pass |  |
| business | `/dashboard/business?view=messages` | pass |  | pass |  |
| business | `/dashboard/business?view=team` | 320:fail 375:fail 390:fail 430:fail | div.flex.items-center.gap-2.shrink-0 "Approval limit £500.00 Set limit National Edit Remove" | pass |  |
| business | `/dashboard/business?view=settings` | pass |  | pass |  |
| business | `/dashboard/business/settings` | pass |  | pass |  |
| business | `/notifications` | pass |  | pass |  |
| business | `/site-portal` | pass |  | pass |  |
| personal | `/dashboard/homeowner?view=dashboard` | pass | div.hidden.md:flex.items-center.gap-3 "11 TC Test Customer" | pass | div.hidden.md:flex.items-center.gap-3 "11 TC Test Customer" |
| personal | `/dashboard/homeowner?view=projects` | pass | div.hidden.md:flex.items-center.gap-3 "11 TC Test Customer" | pass | div.hidden.md:flex.items-center.gap-3 "11 TC Test Customer" |
| personal | `/dashboard/homeowner?view=jobs` | 320:fail 375:fail | div.rounded-lg.border.bg-card.text-card-foreground.shadow-sm.cursor-pointer "TEST CUSTOMER — TEST.3 J-4AE203-0<br>div.rounded-lg.border.bg-card.text-card-foreground.shadow-sm.cursor-pointer "TEST 25/07 J-4AE203-0014 · from q<br>div.rounded-lg.border.bg-card.text-card-foreground.shadow-sm.cursor-pointer "TEST 2 18/07 J-4AE203-0013 · from | pass | div.hidden.md:flex.items-center.gap-3 "11 TC Test Customer" |
| personal | `/dashboard/homeowner?view=quotes` | pass | div.hidden.md:flex.items-center.gap-3 "11 TC Test Customer" | pass | div.hidden.md:flex.items-center.gap-3 "11 TC Test Customer" |
| personal | `/dashboard/homeowner?view=enquiries` | pass | div.hidden.md:flex.items-center.gap-3 "11 TC Test Customer" | pass | div.hidden.md:flex.items-center.gap-3 "11 TC Test Customer" |
| personal | `/dashboard/homeowner?view=hire` | pass | div.hidden.md:flex.items-center.gap-3 "11 TC Test Customer" | pass | div.hidden.md:flex.items-center.gap-3 "11 TC Test Customer" |
| personal | `/dashboard/homeowner?view=invoices` | pass | div.hidden.md:flex.items-center.gap-3 "11 TC Test Customer" | pass | div.hidden.md:flex.items-center.gap-3 "11 TC Test Customer" |
| personal | `/dashboard/homeowner?view=messages` | pass | div.hidden.md:flex.items-center.gap-3 "11 TC Test Customer" | pass | div.hidden.md:flex.items-center.gap-3 "11 TC Test Customer" |
| personal | `/dashboard/homeowner?view=settings` | pass | div.hidden.md:flex.items-center.gap-3 "11 TC Test Customer" | pass | div.hidden.md:flex.items-center.gap-3 "11 TC Test Customer" |
| personal | `/notifications` | pass |  | pass |  |
| public | `dialog:public-contact` | pass |  | pass |  |
| contractor | `dialog:contractor-job-detail` | 320:fail 375:fail 390:fail 430:fail | div.flex.flex-col.space-y-1.5.text-center.sm:text-left "J-0020 TEST 4 Test Business TS-B-57B38C Scheduled"<br>div.space-y-5 "Job Scheduled Work Started Final Checks Job Complete Time lo" | pass |  |
| contractor | `dialog:contractor-job-rams-editor` | 320:fail 375:fail 390:fail 430:fail | div.flex.flex-col.space-y-1.5.text-center.sm:text-left "J-0020 TEST 4 Test Business TS-B-57B38C Scheduled"<br>div.space-y-5 "Job Scheduled Work Started Final Checks Job Complete Time lo" | pass |  |
| contractor | `dialog:contractor-quote-view` | 320:fail | div.flex.flex-col.space-y-1.5.text-center.sm:text-left "Q-0020 04/08 Awaiting deposit — client to pay"<br>div.space-y-5.mt-2 "Client Test Business Description Qty Unit Total Test 1 £10.0" | pass |  |
| contractor | `dialog:contractor-create-invoice` | pass |  | pass |  |
| contractor | `dialog:contractor-more-menu` | 320:not-reached 375:not-reached 390:not-reached 430:not-reached |  | pass |  |
| business | `dialog:business-job-detail` | pass |  | pass |  |
| business | `dialog:business-add-site` | pass |  | pass |  |
| business | `dialog:business-add-asset` | pass |  | pass |  |
| business | `dialog:business-invite-contractor` | pass |  | pass |  |
| business | `dialog:business-new-request` | 320:not-reached 375:not-reached 390:not-reached 430:not-reached |  | pass |  |
| business | `dialog:business-open-menu` | 320:fail | button.inline-flex.items-center.justify-center.gap-2.whitespace-nowrap.text-sm "Declined — reassign or find an | pass |  |
| personal | `dialog:personal-invoice-query` | pass |  | pass |  |
| contractor | `/dashboard/contractor?view=dashboard#audit-tour` | – | div.hidden.md:flex.items-center.gap-3 "16 Richard Bowes" | pass | div.hidden.md:flex.items-center.gap-3 "16 Richard Bowes" |
