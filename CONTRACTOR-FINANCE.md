# CONTRACTOR-FINANCE.md — TradeStone Contractor Finance & Accountancy

Full-scope design for replacing Xero/FreeAgent/QuickBooks for trade contractors.
One platform: marketplace + operations + accountancy. No UK competitor does all three.

**Regulatory position:** Showing a contractor their own financial data, calculating
VAT, producing tax summaries = providing information, not financial advice. Not a
regulated activity. No FCA authorisation needed.

**Build gate:** Nothing in this file touches the codebase until the core job flow is
clean, end-to-end validated with a real user, and first B2B onboarding closed.

---

## 1. FINANCE SETTINGS (prerequisite — gates everything below)

Contractor configures once, everything else derives from these settings.

### 1.1 Business Type
- Sole trader (default) or limited company
- Affects reporting periods: sole trader = 6 April–5 April UK tax year;
  limited company = configurable financial year end
- Affects terminology: "profit" vs "dividends", "Self Assessment" vs
  "Corporation Tax"

### 1.2 VAT Status & Scheme
- Not VAT registered (default for new contractors)
- Standard VAT scheme (charge 20%, reclaim input VAT)
- Flat Rate Scheme (charge 20%, pay HMRC a lower trade-specific percentage)
  - Flat rate percentage stored per contractor (e.g. 9.5% general building,
    14.5% electrical, 16.5% plumbing — full list from HMRC FRS trade sectors)
  - First-year discount: 1% reduction — platform tracks registration date
    and applies automatically
- VAT registration number stored when registered
- **VAT threshold tracker:** for non-registered contractors, rolling 12-month
  taxable turnover calculated from invoices. Alert at 80% and 90% of threshold
  (currently £90,000). Threshold stored in config, not hardcoded.

### 1.3 Vehicles & Mileage Method
- Contractor defines one or more vehicles: name/description, registration,
  vehicle type (car, van, motorcycle, bicycle)
- Per vehicle, per tax year: simplified mileage allowance OR actual costs
  - Cannot switch method mid-tax-year (HMRC rule) — lock after first claim
    in a tax year with clear explanation
  - Simplified rates stored in config table:
    - Car/van: 45p/mile first 10,000 miles, 25p/mile thereafter
    - Motorcycle: 24p/mile (flat)
    - Bicycle: 20p/mile (flat)
  - Actual costs: expenses logged against the vehicle with business-use
    percentage applied (e.g. 80% business use = 80% of fuel/insurance/
    repairs/financing claimed)

### 1.4 Default Payment Terms
- Days until payment due on invoices: 7 / 14 / 30 / custom
- Applied as default when raising invoices; overridable per invoice
- Already partially handled in quote/invoice flow — surface as global setting

### 1.5 Expense Subcategories
- HMRC parent categories are fixed (see §2.2)
- Contractor can create custom subcategories under any parent
  (e.g. "Copper pipe", "Solder", "Fixings" under Materials)
- Subcategories roll up to parent for tax reporting; granularity is for the
  contractor's own tracking and job costing

---

## 2. EXPENSE & COST TRACKING

### 2.1 Core Table: `contractor_expenses`

```sql
-- DO NOT RUN — schema direction only
CREATE TABLE contractor_expenses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id   uuid NOT NULL REFERENCES profiles(id),
  job_id          uuid REFERENCES jobs(id),          -- nullable: general business expenses
  category        text NOT NULL,                      -- HMRC parent category enum
  subcategory     text,                               -- contractor's custom subcategory
  description     text NOT NULL,
  supplier        text,                               -- who was it paid to
  amount          numeric(10,2) NOT NULL,             -- gross amount including VAT
  vat_amount      numeric(10,2) DEFAULT 0,            -- VAT component (input VAT)
  vat_treatment   text NOT NULL DEFAULT 'no_vat',     -- standard_20 | reduced_5 | zero_rated | exempt | no_vat
  receipt_url     text,                               -- signed URL to expense-receipts bucket
  expense_date    date NOT NULL DEFAULT CURRENT_DATE,
  payment_method  text,                               -- cash | card | bank_transfer | account
  is_recurring    boolean DEFAULT false,
  notes           text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);
```

### 2.2 HMRC Parent Expense Categories (fixed, not customisable)

