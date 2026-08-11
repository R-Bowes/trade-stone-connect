# I18N-AUDIT.md — Internationalisation Readiness Audit

**Read-only audit. No files modified, no migrations written.**
Source: live database `tnvxfzmdjpsswjszwbvf` (queried via `supabase db query --linked`,
2026-08-11) plus a repo-wide grep of the frontend and edge functions. Where this
document states a schema fact, it came from `information_schema` / `pg_catalog` /
`pg_policies` output pasted directly from the live DB, per CLAUDE.md's
"Schema/policy claims must come from the live DB" rule — not from migration files.

---

## SECTION 1 — MONEY-BEARING TABLES

### Currency column: **NONE EXISTS ANYWHERE.**
A repo-wide `information_schema.columns` sweep for `%currency%` across every
table in `public` returned zero rows. There is no `currency` column on
`issued_quotes`, `invoices`, `jobs`, `enquiries`, `payments`, or any of the ~35
other tables carrying a monetary-shaped column (full list in the sweep below).
Every amount in the system is implicitly GBP, enforced nowhere in the schema —
only by the frontend always rendering `£` and edge functions always formatting
`en-GB`/`GBP` (see Section 6).

### Storage: **`numeric`, not integer minor units, on every table.**
Every monetary column found is Postgres `numeric` (arbitrary precision
decimal), stored as pounds-and-pence (e.g. `12.50` means £12.50), not integer
pence/minor-units. The two exceptions with explicit precision are
`invoices.deposit_amount` (`numeric(10,2)`) and `payments.amount` /
`payments.platform_fee` (`numeric(10,2)`); every other monetary column is
unconstrained `numeric` with no declared precision/scale. `invoice_number`,
`quote_number`, `job_number` are `integer` but those are sequence numbers, not
money.

Stripe amounts are the one place minor units appear, and only transiently:
`stripe-webhook/index.ts` divides Stripe's pence integers by 100 before storing
(`dispute.amount / 100`) — the DB-persisted value is always decimal pounds.

### Full column list — `issued_quotes`

| column | type | nullable | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| contractor_id | uuid | NO | — |
| quote_number | integer | NO | — |
| client_type | text | NO | 'personal' |
| client_name | text | NO | — |
| business_name | text | YES | — |
| client_email | text | NO | — |
| client_phone | text | YES | — |
| client_address | text | YES | — |
| title | text | NO | — |
| description | text | YES | — |
| items | jsonb | NO | '[]' |
| subtotal | numeric | NO | 0 |
| tax_rate | numeric | NO | 0 |
| tax_amount | numeric | NO | 0 |
| total | numeric | NO | 0 |
| status | text | NO | 'draft' |
| valid_until | date | NO | — |
| sent_at | timestamptz | YES | — |
| responded_at | timestamptz | YES | — |
| terms | text | YES | — |
| notes | text | YES | — |
| created_at | timestamptz | NO | now() |
| updated_at | timestamptz | NO | now() |
| recipient_id | uuid | YES | — |
| recipient_response | text | YES | — |
| completion_time | text | YES | — |
| deposit_required | boolean | YES | false |
| deposit_percentage | numeric | YES | 0 |
| enquiry_id | uuid | YES | — |
| project_id | uuid | YES | — |
| version | integer | NO | 1 |
| parent_quote_id | uuid | YES | — |
| deposit_amount | numeric | YES | — |
| deposit_paid | boolean | YES | false |
| deposit_paid_at | timestamptz | YES | — |
| accepted_at | timestamptz | YES | — |
| rejected_at | timestamptz | YES | — |
| customer_note | text | YES | — |
| viewed_at | timestamptz | YES | — |
| estimated_duration_minutes | integer | YES | — |
| payment_schedule | jsonb | YES | — |

CHECK constraints (verbatim): `issued_quotes_recipient_response_valid` —
`CHECK (recipient_response IS NULL OR recipient_response = ANY (ARRAY['accepted','rejected','stalled']))`.
No CHECK constrains `tax_rate` to any specific value (e.g. 20) — it is a free
`numeric`, currently only ever set to 0 or 20 by the frontend.

### Full column list — `invoices`

| column | type | nullable | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| contractor_id | uuid | NO | — |
| client_name | text | NO | — |
| client_email | text | NO | — |
| client_phone | text | YES | — |
| client_address | text | YES | — |
| items | jsonb | NO | '[]' |
| subtotal | numeric | NO | 0 |
| tax_rate | numeric | NO | 0 |
| tax_amount | numeric | NO | 0 |
| total | numeric | NO | 0 |
| status | text | NO | 'draft' |
| issued_date | date | NO | CURRENT_DATE |
| due_date | date | NO | — |
| paid_date | date | YES | — |
| notes | text | YES | — |
| created_at | timestamptz | NO | now() |
| updated_at | timestamptz | NO | now() |
| recipient_id | uuid | YES | — |
| recipient_response | text | YES | — |
| responded_at | timestamptz | YES | — |
| deposit_amount | numeric(10,2) | YES | — |
| deposit_paid | boolean | YES | false |
| deposit_paid_at | timestamptz | YES | — |
| quote_id | uuid | YES | — |
| stripe_payment_intent_id | text | YES | — |
| project_id | uuid | YES | — |
| job_id | uuid | YES | — |
| amount_due | numeric | YES | — |
| deposit_deducted | numeric | YES | — |
| sent_at | timestamptz | YES | — |
| viewed_at | timestamptz | YES | — |
| invoice_number | integer | NO | — |

CHECK constraints: `invoices_status_valid` —
`CHECK (status = ANY (ARRAY['draft','sent','viewed','paid','void']))`;
`invoices_recipient_response_valid` —
`CHECK (recipient_response IS NULL OR recipient_response = ANY (ARRAY['paid','stalled','queried']))`.

### Full column list — `jobs`

| column | type | nullable | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| contractor_id | uuid | NO | — |
| customer_id | uuid | NO | — |
| issued_quote_id | uuid | YES | — |
| title | text | NO | — |
| description | text | YES | — |
| location | text | YES | — |
| status | text | NO | 'scheduled' |
| start_date | date | YES | — |
| end_date | date | YES | — |
| contract_value | numeric | YES | 0 |
| portfolio_approved | boolean | YES | false |
| created_at | timestamptz | NO | now() |
| updated_at | timestamptz | NO | now() |
| company_id | uuid | YES | — |
| sla_rule_id | uuid | YES | — |
| priority | text | YES | — |
| responded_at | timestamptz | YES | — |
| completed_at | timestamptz | YES | — |
| sla_response_due | timestamptz | YES | — |
| sla_resolution_due | timestamptz | YES | — |
| project_id | uuid | YES | — |
| actual_start | timestamptz | YES | — |
| actual_end | timestamptz | YES | — |
| signed_off_at | timestamptz | YES | — |
| signed_off_by | uuid | YES | — |
| site_id | uuid | YES | — |
| asset_id | uuid | YES | — |
| job_type | text | YES | — |
| scheduled_start | timestamptz | YES | — |
| expected_completion | timestamptz | YES | — |
| sla_attendance_due | timestamptz | YES | — |
| sla_completion_due | timestamptz | YES | — |
| sla_status | text | YES | 'not_applicable' |
| job_number | integer | NO | — |
| contractor_signed_off_at | timestamptz | YES | — |
| contractor_signed_off_name | text | YES | — |
| tender_agreement_id | uuid | YES | — |
| engagement_id | uuid | YES | — |
| site_signed_off_at | timestamptz | YES | — |
| site_signed_off_name | text | YES | — |
| site_signed_off_by | uuid | YES | — |

CHECK constraints: `jobs_job_type_check`, `jobs_priority_check` (`P1`–`P4`),
`jobs_sla_status_check`, `jobs_status_check` — see Section 5 pseudo-enum list.
No CHECK bounds `contract_value`.

### Full column list — `enquiries`

