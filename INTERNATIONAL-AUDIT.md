# International Readiness Audit — Finance & Money Layer

Audit date: 2026-08-17. Read-only. Live schema and live data queried directly
against the linked Supabase project (`tnvxfzmdjpsswjszwbvf`) via
`npx supabase db query --linked` (Management API SQL execution — no docker,
no direct pg connection). Migration files were read only to explain *why*
something looks the way it does; every factual claim about current schema
shape or data was independently verified against `information_schema`,
`pg_constraint`, `pg_policies`, and `pg_trigger` output pasted below, not
inferred from migration text.

Production data volume at audit time is very small: `profiles`=7,
`companies`=1, `sites`=1, `jobs`=15, `issued_quotes`=22, `invoices`=4,
`payments`=1, `expenses`=0, `mileage_trips`=0, `finance_settings`=1. Every
"distinct values in real data" claim below should be read against that
N — a single value being 100% consistent across 4-22 rows is suggestive,
not statistically dispositive.

---

## 1. Executive summary

1. **The database already has DB-enforced GB/US/CA country + currency
   scaffolding — check constraints (`country_code IN ('GB','US','CA')`,
   `currency` pinned to `country_code` via a compound CHECK) and
   immutability triggers, live since migration `20260811090000`. The
   application code was never updated to use it: every edge function that
   touches Stripe hardcodes `currency: "gbp"`, every PDF generator
   hardcodes `£`/`GBP`/`en-GB`, and the frontend never reads or writes the
   `currency`/`country_code` columns anywhere. The schema is ahead of the
   code, not behind it — the constraint would currently reject any attempt
   to actually create a non-GB record end-to-end, because nothing populates
   `currency`/`country_code` from user input.
2. **`src/lib/invoiceMoney.ts`'s `summariseInvoices` and every KPI/aggregate
   that sums `payments.amount` or `payments.platform_fee` across rows do
   so with no currency field in scope at all** (`InvoiceMoneyFields` doesn't
   include `currency`). If a second currency ever appeared in the same
   result set, these functions would silently add pounds to dollars with no
   error and no warning.
3. **The 3.5% platform fee documented in `CLAUDE.md` does not match the
   code.** The live fee, in both the Stripe-charging edge functions and the
   user-facing copy (Terms, `TransactionFeeNotice.tsx`, `StripeConnect.tsx`),
   is **5%** (`PLATFORM_FEE_PERCENT = 0.05` in
   `supabase/functions/_shared/paymentMath.ts`). This is a currency-adjacent
   finding because that same file's `toPence()` (`Math.round(amount * 100)`)
   hardcodes a 2-decimal-minor-unit currency; it would silently misconvert
   for a zero-decimal currency (JPY) or 3-decimal currency (KWD/BHD) if one
   were ever added under the existing `currency` column.

Other load-bearing facts, not in the top three but structurally important:
mileage is HMRC-specific end to end (table name, rate structure, unit is
literally named `miles` with no km alternative or unit column); tax
terminology is VAT-specific by column name (`vat_status`, `vat_number`,
`vat_rate`) with no generic "tax regime/jurisdiction" concept anywhere;
`sites` (the one genuinely address-only table) has a `NOT NULL postcode`
column and no `country_code` at all.

---

## 2. Spec vs reality discrepancies