- `materials`           — Materials and consumables
- `subcontractor`       — Subcontractor costs
- `vehicle_costs`       — Fuel, repairs, insurance, MOT, financing (actual cost method only)
- `tools_equipment`     — Tools, equipment, plant hire
- `clothing_ppe`        — Work clothing and PPE
- `insurance`           — Public liability, professional indemnity, tool insurance
- `phone_internet`      — Phone, broadband, data
- `office_admin`        — Stationery, postage, software subscriptions
- `training`            — Training courses, qualifications, CPD
- `accountancy`         — Accountant fees, bookkeeping software
- `premises`            — Workshop rent, storage, utilities (if applicable)
- `marketing`           — Advertising, website, business cards
- `finance_charges`     — Bank charges, loan interest, Stripe fees
- `other`               — Anything not covered above

### 2.3 Receipt Handling

- `expense-receipts` private storage bucket, scoped RLS (contractor sees own only)
- HEIC conversion on upload (same pattern as job-photos)
- Multi-file upload supported (one receipt per expense, but allow re-upload/replace)
- Receipt URL stored on expense record as signed URL
- **Later optimisation:** OCR pre-fill (amount, supplier, date) from receipt image

### 2.4 Recurring Expenses

- Flag `is_recurring` with `recurrence_interval` (monthly, quarterly, annually)
- Cron edge function creates draft expense records from recurring templates
- Contractor reviews and confirms each occurrence (not auto-confirmed — amounts
  may change, e.g. phone bill varies)
- Covers: insurance premiums, phone contracts, software subscriptions, van lease

---

## 3. MILEAGE TRACKING

### 3.1 Core Table: `contractor_mileage`

```sql
-- DO NOT RUN — schema direction only
CREATE TABLE contractor_mileage (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id   uuid NOT NULL REFERENCES profiles(id),
  vehicle_id      uuid NOT NULL REFERENCES contractor_vehicles(id),
  job_id          uuid REFERENCES jobs(id),          -- nullable: not all trips are job-linked
  origin          text NOT NULL,
  destination     text NOT NULL,
  miles           numeric(6,1) NOT NULL,
  trip_date       date NOT NULL DEFAULT CURRENT_DATE,
  notes           text,
  created_at      timestamptz DEFAULT now()
);
```

### 3.2 Vehicles Table: `contractor_vehicles`

```sql
-- DO NOT RUN — schema direction only
CREATE TABLE contractor_vehicles (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id   uuid NOT NULL REFERENCES profiles(id),
  name            text NOT NULL,                      -- "White Transit" / "VW Caddy"
  registration    text,
  vehicle_type    text NOT NULL,                      -- car | van | motorcycle | bicycle
  claim_method    text NOT NULL DEFAULT 'simplified', -- simplified | actual_costs
  business_use_pct numeric(5,2) DEFAULT 100,          -- for actual costs method
  is_default      boolean DEFAULT false,
  created_at      timestamptz DEFAULT now()
);
```

### 3.3 Mileage Rates Table: `mileage_rates`

```sql
-- DO NOT RUN — schema direction only
CREATE TABLE mileage_rates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_type    text NOT NULL,                      -- car_van | motorcycle | bicycle
  threshold_miles integer,                            -- null for flat rate; 10000 for car/van
  rate_pence      integer NOT NULL,                   -- 45, 25, 24, 20
  effective_from  date NOT NULL,
  effective_to    date,                               -- null = current
  UNIQUE (vehicle_type, threshold_miles, effective_from)
);
```

Platform-managed, not contractor-editable. Updated when HMRC changes rates.

### 3.4 Calculation Logic

- Simplified method: look up rate for vehicle type, check cumulative miles in
  current tax year against threshold, apply correct rate
- Actual costs method: mileage logged for record-keeping only; claim comes from
  vehicle-tagged expenses × business_use_pct
- Annual mileage summary exportable for Self Assessment

> **Scope note:** The mileage design is specific to the HMRC regime
> (6 April–5 April tax year, two-tier threshold, `tax_year` as a
> "2025-26" string). It is not a country-neutral rate table and will
> not survive US or Canadian expansion without redesign. See LATER.md.

---

## 4. P&L DASHBOARD

### 4.1 Income Side (already captured)
- Source: `invoices` table where `contractor_id` matches
- Realised income: invoices with `status = 'paid'` or `recipient_response = 'paid'`
- Outstanding: unpaid invoices
- Grouped by: client, job, trade, month
- Includes: platform fees deducted (Stripe application_fee_amount) shown as a
  cost line so the contractor sees true net income

