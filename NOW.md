# NOW.md

**Last reviewed: 2026-08-06**

The only authorised work until end-to-end validation is closed.

Everything in this file stands between TradeStone and a real contractor
plus a real B2B client walking the full loop on production:
Enquiry → Quote → Job → In Progress → Sign-off → Invoice → Payment.

Parked ideas live in `LATER.md`. If an item is in `LATER.md` and it turns
out to block validation, move it here — don't build it in place.

---

## Working rules

1. Blocking items first, in the order listed. Small fixes and data
   integrity can be batched; housekeeping last.
2. Step-0 schema audit before any schema change:
   `information_schema.columns` + `pg_policies` output pasted from the
   live DB, never described, never reconstructed from code or memory.
3. Migrations are immutable. New timestamped file only, via
   `npx supabase db push`. Never the dashboard SQL editor.
4. `npx tsc --noEmit -p tsconfig.app.json` before any commit.
5. Browser verification before commit. Claude Code stops and waits for
   confirmation — it does not commit UI work unprompted.
6. Surgical git staging, explicit file paths only. Never `git add -A`.
7. Items are deleted from this file when closed, not annotated as done.

---

## BLOCKING VALIDATION

### Mobile quote acceptance missing
**Priority: highest. Blocks end-to-end validation.**

There is no way to accept a quote from the mobile homeowner view. Desktop
shows Accept / Reject / Stall plus the date-picker modal; mobile has neither.

Why this is first: accepting a quote is the only conversion event in the
funnel, and homeowners are predominantly mobile. A validation run that
requires the client to find a laptop is not a validation run.

Step-0 required: audit `ReceivedQuotes` / homeowner quotes route for the
responsive branch — establish whether the actions are hidden by CSS, dropped
from a mobile component, or the modal simply doesn't fit. Fix differs per case.

Files: homeowner quotes page, `useReceivedQuotes.ts`, accept modal component.

### Money tiles not reading `invoiceMoney.ts`
**Priority: high. Contractor-facing wrong numbers.**

Commit `721d183` added `src/lib/invoiceMoney.ts` and reportedly rewired nine
files, but as of last browser check the tiles read:

| Surface | Reads | Should read |
|---|---|---|
| Dashboard "Invoices" | £27, 2 pending | £9, 1 overdue |
| Invoices "Pending" | £27 | £9 |
| Invoices "Overdue" | £0.00 | £9 |
| Finance "Outstanding" | £12 | £9 |
| KPI "Outstanding" | £12 | £9 |

Every movement from the pre-migration values is explained by the
`pending → sent` backfill alone, so no tile appears to call the helper.
Table badges also render the `draft` invoice as Overdue, which `displayStatus()`
would not do.

Unresolved: whether the Vercel deploy of `721d183` actually landed. Check
Deployments before assuming the wiring is wrong.

Verify with:
`Select-String -Path .\src\hooks\useInvoices.ts,.\src\pages\ContractorDashboard.tsx,.\src\pages\ContractorKPIInsights.tsx -Pattern "summariseInvoices|amountOutstanding|isOutstanding"`

### `accept-quote` deposit path untested in production
**Priority: high.**

The invoice insert fixed in `accept-quote` sits inside the deposit branch.
Q-4AE203-0018 was accepted with no deposit, so the branch never ran and the
fix remains unproven. It will fire for the first time on a real
deposit-required acceptance.

Close by: issuing one quote with deposit required, accepting as Test Customer,
confirming a new `invoices` row lands with `status = 'sent'`.

---

## SMALL FIXES — DO BEFORE FIRST REAL CONTRACTOR

### `TransactionFeeNotice.tsx` states 3.5%, platform charges 5%
One hardcoded string, `src/components/TransactionFeeNotice.tsx:13`. Both edge
functions (`accept-quote:28`, `create-payment-intent:8`) use
`PLATFORM_FEE_PERCENT = 0.05`. A contractor who reads 3.5% and is charged 5%
has a legitimate complaint. One-line fix.

Sweep for the same stale figure elsewhere while in there:
`Select-String -Path src\**\*.ts,src\**\*.tsx,supabase\functions\**\*.ts -Pattern "3\.5%|0\.035"`

### Zero-day payment terms
`accept-quote` writes `due_date: new Date().toISOString().slice(0, 10)` — every
invoice raised by quote acceptance is due the day it is issued, and reads as
overdue the following morning. Makes "overdue" meaningless as a signal.

