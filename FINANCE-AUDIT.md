# FINANCE-AUDIT.md — Contractor Finance Schema Audit

**Read-only audit. No files modified, no migrations written.**
Source: live database `tnvxfzmdjpsswjszwbvf` (queried via `npx supabase db query
--linked` against `information_schema` / `pg_catalog` / `pg_policies` /
`cron.job`, 2026-08-15), cross-checked against `CONTRACTOR-FINANCE.md` and
`supabase/migrations/*.sql`. Per CLAUDE.md's "Schema/policy claims must come
from the live DB" rule, every schema fact below is from the live query output,
not from migration files or the spec's own SQL stubs — migration text is
cited only to explain *how* a live fact came to be, never as the source of
the fact itself.

**Headline finding, read this first:** `CONTRACTOR-FINANCE.md` states *"Build
gate: Nothing in this file touches the codebase until the core job flow is
clean..."* and presents its schema as `-- DO NOT RUN — schema direction
only`. **This is stale.** Finance Tier 1 has already been built — three
migrations dated 2026-07-27/28 and 2026-08-01 ("Finance Tier 1, Slice 1/2/3"
per their own header comments) created live tables, RLS policies, a seeded
category taxonomy, a live daily cron, and a full frontend (`src/components/
management/financials/*.tsx`, `src/hooks/useFinanceSummary.ts`) implementing
Finance Settings, Expenses, Mileage, and a P&L-shaped summary. **None of it
uses the table names the spec's SQL stubs propose** (`contractor_expenses`,
`contractor_mileage`, `mileage_rates` do not exist; the live tables are
`expenses`, `mileage_trips`, `hmrc_mileage_rates`). Any migration work driven
by this spec must reconcile with what's live, not create a second, parallel
set of tables under the spec's stub names.

---

## SECTION A — EXISTS AND MATCHES SPEC

### A1. `finance_settings` ↔ spec §1.1–§1.4

Live table (migration `20260727160000_finance_settings_foundation.sql`,
confirmed via live `information_schema.columns`):

| column | type | nullable | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| contractor_id | uuid | NO | — |
| business_type | text | NO | 'sole_trader' |
| vat_status | text | NO | 'not_registered' |
| vat_number | text | YES | — |
| flat_rate_percentage | numeric | YES | — |
| flat_rate_start_date | date | YES | — |
| financial_year_end_month | integer | YES | — |
| financial_year_end_day | integer | YES | — |
| default_payment_terms_days | integer | YES | 30 |
| created_at | timestamptz | NO | now() |
| updated_at | timestamptz | NO | now() |

CHECK constraints (live, `pg_constraint`): `business_type IN
('sole_trader','limited_company')` — matches §1.1. `vat_status IN
('not_registered','standard','flat_rate')` — matches §1.2's three schemes.
`financial_year_end_month BETWEEN 1 AND 12`, `financial_year_end_day BETWEEN
1 AND 31` — matches §1.1's "configurable financial year end" for limited
companies. `default_payment_terms_days` — matches §1.4 exactly (stored as a
default, overridable per invoice per the spec's own note that this is
"already partially handled").

FK: `contractor_id REFERENCES profiles(id)` (live, `pg_constraint`) — correct
direction per CLAUDE.md's `profiles.id == profiles.user_id` invariant.

**One-row-per-contractor is enforced by RLS shape, not a DB constraint** —
there is no `UNIQUE (contractor_id)` on this table. The app can insert
multiple `finance_settings` rows per contractor with nothing at the DB level
stopping it; correctness currently rests entirely on the frontend always
upserting rather than inserting. Flagged in Landmines (C1).

### A2. `contractor_vehicles` ↔ spec §1.3, §3.2

| column | type | nullable | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| contractor_id | uuid | NO | — |
| name | text | NO | — |
| registration | text | YES | — |
| vehicle_type | text | NO | 'car' |
| mileage_method | text | NO | 'simplified' |
| business_use_percentage | numeric | YES | 100 |
| method_locked_tax_year | text | YES | — |
| is_active | boolean | NO | true |
| created_at / updated_at | timestamptz | NO | now() |

CHECK constraints: `vehicle_type IN ('car','van','motorcycle','bicycle')` —
matches spec exactly. `mileage_method IN ('simplified','actual_costs')` —
matches spec's "simplified mileage allowance OR actual costs" (named
`claim_method` in the spec's stub, `mileage_method` live — cosmetic only).
`business_use_percentage BETWEEN 0 AND 100` — matches §1.3's business-use-%
requirement for actual costs. `method_locked_tax_year` (text, e.g. a
"2025-26" tax-year string per the mileage scope note) — implements §1.3's
"cannot switch method mid-tax-year (HMRC rule) — lock after first claim"
requirement structurally, though the lock itself is app-enforced (no trigger
found — see Section B / Landmine C2).

FK: `contractor_id REFERENCES profiles(id)` — correct.

### A3. `hmrc_mileage_rates` ↔ spec §3.3

| column | type | nullable |
|---|---|---|
| id | uuid | NO |
| vehicle_type | text | NO |
| threshold_miles | integer | YES |
| rate_per_mile | numeric | NO |
| effective_from | date | NO |
| effective_to | date | YES |

`UNIQUE (vehicle_type, threshold_miles, effective_from)` — matches spec's
stub exactly. Live seed data (queried directly):

| vehicle_type | threshold_miles | rate_per_mile |
|---|---|---|
| car | 10000 | 0.45 |
| car | null | 0.25 |
| van | 10000 | 0.45 |
| van | null | 0.25 |
| motorcycle | null | 0.24 |
| bicycle | null | 0.20 |

Rates match §3.1's 45p/25p/24p/20p exactly. One structural improvement over
the spec's own stub: the spec's `mileage_rates` stub comments `vehicle_type
-- car_van | motorcycle | bicycle` (one combined `car_van` value); the live
table instead stores `car` and `van` as two separate rows with identical
rates. This is **more correct**, not a defect — it leaves room for car and
van rates to diverge in a future HMRC rate change without a schema change,
whereas the spec's combined value would require one.

RLS: `SELECT` open to any `authenticated` role (`USING (true)`) — correct
per spec §3.3's "Platform-managed, not contractor-editable" (no INSERT/
UPDATE/DELETE policy exists for any non-service role, so contractors
genuinely cannot edit it — matches spec intent).

### A4. Storage: receipts bucket ↔ spec §2.3

Live bucket `receipts` (`storage.buckets`, `public: false`) — private, per
spec. RLS on `storage.objects` (live, `pg_policies`): SELECT and DELETE both
scoped `bucket_id = 'receipts' AND auth.uid()::text = (storage.foldername
(name))[1]` — a per-contractor folder-scoped read/delete gate, matching
spec's "scoped RLS (contractor sees own only)". An INSERT policy also exists
(`"Contractors can upload their own receipts"`); its `WITH CHECK` clause
returned null in the query used here and needs a follow-up read of the exact
predicate before relying on it, but its existence confirms upload is gated,
not open.

Naming note: the bucket is `receipts`, not `expense-receipts` as named in
spec §2.3. Functionally equivalent; purely cosmetic, listed here (not in
Section B) because no fix is needed — just don't create a second bucket
under the spec's literal name.

### A5. `expenses.is_recurring` + recurrence machinery ↔ spec §2.4

Migration `20260801200000_recurring_expenses.sql` added `recurrence_interval`
(CHECK `IN ('weekly','fortnightly','monthly','quarterly','annually')`),
`recurrence_next_due`, `recurrence_end_date`, `recurrence_parent_id` (self-FK,
`ON DELETE SET NULL`), `recurrence_auto_confirm` (boolean, default `true`),
and `expense_status` (CHECK `IN ('confirmed','pending_confirmation',
'skipped')`) on top of the original `is_recurring` boolean. This is **more
developed than the spec's stub**, which only sketches `recurrence_interval`
inline and doesn't model a parent/child occurrence chain or a
pending-confirmation state at all. It directly implements §2.4's "Contractor
reviews and confirms each occurrence (not auto-confirmed...)" via
`expense_status = 'pending_confirmation'` as a real, queryable state — the
spec describes this as a UX behaviour; the live schema backs it with an
actual status column.

Live cron (`cron.job`, confirmed): `process-recurring-expenses`, daily at
`0 6 * * *`, active. Edge function `supabase/functions/process-recurring-
expenses/` exists. §2.4 is fully built, not just scaffolded.

### A6. Frontend already covers §8.1's Money sidebar and §4/§5/§6/§7 views

`src/components/management/financials/` (confirmed via directory listing):
`FinanceDashboard.tsx` (§8.1 Overview), `ExpenseList.tsx` +
`ExpenseFormDialog.tsx` (§8.1 Expenses), `MileageTracking.tsx` (§8.1
Mileage), `ProfitAndLoss.tsx` (§4), `VatPosition.tsx` (§6), `AgedDebtors.tsx`
(§7), `JobProfitability.tsx` (§5), `YearEndPackDialog.tsx` (§10's "Year-end
tax pack" — a Tier 3 item in the spec, already at least stubbed). None of
these are new builds this audit needs to plan for; they need to be checked
against the spec's detail (Section B/C below), not created.

---

## SECTION B — EXISTS BUT DIFFERS

### B1. Category taxonomy: live 13-value set vs spec's 14-value §2.2 list

Live `expense_categories` (seeded, `owner_contractor_id IS NULL` = platform
rows, mirroring the `rams_templates` global-template pattern per CLAUDE.md):

| live `hmrc_category` | live `name` | spec §2.2 equivalent |
|---|---|---|
| `cost_of_goods` | Materials & Stock | `materials` |
| `subcontractor` | Subcontractor Costs | `subcontractor` ✓ |
| `vehicle_travel` | Vehicle & Travel | `vehicle_costs` |
| `tools_equipment` | Tools & Equipment | `tools_equipment` ✓ |
| `premises` | Premises & Workspace | `premises` ✓ |
| `office_admin` | Office & Admin | `office_admin` ✓ |
| `insurance` | Insurance | `insurance` ✓ |
| `professional_fees` | Professional Fees | `accountancy` (narrower in spec) |
| `marketing` | Marketing & Advertising | `marketing` ✓ |
| `training` | Training & Development | `training` ✓ |
| `clothing_ppe` | Clothing & PPE | `clothing_ppe` ✓ |
| `phone_internet` | Phone & Internet | `phone_internet` ✓ |
| `other` | Other Allowable Expenses | `other` ✓ |

Two concrete mismatches, not just naming: **the slug values differ**
(`cost_of_goods` vs spec's `materials`, `vehicle_travel` vs spec's
`vehicle_costs`) — code written against the spec's literal slugs will not
match live data. And **`finance_charges` (spec: "Bank charges, loan
interest, Stripe fees") has no live equivalent at all** — the closest live
category is `professional_fees`, which is semantically accountancy/legal
fees, not bank/finance charges. If Stripe fee visibility (spec's Open
Decision #4) is ever built as an expense-category line, a 14th category row
needs adding, not shoehorned into `professional_fees`.

`expense_categories` also supports **per-contractor custom subcategories**
via `parent_id` (self-referencing FK) exactly as spec §1.5 describes ("roll
up to parent for tax reporting") — this part matches; only the parent-slug
set differs.

### B2. `expenses.category` (legacy) vs `expenses.category_id` (live, authoritative)

The `expenses` table carries **two parallel categorisation columns**:

- `category` (text, `NOT NULL DEFAULT 'general'`, no CHECK constraint) —
  from the original Feb 2026 migration, pre-dating `expense_categories`
  entirely. Confirmed dead: `ExpenseFormDialog.tsx` never writes it (grepped
  — only `category_id` appears in the write payload). `'general'` isn't
  even one of the 13 seeded category slugs.
- `category_id` (uuid, nullable, FK → `expense_categories(id)`) — added in
  `20260728120000_expense_categories_vat_payment_method.sql`, and confirmed
  as the column the live form actually writes.

Spec §2.1's stub proposes a single flat `category text NOT NULL` (HMRC
parent enum) + `subcategory text`. Live design is a proper normalised FK
into a self-referencing category table, which is a better shape than the
spec's stub — but it means any migration/report work driven by the spec's
literal column list will misread `category` as live data when it's actually
inert. See Landmine C4.

### B3. `expenses.vat_treatment` (spec) vs `vat_rate` + `vat_reclaimable` (live)

Spec §2.1 wants a single `vat_treatment` enum: `standard_20 | reduced_5 |
zero_rated | exempt | no_vat`. Live schema instead has:

- `vat_amount numeric DEFAULT 0`
- `vat_rate numeric DEFAULT 0` (added `20260728120000`)
- `vat_reclaimable boolean DEFAULT false` (added same migration)

This captures similar information but not identically: the live shape can
represent "20% VAT, not reclaimable" (a combination the spec's single-enum
`vat_treatment` value can't express — its `standard_20` implies reclaimable
by construction), which is actually useful (e.g. business entertaining has
VAT charged but isn't reclaimable), but it also means **§6.1's "Input VAT:
total reclaimable VAT from expenses (where `vat_treatment` is `standard_20`,
`reduced_5`, or `zero_rated`)" cannot be built against the literal spec
column** — any VAT-position build needs to filter on `vat_reclaimable =
true AND vat_rate > 0`, not on a `vat_treatment` value, because that column
doesn't exist.

### B4. `expenses.payment_method` CHECK values differ from spec

Live: `CHECK (payment_method IN ('cash','card','bank_transfer','other'))`.
Spec §2.1 comment: `cash | card | bank_transfer | account`. `account` (an
on-account/trade-credit payment method, common for trade suppliers) has no
live equivalent — falls into `other` today, losing that distinction if it's
ever needed for supplier-account reconciliation.

### B5. RLS predicate style: `expenses` diverges from its own migration text

The **live** `expenses` RLS policies (queried directly from `pg_policies`)
all use the two-step subquery form:

```
contractor_id IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid())
```

But the **original migration** that created these policies
(`20260211214225_c922aa1e-56ef-44a5-b349-01f99ee75fd7.sql`) wrote them as
the direct form:

```sql
USING (contractor_id = auth.uid())
```

**No later migration file touches these four policies at all** (grepped for
`DROP POLICY`/`ALTER POLICY` referencing `expenses` across every migration —
zero matches). The live predicate does not match any migration file in the
repo. This is exactly the failure mode CLAUDE.md's "Schema-change
discipline" section warns about (dashboard-applied SQL bypassing migrations)
and its own two confirmed-incident list (`accept_business_invite` /
`prevent_last_owner_removal`) — a third, previously undocumented instance.
Functionally the two forms are equivalent under CLAUDE.md's documented
`profiles.id == profiles.user_id` invariant, so this is not a live security
bug, but the drift itself is undocumented and should be captured in a
drift-repair migration the same way the two prior incidents were (per
CLAUDE.md's own precedent), not left implicit. See Landmine C5.

By contrast, `finance_settings`, `contractor_vehicles`, `expense_categories`,
and `mileage_trips` were **written with the two-step subquery form from
their original migration** (`20260727160000`, `20260728130000` — confirmed
by reading the migration text directly) and the live DB matches those files
exactly — no drift on those four, just a house-style inconsistency with
CLAUDE.md's current documented preference for the direct-comparison form.

### B6. Job Profitability (`JobProfitability.tsx`) doesn't break out cost lines per spec §5.1

Live code (`src/components/management/financials/JobProfitability.tsx`,
confirmed by direct read) sums **all** `expenses.amount` for a job into a
single `expensesAmount` figure plus a separate `mileageAmount` — it does not
currently split by `materials` / `subcontractor` / `other` category as spec
§5.1 specifies ("Materials: sum... / Subcontractor: sum... / Other costs:
sum of all other"). The data to do this exists (`category_id` joins to
`expense_categories.hmrc_category`), it's just not queried/grouped that way
yet. This is a build gap on top of already-correct plumbing, not a schema
gap — flagged here because a naive glance at "JobProfitability.tsx exists"
could wrongly read as "§5.1 is done."

---

## SECTION C — MISSING

Everything below has no live schema counterpart and would need a migration.

### C1. `finance_settings` — no `UNIQUE (contractor_id)`

**CORRECTION (2026-08-15, caught during the FINANCE-AUDIT hardening pass):
this finding was wrong.** `finance_settings.contractor_id` already had
`UNIQUE (contractor_id)` from its original migration
(`20260727160000_finance_settings_foundation.sql` line 31, inline in the
`CREATE TABLE`, auto-named `finance_settings_contractor_id_key`) — this
audit's own C1 write-up never re-verified that specific point against
`pg_constraint`/`pg_indexes` live, in violation of the "Schema/policy claims
must come from the live DB" rule this document otherwise follows throughout.
The hardening migration written off this (wrong) finding added a second,
redundant unique constraint (`finance_settings_contractor_id_unique`),
caught and dropped in the same session via
`20260815110000_drop_redundant_finance_settings_unique.sql`. Left below,
struck through in spirit but not in text, as a record of the mistake — do
not re-add this constraint, it already exists.

**Original (incorrect) finding, kept for history:** **Table**:
`finance_settings`. **Needed**: `ALTER TABLE finance_settings ADD
CONSTRAINT finance_settings_contractor_id_key UNIQUE (contractor_id);` (a
migration file, not an editor change, per CLAUDE.md). Nothing in the spec
calls this out explicitly, but §1's framing ("Contractor configures once,
everything else derives from these settings") implies exactly one row per
contractor — currently unenforced. Low urgency (small live dataset, no
known duplicate rows), but worth fixing before the feature has real user
volume, since a duplicate-row bug here would be silent (whichever row a
`.single()`/`.maybeSingle()` query happens to return wins).

### C2. Tax-year lock enforcement for `contractor_vehicles.mileage_method`

Spec §1.3: *"Cannot switch method mid-tax-year (HMRC rule) — lock after
first claim in a tax year with clear explanation."* Live: `contractor_
vehicles.method_locked_tax_year` (text) exists as a column to **record**
the lock, but there is no trigger, CHECK, or function found anywhere (swept
`information_schema.triggers` and `information_schema.routines` for the six
finance tables — zero rows for any mileage/vehicle-method enforcement)
preventing an UPDATE that changes `mileage_method` after a claim exists in
the locked tax year. This needs either a BEFORE UPDATE trigger on
`contractor_vehicles` (checking for existing `mileage_trips` rows in the
current tax year before allowing a `mileage_method` change) or an
app-enforced check backed by that same query — currently neither exists at
the DB level, so the "lock" is presently just an unused column.

### C3. VAT threshold — no config row anywhere; hardcoded in three frontend files

Spec §1.2 / §6.3: *"Threshold stored in config, not hardcoded... currently
£90,000."* Live `platform_settings` (a generic `key text / value text`
table, confirmed via `information_schema.columns`) has no `vat_threshold`
(or similarly-named) key — queried its full row set directly, only
`commission_tier_1/2/3`, `maintenance_mode`, `platform_email` exist. The
£90,000 figure is hardcoded as a string literal in `VatPosition.tsx` (lines
103, 192), `FinanceSettings.tsx` (line 408) — three independent copies, no
shared constant. **Needed**: either an `INSERT INTO platform_settings (key,
value) VALUES ('vat_registration_threshold', '90000')` seed row (fits the
existing key/value shape with zero schema change) or a dedicated typed
column if more threshold-shaped config is coming (the Flat Rate Scheme's
"£2,000 capital threshold", also hardcoded in `VatPosition.tsx:192`, would
fit the same pattern). Either way this needs an actual migration/seed, not
another hardcoded string.

### C4. Bad-debt / payment-plan support on `invoices` — spec §7.2

Spec §7.2: *"Mark as written off (with reason — moves to expense as bad
debt)"* and *"Payment plan flag (stops overdue alerts but keeps the debt
visible)."* Live `invoices.status` CHECK is `IN ('draft','sent','viewed',
'paid','void')` — no `written_off` state. No `payment_plan` boolean or
similar column exists on `invoices` (confirmed against the full live column
list). **Needed, new migration**:

- `invoices.status` CHECK extended to include a `written_off` value (or a
  separate `written_off_at timestamptz` + `written_off_reason text` pair,
  which is more auditable than overloading `status` and doesn't require
  every other `status`-branching query in the codebase to learn a new
  terminal state) — **recommend the separate-columns approach** precisely
  because `invoices.status` already drives UI branching in multiple
  components; adding a new enum value there is a wider blast radius than
  adding two nullable columns.
- A `payment_plan boolean NOT NULL DEFAULT false` column (or a small
  `invoice_payment_plans` table if a plan needs its own schedule/terms
  later — the spec only asks for a flag, so start with the boolean).
- The "moves to expense as bad debt" behaviour implies either a DB
  trigger (write-off on `invoices` inserts a row into `expenses` with
  `category_id` pointed at a bad-debt category — which doesn't exist in
  the 13-row seed set today, so that's a second dependency) or an
  app-level two-step write. No trigger exists for this today; flag as a
  design decision to make before writing the migration, not an oversight.

### C5. `finance_charges` expense category (Stripe fees, bank charges) — spec §2.2

Already noted as a mismatch in B1; restated here because it is also fully
**absent**, not just misnamed — there is no live category row a Stripe-fee
or bank-charge expense could correctly file under today. Needed: one
`INSERT INTO expense_categories (name, hmrc_category, sort_order) VALUES
('Bank & Finance Charges', 'finance_charges', 14)` seed row (owner_
contractor_id NULL, matching the existing 13 platform-wide rows' pattern).
Directly relevant to spec's Open Decision #4 (Stripe fee visibility) — that
decision cannot be implemented as "a separate expense line" until this
category exists.

### C6. `expenses.contractor_id` has no foreign key to `profiles`

Not something the spec calls out, but a genuine schema gap found while
auditing: every other finance table's `contractor_id` is FK'd to
`profiles(id)` (confirmed above: `finance_settings`, `contractor_vehicles`,
`mileage_trips` all carry `contractor_id REFERENCES profiles(id)`) —
**`expenses.contractor_id` does not** (confirmed: swept `pg_constraint`
foreign keys on `expenses` — only `project_id`, `job_id`, `category_id`, and
`recurrence_parent_id` have FKs; `contractor_id` is a bare `uuid NOT NULL`
from the original Feb 2026 migration, which pre-dates the FK-discipline
convention documented elsewhere in CLAUDE.md). This means a bad/orphaned
`contractor_id` on `expenses` fails silently instead of erroring at insert.
**Needed**: `ALTER TABLE expenses ADD CONSTRAINT expenses_contractor_id_fkey
FOREIGN KEY (contractor_id) REFERENCES profiles(id);` — check for orphan
rows first (current dataset is small; confirmed `SELECT category FROM
expenses` returned zero rows live, so this is a zero-risk backfill today,
but won't stay that way).

### C7. MTD VAT / Bank Feed / MTD-IT (spec Tier 2, §9) — nothing live, as expected

No schema, no edge function, no OAuth/token storage table for HMRC Developer
Hub or TrueLayer/Plaid exists (swept table names, routine names, and
`supabase/functions/` directory — no matches for `mtd`, `hmrc_submission`,
`bank_feed`, `truelayer`, `plaid`, `open_banking`). This matches the spec's
own gating ("build after Tier 1 is validated") — listed here only for
completeness, not because it's an oversight. When Tier 2 starts, it will
need genuinely new tables (OAuth token storage, submission history, matched-
transaction linkage) — none of which can reuse Tier 1's shape.

### C8. Tier 3 items (§10) — no live schema, as expected

Receipt OCR, smart categorisation, contractor benchmarking, invoice
factoring: no schema traces found (expected — spec explicitly defers these).
No action needed; listed for completeness only.

---

## LANDMINES

### L1. Two independent, unsynced VAT-status sources of truth

`profiles.vat_registered` (boolean) / `profiles.vat_number` (text) /
`profiles.vat_registration_date` (date) — added per CLAUDE.md's Session 2
log (~3 May), read by `JobManagement.tsx` and `ProfileManagement.tsx` —
coexist with `finance_settings.vat_status` (text enum) / `finance_settings.
vat_number` (text) / `finance_settings.flat_rate_start_date` (date) — added
`20260727160000`, read by `FinanceSettings.tsx`, `ExpenseFormDialog.tsx`,
`useFinanceSummary.ts`. **Nothing keeps these two in sync.** A contractor
could toggle VAT-registered in one settings screen and not the other,
giving genuinely different VAT behaviour depending on which screen/hook a
given piece of UI reads from. Neither `InvoiceFormDialog.tsx` nor
`SendQuoteDialog.tsx` actually reads *either* column today — both simply
`useState(20)` as a flat default regardless of VAT status — so the drift
hasn't caused a visible bug yet only because nothing downstream branches on
it consistently. Before building anything in §6 (VAT Position) against
`finance_settings.vat_status`, decide explicitly whether `profiles.
vat_registered` is being retired, kept as a cheap denormalised read, or
actively synced — do not silently let `finance_settings` become the "real"
answer while `profiles` still exists and is still read elsewhere.

### L2. Two independent job-material-cost tracking systems

`expenses` (category_id → `expense_categories` with `hmrc_category =
'cost_of_goods'`, job-linked via `expenses.job_id`) is one path to record
material cost against a job. **A second, entirely separate path already
exists**: `contractor_materials` (a stock/inventory table — `unit_cost`,
`quantity_on_hand`, `reorder_level`) joined via `job_material_usage`
(`job_id`, `material_id`, `quantity_used`, `unit_cost_at_use`) — confirmed
live, both tables fully built with real columns, presumably backing the
existing Inventory feature. **`JobProfitability.tsx` currently reads only
`expenses`, never `job_material_usage`** (confirmed by direct read — zero
references to `job_material_usage` or `contractor_materials` in that file).
This means: a contractor who logs materials via the Inventory/stock
drawdown flow against a job will see that job's "Materials" cost
under-reported in Job Profitability (spec §5.1) — their real cost is
invisible to the exact feature the spec calls "the single most valuable
view for a contractor." Before building §5.1's materials line, decide
whether it sums `expenses` only, `job_material_usage` only, or both with
de-duplication logic (a contractor could, in principle, log the same
purchase both ways) — this is a design decision the spec doesn't anticipate
because it doesn't know the inventory system exists.

### L3. `expenses.category` legacy column — dead but present, don't build against it

Restated from B2 as a landmine because it's an easy trap for a future
migration author: `expenses.category` (text, default `'general'`, `NOT
NULL`) looks like the obvious column to filter/group by for any HMRC-
category reporting, and it's the column name the spec's own §2.1 stub uses.
It is **not written by the live form** and holds no real data (table has
zero populated rows in the current dataset, and even historically would
only ever have held `'general'`). The authoritative column is `category_id`
→ `expense_categories.hmrc_category`. Do not build P&L/VAT-position/export
logic against `expenses.category` — it will silently return nothing or
`'general'` for everything.

### L4. Undocumented RLS drift on `expenses` (detail in B5)

The live `expenses` RLS policies don't match their own origin migration
file, and no later migration explains the change. Not a live security bug
(both forms are equivalent under the documented `profiles.id ==
profiles.user_id` invariant), but it is exactly the class of undocumented
dashboard-applied change CLAUDE.md's schema-change-discipline section
exists to prevent, and it should get a drift-repair migration (updating the
migration history to match reality, per the same pattern used for the two
prior confirmed incidents) before any further `expenses` RLS changes are
layered on top of an already-undocumented base.

### L5. No RLS recursion risk found — explicitly checked

All six finance tables' policies (`finance_settings`, `contractor_vehicles`,
`expense_categories`, `expenses`, `hmrc_mileage_rates`, `mileage_trips`) only
ever reference `profiles` in their subquery — a single-hop, one-directional
read with no function call-back into any of these six tables from
`profiles`' own policies. This does not match the shape of the
`auth_user_company_ids()` / `service_visits` cycle CLAUDE.md warns against
(table A's policy → function reads table B → table B's policy calls back
into table A). Confirmed no recursion risk exists in the current or likely
next shape of this feature — flagged as checked, not as a finding to fix.

### L6. `payments.platform_fee` / `stripe_fee` already exist for spec §4.1's Stripe-fee cost line

Spec §4.1 wants "platform fees deducted (Stripe application_fee_amount)
shown as a cost line." Live `payments` table (confirmed via prior schema
sweep, re-verified column list) already carries `platform_fee numeric(10,2)`
and `stripe_fee numeric` per payment row, plus `net_platform_revenue`. This
is not itself a gap — it's a pointer for whoever builds §4.1: the data
already exists on `payments`, joined via `payments.invoice_id`, so this does
**not** need a new column on `invoices` or a new table. Listed here so it
isn't accidentally re-built as new schema.

---

## SUMMARY TABLE — what a migration file needs to touch

| # | Item | Table | Action |
|---|---|---|---|
| C1 | Prevent duplicate `finance_settings` rows | `finance_settings` | `ADD CONSTRAINT ... UNIQUE (contractor_id)` |
| C2 | Enforce tax-year mileage-method lock | `contractor_vehicles` | new trigger (design decision: block vs auto-revert) |
| C3 | VAT threshold as config, not hardcoded | `platform_settings` | seed row(s), no schema change |
| C4 | Written-off / payment-plan invoice states | `invoices` | new nullable columns (recommend `written_off_at`/`written_off_reason`/`payment_plan`, not a `status` enum value) |
| C5 | `finance_charges` expense category | `expense_categories` | one seed `INSERT` |
| C6 | Missing FK on `expenses.contractor_id` | `expenses` | `ADD CONSTRAINT ... FOREIGN KEY (contractor_id) REFERENCES profiles(id)` (verify zero orphans first — confirmed clean today) |
| L4 | Undocumented RLS drift | `expenses` | drift-repair migration documenting the two-step form as intentional (or revert to direct form for consistency with the original migration — pick one, don't leave it silent) |

Everything else in Section A is already correct and needs no migration.
Section B items are design/data mismatches to resolve in code (which
category slug set to use, which VAT column to read, how to break out job
cost lines) before writing any further schema, not schema bugs themselves.

---

*End of FINANCE-AUDIT.md. Every schema claim traced to a live query run
2026-08-15 against project `tnvxfzmdjpsswjszwbvf`; every migration-file
claim traced to the specific `.sql` file cited inline. Re-run the queries in
Section headers before acting on this if significant time has passed —
per CLAUDE.md, this file is a snapshot, not a substitute for a fresh
Step-0 check at build time.*