### 4.2 Expense Side
- Source: `contractor_expenses` + mileage allowance calculations
- Grouped by HMRC parent category, drillable to subcategory
- Monthly totals with year-to-date running total
- Job-linked expenses attributed to specific jobs for profitability view

### 4.3 Profit Calculation
- Gross profit: total invoiced (ex VAT) minus cost of sales (materials +
  subcontractor costs)
- Net profit: gross profit minus all other expenses
- Tax year running total with projection to year-end based on current run rate

### 4.4 Filters
- Tax year selector (defaults to current, previous available)
- Custom date range
- By job
- By client
- By expense category

### 4.5 Export
- CSV export of full P&L for accountant
- Columns: date, type (income/expense), category, description, client/supplier,
  gross amount, VAT amount, net amount, job reference
- PDF summary report (branded TradeStone template, same pattern as invoice PDF)

---

## 5. JOB PROFITABILITY VIEW

The single most valuable view for a contractor — and the one no competitor surfaces
properly within the job management tool itself.

### 5.1 Per-Job Breakdown
- **Quoted:** original quote total (from `issued_quotes`)
- **Invoiced:** actual invoice total (may differ if variations applied)
- **Materials:** sum of job-linked expenses in `materials` category
- **Subcontractor:** sum of job-linked expenses in `subcontractor` category
- **Other costs:** sum of all other job-linked expenses
- **Mileage:** sum of job-linked mileage at applicable rate
- **Actual margin:** invoiced minus all costs, shown as £ and %
- **Quoted vs actual:** variance highlighting (green if margin improved, red if
  margin eroded vs quote)

### 5.2 Aggregate Views
- Profitability by trade type (plumbing jobs vs electrical vs general building)
- Profitability by client (which clients are most/least profitable)
- Trend over time (are margins improving or compressing)
- Average job margin as a headline KPI on the Money overview

### 5.3 Where It Surfaces
- Tab on individual job card (alongside photos, notes, timeline)
- Summary card on Money overview dashboard
- Column on jobs list view (margin % per job)

---

## 6. VAT POSITION

### 6.1 For VAT-Registered Contractors (Standard Scheme)
- **Output VAT:** total VAT charged on invoices in the period
- **Input VAT:** total reclaimable VAT from expenses (where vat_treatment is
  standard_20, reduced_5, or zero_rated)
- **Net position:** output minus input = amount owed to / owed by HMRC
- Quarterly breakdown matching HMRC's standard VAT periods
  (quarters ending March, June, September, December — or stagger group if
  the contractor has non-standard periods; store in finance settings)
- Box 1–9 pre-calculation ready for MTD submission (Tier 2)

### 6.2 For Flat Rate Scheme Contractors
- **Output VAT:** total VAT charged on invoices (still 20%)
- **FRS payment:** total gross income × flat rate percentage = amount owed to HMRC
- **FRS benefit:** output VAT minus FRS payment = retained by contractor
- First-year discount applied automatically if within 12 months of registration

### 6.3 For Non-VAT-Registered Contractors
- **Threshold tracker:** rolling 12-month taxable turnover from invoices
- Visual indicator: progress bar toward £90,000 threshold
- Alerts at 80% and 90%
- Explainer text: "You must register for VAT once your taxable turnover exceeds
  £90,000 in any rolling 12-month period. You can voluntarily register below
  this threshold."

---

## 7. AGED DEBTORS

### 7.1 View
- All unpaid invoices grouped by client
- Ageing buckets: current (0–14 days), 30 days, 60 days, 90+ days
- Total outstanding per client and overall
- Days since invoice issued
- Last payment reminder sent (if notification system supports it)

### 7.2 Actions
- Send payment reminder (email via Resend, branded template)
- Mark as written off (with reason — moves to expense as bad debt)
- Payment plan flag (stops overdue alerts but keeps the debt visible)

---

## 8. UI PLACEMENT

### 8.1 Contractor Sidebar — Money Section
- **Overview** — P&L summary dashboard (headline: income, expenses, profit, VAT
  position, outstanding invoices)
- **Invoices** — existing invoice management (already built)
- **Expenses** — expense list with add/edit, receipt upload, filters
- **Mileage** — mileage log with trip entry, vehicle selector, running totals
- **Reports** — P&L detail, VAT position, aged debtors, job profitability
- **Settings** — Finance Settings (§1: business type, VAT, vehicles, categories,
  payment terms)