Fix: payment terms from `finance_settings`, defaulting to 14 or 30 days.
Step-0 required: confirm whether `finance_settings` already has a terms column.

Note: payment reliability warnings (`LATER.md`) depend on this being right —
flagging clients as late payers off a same-day due date would be defamatory
nonsense.

### `tax_amount: 0` hardcoded on invoice creation
`accept-quote` sets `subtotal: Number(quote.total)` and `tax_amount: 0`
regardless of the quote's VAT. On a £100 + £20 VAT quote the invoice records
£120 total with zero tax. Harmless while not VAT-registered; wrong the moment
the VAT position page has real data to report.

### Contractor sidebar "Projects" tab is a mislabeled jobs re-slice
Not the real Projects feature (unbuilt — see `LATER.md`). Rename or remove
before the first real contractor onboarding, to avoid setting an expectation
the platform doesn't meet.

Related: top-bar public nav exposes `/projects` and `/contracts`. Confirm
these are not half-built routes visible to real visitors.

### Send-quote modal identifies the recipient by TS code only
Modal header reads "Create a quote for TS-B-57B38C" with no client name or
address. Two quotes were sent to the wrong account during testing for exactly
this reason. The enquiry detail panel shows the name; the send modal drops it.

### Stripe Connect `charges_enabled` tracking
`StripeConnect.tsx`'s status badge is derived purely from whether
`profiles.stripe_account_id` is non-null, never from Stripe's live
`charges_enabled` / `details_submitted` — a contractor who abandons onboarding
immediately after clicking Connect still sees a green "Connected"/"Active"
card. That misfires on the first real contractor.

Fix: `account.updated` webhook branch in `stripe-webhook/index.ts` writing
`charges_enabled` / `payouts_enabled` columns (need adding to `profiles`);
`StripeConnect.tsx` reads those instead of presence-of-id alone.

### `stripe-webhook` has no handler for payment-failure events
Only `checkout.session.completed` and `payment_intent.succeeded` are handled;
`payment_intent.payment_failed` / `checkout.session.expired` fall through to a
generic 200 ack with no processing and no user-facing follow-up — an invoice
stuck at "sent" forever with no signal to the client that their card was
declined.

### Watcher nudge dedup
Both the compliance watcher and the expiry radar (tendering chunks 6/7)
re-send the same nudge notification on every scheduled run for as long as the
underlying condition holds — no "already nudged" log or last-nudged timestamp
exists. Needs a sent-log table or a `last_nudged_at`-style stamp before this
goes in front of a real user. Flagged in both migrations
(`20260711130000_term_engagements_and_watchers.sql`,
`20260712120000_expiry_radar_and_retender.sql`).

### Audit the homeowner-visible job Team tab against contact-suppression
Verify it doesn't leak contractor contact details that the rest of the
platform deliberately keeps behind `public_pro_profiles` / messaging.
Comms invariant: no phone numbers or email addresses on platform-generated
documents or contractor-facing views.

### `BusinessManagement.tsx` renders hardcoded fake data
Line 54: `"Pending Invoices", value: "£3,200", change: "5 invoices"`.
Line 288: literal `£3,200` / `5 overdue invoices` in JSX. Nothing behind either.

This is live in production. Hide the page or build it — leaving invented
financial figures on a business-facing screen is the worst of the three
options, and the fastest way to lose a B2B prospect in a demo.

---

## DATA INTEGRITY — DEAD COLUMNS AND MISSING CONSTRAINTS

### Status vocabularies have no CHECK constraints
`invoices` now has `invoices_status_valid`. Nothing else audited does.
`issued_quotes` holds five values in production (`accepted`, `expired`,
`superseded`, `draft`, `lapsed`) with no constraint. `jobs` never audited.

This is the exact condition that produced the invoice bug: free-text status,
multiple writers, no enforcement, five screens disagreeing.

Step-0 required per table before adding any constraint — and check every
writer, including edge functions and crons. The `mark-overdue-invoices` cron
was writing an invalid value and would have 500'd nightly.

```sql
-- DO NOT RUN — Step-0 report only
SELECT c.relname, con.conname, pg_get_constraintdef(con.oid)
FROM pg_constraint con
JOIN pg_class c ON c.oid = con.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND con.contype = 'c'
ORDER BY c.relname;
```

Also open: are `superseded`, `lapsed` and `expired` all still written, or is
one a legacy value like `pending` was?