| Document | Claim | Reality (verified live) | Status |
|---|---|---|---|
| `I18N-AUDIT.md` line 15-19 | "A repo-wide sweep for `%currency%` across every table in `public` returned zero rows. There is no `currency` column on any table." | `invoices.currency`, `issued_quotes.currency`, `payments.currency` all exist, `text NOT NULL DEFAULT 'GBP'`, with a compound CHECK pinning them to `country_code`. | **Stale.** `I18N-AUDIT.md` predates migration `20260811090000_add_country_code_and_currency.sql` (11 Aug 2026); the audit itself was evidently written before that date and never revisited. This is the single most consequential doc/reality gap found — the audit's entire "no currency column exists" framing (repeated at lines 1057-1062) is now false. |
| `I18N-AUDIT.md` line 1057 | "No currency column, no country column, exist anywhere in the schema." | 7 tables have `country_code`, 3 have `currency` — see Section 3/6 below. | **Stale**, same root cause as above. |
| `FINANCE-AUDIT.md` Landmine C6 (line 425-438, 566) | "`expenses.contractor_id` has no foreign key to `profiles`" — listed as an open, unresolved finding with a recommended fix. | Live `pg_constraint` shows `expenses_contractor_id_fkey: FOREIGN KEY (contractor_id) REFERENCES profiles(id)` already present. | **Stale, but self-consistent with `CLAUDE.md`**, which documents this same FK as added in `20260815100000_finance_schema_hardening.sql`. `FINANCE-AUDIT.md` itself was written before that migration and was never marked corrected for C6 (contrast with its own C1, which *was* self-corrected in-place — see below). |
| `FINANCE-AUDIT.md` C1 (line 325-341) | Originally claimed `finance_settings` had no `UNIQUE (contractor_id)`; the document contains its own dated correction admitting the finding was wrong, and describes a follow-up migration that added, then dropped, a redundant duplicate unique constraint. | Live: exactly one unique constraint on `finance_settings.contractor_id` (`finance_settings_contractor_id_key`). Matches the corrected text. | **Accurate** (self-corrected in place) — included here to show the doc *can* be trusted where it has done this, in contrast to C6 above, which needed the same treatment and didn't get it. |
| Brief's own premise (Step 4) | Asks the auditor to "confirm the four known integrity issues are still present" — missing FK, RLS drift, missing unique constraint, dual VAT-status. | Of the four: the missing FK is **fixed**, the missing unique constraint was **already false when first written** (per FINANCE-AUDIT.md's own C1 correction), the "RLS drift" is **present but is documented, deliberate, and explicitly not a bug** (see Section 5), and the dual VAT-status source is **still genuinely present** (see Section 5). | Only 1 of 4 is an open, unaddressed issue as of this audit. |
| `CLAUDE.md` Stack section | "Payments: Stripe Connect (Express, UK, 3.5% platform fee)" | Every fee-calculating code path (`paymentMath.ts`, user-facing copy in three places) uses **5%**, not 3.5%. `CLAUDE.md`'s own earlier session log (Session 2) says the fee was "corrected from 2% to 3.5%" at some point — so the true history is 2% → 3.5% (per that log) → 5% (current code), and the top-of-file Stack summary was never updated past the 3.5% figure. | **Stale.** |
| `LOCATION-AUDIT.md` | Documents `country_code`, `service_area_radius_miles`, `working_radius`, and the postcodes.io UK-only dependency, all matching what this audit independently found. | Matches live schema and code. | **Accurate** — this doc postdates the country_code migration and was evidently kept current; contrast with `I18N-AUDIT.md`. |
| `I18N-AUDIT.md` line 743 | "GBP symbol (£) as a literal — 90 files, ~220 occurrences" (scope/date not stated precisely) | This audit's own `src/`-only sweep (Section 9) found **66 files** containing a literal `£`. | Not necessarily a contradiction — the older figure may include `supabase/functions/` or count occurrences rather than files, and the codebase has changed since. Flagged as unreconciled rather than asserted wrong; do not treat either count as current without re-running the sweep at the time it's needed. |

---

## 3. Currency

### 3.1 Currency indicator columns (the only ones in the schema)

| Table | Column | Type | Nullable | Default | Populated? |
|---|---|---|---|---|---|
| `invoices` | `currency` | text | NO | `'GBP'` | 4/4 rows = `'GBP'` |
| `issued_quotes` | `currency` | text | NO | `'GBP'` | 22/22 rows = `'GBP'` |
| `payments` | `currency` | text | NO | `'GBP'` | 1/1 row = `'GBP'` |

Added by `20260811090000_add_country_code_and_currency.sql`. Enforced live by
a compound CHECK per table, e.g. on `invoices`:

```
CHECK (((country_code = 'GB'::text) AND (currency = 'GBP'::text)) OR
       ((country_code = 'US'::text) AND (currency = 'USD'::text)) OR
       ((country_code = 'CA'::text) AND (currency = 'CAD'::text)))
```

identical (per-table) on `issued_quotes` and `payments`. A `BEFORE UPDATE`
trigger (`prevent_country_currency_change`, one function shared by 5
triggers — `jobs_country_immutable`, `enquiries_country_immutable`,
`issued_quotes_country_immutable`, `invoices_country_immutable`,
`payments_country_immutable`, all confirmed `tgenabled = 'O'`, i.e. live and
enabled) raises if either column is changed post-insert.

**Nothing in `src/` ever reads or writes `currency` or `country_code`.** A
repo-wide search of `src/hooks/` for `currency` returns zero matches.
`invoiceMoney.ts`'s `InvoiceMoneyFields` type does not include a `currency`
field. The columns exist, default correctly, and are protected by DB
constraints — but the application has no code path that would ever set them
to anything other than the default, and no code path reads them to decide
how to format or aggregate an amount.

### 3.2 Money-bearing columns with NO currency indicator anywhere on the row or an FK-reachable parent

All of the following are `numeric` and hold a monetary value, and none of
their tables (nor, in most cases, any table one FK hop away) carry a
`currency` column:

`business_counters.next_value`, `chargebacks.amount` /
`.dispute_fee` / `.transfer_reversed_amount` / `.funds_returned_amount`,
`contractor_counters.next_value`, `contractor_debts.amount` /
`.recovered_amount`, `contractor_materials.unit_cost`,
`contractor_score_history.score_value`, `contractor_scores.value_score`,
`contractor_tools.purchase_cost`, `contracts.contract_value`,
`craft_signals.signal_value`, `crm_clients.total_revenue`,
`engagement_rates.hourly_rate` / `.minimum_charge`,
`expenses.amount` / `.vat_amount` / `.vat_rate`,
`hmrc_mileage_rates.rate_per_mile`,
`job_adjusted_contract_value.original_quote_total` / `.approved_variation_total`
/ `.adjusted_total`, `job_material_usage.unit_cost_at_use`,
`job_variations.amount` / `.revised_contract_value` / `.original_contract_value`,
`jobs.contract_value`, `marketplace_listings.price`,
`mileage_trips.claim_amount`, `payment_schedules.total_contract_value`,
`payment_stages.fixed_amount` / `.calculated_amount`,
`payments.amount` / `.platform_fee` / `.contractor_payout` / `.stripe_fee` /
`.refunded_amount` / `.transfer_reversed_amount` (payments itself DOES have
`currency`, listed in 3.1 — its *sibling* money columns just inherit that,
so this is fine; listed for completeness),
`profiles.hourly_rate`, `project_change_requests.cost_impact`,
`project_proposals.total_cost`, `projects.budget` / `.budget_revised` /
`.deposit_amount`, `refunds.amount` / `.stripe_fee_lost` /
`.transfer_reversed_amount` / `.application_fee_refunded`,
`service_contracts.annual_value`, `site_autonomy_config.max_wo_value`,
`subcontracts.subcontract_value`, `team_members.hourly_rate` / `.day_rate` /
`.overtime_rate`, `tender_application_price_lines.rate`,
`tender_applications.lump_sum_total`, `tender_rates_cards.hourly_rate` /
`.minimum_charge`, `tenders.budget_min` / `.budget_max`,
`timesheets.rate_applied`, `trade_averages.avg_value`,
`work_orders.estimated_cost`.

That is ~40 distinct money-bearing columns across ~25 tables with zero
currency indicator, against 3 tables (`invoices`, `issued_quotes`,
`payments`) that have one. `refunds` and `chargebacks` are notable: both are
one FK hop from `payments`/`invoices` (which do carry currency), but neither
denormalises it onto its own row, so a refund/chargeback report can't
determine its own currency without a join.

### 3.3 Does a currency column exist anywhere? — direct answer

Yes, on three tables (`invoices`, `issued_quotes`, `payments`), added
11 Aug 2026, `NOT NULL DEFAULT 'GBP'`, 100% populated as `'GBP'` in all
current rows, DB-enforced consistent with `country_code`, immutable after
insert by trigger. It is unused by any application code path.

---

## 4. Tax

- **`profiles.vat_registered`** — `boolean`, nullable, `DEFAULT false`. 7/7
  real rows = `false`, no nulls. **Deprecated in code** — `ProfileManagement.tsx`
  carries an explicit comment: *"VAT status is canonical on
  `finance_settings.vat_status`, not `profiles.vat_registered`
  (FINANCE-AUDIT.md Landmine L1 — `profiles.vat_registered`/`vat_number` are
  deprecated, kept only to avoid a schema break)."* Confirmed: the save path
  in `ProfileManagement.tsx` writes VAT changes to `finance_settings`, never
  updates `profiles.vat_registered` directly.
- **`finance_settings.vat_status`** — table and column exist exactly as
  named. `text NOT NULL DEFAULT 'not_registered'`. Only 1 real row exists
  (`vat_status = 'not_registered'`). This is the column every read path
  (`useFinanceSummary.ts`, `FinanceSettings.tsx`, `JobManagement.tsx`,
  `ExpenseFormDialog.tsx`) actually uses to decide VAT behaviour.
- **Dual-source is still real, live-verified**: querying `profiles` LEFT
  JOIN `finance_settings` for the two contractor rows in the DB returns one
  row where `finance_settings` doesn't exist at all (`vat_status: null`) —
  the two sources are not just theoretically divergent, one contractor
  currently has no `finance_settings` row and therefore no canonical VAT
  status at all, only the deprecated `profiles.vat_registered = false`.
- **Other tax-shaped columns**: `expenses.vat_amount` / `.vat_rate` /
  `.vat_reclaimable`; `finance_settings.vat_number`, `.flat_rate_percentage`,
  `.flat_rate_start_date`; `invoices.tax_rate` / `.tax_amount`;
  `issued_quotes.tax_rate` / `.tax_amount`. The `invoices`/`issued_quotes`
  pair is genuinely tax-generic by naming (`tax_rate`/`tax_amount`, not
  `vat_rate`/`vat_amount`) — everything under `finance_settings`/`expenses`
  is VAT-specific by name.