| column | type | nullable | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| contractor_id | uuid | YES | — |
| customer_id | uuid | YES | — |
| customer_name | text | YES | — |
| customer_email | text | YES | — |
| customer_phone | text | YES | — |
| customer_ts_code | text | YES | — |
| job_description | text | NO | — |
| location | text | NO | — |
| preferred_timeline | text | YES | — |
| budget_range | text | YES | — |
| photo_urls | ARRAY | YES | — |
| additional_details | text | YES | — |
| status | text | YES | 'new' |
| created_at | timestamptz | YES | now() |
| updated_at | timestamptz | YES | now() |
| project_id | uuid | YES | — |
| trade | text | YES | — |
| title | text | YES | — |
| company_id | uuid | YES | — |
| site_id | uuid | YES | — |
| asset_id | uuid | YES | — |
| job_type | text | YES | — |
| priority | text | YES | — |
| preferred_window_start | date | YES | — |
| preferred_window_end | date | YES | — |
| preferred_time_of_day | text | YES | — |
| access_notes | text | YES | — |
| source | text | YES | 'marketplace' |

**No monetary numeric column at all** — `budget_range` is free `text` (e.g.
"£500 – £1,000", see Section 6's `QuoteRequestDialog.tsx` bucket list), not a
number. CHECK constraints: `enquiries_job_type_check`,
`enquiries_preferred_time_of_day_check` (`am|pm|any` — implicitly English/UK
day-part convention), `enquiries_priority_check`, `enquiries_source_check`,
`enquiries_status_check`.

### Full column list — `payments`

| column | type | nullable | default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| job_id | uuid | YES | — |
| invoice_id | uuid | YES | — |
| payer_id | uuid | YES | — |
| payee_id | uuid | YES | — |
| amount | numeric(10,2) | NO | — |
| platform_fee | numeric(10,2) | YES | — |
| stripe_payment_intent_id | text | YES | — |
| stripe_transfer_id | text | YES | — |
| status | text | YES | 'pending' |
| escrow_released_at | timestamptz | YES | — |
| released_by | uuid | YES | — |
| notes | text | YES | — |
| created_at | timestamptz | YES | now() |
| updated_at | timestamptz | YES | now() |
| project_id | uuid | YES | — |
| type | text | YES | 'balance' |
| contractor_payout | numeric | YES | — |
| stripe_charge_id | text | YES | — |
| stripe_balance_transaction_id | text | YES | — |
| stripe_fee | numeric | YES | — |
| net_platform_revenue | numeric | YES | — |
| refunded_amount | numeric | NO | 0 |
| transfer_reversed_amount | numeric | NO | 0 |

CHECK: `payments_status_check` — `pending|held_in_escrow|released|refunded|failed|disputed`.

### Every other money-bearing table (repo-wide sweep)

A schema-wide grep for columns matching `%amount%|%price%|%cost%|%total%|%fee%
|%value%|%deposit%|%balance%|%rate%|%currency%|%vat%|%tax%|%payout%|%charge%
|%invoice%|%contract_value%|%budget%` surfaced these additional tables, all
`numeric`, none with a currency column: `business_counters`, `chargebacks`
(`amount`, `dispute_fee`, `funds_returned_amount`, `transfer_reversed_amount`),
`contractor_counters`, `contractor_debts` (`amount`, `recovered_amount`),
`contractor_materials` (`unit_cost`), `contractor_projects` (`value_label` is
`text`, not numeric — display-only), `contractor_score_history`,
`contractor_scores`, `contractor_tools` (`purchase_cost`), `contractor_vehicles`
(`method_locked_tax_year` is `text`), `contracts` (`contract_value`
`numeric NOT NULL`), `craft_signals` (`signal_value`), `crm_clients`
(`total_revenue`), `engagement_rates` (`hourly_rate`, `minimum_charge`),
`expenses` (`amount`, `vat_amount`, `vat_rate`, `vat_reclaimable`),
`finance_settings` (`flat_rate_percentage`, `vat_number`, `vat_status`),
`hmrc_mileage_rates` (`rate_per_mile` — HMRC-specific, inherently UK-only),
`job_adjusted_contract_value`, `job_callbacks`, `job_material_usage`
(`unit_cost_at_use`), `job_rams`, `job_variations` (`amount`,
`original_contract_value`, `revised_contract_value`), `marketplace_listings`
(`price`), `mileage_trips` (`claim_amount`, `tax_year`), `payment_schedules`
(`total_contract_value`), `payment_stages` (`calculated_amount`,
`fixed_amount`), `platform_settings`, `profiles` (`hourly_rate`, `vat_number`,
`vat_registered`, `vat_registration_date`), `project_change_requests`
(`cost_impact`), `project_proposals` (`total_cost`), `projects` (`budget`,
`budget_revised`, `deposit_amount`, `deposit_percentage`), `quotes` (legacy,
empty — `budget_range` text), `refunds` (`amount`,
`application_fee_refunded`, `stripe_fee_lost`, `transfer_reversed_amount`),
`service_contracts` (`annual_value`), `site_autonomy_config` (`max_wo_value`),
`subcontracts` (`subcontract_value`), `team_members` (`day_rate`,
`hourly_rate`, `overtime_rate`), `tender_application_price_lines` (`rate`),
`tender_applications` (`lump_sum_total`), `tender_rates_cards` (`hourly_rate`,
`minimum_charge`), `tenders` (`budget_max`, `budget_min`, `budget_visible`),
`timesheets` (`rate_applied`), `trade_averages` (`avg_value`), `work_orders`
(`estimated_cost`, `rate_snapshot` jsonb).

`hmrc_mileage_rates` and `mileage_trips.tax_year` deserve explicit flagging:
these implement **HMRC mileage allowance rules** (45p/25p tiered rate, UK tax
year), which is a UK-specific tax regime baked into the schema and the
`MileageTracking.tsx`/`useMileage.ts` frontend (see Section 6) — not a
generic "trip cost" feature. Internationalising this is not a currency-symbol
change; it is a different tax regime per country.

---

## SECTION 2 — LOCATION FIELDS

### Explicit statement: **no `country` column exists anywhere in the schema.** A repo-wide sweep found no column matching `%country%` on any table.

### Postcode columns — exist, UK-shaped, always optional except `sites`

| table | column | type | nullable | non-null rows |
|---|---|---|---|---|
| companies | postcode | text | YES | 0 |
| profiles | postcode | text | YES | 0 |
| projects | postcode | text | YES | 0 |
| sites | postcode | text | **NO** | 1 |

`sites.postcode` is the only postcode column in the schema with a `NOT NULL`
constraint. Everywhere else it is optional and, in the live data, almost
entirely unpopulated (see row counts below) — most location data currently
lives in free-text `location`/`address` fields instead of the structured
`postcode` columns that do exist.

### All location/address/coordinate columns, full inventory

| table | column | type | nullable |
|---|---|---|---|
| assets | location_note | text | YES |
| companies | address | text | YES |
| companies | address_line1 | text | YES |
| companies | address_line2 | text | YES |
| companies | city | text | YES |
| companies | postcode | text | YES |
| crm_clients | address | text | YES |
| enquiries | location | text | **NO** |
| invoices | client_address | text | YES |
| issued_quotes | client_address | text | YES |
| job_rams | site_address | text | YES |
| jobs | location | text | YES |
| marketplace_listings | location | text | **NO** |
| mileage_trips | from_location | text | **NO** |
| mileage_trips | to_location | text | **NO** |
| profile_videos | platform | text | **NO** (not a location — video host, false-positive on the sweep) |
| profiles | address | text | YES |
| profiles | location | text | YES |
| profiles | postcode | text | YES |
| profiles | service_area_center_lat | numeric | YES |
| profiles | service_area_center_lng | numeric | YES |
| profiles | service_area_radius_miles | integer | YES |
| profiles | working_radius | text | YES |
| projects | address_line_1 | text | YES |
| projects | address_line_2 | text | YES |
| projects | city | text | YES |
| projects | postcode | text | YES |
| public_pro_profiles (view) | location, postcode, service_area_center_lat/lng, service_area_radius_miles, working_radius | mirrors `profiles` | YES |
| quotes (legacy) | project_location | text | YES |
| schedule_events | location | text | YES |
| service_requests | location_in_site | text | YES |
| sites | address | text | **NO** |
| sites | address_line1 | text | YES |
| sites | address_line2 | text | YES |
| sites | city | text | YES |
| sites | postcode | text | **NO** |
| trade_averages | region | text | YES |

Note `profiles.service_area_radius_miles` and `working_radius` — the
service-area/coverage-radius feature (`20260810120000` migration per Section
7) is **miles-only**, no km option, another UK/imperial-unit assumption baked
into a recently-added column, not just legacy debt.

### Non-null row counts (live data, small dataset — 7 profiles, 20 enquiries, 22 quotes, 15 jobs, 4 invoices, 1 company, 1 site, 0 projects)

| column | non-null rows |
|---|---|
| companies.postcode | 0 |
| companies.address | 0 |
| companies.address_line1 | 0 |
| companies.city | 0 |
| profiles.postcode | 0 |
| profiles.address | 1 |
| profiles.location | 2 |
| profiles.service_area_center_lat | 0 |
| profiles.service_area_center_lng | 0 |
| profiles.service_area_radius_miles | 1 |
| profiles.working_radius | 1 |
| projects.postcode | 0 |
| projects.address_line_1 | 0 |
| projects.city | 0 |
| sites.postcode | 1 |
| sites.address | 1 |
| sites.city | 0 |
| enquiries.location | 20 |
| jobs.location | 1 |
| invoices.client_address | 0 |
| issued_quotes.client_address | 0 |
| marketplace_listings.location | 0 |
| schedule_events.location | 0 |
| crm_clients.address | 0 |
| trade_averages.region | 0 |
| quotes.project_location | 0 |

`enquiries.location` is the only heavily-populated location field in the
live dataset (20/20 rows) — and it is unstructured free text, not a
postcode/city/country breakdown.

---

## SECTION 3 — QUOTE LINE ITEMS (`issued_quotes.items` JSONB)

### Every key observed across the entire table (distinct `jsonb_object_keys`)

```
description
quantity
total
unit_price
```

**No `unit` key exists in practice.** There is no field anywhere in the
JSONB shape for a unit of measurement (each, hour, m², linear metre, etc.) —
`quantity` is a bare number with no attached unit, and the UI (`IssuedQuotes.tsx`,
`InvoiceFormDialog.tsx`) labels the price column literally "Unit £" / "Unit
price (£)" as a column header, not a per-row unit value.

### Three real rows (client identifying fields not present in `items` itself — nothing to redact)

```json
// quote_number 20
[
  { "total": 10, "quantity": 1, "unit_price": 10, "description": "Test" }
]

// quote_number 19
[
  { "total": 10, "quantity": 1, "unit_price": 10, "description": "Test" }
]

// quote_number 18
[
  { "total": 100, "quantity": 1, "unit_price": 100, "description": "Test" }
]
```

(`invoices.items` shares the identical `[]::jsonb` default and column shape —
not separately dumped since no populated `invoices.items` rows exist in the
current 4-row dataset, but the TypeScript/PDF code paths treat it identically:
`description` / `quantity` / `unit_price` / `total`, no unit field.)

---

## SECTION 4 — RLS POLICY INVENTORY

Verbatim from `pg_policies` for every table named in Sections 1 and 2, plus
`companies`, `profiles`, `projects`, `sites` (the location-bearing tables),
`crm_clients`, `marketplace_listings`, `schedule_events`, `trade_averages`,
and legacy `quotes`. `public_pro_profiles` has **no rows here** — it is a
plain view (CLAUDE.md's "View idioms" pattern 1, RLS-bypass), so it carries
no `pg_policies` entries of its own; its access gate is entirely the view's
own `WHERE` clause, not visible in this inventory.

### `companies`
| cmd | policyname | qual | with_check |
|---|---|---|---|
| DELETE | Companies deletable by owner | `owner_id IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid())` | — |
| INSERT | Companies insertable by owner | — | `owner_id IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid())` |
| SELECT | Companies readable | `is_company_member(id)` | — |
| SELECT | Companies readable by panel contractors | `id IN (SELECT cp.company_id FROM contractor_panel cp JOIN profiles p ON p.id = cp.contractor_id WHERE p.user_id = auth.uid())` | — |
| SELECT | companies_readable_by_invited_tender_contractors | `EXISTS (SELECT 1 FROM tenders t WHERE t.company_id = companies.id AND contractor_can_view_tender(t.id))` | — |
| UPDATE | Companies editable by owner | `owner_id IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid())` | — |

A new `country_code` column on `companies` would be governed by these same
row-selecting predicates (owner / member / panel-contractor / invited-tender-
contractor) — none of them touch column-level content, so adding a nullable
`country_code` column here **does not widen access**; it's covered by
whatever row a caller could already see in full. Same conclusion applies to
every other table below: all of these policies are row-level (`USING`/`WITH
CHECK` on ownership/membership), none of them do column-level filtering, so a
new column added to any of these tables inherits the existing row gate
automatically and cannot itself create a leak — the risk instead would be
adding a **new relaxed policy** while introducing the column, not the column
alone.

### `crm_clients`
| cmd | policyname | qual |
|---|---|---|
| ALL | Contractors can manage their own clients | `contractor_id = auth.uid()` |

### `enquiries`
| cmd | policyname | qual / with_check |
|---|---|---|
| INSERT | Company members can create company enquiries | WC: `company_id IS NOT NULL AND is_company_member(company_id) AND customer_id IN (...)` |
| INSERT | Customers can create enquiries | WC: `auth.uid() = customer_id` |
| INSERT | enquiries_customer_insert | WC: `customer_id IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid())` |
| SELECT | Admins can read all enquiries | `EXISTS (SELECT 1 FROM admin_users WHERE admin_users.user_id = auth.uid())` |
| SELECT | Company members can read company enquiries | `company_id IS NOT NULL AND is_company_member(company_id)` |
| SELECT | Contractors can view their enquiries | `contractor_id IN (SELECT profiles.id ... auth.uid())` |
| SELECT | Customers can view own enquiries | `auth.uid() = customer_id` |
| SELECT | admin_select_enquiries | `is_platform_admin()` |
| SELECT | enquiries_contractor_select | `contractor_id IN (...)` |
| SELECT | enquiries_customer_select | `customer_id IN (...) OR contractor_id IN (...)` |
| UPDATE | Contractors can update enquiry status | `contractor_id IN (...)` |
| UPDATE | admin_update_enquiries | `is_platform_admin()` |
| UPDATE | enquiries_customer_update | `customer_id IN (...)` |

Note this table carries **two overlapping generations** of SELECT policy
(`Contractors can view their enquiries` / `enquiries_contractor_select` are
functionally identical; likewise the customer pair) — consistent with
CLAUDE.md's LATER.md note about 11 overlapping `enquiries` policies needing
consolidation. A `country_code` addition here rides the same row predicates;
no widening risk.

### `invoices`
| cmd | policyname | qual / with_check |
|---|---|---|
| DELETE | Contractors can delete their own invoices | `contractor_id IN (...)` |
| INSERT | Contractors can insert their own invoices | WC: `contractor_id IN (...)` |
| SELECT | Admins can read all invoices | `EXISTS (admin_users...)` |
| SELECT | Contractors can view their own invoices | `contractor_id IN (...)` |
| SELECT | Recipients can view their invoices | `recipient_id IN (...)` |
| SELECT | admin_select_invoices | `is_platform_admin()` |
| UPDATE | Contractors can update their own invoices | `contractor_id IN (...)` |
| UPDATE | Recipients can respond to their invoices | `recipient_id IN (...)` |
| UPDATE | admin_update_invoices | `is_platform_admin()` |

### `issued_quotes`
| cmd | policyname | qual / with_check |
|---|---|---|
| DELETE | issued_quotes_contractor_delete | `contractor_id IN (...)` |
| INSERT | issued_quotes_contractor_insert | WC: `contractor_id IN (...)` |
| SELECT | Recipients can view their quotes | `recipient_id IN (...)` |
| SELECT | issued_quotes_contractor_select | `contractor_id IN (...)` |
| UPDATE | Recipients can respond to their quotes | `recipient_id IN (...)` |
| UPDATE | issued_quotes_contractor_update | `contractor_id IN (...)` |

### `jobs`
| cmd | policyname | qual / with_check |
|---|---|---|
| ALL | Contractors can manage their own jobs | `contractor_id IN (...)` |
| INSERT | Clients can create jobs on their projects | WC: `customer_id IN (...)` |
| INSERT | Clients can insert jobs | WC: `customer_id IN (...)` |
| SELECT | Admins can read all jobs | `EXISTS (admin_users...)` |
| SELECT | Clients can view their jobs | `customer_id IN (...) OR contractor_id IN (...)` |
| SELECT | Company members can view company jobs | `company_id IS NOT NULL AND is_company_member(company_id)` |
| SELECT | Team members can view their contractor's jobs | `contractor_id IN (SELECT acting_contractor_ids())` |
| SELECT | admin_select_jobs | `is_platform_admin()` |
| UPDATE | Clients can update their job fields | `customer_id IN (...)` |
| UPDATE | Team members can update their contractor's jobs | `contractor_id IN (SELECT acting_contractor_ids())` |
| UPDATE | admin_update_jobs | `is_platform_admin()` |

Two near-duplicate INSERT policies ("Clients can create jobs on their
projects" and "Clients can insert jobs") — same predicate, one is dead
weight, flag for cleanup, not an i18n issue.

### `marketplace_listings`
| cmd | policyname | qual |
|---|---|---|
| DELETE | Sellers can delete their own listings | `auth.uid() = seller_id` |
| INSERT | Sellers can insert their own listings | WC: `auth.uid() = seller_id` |
| SELECT | Anyone can view active marketplace listings | `is_active = true` |
| UPDATE | Sellers can update their own listings | `auth.uid() = seller_id` |

The SELECT policy is `is_active = true` with **no role restriction at all** —
anon and authenticated alike see every active listing including its `location`
free-text field. A `country_code` here would be world-readable by design
(same as `location` already is) — consistent with the intentional public
directory pattern documented elsewhere in CLAUDE.md, not a new risk.

### `payments`
| cmd | policyname | qual / with_check |
|---|---|---|
| INSERT | Contractors can record manual payments as payee | WC: `payee_id = auth.uid() AND type = 'manual' AND invoice_id IN (SELECT id FROM invoices WHERE contractor_id = auth.uid())` |
| INSERT | Payments insertable by payer | WC: `auth.uid() = payer_id` |
| SELECT | Payments visible to payee | `auth.uid() = payee_id` |
| SELECT | Payments visible to payer | `auth.uid() = payer_id` |

Note: `payer_id`/`payee_id` here compare `auth.uid()` **directly** (not via
`profiles.id` two-step) — consistent with CLAUDE.md's documented
`profiles.id == profiles.user_id` invariant.

### `profiles`
| cmd | policyname | qual / with_check |
|---|---|---|
| INSERT | Service role can insert profiles | role: service_role, WC: `true` |
| INSERT | Users can insert their own profile | WC: `auth.uid() = user_id` |
| SELECT | Admins can read all profiles | `EXISTS (admin_users...)` |
| SELECT | Authenticated users can view basic profiles | `true` (role: authenticated) |
| SELECT | Users can view their own profile | `auth.uid() = user_id` |
| SELECT | admin_select_profiles | `is_platform_admin()` |
| UPDATE | Admins can update all profiles | `EXISTS (admin_users...)` |
| UPDATE | Users can update their own profile | `auth.uid() = user_id` |
| UPDATE | admin_update_profiles | `is_platform_admin()` |

**"Authenticated users can view basic profiles" is `USING (true)`** — every
column on `profiles`, including `postcode`, `address`, `location`, is visible
to any authenticated user today (this is the LATER.md-flagged "scope the
profiles SELECT policy down from `USING (true)`" item, referenced in the
session-2 log). Adding a nullable `country_code` to `profiles` would be
immediately world-readable-to-authenticated-users through this existing
policy, same as every other profile column already is — not a new widening,
but worth flagging precisely because this is the one table where the
existing policy is already maximally broad, so a new column here has zero
extra protection from RLS at all.

### `projects`
| cmd | policyname | qual / with_check |
|---|---|---|
| ALL | projects_customer_all | `posted_by IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid())` |
| SELECT | projects_contractor_select | `id IN (SELECT enquiries.project_id FROM enquiries WHERE enquiries.contractor_id IN (...))` |

### `quotes` (legacy, empty table)
| cmd | policyname | qual |
|---|---|---|
| DELETE | Contractors can delete their own quotes | `contractor_id = auth.uid()` |
| INSERT | Contractors can insert their own quotes | WC: `contractor_id = auth.uid()` |
| SELECT | Contractors can view their own quotes | `contractor_id = auth.uid()` |
| UPDATE | Contractors can update their own quotes | `contractor_id = auth.uid()` |

### `schedule_events`
| cmd | policyname | qual / with_check |
|---|---|---|
| DELETE | schedule_events_contractor_delete | `contractor_id IN (...)` |
| INSERT | Recipients can insert schedule proposals | WC: `quote_id IN (SELECT id FROM issued_quotes WHERE recipient_id IN (...))` |
| INSERT | schedule_events_contractor_insert | WC: `contractor_id IN (...)` |
| SELECT | Customers can view site visit proposals for their enquiries | `event_type = 'site_visit' AND enquiry_id IN (...)` |
| SELECT | Recipients can view schedule events for their quotes | `quote_id IN (...) OR contractor_id IN (...)` |
| SELECT | Team members can view their contractor's schedule events | `contractor_id IN (SELECT acting_contractor_ids())` |
| SELECT | schedule_events_contractor_select | `contractor_id IN (...) OR quote_id IN (...)` |
| UPDATE | Customers can respond to site visit proposals | `event_type = 'site_visit' AND enquiry_id IN (...)` |
| UPDATE | Parties can update schedule events | `contractor_id IN (...) OR quote_id IN (...)` |

### `sites`
| cmd | policyname | qual / with_check |
|---|---|---|
| DELETE | sites_delete | `is_company_owner(company_id)` |
| INSERT | sites_insert | WC: `is_company_owner(company_id)` |
| SELECT | Sites readable by contractor via visit | `id IN (SELECT a.site_id FROM assets a JOIN service_visits sv ON sv.asset_id = a.id WHERE sv.contractor_id IN (...))` |
| SELECT | sites_readable_by_invited_tender_contractors | `EXISTS (SELECT 1 FROM tender_sites ts WHERE ts.site_id = sites.id AND contractor_can_view_tender(ts.tender_id))` |
| SELECT | sites_select | `can_access_site(id)` |
| UPDATE | sites_update | `can_access_site(id)` — WC same |

`sites.postcode` (the one `NOT NULL` postcode column in the schema) sits
behind `can_access_site()` — a SECURITY DEFINER coverage check, per CLAUDE.md's
B2B/FM foundation. No column-level exposure risk here either.

### `trade_averages`
| cmd | policyname | qual |
|---|---|---|
| ALL | Service role full access to trade averages | role: service_role, `true` |
| SELECT | Public reads trade averages | `true` (role: public, includes anon) |

`trade_averages.region` is public/anon-readable by design already (this is
an aggregate benchmarking table) — a `country` column here, if ever added,
would be intentionally public too, matching how `region` already behaves.

### Summary for Section 4's stated purpose
No policy on any of these tables filters or references columns by name
(no `SELECT ... some_column IS NOT NULL` style predicate) — every predicate
is row-ownership/membership based. **Adding a nullable `country_code` column
to any of these tables would not by itself widen access on any of them.**
The two places worth a second look before adding new PII-adjacent columns are
(a) `profiles`' `USING (true)` authenticated-read policy (already maximally
broad, documented above) and (b) `marketplace_listings`' `is_active = true`
anon-readable policy (already public by design, documented above) — both are
pre-existing, reviewed, intentional broad policies per CLAUDE.md's "Deliberately
public / known-broad RLS policies" section, not newly discovered issues.

---

## SECTION 5 — TAXONOMY AND ENUMS

### Hardcoded 61-entry trades constant

**File**: [`src/constants/trades.ts`](src/constants/trades.ts)
**Export**: `CONTRACTOR_TRADES` (a `const` string-literal array, 61 entries,
confirmed by direct count against the file), plus a derived `ContractorTrade`
type and a `TRADE_TYPES: readonly string[]` re-export. All 61 entries are
UK-trade-naming-convention English strings (e.g. "Bricklaying", "Damp
Proofing", "Loft Conversions", "EV Charger Installation") — no locale
indirection, no translation keys, consumed directly as user-facing display
text and as the stored value in `profiles.trades` / `enquiries.trade`.

### Every Postgres ENUM type in the database

| enum_name | values (in order) |
|---|---|
| `asset_category` | fire_safety, emergency_lighting, fire_suppression, fire_doors, smoke_ventilation, electrical, lightning_protection, ups_systems, solar_panels, ev_charging, hvac, boilers, air_handling, ventilation, heat_pumps, chiller_systems, plumbing, water_hygiene, water_treatment, drainage, rainwater_harvesting, gas, gas_detection, security, access_control, cctv, intruder_alarms, intercoms, lifts_lifting, escalators, loading_bays, roofing, glazing, doors_windows, cladding, structural, grounds, car_parks, drainage_external, pest_control, asbestos, legionella, air_quality, waste_management, other (45 values) |
| `service_contract_status` | draft, active, expired, cancelled |
| `service_document_type` | certificate, report, invoice, photo, other |
| `service_frequency` | weekly, bi_weekly, monthly, bi_monthly, quarterly, six_monthly, annual, 2_yearly, 3_yearly, 4_yearly, 5_yearly, 6_yearly, 7_yearly, 8_yearly, 9_yearly, 10_yearly (16 values) |
| `service_visit_status` | scheduled, confirmed, completed, overdue, cancelled |
| `user_type` | personal, business, contractor |

`asset_category` (45 values) includes `legionella` and `water_hygiene` as
distinct categories — Legionella (water system) risk assessment is a
UK/EU-specific regulatory compliance category (HSE ACOP L8); not necessarily
meaningful terminology outside that regulatory context, another
implicit-UK-regime item alongside `hmrc_mileage_rates` in Section 1.

### Every CHECK constraint acting as a pseudo-enum

Already inventoried verbatim in Section 1's constraint dump; the full list
across every table (`profiles`, `quotes`, `team_members`, `marketplace_listings`,
`invoices`, `issued_quotes`, `expenses`, `jobs`, `enquiries`, `projects`,
`project_proposals`, `project_change_requests`, `tenders`,
`tender_applications`, `contractor_materials`, `job_material_usage`,
`finance_settings`, `mileage_trips`, `craft_signals`, `work_orders`,
`site_autonomy_config`, `payment_schedules`, `payment_stages`,
`job_variations`, `refunds`, `contractor_debts`) totals 40 pseudo-enum CHECK
constraints, all `ANY (ARRAY[...])` over English string literals. None of
them encode locale — they're workflow-state enums (status/type/reason
values), not user-facing locale-sensitive text, except:

- `enquiries_preferred_time_of_day_check` — `am|pm|any`: encodes a 12-hour
  AM/PM day-part convention directly into the constraint values (not just
  display formatting).
- `finance_settings_business_type_check` — `sole_trader|limited_company`:
  UK company-structure terminology; not a universal business-entity taxonomy.
- `finance_settings_vat_status_check` — `not_registered|standard|flat_rate`:
  the UK VAT Flat Rate Scheme is a UK-specific tax mechanism.
- `contractor_debts_source_type_check` / `chargebacks` — describe a Stripe-
  centric dispute/chargeback model, not locale-specific but payment-provider-
  specific.

### Units of measurement

**`contractor_materials_unit_check`** is the only unit-of-measurement
pseudo-enum in the schema:
`CHECK (unit = ANY (ARRAY['metres','kg','litres','each','box','roll','pack','length']))`
on `contractor_materials.unit`. This is metric (`metres`, `kg`, `litres`) —
the one place in the schema units are metric rather than imperial. It stands
in direct contrast to `profiles.service_area_radius_miles` (Section 2) and
`mileage_trips`/`hmrc_mileage_rates` (Section 1), which are imperial
(miles). **There is no unit column on `issued_quotes.items` /
`invoices.items`** (confirmed in Section 3) — line-item quantities have no
unit at all, metric or imperial.

No other table has a units-of-measurement column or CHECK constraint.

---

## SECTION 6 — HARDCODED LOCALE ASSUMPTIONS

Grouped by pattern (a per-file breakdown for the `£`/`GBP`/date-format
categories would mean listing ~120 near-identical lines across ~90 files —
see the representative sample under each pattern; every match found is
included, none truncated within a pattern's list).

### GBP symbol (`£`) as a literal — 90 files, ~220 occurrences

Every one of these is a raw `£` character concatenated or interpolated into
a string, independent of `Intl.NumberFormat`. Full file list (frontend):
`src/data/marketplaceData.ts`, `src/pages/AdminDashboard.tsx`,
`src/lib/generateJobRecordPdf.ts`, `src/lib/invoiceMoney.ts`,
`src/lib/generateInvoicePdf.ts`, `src/components/consumer/VariationApproval.tsx`,
`src/pages/HowItWorks.tsx`, `src/pages/BusinessManagement.tsx`,
`src/pages/ContractorProfile.tsx`, `src/pages/HomeownerDashboard.tsx`,
`src/pages/ContractorKPIInsights.tsx`, `src/pages/legal/TermsAndConditions.tsx`,
`src/pages/ContractorOnboarding.tsx`, `src/pages/ContractorDashboard.tsx`,
`src/components/admin/AdminRevenue.tsx`, `src/components/business/WorkOrderDashboard.tsx`,
`src/pages/SitePortal.tsx`, `src/hooks/usePaymentSchedule.ts`,
`src/hooks/useJobVariations.ts`, `src/components/business/SiteAutonomySettings.tsx`,
`src/pages/PayInvoicePage.tsx`, `src/components/business/MaintenanceManagement.tsx`,
`src/components/contractor/EnquiryDetailSheet.tsx`,
`src/components/contractor/thread/ThreadInvoiceSection.tsx`,
`src/components/contractor/thread/ThreadQuoteSection.tsx`,
`src/components/contractor/thread/ThreadJobSection.tsx`,
`src/components/contractor/tenders/ContractorApplicationStepper.tsx`,
`src/components/profile/CanvasEditor.tsx`, `src/components/projects/PostTenderForm.tsx`,
`src/components/projects/SubmitProposalForm.tsx`, `src/components/QuoteRequestDialog.tsx`,
`src/components/management/FinanceSettings.tsx`, `src/components/management/ClientJobsView.tsx`,
`src/components/management/ContractManagement.tsx`, `src/components/management/CRMManagement.tsx`,
`src/components/management/JobManagement.tsx`, `src/components/recipient/DepositPaymentDialog.tsx`,
`src/components/recipient/ReceivedQuotes.tsx`, `src/components/recipient/QuoteBreakdownSummary.tsx`,
`src/components/management/crm/ClientDetail.tsx`, `src/components/management/IssuedQuotes.tsx`,
`src/components/management/InvoiceManagement.tsx`, `src/components/management/InventoryManagement.tsx`,
`src/components/recipient/ReceivedInvoices.tsx`, `src/components/recipient/QuoteAcceptScreen.tsx`,
`src/components/recipient/QuoteScheduleNegotiation.tsx`,
`src/components/management/financials/AgedDebtors.tsx`, `src/components/management/financials/ExpenseFormDialog.tsx`,
`src/components/management/financials/ExpenseList.tsx`, `src/components/management/financials/FinanceDashboard.tsx`,
`src/components/management/financials/MileageTracking.tsx`, `src/components/management/financials/VatPosition.tsx`,
`src/components/management/financials/JobProfitability.tsx`, `src/components/management/financials/ProfitAndLoss.tsx`,
`src/components/management/invoices/RecordPaymentDialog.tsx`, `src/components/management/invoices/InvoiceFormDialog.tsx`,
`src/components/management/payments/PaymentProgress.tsx`, `src/components/management/quotes/PaymentScheduleBuilder.tsx`,
`src/components/management/SendQuoteDialog.tsx`, `src/components/management/TeamManagement.tsx`,
`src/components/management/TimesheetManagement.tsx`, `src/components/management/SubcontractManagement.tsx`,
`src/components/management/WorkOrderInbox.tsx`, `src/components/management/variations/VariationRequestForm.tsx`,
`src/components/management/variations/VariationsSection.tsx`, `src/pages/ProjectDelivery.tsx`,
`src/pages/Projects.tsx`, `src/pages/ProposalReview.tsx`, `src/pages/TenderDetail.tsx`,
`src/pages/MarketplaceItem.tsx`, `src/components/marketplace/MarketplaceItemCard.tsx`,
`src/components/business/BusinessJobsView.tsx`, `src/components/business/BusinessOverview.tsx`,
`src/components/business/BusinessSpendView.tsx`, `src/components/JobEquipmentMaterials.tsx`,
`src/components/management/InventoryManagement.tsx`. Representative lines:

```
src/pages/AdminDashboard.tsx:940:   {inv.total_amount != null ? `£${Number(inv.total_amount).toFixed(2)}` : '—'}
src/lib/generateInvoicePdf.ts:217:  doc.text(`£${Number(invoice.subtotal).toFixed(2)}`, totalsX, tY, { align: "right" });
src/components/management/financials/AgedDebtors.tsx:44: const gbp = (n: number) => `£${n.toLocaleString("en-GB", {...})}`;
src/components/QuoteRequestDialog.tsx:50-56: "Under £100" / "£100 – £250" / ... / "£5,000+"  (hardcoded budget-bucket strings)
```

Edge functions with `£` literals (9 files):
`supabase/functions/generate-year-end-pack/index.ts`,
`supabase/functions/generate-quote-pdf/index.ts`,
`supabase/functions/_shared/pdfBranding.ts` (lines 263, 326: `currency = options.currency ?? "£"` — the one place a currency override *parameter* exists, but it is never called with anything other than the default anywhere in the codebase),
`supabase/functions/generate-completion-pdf/index.ts`,
`supabase/functions/process-refund/index.ts`,
`supabase/functions/_shared/emailTemplate.ts` (type comments only: `amount: string; // e.g. "£9.00"`),
`supabase/functions/stripe-webhook/index.ts`,
`supabase/functions/mark-overdue-invoices/index.ts`,
`supabase/functions/process-recurring-expenses/index.ts`.

### `"GBP"` as a string literal — 20 files

`src/pages/ContractorKPIInsights.tsx:83`, `src/components/JobEquipmentMaterials.tsx:46`,
`src/pages/MarketplaceItem.tsx:42`, `src/components/marketplace/MarketplaceItemCard.tsx:14`,
`src/pages/ProjectDelivery.tsx:118`, `src/pages/Projects.tsx:31`,
`src/pages/ProposalReview.tsx:83`, `src/pages/TenderDetail.tsx:61`,
`src/components/business/BusinessJobsView.tsx:125`, `src/components/business/BusinessOverview.tsx:57`,
`src/components/business/BusinessSpendView.tsx:22,26`, `src/components/projects/PostTenderForm.tsx:294`,
`src/components/projects/SubmitProposalForm.tsx:106`, `src/components/management/InventoryManagement.tsx:80`,
`src/components/management/TimesheetManagement.tsx:78`, `src/components/management/TeamManagement.tsx:116`,
`supabase/functions/generate-project-contract/index.ts:45`. Every one of these
is `new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" })` —
the locale AND the currency are both hardcoded together, always as a pair,
never read from a settings/profile column (there is no currency column to
read from — Section 1).

### VAT rate literals

`src/components/management/ProfileManagement.tsx:486,518` — "20% VAT" in
copy text; `src/components/management/financials/VatPosition.tsx:103,192` —
"£90,000" VAT registration threshold and "£2,000" Flat Rate Scheme capital
threshold hardcoded in copy; `src/components/management/FinanceSettings.tsx:408`
— "£90,000" threshold repeated. These are UK HMRC-specific thresholds
(current UK VAT registration threshold), not configurable constants — no
`VAT_THRESHOLD` constant exists to search for; the figures are typed directly
into JSX. The actual tax-RATE default (0/20) lives in DB defaults
(`invoices.tax_rate` / `issued_quotes.tax_rate` default `0`, set to 20 by
`InvoiceFormDialog`/`SendQuoteDialog` logic when `vat_registered = true`,
Section 1) rather than a `0.20` literal in code — no `0.20` or `"20%"` numeric
literal was found controlling calculation logic; the 20/0 split is a UI
default, not a hardcoded formula multiplier.

### `toLocaleString` / `toLocaleDateString` / `toLocaleTimeString` / `Intl.*`

**138 call sites found, 100% of them pass `"en-GB"` explicitly** as the
locale argument — none are locale-omitted in the currency/date-formatting
helper functions. Every `formatGBP`/`gbp`/`fmt`/`fmtDate` helper across the
codebase (one redefined per-file rather than a shared utility — e.g.
`formatGBP` is independently defined in `JobEquipmentMaterials.tsx`,
`ProjectDelivery.tsx`, `Projects.tsx`, `ProposalReview.tsx`, `TenderDetail.tsx`,
`SubmitProposalForm.tsx`, `InventoryManagement.tsx`, `TimesheetManagement.tsx`,
`TeamManagement.tsx`, `PostTenderForm.tsx` — ten separate re-implementations
of the same GBP formatter, a duplication issue independent of i18n) hardcodes
`en-GB`.

**Exceptions — calls with NO locale argument (implicit system/browser
locale), found in a separate sweep:**
```
src/components/management/ContractManagement.tsx:384: contract.contract_value.toLocaleString()
src/components/management/ContractManagement.tsx:411: new Date(contract.start_date).toLocaleDateString()
src/components/management/ContractManagement.tsx:416: new Date(contract.end_date).toLocaleDateString()
src/components/management/SubcontractManagement.tsx:366: sub.subcontract_value.toLocaleString() ... new Date(sub.start_date).toLocaleDateString()
src/components/management/CRMManagement.tsx:119: totalRevenue.toLocaleString()
src/components/management/CRMManagement.tsx:171: client.total_revenue.toLocaleString()
src/components/management/crm/ClientDetail.tsx:78: client.total_revenue.toLocaleString()
src/components/management/crm/ClientDetail.tsx:147: job.contract_value.toLocaleString()
src/components/ui/chart.tsx:212: item.value.toLocaleString()
```
These nine call sites are the genuinely locale-**unsafe** ones — they'll
silently render numbers/dates in whatever locale the visitor's browser is
set to (inconsistent with the rest of the app's forced `en-GB`), rather than
being hardcoded-but-consistent like everywhere else.

Representative `Intl.DateTimeFormat`/`NumberFormat` module-level instances
(pre-built formatters, all `en-GB`): `src/components/management/AvailabilityManagement.tsx:117-119`,
`src/components/management/InventoryManagement.tsx:65,71`,
`src/components/management/TimesheetManagement.tsx:69-70`,
`src/components/management/TeamManagement.tsx:107`.

### Date format strings containing `d MMM`/`dd MMM` (date-fns `format()`)

**~90 call sites**, exclusively the pattern `"d MMM yyyy"` or `"dd MMM
yyyy"` (with time-of-day variants like `"d MMM yyyy 'at' HH:mm"` or
`"EEE d MMM yyyy"`), consistent with CLAUDE.md's stated "UK date format (d
MMM yyyy)" rule — this is a deliberate house style, not oversight, but it is
100% hardcoded per-call, not centralised in one formatter or driven by a
locale setting. Files (partial — every file below has 1-6 occurrences of the
identical pattern, full set of matches captured, not sampled):
`src/lib/generateInvoicePdf.ts`, `src/lib/generateJobRecordPdf.ts`,
`src/pages/HomeownerDashboard.tsx`, `src/pages/SitePortal.tsx`,
`src/components/contractor/EnquiryDetailSheet.tsx`,
`src/components/contractor/thread/ThreadQuoteSection.tsx`,
`src/components/contractor/thread/ThreadWorknotesSection.tsx`,
`src/components/contractor/thread/ThreadInvoiceSection.tsx`,
`src/components/contractor/thread/ThreadJobSection.tsx`,
`src/components/business/AssetDetail.tsx`, `src/components/business/BusinessJobsView.tsx`,
`src/components/contractor/tenders/ContractorTendersPipeline.tsx`,
`src/components/business/BusinessComplianceView.tsx`, `src/components/business/BusinessOverview.tsx`,
`src/components/business/BusinessMessageInbox.tsx`, `src/components/contractor/tenders/ContractorTenderBrief.tsx`,
`src/components/business/BusinessRequestsView.tsx`, `src/components/JobPhotosTab.tsx`,
`src/components/homeowner/SiteVisitReviewDialog.tsx`, `src/components/homeowner/HomeownerMessageInbox.tsx`,
`src/components/management/ClientJobsView.tsx`, `src/components/business/BusinessTenderDetail.tsx`,
`src/components/management/certificates/JobCertificates.tsx`, `src/components/management/financials/AgedDebtors.tsx`,
`src/components/management/crm/ClientDetail.tsx`, `src/components/business/PpmComplianceDashboard.tsx`,
`src/components/management/financials/ExpenseList.tsx`, `src/components/management/financials/ExpenseFormDialog.tsx`,
`src/components/management/IssuedQuotes.tsx`, `src/components/business/ServiceRequestQueue.tsx`,
`src/components/management/InvoiceManagement.tsx`, `src/components/management/financials/FinanceDashboard.tsx`,
`src/components/business/WorkOrderDashboard.tsx`, `src/components/management/JobManagement.tsx`,
`src/components/management/financials/MileageTracking.tsx`, `src/components/management/rams/RamsEditor.tsx`,
`src/components/management/payments/PaymentProgress.tsx`, `src/components/management/schedule/WeekCalendar.tsx`,
`src/components/management/variations/VariationsSection.tsx`, `src/components/recipient/QuoteScheduleNegotiation.tsx`,
`src/components/recipient/ReceivedInvoices.tsx`, `src/components/recipient/QuoteBreakdownSummary.tsx`,
`src/components/recipient/ReceivedQuotes.tsx`, `src/components/personal/EnquiryList.tsx`,
`src/components/recipient/QuoteAcceptScreen.tsx`.

No file uses `date-fns`'s locale parameter (`{ locale: enGB }` etc.) — the
UK-ness comes entirely from the literal format token order (`d MMM yyyy`, not
`MMM d, yyyy`), not from date-fns locale configuration, meaning even the
month names (`Jan`, `Feb`...) are English-hardcoded by the token, not
locale-translated.

### Hardcoded "UK" / "United Kingdom" / "England" / "Great Britain"

```
src/components/Footer.tsx:36:      <p>Registered in England &amp; Wales</p>
src/components/Footer.tsx:37:      <p>82a James Carter Road, Mildenhall, Bury St. Edmunds, IP28 7DE</p>
src/pages/legal/TermsAndConditions.tsx:23-25: "...registered in England and Wales (company number 17229262), registered office at 82a James Carter Road, Mildenhall, Bury St. Edmunds, England, IP28 7DE."
src/pages/legal/TermsAndConditions.tsx:189: "These Terms are governed by the laws of England and Wales."
src/pages/legal/PrivacyPolicy.tsx:21: "Registered Address: 82a James Carter Road, Mildenhall, Bury St. Edmunds, England, IP28 7DE"
supabase/functions/_shared/emailTemplate.ts:163: "82a James Carter Road, Mildenhall, IP28 7DE<br/>" (company address baked into every transactional email footer)
```
These are legal/company-registration facts (genuinely fixed regardless of
who uses the platform — TradeStone Group Ltd is an England & Wales company),
not locale-adaptive content, so they're lower-priority than the transactional
UI strings above, but they do mean the governing-law clause and footer are
non-negotiable UK text in every email sent, everywhere.

No bare `"UK"` or `'UK'` or `"Great Britain"` string literal was found
anywhere in `.ts`/`.tsx` — only the `England`/company-address instances
above, plus the geocode function's UK-only comment (below).

### Postcode regex patterns

**One regex found**, `src/hooks/useContractors.ts:50`:
```ts
// Full UK postcode shape only (not a bare outcode, not a place name) --
// matches exactly what geocode-postcode's postcodes.io call expects
const UK_POSTCODE_REGEX = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;
```
Used at line 131 to gate whether the directory search box's input string
gets sent to the `geocode-postcode` edge function (radius-ranked search) or
falls back to a plain `ILIKE` substring match. A non-UK postcode format
(e.g. a US ZIP or a Canadian postal code) fails this regex and silently
degrades to substring search — not an error, just a quieter/worse search
experience.

The `geocode-postcode` edge function itself
(`supabase/functions/geocode-postcode/index.ts:3-4`) states in its header
comment: *"Resolves a UK postcode to lat/lng via postcodes.io (free, no API
key, UK-only)."* — the postcode→coordinate geocoding capability that backs
the new radius-based contractor search (per the most recent commits,
`f5539c1`/`71d8028`) is architecturally UK-only; there is no non-UK geocoding
provider integrated anywhere.

Onboarding/settings forms use UK-format placeholder text only (not
validation regex): `ContractorOnboarding.tsx:339` — `"M1 1AE"`,
`BusinessSettings.tsx:312` — `"EC1A 1BB"`, `ProfileManagement.tsx:429` —
`"e.g. M1 1AE"`, `HomeownerDashboard.tsx:536` — `"e.g. SW1A 1AA"`,
`MaintenanceManagement.tsx:157` — `"SW1A 1AA"`, `PostTenderForm.tsx:441` —
`"M1 1AE"`.

### Phone number validation or formatting

**None found.** No phone-number regex, validation function, or formatting
helper exists anywhere in the codebase — every `phone`/`client_phone`/
`customer_phone` column is stored and displayed as plain free-text (confirmed
via `information_schema` — all `text` type, no CHECK constraint) with no
format enforcement in either direction. This is locale-agnostic by omission
rather than by hardcoding (nothing to fix, but also nothing validating
input quality).

### Timezone literals / `Europe/London`

**No `Europe/London` literal and no explicit `timeZone:` option** found
anywhere in `.ts`/`.tsx`. Every date/time render relies on the browser's
local timezone implicitly (via `new Date(...)`/`toLocaleDateString` with no
`timeZone` override) — this means a contractor and customer in different
timezones would each see times rendered in their own local zone, which is
usually correct behaviour but is worth noting as "implicit, not stated"
rather than an explicit UK-timezone assumption. Two files have comments
explicitly calling out UTC-vs-local handling as a deliberate choice (not a
bug): `src/hooks/useMileage.ts:18` ("avoid UTC/local timezone shifting the
day near..."), `supabase/functions/process-recurring-expenses/index.ts:38`
("Date-only arithmetic in UTC to avoid timezone rollover..."),
`src/components/business/AssetDetail.tsx:58` ("compare as calendar days at
UTC midnight, no local-timezone drift"). These are careful DATE-column
handling, not timezone-locale hardcoding.



> **Correction (11 Aug 2026):** The "9 unsafe no-locale-arg call
> sites" figure conflates two different defects. Only 3 are
> `toLocaleDateString()` on dates — fixed via `src/lib/formatDate.ts`
> (ContractManagement.tsx:411,416; SubcontractManagement.tsx:366).
> The remaining 6 are `toLocaleString()` on NUMBERS (contract_value,
> total_revenue, subcontract_value, chart item.value). Those are a
> currency/number formatting defect, not a date defect — no
> UTC-midnight bug applies. They belong with the currency formatter
> work, tracked in LATER.md.
---

## SECTION 7 — MIGRATION FLOOR

Highest applied migration in the live database (`supabase_migrations.schema_migrations`,
top 5 by version descending):

```
20260810120000   ← highest applied — any new migration file must sort above this
20260808140000
20260808130000
20260808120000
20260808110000
```

Any i18n-readiness migration must use a timestamp prefix greater than
**`20260810120000`**.

---

## SECTION 8 — PDF AND EMAIL TEMPLATES

Every generator that renders a currency figure, a date, or an address, with
how each formats those three things:

| generator | file | currency | date | address |
|---|---|---|---|---|
| Invoice PDF (client-side, jsPDF) | `src/lib/generateInvoicePdf.ts` | raw `£` + `.toFixed(2)` (lines 193-257) | `format(date, "dd MMM yyyy")` (date-fns, lines 143-153) | `invoice.client_address` / `contractor.address` rendered as a single free-text block via `doc.splitTextToSize()` (lines 98-101, 183) — no structured line1/city/postcode/country layout |
| Job Record PDF (client-side, jsPDF) | `src/lib/generateJobRecordPdf.ts` | raw `£` + `.toFixed(2)` (lines 177, 241) | `format(date, "dd MMM yyyy")`, one `"dd MMM yyyy 'at' HH:mm"` (lines 115-275) | not address-rendering (job/contract summary doc) |
| Quote PDF (edge fn, pdf-lib) | `supabase/functions/generate-quote-pdf/index.ts` | raw `£` + `.toFixed(2)` (lines 219, 258) | `toLocaleDateString("en-GB", {...})` (line 53) | uses shared `pdfBranding.ts` layout helpers |
| Completion PDF (edge fn, pdf-lib) | `supabase/functions/generate-completion-pdf/index.ts` | raw `£` + `.toFixed(2)` (lines 409, 491, 503) | `toLocaleString("en-GB", {...})` (line 59) | via `pdfBranding.ts` |
| RAMS PDF (edge fn, pdf-lib) | `supabase/functions/generate-rams-pdf/index.ts` | none (RAMS doc has no money) | `toLocaleDateString("en-GB", { day:"2-digit", month:"long", year:"numeric" })` (line 48) | `site_address` free text, no structured fields |
| Year-End Pack PDF (edge fn, pdf-lib — HMRC mileage/expenses pack) | `supabase/functions/generate-year-end-pack/index.ts` | `£${n.toLocaleString("en-GB", {min/maxFractionDigits:2})}` helper (line 132), used throughout | `toLocaleDateString("en-GB", {...})` repeatedly (lines 128, 346, 352, 608); explicit HMRC `tax_year` string format `^\d{4}-\d{2}$` (line 277) | not address-rendering; this generator is the most explicitly UK-tax-regime-coupled of all of them (HMRC year-end pack) |
| Project Contract PDF (edge fn, pdf-lib) | `supabase/functions/generate-project-contract/index.ts` | `fmtGBP()` helper using `Intl.NumberFormat("en-GB", {currency:"GBP"})` (lines 42-47) | `toLocaleDateString("en-GB", {...})` (lines 51, 329) | `[address_line_1, address_line_2, city, postcode].filter(Boolean).join(", ")` (line 207) — the one PDF generator that does structured address-field concatenation rather than a single free-text block, but still no country appended |
| Shared PDF branding/layout helpers | `supabase/functions/_shared/pdfBranding.ts` | `currency = options.currency ?? "£"` parameter exists on `drawLineItemsTable`/`drawTotalsBlock` (lines 263, 326) — the only currency-configurable code path in the entire codebase, but every caller uses the default and none pass an override | — | — |
| Shared email template | `supabase/functions/_shared/emailTemplate.ts` | `amount: string` fields taken pre-formatted from callers (e.g. `"£9.00"`, `"£285.00"`, lines 53/59 — formatting happens at the call site, not in the template itself) — company footer address hardcoded (line 163, see Section 6) | callers pass pre-formatted date strings (see edge-function `toLocaleDateString("en-GB", ...)` call sites in Section 6, e.g. `mark-overdue-invoices`, `send-cooling-off-notice`, `cert-expiry-check`, `insurance-expiry-check`, `notify-contractor`, `stripe-webhook`) | fixed footer address, England/Wales company registration text (Section 6) |

**Consistent pattern across all 7 PDF generators and the shared email
template**: every currency figure is `£` + a locale-independent `.toFixed(2)`
or an `en-GB`-hardcoded `Intl.NumberFormat`; every date is `en-GB`-hardcoded
`toLocaleDateString`/`toLocaleString` (edge functions) or a literal `"d(d)
MMM yyyy"` date-fns token (frontend). `pdfBranding.ts`'s `currency` parameter
is the sole piece of the codebase already shaped for multi-currency —
everything else would need a new parameter threaded through, not just a
config value changed, since the `£` is inline in template literals at each
call site rather than read from a shared constant.

---

## Cross-cutting summary

- **No currency column, no country column, exist anywhere in the schema.**
  GBP and UK-only are assumptions enforced entirely in application code
  (frontend + edge functions), never in the database.
- Money is `numeric` (decimal pounds), not integer minor units — a currency
  migration would not need a unit-conversion pass, but would need a new
  `currency` column on every one of the ~40 money-bearing tables in Section 1
  plus a decision on historical-row backfill.
- Structured address fields (`address_line1/2`, `city`, `postcode`) exist on
  `companies`, `sites`, `projects` but are almost entirely unpopulated in
  live data; most real address data today lives in free-text `location`/
  `address`/`client_address` columns instead, with no `country` field
  anywhere to append even if the free-text were parsed.
- RLS is row-scoped everywhere reviewed; a new nullable `country_code`
  column would not by itself widen access on any Section 1/2 table, with the
  two pre-existing broad policies (`profiles`'s `USING (true)` authenticated
  read, `marketplace_listings`'s anon-readable `is_active = true`) already
  documented as deliberate in CLAUDE.md.
- Trades taxonomy (61 entries), 6 Postgres enums, and 40 CHECK-constraint
  pseudo-enums are all English string literals with no translation-key
  indirection — a locale layer would need a mapping table for every one of
  them, not just the trades list.
- `£`/`GBP`/`en-GB`/`dd MMM yyyy` hardcoding is the dominant pattern across
  ~90 frontend files and 9 edge functions — consistent (not haphazard) but
  entirely inline per-call-site, with ten independent re-implementations of
  a `formatGBP` helper rather than one shared, swappable formatter.
- Two features are architecturally UK-only, not just cosmetically: HMRC
  mileage-rate/tax-year handling (`hmrc_mileage_rates`, `MileageTracking.tsx`,
  `generate-year-end-pack`) and postcode-based geocoding
  (`geocode-postcode` edge function, explicitly "UK-only" per its own header
  comment, backing the new radius-based contractor search).