### Dead columns on `invoices`
Three columns exist and are never written by anything:

- `amount_due` — NULL on every row. Either populate as a generated column
  (`total - COALESCE(deposit_deducted, 0)`) or drop it.
- `deposit_deducted` — NULL on every row. `stripe-webhook:262` flips
  `deposit_paid` but records no amount, so the invoice never stores what was
  actually collected. Correct home for that number.
- `contractor_id` — has no foreign key, unlike every other relation on the
  table.

`invoiceMoney.ts` currently falls back to `deposit_amount` because
`deposit_deducted` is dead. Once the webhook writes it, the fallback can go.

### `payments.contractor_payout` never populated
NULL on the only payment row. Nothing records what the contractor actually
received after the platform fee.

### Unexplained platform fee: £0.11 on a £3.00 deposit
5% of £3.00 is £0.15; the recorded fee is £0.11, which back-solves to a £2.20
base. `stripe-webhook:195` writes the value straight from
`application_fee_amount`, so Stripe was genuinely told to take 11p.

Either the payment predates the 0.05 constant, or `payments.amount` does not
match what was charged. The second would be serious — check the PaymentIntent
in Stripe for `acct_1TnLKCK6BjgGpUY4` around 18 Jul 10:04.

### Invoice number sequence has gaps
INV-0004 → INV-0009 with 5–8 unused. `contractor_counters` advances on paths
that don't always produce an invoice. HMRC expects sequential invoice
numbering and an accountant will query gaps.

Step-0 required: identify every caller of the counter and whether the
increment happens before or after a guaranteed insert.

---

## HOUSEKEEPING

### Migration timestamps run ahead of the wall clock
Migrations dated `20260805`–`20260807` were applied on 4 Aug. Any new migration
written today sorts *behind* applied history and is rejected by `db push`
without `--include-all`. Will recur on every new migration until the drift is
resolved.

Separately, eight migrations carry invalid timestamps —
`20260730240000` through `20260730310000`, hours 24–31. Applied and working,
but Supabase cannot parse them as dates and any date-sorting tool will order
them unpredictably. Leave applied; do not repeat the pattern.

### "Needs your action" feed triple-renders each item
Business dashboard showed six rows for two quotes — each quote appearing three
times with different action labels ("Confirm or counter dates" ×2, "Awaiting
your response" ×1). Confirmed against `issued_quotes`: only Q-0019 and Q-0020
exist. Display bug, not duplicate sends.

### Business quotes are discoverable only under "Approvals"
No Quotes nav item on the business dashboard; received quotes live under
Approvals. A contractor telling a client "check your quotes" sends them looking
for something that isn't there. Homeowner accounts have a dedicated Quotes page.

### CRM disconnected from real clients
CRM reads `crm_clients` and shows Total Clients 0, Total Revenue £0 against 20
enquiries, 17 converted, 13 jobs and £3,200 invoiced. Nothing flows from a
completed job into the CRM, so the module is inert.

Decide: wire it to actual client records, or hide the nav item until it does
something. Do not leave it visible and empty for the first real contractor.

### Empty/error-state rollout, remainder
The readiness-audit R3-1 pass fixed the `if(!user) return`-before-
`setLoading(false)` spinner-forever class and added error surfacing to
`useInvoices`, `useJobs`, `useReceivedQuotes`, `useReceivedInvoices`,
`useContractorPipeline`, and `HomeownerOverview` only. The audit's A4 findings
named several more surfaces with the same silent-empty-on-fetch-error pattern
that were explicitly deferred: `IssuedQuotes.tsx`, `ContractorDashboard.tsx`'s
8-query stats block, `BusinessOverview.tsx`, `BusinessJobsView.tsx`,
`BusinessRequestsView.tsx`, `BusinessComplianceView.tsx`.

Same fix shape each time (check `.error`, toast or `ErrorState`,
`finally { setLoading(false) }`) — do the rest in one pass rather than
piecemeal.


- Team member account self-service: settings/profile are query-param views
  inside HomeownerDashboard (?view=settings). Post-/field-routing-fix,
  team members have no route to manage their own account (password,
  personal details). Sign-out addressed; settings surface still open.
  See LATER.md.
- Auth.tsx returnTo: honours a returnTo query param post-login, currently
  only set by ContractorProfile.tsx to a profile path. Now backstopped by
  team-aware ProtectedRoute — no fix needed, but any future returnTo
  pointing at a dashboard route must not bypass the role/team resolver.