- **Hardcoded tax rate/arithmetic in code**: `src/constants/tax.ts` defines
  `UK_VAT_REGISTRATION_THRESHOLD = 90000`, documented in its own header
  comment as "hardcoded UK-only... when multi-country support is built, this
  should move into a config table." No bare `0.2`/`1.2` VAT-rate
  multiplication literal was found in `src/` or `supabase/functions/` — tax
  is computed from the stored `tax_rate`/`vat_rate` columns, not a
  hardcoded constant, with the one exception of the threshold above. UI copy
  in `FinanceSettings.tsx:464` lists flat-rate scheme percentages ("General
  building 9.5%, Electrical 14.5%, Plumbing 9.5%") and
  `ExpenseFormDialog.tsx:40` has a VAT-rate picker option `"5" → "5%
  (Reduced)"` — both are UK VAT-scheme-specific values presented as UI copy/
  options, not silent arithmetic.
- **Tax is stored per-invoice/per-quote as a single `tax_rate`+`tax_amount`
  pair** (`invoices`, `issued_quotes`) — not per-line-item. Line items live
  in a `jsonb` `items` column; no evidence of a per-line tax rate.
- **No "tax regime" or "tax jurisdiction" concept exists anywhere in the
  schema.** Confirmed by a full-schema grep for `jurisdiction`/`regime`:
  zero matches. Tax handling is entirely VAT-shaped (UK/EU concept); there
  is no structure that could hold, e.g., US state-level sales tax nexus or
  a GST/HST split.

---

## 5. Mileage and expenses

- **Table name confirmed as `hmrc_mileage_rates`** (not a generic name) — 6
  rows, no country/jurisdiction column, no date-range concept beyond
  `effective_from`/`effective_to` (both populated `2011-04-06` / `NULL` on
  every row — i.e. these are static "current rate" rows, not a historical
  rate table in practice despite having the columns to be one). Rate
  structure: **tiered by vehicle type AND a mileage threshold**
  (`vehicle_type` ∈ `{bicycle, car, motorcycle, van}`, `threshold_miles` ∈
  `{NULL, 10000}` — car/van get a higher rate under 10,000 miles/year and a
  lower flat rate above it, matching real HMRC Approved Mileage Allowance
  Payment rules; bicycle/motorcycle are flat with no threshold row).
  `rate_per_mile` values (0.20, 0.45/0.25, 0.24, 0.45/0.25) are literal HMRC
  AMAP figures. Nothing about the table is country-parameterised — it is
  one flat vocabulary, correct only for the UK.
- **`mileage_trips.miles`** — `numeric`, no unit column, no unit indicator
  anywhere on the row. The unit is asserted purely by the column being named
  `miles`, and by `hmrc_mileage_rates.rate_per_mile` / `.threshold_miles`
  being named the same way. `mileage_trips` currently has 0 rows (unverified
  against real data beyond schema).
- **The four "known" integrity issues, current live state**:
  1. *Missing FK on `expenses.contractor_id`* — **fixed**. Live FK
     `expenses_contractor_id_fkey → profiles(id)` confirmed via
     `pg_constraint`; 0 orphaned rows (moot, `expenses` has 0 rows today).
  2. *RLS drift (subquery vs direct form) across the four contractor finance
     tables* — **present, verified, and matches what `CLAUDE.md` already
     documents as deliberate.** Live `pg_policies`: `expenses`' four
     policies all use the direct form (`contractor_id = auth.uid()`);
     `finance_settings`, `mileage_trips`, `contractor_vehicles` all use the
     two-step subquery form (`contractor_id IN (SELECT profiles.id FROM
     profiles WHERE profiles.user_id = auth.uid())`) on every policy. Both
     forms are correct under the live `CHECK (id = user_id)` invariant on
     `profiles` — this is a style inconsistency, not an access-control bug.
  3. *Missing unique constraint on `finance_settings.contractor_id`* —
     **was never actually missing.** `FINANCE-AUDIT.md`'s own text
     documents that this was a false finding from the start (see Section 2
     table above); live schema shows exactly one unique constraint,
     `finance_settings_contractor_id_key`.
  4. *Dual VAT-status sources* — **still present**, detailed in Section 4.
- **Other UK-specific concepts baked into the finance tables**:
  `finance_settings.financial_year_end_month`/`.financial_year_end_day` are
  generic (any country has a fiscal year), but `flat_rate_percentage`/
  `flat_rate_start_date` name a UK VAT Flat Rate Scheme concept with no
  equivalent structure for another jurisdiction's simplified-tax scheme.
  `mileage_trips.tax_year` is `text NOT NULL` with no format constraint
  observed in the dump — UK tax years run 6 April–5 April, a convention with
  no equivalent for a calendar-year jurisdiction.

---

## 6. `src/lib/invoiceMoney.ts` — function by function

File-level design note (from its own header comment): built specifically to
close a bug where five screens each filtered inline and produced different
totals for the same two invoices. It is a single-source-of-truth module —
but its `InvoiceMoneyFields` interface has no `currency` field at all, so
none of the below is currency-aware by construction, not by oversight of a
particular function.

| Function | Multi-currency safe? | Why |
|---|---|---|
| `depositSettled(inv)` | Safe (single-invoice) | Operates on one invoice's own fields; no cross-row arithmetic. Returns a bare number with no currency tag, so a *caller* combining this across invoices inherits the risk below. |
| `amountGross(inv)` | Safe (single-invoice) | Same — `num(inv.total)` on one row. |
| `amountOutstanding(inv)` | Safe (single-invoice) | Subtracts `depositSettled` from `amountGross` on the *same* invoice — never mixes rows. |
| `isOutstanding(inv)` | N/A | Boolean predicate on status, no arithmetic. |
| `isOverdue(inv)` | N/A | Date comparison, currency-independent. |
| `daysOverdue(inv)` | N/A | Date arithmetic, currency-independent. |
| `displayStatus(inv)` | N/A | String derivation, no arithmetic. |
| **`summariseInvoices(invoices)`** | **NOT safe** | This is the one function that aggregates *across* invoices — it sums `amountGross`/`amountOutstanding` into `outstanding`, `overdue`, and `paid` totals with a single `+=` accumulator per bucket, with no grouping or even awareness of `currency`. If the `invoices` array passed in ever contained a mix of `GBP` and (hypothetically, once the `currency` column above is actually used) `USD` rows, this function would add the two figures together into one meaningless total with no error, no warning, and no way for a caller to detect it happened. This is exactly the "silently breaks under multi-currency" case the audit brief asked to watch for. |

`src/lib/documentRefs.ts` (`formatQuoteRef`/`formatJobRef`/`formatInvoiceRef`):
**no locale or jurisdiction assumption found.** The `TS-C-`/`Q-`/`J-`/`INV-`
prefixes are platform-internal document-reference conventions, not
country-coded; the functions are pure string formatting off an integer and
an optional contractor code. Confirmed jurisdiction-neutral.

`src/lib/formatDate.ts`: **deliberately fixed-format, not locale-aware, by
design** — its own header comment explains the format (`d MMM yyyy`, e.g.
"11 Aug 2026") is chosen specifically to be unambiguous to both UK and US
viewers regardless of the viewer's browser locale, closing a real bug where
bare `toLocaleDateString()` rendered different calendar dates in different
locales for the same underlying value. This is not itself evidence of a
UK-only assumption — the output format doesn't collide with any locale's
native short form — but it is also not adaptive: every viewer everywhere
sees the same fixed day-month-year ordering and English month abbreviation,
with no path to render a different convention (e.g. ISO 8601, or a
US-style "Aug 11, 2026") for a different market.

---

## 7. Country and locale data

### 7.1 Tables with `country_code`

| Table | Type | Nullable | Default | Distinct real values | Null count |
|---|---|---|---|---|---|
| `profiles` | text | NO | `'GB'` | `{'GB'}` (7/7) | 0 |
| `companies` | text | NO | `'GB'` | `{'GB'}` (1/1) | 0 |
| `jobs` | text | NO | `'GB'` | `{'GB'}` (15/15) | 0 |
| `enquiries` | text | NO | `'GB'` | `{'GB'}` (20/20) | 0 |
| `issued_quotes` | text | NO | `'GB'` | `{'GB'}` (22/22) | 0 |
| `invoices` | text | NO | `'GB'` | `{'GB'}` (4/4) | 0 |
| `payments` | text | NO | `'GB'` | `{'GB'}` (1/1) | 0 |
| `public_pro_profiles` (view) | text | YES | — | `{'GB'}` (1/1) | 0 |

All CHECK-constrained to `IN ('GB','US','CA')` except the view (which
inherits whatever `profiles.country_code` holds and adds no constraint of
its own — views don't carry CHECK constraints).

### 7.2 Tables that plausibly should have `country_code` and don't

- **`sites`** — the one table this audit specifically checked per the brief
  and confirmed absent. `sites.postcode` is `text NOT NULL` (a hard UK/postal
  format assumption baked in as a required field, not merely a convention),
  and there is no `country_code` column at all. `LOCATION-AUDIT.md`
  independently confirms this same absence.
- **`expenses`** — no `country_code`. Not unreasonable on its own (an
  expense inherits the contractor's country), but there's no `country_code`
  on `contractor_vehicles`, `mileage_trips`, or `finance_settings` either —
  the entire mileage/expense subsystem has zero jurisdiction awareness even
  though `hmrc_mileage_rates` (Section 5) is hard-coded to exactly one
  jurisdiction's rate table.
- `jobs`, `invoices`, `issued_quotes` DO have it (Section 7.1) — the brief
  asked to check these specifically; confirmed present, contrary to what a
  naive read of `sites`' absence might suggest about the rest of the schema.

### 7.3 Where the codebase reads `profiles.country_code`

Only one call site found: `supabase/functions/create-connect-account/index.ts`
(Section 8) reads it to select the Stripe Connect account's `country`
parameter, with an explicit comment that there is deliberately no UK
fallback — a missing or unsupported `country_code` is a hard error, not a
silent default. This is the **only** place in the entire codebase (frontend
or edge functions) that reads `country_code` for any behavioural purpose.
Every other UK assumption in the codebase (currency, tax, date format,
postcode validation, mileage) is hardcoded independent of this column, not
derived from it — including in code that runs immediately alongside the one
function that does read it (`create-payment-intent`/`accept-quote` hardcode
`currency: "gbp"` unconditionally, with no read of the country-aware
`country_code` column that by this point already exists on the very row
being charged).

### 7.4 UK-specific address/geo assumptions located

- **Postcode validation / lookup**: `supabase/functions/geocode-postcode/index.ts`
  calls `https://api.postcodes.io/postcodes/{postcode}` — the function's own
  header comment states plainly: "Resolves a UK postcode to lat/lng via
  postcodes.io (free, no API key, **UK-only**)." A non-UK postal code will
  simply 404 against this API; there is no branching on `country_code` to
  pick a different geocoder.
- **`sites.postcode text NOT NULL`** — required field, UK postal-code shaped
  by convention (no regex CHECK enforcing the format was found in the
  constraint dump — it's a bare `NOT NULL text`, so the UK-only assumption
  is cultural/UI-driven, not DB-enforced by a pattern check).
- **Working radius is miles-only**: `profiles.service_area_radius_miles`
  (integer, canonical) and the deprecated `profiles.working_radius` (text,
  still written alongside it as a derived display string
  `` `${radius} miles` `` in `ProfileManagement.tsx`/`ContractorOnboarding.tsx`)
  — no kilometre option, no unit column, "miles" is hardcoded into both the
  column name and every display string that reads it.
- **No county/region field, no phone-number formatting logic** were found
  in the schema dump or in a targeted `src/` search — addresses are
  free-text (`address`, `address_line1`, `address_line2`, `city`) plus the
  UK-shaped `postcode`, with no structured county/region/state field at
  all (relevant for a US/CA expansion, which typically needs a state/
  province field this schema has nowhere to put).
- **`src/constants/units.ts`** is explicitly unit-system-neutral by design
  — its own header states units are descriptive only, never participate in
  calculation, and the vocabulary includes both `metric` and `imperial`
  labelled units side by side (`m`/`mm`/`lm` vs `ft`/`in`/`lft`/`yd`) plus a
  `neutral` tier (`each`, `hour`, `day`, etc.). This one file is **not**
  UK/imperial-locked — it is the one piece of the money/measurement layer
  already built multi-system.

---

## 8. Stripe boundary

Every edge function that creates a PaymentIntent or a Connect account,
checked directly in source (all three CRLF-line-ending functions —
`accept-quote`, `create-connect-account`, `notify-invoice-quote-action` —
were greped directly and matched fine; CRLF did not hide anything):

| Function | Currency | `on_behalf_of` | Country source | Fee calc |
|---|---|---|---|---|
| `create-payment-intent/index.ts:202` | Hardcoded: `currency: "gbp"` | Not set | N/A (no account creation here) | `application_fee_amount: platformFee` — see `paymentMath.ts`, 5% of the pence amount, assumes 2-decimal minor units (`toPence` = `amount * 100`) |
| `accept-quote/index.ts:232` | Hardcoded: `currency: "gbp"` | Not set | N/A | Same `application_fee_amount` pattern, same 5%/2-decimal assumption |
| `stripe-webhook/index.ts:955` | Hardcoded: `currency: "gbp"` | Not set | N/A | Reads `application_fee_amount` back off the Stripe object rather than computing it |
| `create-connect-account/index.ts` | Not applicable (no PaymentIntent here) — `default_currency` is **deliberately not set**, per an inline comment stating Stripe derives it from `country` and that for CA specifically that choice (CAD vs USD settlement) shouldn't be second-guessed here | Not set | **`profiles.country_code`**, read from the DB — with an allowlist `ALLOWED_STRIPE_COUNTRIES = ["GB", "US", "CA"]` (line 107) and a hard error (no fallback) if the profile's `country_code` is missing or not in that list | N/A |

**Findings**:
- Both money-moving functions (`create-payment-intent`, `accept-quote`) and
  the webhook handler hardcode `currency: "gbp"` as a literal string,
  unconditionally — none of the three reads the `currency` or
  `country_code` column that already exists on the `invoices`/`payments`
  row being processed at that point in the code.
- `on_behalf_of` is never set anywhere in any of these functions — all
  payments use `transfer_data.destination` (destination charges), confirmed
  at `create-payment-intent/index.ts:204-206`.
- `create-connect-account` is the **one place in the whole Stripe
  integration that is already country-aware** — it derives the Connect
  account's country from `profiles.country_code` and fails loudly rather
  than defaulting to GB. This is architecturally ahead of the PaymentIntent
  code paths, which remain GBP-only regardless of what country the
  contractor's own Connect account was created under.
- The 5% platform fee (`PLATFORM_FEE_PERCENT` in `paymentMath.ts` — see
  Section 1, executive summary, for the 3.5%-vs-5% documentation mismatch)
  is calculated as `Math.round(amountPence * 0.05)` on a pence integer
  produced by `toPence()` (`Math.round(amount * 100)`). Both the
  pounds→pence conversion and the fee rounding assume a currency with
  exactly 2 decimal places of minor unit — correct for GBP/USD/CAD (the
  three currencies the DB constraint currently allows) but would silently
  misconvert for a zero-decimal currency (e.g. JPY) or a 3-decimal currency
  (e.g. KWD) if the `currency`/`country_code` CHECK constraints were ever
  widened to allow one without this file being revisited.

---

## 9. Presentation layer

### 9.1 Hardcoded `£` literal — 66 files under `src/`

By directory:

- `src/pages/` (16): `AdminDashboard.tsx`, `ContractorProfile.tsx`,
  `ContractorDashboard.tsx`, `ContractorOnboarding.tsx`,
  `legal/TermsAndConditions.tsx`, `PayInvoicePage.tsx`,
  `ContractorKPIInsights.tsx`, `HomeownerDashboard.tsx`, `SitePortal.tsx`,
  `HowItWorks.tsx`, `BusinessManagement.tsx`
- `src/components/management/` (23, incl. `financials/` and `invoices/`
  and `payments/` and `variations/` and `quotes/` subfolders):
  `InvoiceManagement.tsx`, `RequestRefundDialog.tsx`, `FinanceSettings.tsx`,
  `financials/JobProfitability.tsx`, `financials/ProfitAndLoss.tsx`,
  `ProfileManagement.tsx`, `financials/VatPosition.tsx`,
  `financials/FinanceDashboard.tsx`, `financials/ExpenseList.tsx`,
  `JobManagement.tsx`, `SubcontractManagement.tsx`, `ContractManagement.tsx`,
  `SendQuoteDialog.tsx`, `IssuedQuotes.tsx`, `TeamManagement.tsx`,
  `financials/AgedDebtors.tsx`, `variations/VariationsSection.tsx`,
  `variations/VariationRequestForm.tsx`, `payments/PaymentProgress.tsx`,
  `quotes/PaymentScheduleBuilder.tsx`, `WorkOrderInbox.tsx`,
  `financials/ExpenseFormDialog.tsx`, `invoices/RecordPaymentDialog.tsx`,
  `financials/MileageTracking.tsx`, `InventoryManagement.tsx`,
  `invoices/InvoiceFormDialog.tsx`, `CRMManagement.tsx`
- `src/components/recipient/` (6): `QuoteBreakdownSummary.tsx`,
  `ReceivedInvoices.tsx`, `QuoteAcceptScreen.tsx`, `ReceivedQuotes.tsx`,
  `DepositPaymentDialog.tsx`, `QuoteScheduleNegotiation.tsx`
- `src/components/contractor/` (3, incl. `thread/`, `tenders/`):
  `thread/ThreadInvoiceSection.tsx`, `thread/ThreadJobSection.tsx`,
  `thread/ThreadQuoteSection.tsx`, `EnquiryDetailSheet.tsx`,
  `tenders/ContractorApplicationStepper.tsx`
- `src/components/business/` (2): `MaintenanceManagement.tsx`,
  `WorkOrderDashboard.tsx`, `SiteAutonomySettings.tsx`
- `src/components/admin/` (1): `AdminRevenue.tsx`
- `src/components/consumer/` (1): `VariationApproval.tsx`
- `src/components/profile/` (1): `CanvasEditor.tsx`
- `src/hooks/` (2): `useJobVariations.ts`, `usePaymentSchedule.ts`
- `src/lib/` (3): `generateInvoicePdf.ts`, `invoiceMoney.ts` (the £ hit here
  is in a comment describing the bug the file fixes, not a literal in
  active code — see Section 6), `generateJobRecordPdf.ts`
- `src/components/projects/` (2): `SubmitProposalForm.tsx`,
  `PostTenderForm.tsx`
- `src/components/management/crm/` (1): `ClientDetail.tsx`
- `src/data/` (1): `marketplaceData.ts`

(66 files total; some appear once, some carry multiple `£` occurrences per
file — this is a file count, not an occurrence count. 16 separate,
independently-defined inline `formatGBP`/`gbp` helper functions were found
across these files — see Section 1 executive summary point 2's neighbouring
finding — confirming there is no single shared currency formatter beyond
`invoiceMoney.ts`, which itself doesn't format, only computes.)

### 9.2 Hardcoded `GBP` string literal — 16 files

`ProjectDelivery.tsx`, `ProposalReview.tsx`,
`management/TeamManagement.tsx`, `ContractorKPIInsights.tsx`,
`business/BusinessSpendView.tsx`, `business/BusinessOverview.tsx`,
`management/InventoryManagement.tsx`, `JobEquipmentMaterials.tsx`,
`management/TimesheetManagement.tsx`, `business/BusinessJobsView.tsx`,
`projects/SubmitProposalForm.tsx`, `projects/PostTenderForm.tsx`,
`pages/TenderDetail.tsx`, `pages/MarketplaceItem.tsx`, `pages/Projects.tsx`,
`marketplace/MarketplaceItemCard.tsx`. These are overwhelmingly
`Intl.NumberFormat(..., { currency: "GBP" })` calls inside the per-file
`formatGBP` helpers named in 9.1.

### 9.3 `en-GB` locale string — 56 files under `src/`

Full count matches roughly the same surface as the `£`/`GBP` sweep plus a
handful of date-only-formatting files not carrying a currency literal
(`field/FieldJobList.tsx`, `field/FieldJobDetail.tsx`, `field/FieldNotes.tsx`,
`management/VerificationManagement.tsx`, `hooks/useMileage.ts`,
`admin/AdminVerification.tsx`, `management/AvailabilityManagement.tsx`,
`contractor/ContractorPrequalStatus.tsx`, `business/ContractorServiceVisits.tsx`,
`business/PanelInvites.tsx`, and others already listed in 9.1/9.2). Every
`en-GB` call found is paired with `currency: "GBP"` in the same
`Intl.NumberFormat` invocation where currency formatting is involved (per
`I18N-AUDIT.md`'s own finding, independently spot-checked here and found
still true in every sampled case) — locale and currency are set together as
one hardcoded pair, never independently, and never read from a
settings/profile column.

### 9.4 PDF generation — two distinct code paths, both hardcode UK formatting independently

**Frontend, `jsPDF`** (`src/lib/generateInvoicePdf.ts`): 7 separate
`` `£${...toFixed(2)}` `` literal constructions (lines 193, 194, 217, 221,
235, 242, 254, 257) — no shared formatter, no currency parameter, no locale
handling (uses raw `.toFixed(2)`, not even `toLocaleString`).

**Edge functions, `pdf-lib`** (5 functions:
`generate-completion-pdf`, `generate-project-contract`, `generate-quote-pdf`,
`generate-rams-pdf`, `generate-year-end-pack`) — a **separate, independent**
implementation from the frontend path, each with its own hardcoding:
- `generate-project-contract/index.ts` defines a dedicated `fmtGBP()` helper
  (line 42) built on `new Intl.NumberFormat("en-GB", { currency: "GBP" })`.
- `generate-year-end-pack/index.ts` defines its own separate `gbp()` helper
  (line 139) using the same `en-GB`/manual-`£`-prefix pattern, plus 5
  separate `toLocaleDateString("en-GB", ...)` call sites for different date
  formats within the same file.
- `generate-completion-pdf/index.ts` and `generate-quote-pdf/index.ts` use
  raw `` `£${n.toFixed(2)}` `` literals directly at each call site (no
  shared helper even within the file, in `generate-completion-pdf`'s case —
  3 separate inline literal constructions).
- `generate-rams-pdf/index.ts` has no currency literal (RAMS documents don't
  carry money) but does hardcode `en-GB` for its one date field.

`supabase/functions/_shared/pdfBranding.ts` (not itself a PDF *generator*,
but shared drawing helpers used by the pdf-lib generators) has a `currency`
parameter on `drawLineItemsTable`/`drawTotalsBlock` defaulting to `"£"` —
per `I18N-AUDIT.md`'s finding (independently spot-checked here and
confirmed still true), this is the **only currency-configurable code path
in the entire codebase**, and no caller anywhere passes anything other than
the default.

Net effect: there are at minimum **7 independent hardcoded-GBP
implementations** across the two PDF paths (1 frontend jsPDF file + 5
edge-function pdf-lib files with their own literals/helpers + the one
shared-but-unused override parameter) with no single source of truth
between them, in addition to the 16 UI-layer `formatGBP` helpers counted in
9.1.

### 9.5 Imperial/metric in line-item units

Covered in Section 7.4 — `src/constants/units.ts` is explicitly
unit-system-neutral and already carries both `metric` and `imperial`
categories with a documented invariant that units never participate in
calculation. This is the one part of the money/measurement surface that
does **not** need remediation for international readiness; it was built
that way from the start.

---

## 10. Open questions

- **Whether any US/CA row has ever existed.** The CHECK constraints and
  immutability triggers for `country_code IN ('GB','US','CA')` are live,
  but every row in every table checked is `'GB'`/`'GBP'`. Could not
  determine from schema or data alone whether US/CA was ever exercised in a
  staging/test path, or whether the constraint's US/CA branches have ever
  actually been hit by application code (given no UI or edge function was
  found that lets a user select a non-GB country at signup/company
  creation).
- **Why `20260811090000` added this scaffolding with no corresponding
  application code.** No commit message, PR, or doc in the repo explains
  the intent behind adding DB-level multi-country support ahead of any
  UI/edge-function change to use it. Could not determine whether this was
  deliberate "schema-first" preparation for a planned expansion or a
  partially-applied piece of work that stalled after the DB layer.
  `CLAUDE.md`'s own session logs (which run up to a 13 Jun 2026 entry) don't
  mention it, and no session log entry for August exists — this migration
  post-dates the last documented session entirely, and could not determine
  from the repo alone why it was undertaken or what triggered it.
- **Whether `mileage_trips.tax_year` has an enforced format.** The column is
  `text NOT NULL` with no CHECK constraint found in the live constraint
  dump. Could not determine the exact expected format (e.g. `"2025/26"` vs
  `"2025-26"` vs `"2025"`) from schema alone — no real rows exist to infer
  it from (table has 0 rows), and no CHECK constrains it.
- **Whether `sites.postcode`'s `NOT NULL` constraint would reject a non-UK
  address today.** Confirmed there is no format-validating CHECK on the
  column (it's a bare `NOT NULL text`), so a non-UK postal code string
  could technically be stored — the UK-only assumption here is that the
  field is *required* and *named* `postcode`, and that the one geocoding
  path (`geocode-postcode` edge function) that consumes postcodes elsewhere
  in the app is hard-UK-only via postcodes.io, not that the column itself
  would reject non-UK input at the DB level.
- **Full reconciliation of `I18N-AUDIT.md`'s "90 files / ~220 occurrences"
  £-literal figure against this audit's 66-file count.** Could not
  determine whether the gap is scope (functions included/excluded),
  occurrence-vs-file counting, or genuine codebase drift between when that
  audit was written and now, without access to that audit's original raw
  search output.