### 8.2 Job Card Integration
- New "Costs" tab on individual job view
- Quick-add expense form (pre-fills job_id)
- Quick-add mileage form (pre-fills job_id, destination from job address)
- Running cost total visible on job card header
- Margin indicator (if invoice exists: invoiced minus costs)

### 8.3 Quote Composer Integration
- When building a quote, show costs from previous similar jobs as reference
  (same trade, same client, or same postcode area)
- Historical margin data helps contractor price more accurately

---

## 9. TIER 2 — EXTERNAL INTEGRATIONS (build after Tier 1 is validated)

### 9.1 MTD VAT Submission
- Register TradeStone as software provider with HMRC Developer Hub
- OAuth connection: contractor links their HMRC Government Gateway account
- Retrieve VAT obligations (return due dates)
- Submit VAT return (Boxes 1–9) directly from the platform
- Store submission confirmation and receipt
- Late filing warnings
- **Lead time:** HMRC developer registration takes weeks; start the application
  clock early

### 9.2 Bank Feed Reconciliation
- Partner with TrueLayer or Plaid (FCA-authorised, TradeStone doesn't need its
  own authorisation — acts as agent of the regulated provider)
- Contractor connects bank account via Open Banking consent flow
- Incoming payments auto-matched against invoices by amount + reference
- Outgoing payments matched against logged expenses
- Unmatched transactions flagged for manual review/categorisation
- Solves the #1 contractor pain point: "I don't know if they've paid"

### 9.3 MTD for Income Tax
- HMRC rolling out from April 2026 for sole traders above threshold
- Quarterly income/expense summaries submitted digitally
- API becoming available — monitor and build when stable
- TradeStone already holds all the data; submission is the last mile

---

## 10. TIER 3 — LATER OPTIMISATIONS

- **Receipt OCR:** extract amount, supplier, date from receipt photo to pre-fill
  expense form (Google Vision, AWS Textract, or similar)
- **Smart categorisation:** suggest expense category based on supplier name and
  amount patterns from previous entries
- **VAT threshold alerts:** proactive notification when approaching registration
  threshold with projected crossing date
- **Year-end tax pack:** generate a complete summary document an accountant can
  use to file Self Assessment or Corporation Tax return, reducing accountant
  time and therefore fees
- **Contractor benchmarking:** anonymised comparison of margins, costs, and
  pricing against other contractors in the same trade and region (opt-in)
- **Invoice factoring integration:** surface third-party invoice factoring
  offers for contractors with cash flow gaps (partnership revenue model)

---

## LOCKED DECISIONS

1. Expense categories: HMRC parent categories fixed; custom subcategories allowed
2. Mileage: per-vehicle configuration with method locked per tax year
3. VAT: three schemes supported (not registered, standard, flat rate)
4. P&L: UK tax year (6 Apr–5 Apr) as default period for sole traders
5. Job profitability: quoted vs invoiced vs actual costs — surfaces on job card
6. Data entry: expenses logged once, flow into P&L/VAT/job costing automatically
7. No double-entry bookkeeping surfaced to the user — platform handles it
   internally if needed, contractor sees simple in/out/profit
8. All SQL schema blocks in this file marked DO NOT RUN — run Step-0 schema
   report against live DB before building any item
9. Finance Settings must be built first — everything else reads from it
10. CSV export uses HMRC-compatible categories so accountant can map directly

## OPEN DECISIONS

1. Recurring expense confirmation UX: notification + one-tap confirm, or
   monthly review screen?
2. Bank feed provider: TrueLayer vs Plaid — evaluate pricing, UK bank coverage,
   and API maturity when ready to build Tier 2
3. Historical data import: should contractors be able to import expenses from
   Xero/FreeAgent CSV on signup? (High onboarding value, moderate build effort)
4. Stripe fee visibility: show platform fees as a separate expense line on P&L,
   or net them from income? (Affects how the contractor perceives TradeStone's cost)
5. Quote composer integration: how much historical cost data to surface without
   overwhelming the quoting flow?

---

*End of CONTRACTOR-FINANCE.md. Every item recorded from real conversations —
nothing invented. When building any item, start with a Step-0 schema report
against the live DB, not this file's SQL stubs.*
