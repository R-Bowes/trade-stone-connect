# LATER.md

Parked ideas and out-of-scope features. Nothing here gets built until the
core job flow (Enquiry → Quote → Job → In Progress → Sign-off → Invoice →
Payment) is clean and validated. Capture here, don't build now.

Discipline: an idea lands here instead of derailing the current build.
Review during the Friday log ritual.

---

## Job Completion PDF (job record / completion certificate)

**What it is**
A PDF auto-generated when a job reaches Complete, confirming the timeline of
what happened and what was done. A trust artefact: proof of work + warranty
start date for the homeowner, a clean record for the contractor, dispute
protection for both. Serves homeowner AND contractor — clears the three-user
filter.

**Hard scoping rule — accepted contractor only**
The PDF shows ONLY the quote breakdown of the contractor who completed the
job, and only that contractor's details. Under the Projects model a project
can hold competing quotes — the completion PDF must NEVER leak the comparative
quotes, other contractors' pricing, or any losing bid. Scope strictly to the
accepted quote + winning contractor. Write this into the query, not as an
afterthought.

**Data sources (mostly already captured — assembly job, not new capture)**
- Job created            -> jobs.created_at
- Quote issued           -> issued_quotes (accepted quote only): line items,
                            totals, VAT, deposit, contractor name + TS code
- Job started            -> job in_progress timestamp
- Completed / signed off -> pending_sign_off -> sign-off timestamp
- Images                 -> job_photos for this job
- Invoice                -> HMRC sequential invoice number + date
- Payment completed       -> Stripe payment confirmed timestamp (paid)

**Layout sketch**
- Header: TradeStone wordmark, job title, TS codes (homeowner TS-P,
  contractor TS-C)
- Timeline block: each lifecycle event with date + time
- Quote breakdown: line items, totals, VAT (accepted quote ONLY)
- Photos: job_photos thumbnails / grid
- Footer: invoice number, payment confirmation, generated-on date

**Tech**
pdf-lib in an Edge Function (better home than client-side — it's a finalised
server-generated record, and shares tooling with the planned Projects
contracts PDF). jsPDF client-side is the fallback if a quick browser render is
ever wanted.

**Priority / dependencies**
Build alongside the Phase 0 PDF quote generation — they share most of the
rendering code, so do them together. Depends on lifecycle timestamps and the
sign-off + payment steps being reliably captured first. Build after core flow
is clean.

---

## "Request a Visit" — structured enquiry action

**What it is**
A dedicated action on an enquiry (alongside Accept & Quote / Respond /
Decline) letting a contractor propose a site visit against their availability,
which the homeowner accepts — instead of arranging it informally in the
Respond free-text message or job thread.

**Why later**
Keeps measure-up scheduling on-platform (reduces leakage). Leans on the
smart-scheduling piece (offering dates from contractor availability). Adds a
state to the enquiry flow before a quote exists — not core-flow-critical, so
parked.

---

## Enriched enquiry — homeowner-submitted dimensions, photos, documents

**What it is**
Optional fields at enquiry stage: trade-specific measurements (e.g. room
dimensions, area in m²), photo uploads, and PDF/Word document upload
(drawings, planning, surveys). Read-only context on the contractor's enquiry
card.

**Why it matters**
The more a homeowner provides upfront, the less often a site visit is needed —
directly softens "Request a Visit". Keep all fields optional so the enquiry
form doesn't get heavy enough to cause abandonment.

**Action**
First check whether this already shipped — the enquiry form may still be
free-text + location + timeline + budget only. If not built, it's a small,
high-value add.
---

# Backlog (parked — same rule: build none of this until the core flow is clean)

## Trust, safety & anti-cowboy
- **Staged / escrow payments** — milestone sign-off by customer, auto-release
  timer if no response in window, funds frozen on dispute. The anti-cowboy
  centrepiece. (Current model is single payment on completion.)
- **Dispute resolution workflow** — platform-mediated fund hold, evidence
  submission from both sides, resolution decision. Needed before any real
  transaction volume.
- **Trade licence verification** — API checks vs Gas Safe, NICEIC,
  Companies House; verified credentials shown publicly (type, body, dates,
  reg number + register link), uploaded docs stay private. Unverified
  credentials don't appear publicly.
- **Insurance tracking** — contractors upload PL insurance with expiry;
  platform warns before lapse; lapsed insurance blocks new enquiries.
- **ID / company number verification at signup** for contractor + business.
- **Review challenge & moderation workflow.**

## Projects (fully designed — see Projects design notes / memory)
- **Projects feature** — container for multi-phase work. Schema first:
  `projects`, `project_proposals`, `proposal_phases`; `asset_id` FK on jobs as
  future-proofing. Open tender vs invite-by-TS-code, proposal versioning,
  expiry mechanic (90% prompt, extension, auto-expiry), budget envelope toggle,
  hard acceptance commitment, public Q&A thread, weighted scoring,
  Gantt/budget/contractor views, two-stage sign-off, retention management,
  contract versioning on approved change requests.
- **Gantt / timeline view** — part of Projects, not detailed yet.
- **Change request flow** — post-acceptance scope changes with revised cost +
  timeline, customer approve/decline. Parked with Projects.
- **Sub-contractor hiring** — contractor as principal on a sub-job via
  `parent_job_id` FK (Option A), no tier escalation. Needs contractor volume.
- **Template schemas** for proposals — needs real tender data first.

## Financial & HMRC compliance
- **MTD VAT submission** via HMRC API — one-button quarterly return from
  platform data.
- **MTD for Income Tax** submission.
- **Open Banking reconciliation** (TrueLayer / Plaid) — auto-match bank
  transactions to invoices.
- **Self Assessment summaries** / P&L reporting.
- **CIS deduction automation** — confirm against current business build before
  treating as unbuilt.
- **Basic payroll (PAYE)** for contractors with employees — deferred, PAYE
  complexity vs small user slice.
- **Invoice factoring / financing** — deferred. FCA territory, capital +
  credit risk; can sink the business if done naively.

## Notifications
- **Push notifications** — needs native app + service worker.
- **SMS notifications** (configurable per user).
- **In-app notification centre** with read/unread state.
- **Granular notification preferences** per event type.
(Email notifications via Resend are in progress — Phase 0, not parked.)

## Discovery & growth
- **SEO-optimised public contractor directory.**
- **Search ranking algorithm** — rating, responsiveness, verified status,
  paid promotion.
- **Geolocation-based search results.**
- **Promoted listings / pay-to-rank** — deferred until trust is established;
  layer in carefully.

## Retention & stickiness
- **Repeat / recurring job scheduling** — boiler service, gutter clean;
  auto-creates enquiry/job at interval.
- **One-click rebook** of a preferred contractor.
- **Contractor health score** — composite trust signal.
- **Homeowner job history** + **warranty tracking** (warranty start date ties
  to the completion PDF above).

## Materials Marketplace

**Status:** Designed, not built. Build only after B2B/FM wedge is validated
with paying customers. Schema must NOT be pushed to Supabase until build begins.

**What it is**
A two-sided marketplace for trade materials and supplies sitting inside
TradeStone. Sellers list materials; buyers (contractors, homeowners, businesses)
purchase them. Distinct from the Hire page (which finds people) — this finds
things.

**The differentiated angle**
Contractors regularly have surplus materials after a job — unopened packs of
tiles, unused plasterboard, leftover conduit. Currently sold on Facebook
Marketplace with zero trust signals. A TradeStone-native listing carries the
seller's TS code, verified trade status, and job history. That trust layer
cannot be replicated on any general marketplace.

---

### Seller types (three tiers, phased)

**Phase 1 — Contractor surplus (build this first)**
Any verified contractor (TS-C code) can list items they no longer need.
Optionally linkable to a job (`job_id`) for provenance context ("leftover
from a loft conversion"). No separate onboarding — they already have a
TradeStone account and Stripe Connect set up.

**Phase 2 — Business/FM clearance**
Business accounts (TS-B codes) can list bulk clearance from sites or asset
disposals. Same listing flow as contractor surplus. Lot listings (entire
quantity must go together) supported.

**Phase 3 — Retail outlets / trade merchants**
Screwfix-type retailers, trade counters, independent merchants listing new
stock. Completely separate commercial relationship — requires merchant
onboarding flow, VAT handling, delivery/click-and-collect logistics, and a
supplier agreement. Do NOT build until Phase 1 is proven and there is volume
to offer merchants. Schema accommodates Phase 3 via `seller_type` field but
no UI or onboarding for retail until then.

---

### Listing taxonomy

Every listing has two classification fields — never conflate them into a
single "condition" dropdown.

**`condition`** (enum)
- `new_sealed` — unopened, in original packaging
- `new_opened` — unused but packaging opened or damaged
- `part_used` — some consumed, remainder available (e.g. half a roll of
  cable, part bag of cement)
- `used_good` — used, good working order, no significant damage
- `used_fair` — used, some wear or cosmetic damage, fully functional

**`source_type`** (enum)
- `retail` — sold by a retail/merchant account (Phase 3 only)
- `surplus` — contractor unused stock from a job or overorder
- `clearance` — end-of-project lot, site clearance, or asset disposal

Both fields display on every card and listing detail: e.g. "New (sealed) ·
Surplus" or "Part used · Surplus".

---

### Listing fields

| Field | Type | Notes |
|---|---|---|
| `title` | text | Short and specific ("Dulux Trade Matt 10L White x3 tins") |
| `description` | text | Condition context, reason for sale, any defects |
| `category` | enum | See category tree below |
| `condition` | enum | See taxonomy above |
| `source_type` | enum | See taxonomy above |
| `quantity` | numeric | Available quantity |
| `unit` | enum | `each`, `m`, `m2`, `m3`, `kg`, `tonne`, `litre`, `pack`, `pallet`, `lot` |
| `price` | numeric(10,2) | GBP. For `lot` listings, single price for entire quantity |
| `is_lot` | boolean | true = entire quantity must be purchased together |
| `negotiable` | boolean | Seller open to offers |
| `location_postcode` | text | Area only. Full address shared only after purchase confirmed |
| `photos` | — | Min 1, max 10. Storage bucket: `marketplace-photos` |
| `job_id` | uuid FK | Optional. Links to `jobs.id` for provenance ("from job TS-J-xxxxx") |
| `seller_id` | uuid FK | References `profiles(id)` |
| `seller_type` | enum | `contractor`, `business`, `retail` |
| `status` | enum | `draft`, `active`, `reserved`, `sold`, `removed` |
| `expires_at` | timestamptz | Auto-set 90 days from publish. Seller prompted to renew or remove |

---

### Category tree (top level — subcategories at build time)

Electrical · Plumbing & heating · Groundworks & drainage · Timber & sheet
materials · Insulation · Plastering & drylining · Roofing · Fixings &
fasteners · Tools & equipment · Flooring · Tiles & adhesives · Painting &
decorating · Doors, windows & ironmongery · General building materials · Other

---

### Schema (DO NOT RUN — for reference at build time only)

```sql
-- Marketplace listings
CREATE TABLE marketplace_listings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id       uuid NOT NULL REFERENCES profiles(id),
  seller_type     text NOT NULL CHECK (seller_type IN ('contractor','business','retail')),
  title           text NOT NULL,
  description     text,
  category        text NOT NULL,
  condition       text NOT NULL CHECK (condition IN (
                    'new_sealed','new_opened','part_used','used_good','used_fair'
                  )),
  source_type     text NOT NULL CHECK (source_type IN ('retail','surplus','clearance')),
  quantity        numeric NOT NULL,
  unit            text NOT NULL CHECK (unit IN (
                    'each','m','m2','m3','kg','tonne','litre','pack','pallet','lot'
                  )),
  price           numeric(10,2) NOT NULL,
  is_lot          boolean NOT NULL DEFAULT false,
  negotiable      boolean NOT NULL DEFAULT false,
  location_postcode text,
  job_id          uuid REFERENCES jobs(id),
  status          text NOT NULL DEFAULT 'draft' CHECK (status IN (
                    'draft','active','reserved','sold','removed'
                  )),
  expires_at      timestamptz,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- Listing photos (multiple per listing)
CREATE TABLE marketplace_listing_photos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id      uuid NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
  storage_path    text NOT NULL,
  display_order   int NOT NULL DEFAULT 0,
  created_at      timestamptz DEFAULT now()
);

-- Orders (buyer purchases a listing)
CREATE TABLE marketplace_orders (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id               uuid NOT NULL REFERENCES marketplace_listings(id),
  buyer_id                 uuid NOT NULL REFERENCES profiles(id),
  quantity_purchased       numeric NOT NULL,
  amount_paid              numeric(10,2) NOT NULL,
  stripe_payment_intent_id text,
  status                   text NOT NULL DEFAULT 'pending' CHECK (status IN (
                             'pending','paid','collection_arranged','completed',
                             'refunded','disputed'
                           )),
  created_at               timestamptz DEFAULT now(),
  updated_at               timestamptz DEFAULT now()
);
```

---

### UI components to build

**Marketplace browse page** (replace existing placeholder page)
Search + category filter + condition filter + distance radius filter.
Card grid: lead photo, title, condition+source badge pair, price, seller TS
code + trade badge, location area, posted date. Sort: newest / price asc /
price desc / nearest.

**Listing detail page**
Photo gallery (swipeable), full condition+source display, seller identity card
(TS code, trade, rating, job count — links to public profile), optional job
provenance link, price/quantity/unit, "Make an offer" button if negotiable,
"Buy now" → Stripe payment flow.

**Create listing flow** (contractor/business dashboard — multi-step)
Step 1: Category + condition + source type
Step 2: Title, description, quantity, unit, price, negotiable toggle, lot toggle
Step 3: Photos (min 1 required)
Step 4: Location postcode, optional job link, expiry acknowledgement
Step 5: Preview + publish

**My listings** (dashboard section)
Tabs: Active / Reserved / Sold / Expired. Renew / edit / remove actions per
listing. Order notification on purchase.

---

### Payment model
Stripe Connect destination charge — same pattern as job payments.
Platform fee: 5% (higher than job payments — lower relationship value, higher
dispute risk on physical goods).
Buyer protection: 48-hour dispute window after collection confirmed.
No physical fulfilment handling by TradeStone — collection or local delivery
arranged directly between buyer and seller.

---

### Explicitly out of scope until Phase 3
- Delivery/logistics integration
- Retail outlet onboarding and merchant agreements
- VAT invoice generation for merchant sales (contractor P2P surplus sales
  carry no VAT obligation for non-VAT-registered sellers)
- Product catalogue / SKU database (listings are free-text, not catalogue-matched)
- Tool and equipment hire (separate liability model — see Tool Hire section below)

---

## Tool Hire & Equipment Rental

**Status:** Designed, not built. Dependent on Materials Marketplace
infrastructure being live first — shares listing browse UI, Stripe flow,
and storage bucket patterns. Build as Phase 2 of the marketplace.

**What it is**
Contractors and businesses can list tools and equipment for short-term hire.
Distinct from the materials marketplace (ownership transfers there; here it
doesn't). A contractor with a £2,000 laser level sitting idle between jobs
can earn from it. A homeowner or smaller contractor can access professional
kit without capital outlay.

**Why it's separate from materials listings**
Hire involves: time-bounded availability, a return obligation, damage liability,
insurance requirements, and deposit handling. None of those apply to a
straightforward sale. Conflating hire and sale in one listing model creates
legal ambiguity and UI confusion. Separate tables, separate flow.

---

### Hire listing fields

| Field | Type | Notes |
|---|---|---|
| `title` | text | Specific make/model ("DeWalt DCS367 18V Reciprocating Saw") |
| `description` | text | Condition, accessories included, collection/delivery info |
| `category` | enum | See tool category tree below |
| `condition` | enum | `excellent`, `good`, `fair` (simpler than materials — hire items are always used) |
| `daily_rate` | numeric(10,2) | GBP per day |
| `weekly_rate` | numeric(10,2) | Optional. If set, displayed alongside daily rate |
| `deposit_amount` | numeric(10,2) | Held by TradeStone via Stripe, released on return confirmed |
| `min_hire_days` | int | Minimum booking period (default 1) |
| `max_hire_days` | int | Maximum continuous hire period |
| `location_postcode` | text | Area only until booking confirmed |
| `delivery_available` | boolean | Lister offers delivery (buyer pays delivery cost separately) |
| `photos` | — | Min 1, max 10. Same `marketplace-photos` storage bucket |
| `owner_id` | uuid FK | References `profiles(id)` |
| `owner_type` | enum | `contractor`, `business` (no retail hire in Phase 1) |
| `status` | enum | `draft`, `active`, `booked`, `unavailable`, `removed` |
| `insurance_confirmed` | boolean | Owner confirms item is covered under their policy |

---

### Hire bookings

| Field | Type | Notes |
|---|---|---|
| `listing_id` | uuid FK | References hire listing |
| `hirer_id` | uuid FK | References `profiles(id)` |
| `start_date` | date | Hire start |
| `end_date` | date | Hire end (return due) |
| `total_charged` | numeric(10,2) | Days × daily rate (or weekly rate if applicable) |
| `deposit_held` | numeric(10,2) | Stripe hold amount |
| `deposit_status` | enum | `held`, `released`, `forfeited` (partial or full on damage) |
| `stripe_payment_intent_id` | text | |
| `return_confirmed_at` | timestamptz | Set by owner on return. Triggers deposit release |
| `damage_claimed` | boolean | Owner flagged damage on return |
| `status` | enum | `pending`, `confirmed`, `active`, `returned`, `disputed`, `cancelled` |

---

### Tool category tree (top level)

Power tools · Hand tools · Measuring & survey · Access & lifting · Groundworks
& excavation · Concreting & mixing · Welding & cutting · Generators &
compressors · Plumbing & drainage · Electrical test equipment · Cleaning &
preparation · Other

---

### Schema (DO NOT RUN — for reference at build time only)

```sql
CREATE TABLE hire_listings (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id            uuid NOT NULL REFERENCES profiles(id),
  owner_type          text NOT NULL CHECK (owner_type IN ('contractor','business')),
  title               text NOT NULL,
  description         text,
  category            text NOT NULL,
  condition           text NOT NULL CHECK (condition IN ('excellent','good','fair')),
  daily_rate          numeric(10,2) NOT NULL,
  weekly_rate         numeric(10,2),
  deposit_amount      numeric(10,2) NOT NULL DEFAULT 0,
  min_hire_days       int NOT NULL DEFAULT 1,
  max_hire_days       int,
  location_postcode   text,
  delivery_available  boolean NOT NULL DEFAULT false,
  insurance_confirmed boolean NOT NULL DEFAULT false,
  status              text NOT NULL DEFAULT 'draft' CHECK (status IN (
                        'draft','active','booked','unavailable','removed'
                      )),
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

CREATE TABLE hire_listing_photos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id      uuid NOT NULL REFERENCES hire_listings(id) ON DELETE CASCADE,
  storage_path    text NOT NULL,
  display_order   int NOT NULL DEFAULT 0,
  created_at      timestamptz DEFAULT now()
);

CREATE TABLE hire_bookings (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id               uuid NOT NULL REFERENCES hire_listings(id),
  hirer_id                 uuid NOT NULL REFERENCES profiles(id),
  start_date               date NOT NULL,
  end_date                 date NOT NULL,
  total_charged            numeric(10,2) NOT NULL,
  deposit_held             numeric(10,2) NOT NULL DEFAULT 0,
  deposit_status           text NOT NULL DEFAULT 'held' CHECK (deposit_status IN (
                             'held','released','forfeited'
                           )),
  stripe_payment_intent_id text,
  return_confirmed_at      timestamptz,
  damage_claimed           boolean NOT NULL DEFAULT false,
  status                   text NOT NULL DEFAULT 'pending' CHECK (status IN (
                             'pending','confirmed','active','returned',
                             'disputed','cancelled'
                           )),
  created_at               timestamptz DEFAULT now(),
  updated_at               timestamptz DEFAULT now()
);
```

---

### Key design decisions locked

**Deposit handling:** TradeStone holds the deposit via Stripe payment hold
(not a separate charge). On `return_confirmed_at` being set by the owner,
deposit is released automatically via Stripe. If `damage_claimed = true`,
deposit release is paused and goes to manual dispute resolution.

**Insurance:** Owner self-declares `insurance_confirmed`. TradeStone does not
verify policies in Phase 1. This is a known risk — flagged for Phase 2 where
verified insurance upload (policy document + expiry date) would be required
before listing goes live.

**Availability calendar:** Not a real-time calendar in Phase 1. `status =
'booked'` blocks the listing for the booking window. Multiple concurrent
bookings not supported until a proper availability calendar UI is built
(Phase 2 of hire).

**Platform fee:** 10% of hire charge (higher than materials sale — deposit
handling, dispute mediation, and return coordination all add operational cost).
Deposit itself carries no platform fee.

**Explicitly out of scope until Phase 2 of hire:**
- Delivery cost calculation or logistics integration
- Verified insurance document upload
- Availability calendar with date-range picker
- Multi-item hire bundles
- Long-term rental (>30 days — different tax/legal treatment)
- Commercial hire companies listing fleet (separate merchant relationship)</new_string>
</invoke>


## Mobile
- **Native app (React Native)** — iOS/Android, offline timesheets/job notes,
  camera integration. WebView wrappers (Capacitor, GoNative) rejected as
  "still the website." Decision deferred.

## Platform infra & observability
- **PostHog analytics** (funnel, usage, retention).
- **Sentry error tracking** (frontend + Edge Functions).
- **2FA** and **end-to-end message encryption.**
- **GDPR data retention** — user-controlled export & deletion.

## Integrations (Phase 2+)
- **Accounting:** Xero, QuickBooks.
- **Calendar:** Google Calendar, Outlook.
- **E-signature:** DocuSign or native.
- **API access** for Business tier enterprise integrations.

## Speculative / long-term
- **AI quote generation** from past job data — only viable once real data
  exists; a bad AI quote to a real customer damages trust.
- **AR site survey / measurement tool.**
- **Carbon footprint tracking per job.**
- **Revenue-based lending.**

---

## Tech debt / known issues to revisit

- Standardise all Edge Functions on `SITE_URL`; remove `PUBLIC_URL` and `PUBLIC_APP_URL` reads.
- ~~`notify_job_note_added` references a possibly non-existent `jobs.client_id`~~
  **Fixed** (readiness-audit R1-3, `20260718100000_fix_job_note_and_invoice_response_triggers.sql`):
  confirmed the column was renamed to `customer_id`; every job-note INSERT was
  rolling back with "column client_id does not exist" — job notes were
  non-functional in both directions, not just silently unnotified.
  `notify_invoice_response`'s `COALESCE(int, text)` type-mismatch bug (same
  migration, R1-4) is fixed too, mirroring `notify_quote_response`'s existing
  LPAD pattern.
- Job sign-off approval — `jobs.portfolio_approved` column unused; business
  Approvals view is quote-approvals only until job sign-off is scoped.
- Business tier SLA per-contractor pairing (matching `applies_to_trade` to a
  contractor's declared trade) — follow-on, currently a reference table only.
- **Watcher nudge dedup.** Both the compliance watcher and the expiry radar
  (tendering chunks 6/7) re-send the same nudge notification on every
  scheduled run for as long as the underlying condition holds — no
  "already nudged" log or last-nudged timestamp exists. Needs a sent-log
  table or a `last_nudged_at`-style stamp before this goes in front of a
  real user; flagged explicitly in both migrations
  (`20260711130000_term_engagements_and_watchers.sql`,
  `20260712120000_expiry_radar_and_retender.sql`) rather than silently
  shipped as "fine."
- **Migrate cron secrets from database GUCs to `supabase_vault`.**
  `app.settings.supabase_url` / `app.settings.service_role_key` currently
  live as plain `ALTER DATABASE ... SET` values, read via
  `current_setting(..., true)` from cron bodies and SECURITY DEFINER
  functions (`create_callout_job()`, the cron entries in
  `20260711130000_term_engagements_and_watchers.sql`). GUCs aren't secret
  storage — Vault is the correct home for a service-role key.
- **Drop deprecated `companies` columns** (`address`, `email`, `phone`) —
  superseded by `address_line1`/`address_line2` and
  `contact_email`/`contact_phone`
  (`20260710140000_companies_contact_field_cleanup.sql`). Safe to drop once
  confirmed nothing reads them for a full release cycle.
- **Drop redundant partial index `jobs_issued_quote_id_key`** (duplicates
  `jobs_issued_quote_id_unique`, which already existed live —
  `20260717120000_offer_with_slots_accept_flow.sql` added the partial index
  without checking the live DB first; harmless but redundant) in the next
  tidy migration.
- **Auto-lapse of unpaid accepted quotes.** A quote whose deposit is never
  paid currently sits accepted-but-unscheduled indefinitely — no mechanism
  expires it. When built, this must ALSO release the
  `'Auto-blocked: awaiting deposit'` `contractor_availability_overrides` row
  (`accept_quote_with_slot`, `20260717150000_accept_quote_with_slot_full_contract.sql`)
  and un-confirm the held `schedule_events` row for that quote — not just
  flip the quote's own status — or a lapsed quote leaves the contractor's
  calendar permanently blocked with no path back to available.
- **`create-payment-intent` findings from the syntax-error repair
  (2026-07-18) — both fixed in the readiness-audit R1-R3 fix slice
  (2026-07-18):**
  - No legacy `quotes` table reference (clean) and no silent-default
    shape like the old `accept-quote` deposit bug (this function has no
    deposit concept at all — it charges the invoice's full `total`).
  - ~~Partial idempotency~~ **Fixed (R3-4):** now checks the retrieved
    PI's `.status` before reusing it (`requires_payment_method`/
    `requires_action`/`requires_confirmation` only), falling through to
    mint a fresh one otherwise — mirrors `accept-quote`'s deposit-branch
    gate.
  - ~~No authorization check on `create_client_secret`~~ **Fixed
    (R3-3):** verify-if-present — if a caller sends a JWT that resolves
    to a real user, it must match the invoice's `recipient_id`; no
    session (the anonymous overdue-invoice email-link flow) is still
    allowed through unchanged, bounded by the invoice id being an
    unguessable UUID.
- **`create-deposit-checkout` (Projects deposits) — quarantined, not
  fixed**, readiness-audit R2 decision 2 (2026-07-18): no live caller
  invokes it (`ProposalReview.tsx` shows an honest "coming soon" message
  instead). Before re-enabling: (a) `stripe-webhook` has no
  `type:"project_deposit"` branch for the checkout session this creates —
  a payment made through it today is captured by Stripe and never
  recorded anywhere in the DB; (b) `contractor_stripe_account` is taken
  directly from the request body with no server-side lookup against
  `profiles.stripe_account_id`, so nothing stops a modified payload
  redirecting the transfer to an arbitrary connected account; (c) no
  idempotency guard at all (no reuse-existing-session check before
  minting a new Checkout Session).
- **Homeowner job view: no per-job messaging entry point.** The rails exist
  (`job_conversations`/`job_messages`) but there's no button on the
  homeowner-facing job view that deep-links into the existing thread —
  needs one UI affordance, not new schema.
- **Audit the homeowner-visible job Team tab against contact-suppression.**
  Verify it doesn't leak contractor contact details that the rest of the
  platform deliberately keeps behind `public_pro_profiles`/messaging.
- **Scope `contractor_availability_overrides` SELECT down from
  `auth.role() = 'authenticated'`.** Flagged in CLAUDE.md's "Deliberately
  public / known-broad RLS policies" section: any logged-in user can
  currently read every contractor's override rows, including the free-text
  `reason` column. Not fixed yet because the booking-slot picker's current
  behaviour depends on the broad read — needs the picker reworked
  alongside the policy tightening, not a policy-only change.
- **Contractor sidebar "Projects" tab is a mislabeled jobs re-slice**, not
  the real Projects feature (which is unbuilt — see the Projects section
  above). Rename or remove before the first real contractor onboarding, to
  avoid setting an expectation the platform doesn't meet yet.
- **Stripe Connect `charges_enabled` tracking.** `StripeConnect.tsx`'s status
  badge is derived purely from whether `profiles.stripe_account_id` is
  non-null, never from Stripe's live `charges_enabled`/`details_submitted` —
  a contractor who abandons onboarding immediately after clicking Connect
  still sees a green "Connected"/"Active" card. `create-connect-account`
  already subscribes to enough to know better; wire an `account.updated`
  webhook handler (new branch in `stripe-webhook/index.ts`) that writes
  `charges_enabled`/`payouts_enabled` columns (need adding to `profiles`)
  and have `StripeConnect.tsx` read those instead of presence-of-id alone.
- **`stripe-webhook` has no handler for payment-failure events.** Only
  `checkout.session.completed` and `payment_intent.succeeded` are handled;
  `payment_intent.payment_failed` / `checkout.session.expired` fall through
  to a generic 200 ack with no processing and no user-facing follow-up
  (e.g. an invoice stuck at "sent" forever with no signal to the client that
  their card was actually declined).
- **Empty/error-state rollout, remainder.** The readiness-audit R3-1 pass
  fixed the `if(!user) return`-before-`setLoading(false)` spinner-forever
  class and added error surfacing to `useInvoices`, `useJobs`,
  `useReceivedQuotes`, `useReceivedInvoices`, `useContractorPipeline`, and
  `HomeownerOverview` only — the audit's A4 findings named several more
  surfaces with the same silent-empty-on-fetch-error pattern that were
  explicitly deferred: `IssuedQuotes.tsx`, `ContractorDashboard.tsx`'s
  8-query stats block, `BusinessOverview.tsx`, `BusinessJobsView.tsx`,
  `BusinessRequestsView.tsx`, `BusinessComplianceView.tsx`. Same fix shape
  each time (check `.error`, toast or `ErrorState`, `finally { setLoading
  (false) }`) — do the rest in one pass rather than piecemeal.
- **Expired-quote DB flip.** R3-5 added a *display-layer* "Expired" state
  (computed from `valid_until` when a quote is still `status='sent'`) and
  disabled Accept for it — nothing in the DB ever actually flips
  `issued_quotes.status` to `'expired'`. A real flip (cron or trigger) is a
  separate piece of work; the display fix means it's no longer urgent, but
  the underlying quote will sit at `status='sent'` forever without one.
- **Enquiry staleness.** Confirmed in the readiness audit (A1): `enquiries`
  has no time-based staleness/expiry concept at all — status changes are
  purely event-driven (new/replied/declined/converted/archived, all
  human-triggered). An enquiry a contractor never responds to just sits at
  `new` indefinitely with no nudge or auto-close. Not designed yet.
- **Contractor-side quote badges don't reflect display-layer expiry.** R3-5's
  `toQuoteState({validUntil})` expiry computation was wired into
  `ReceivedQuotes.tsx` (recipient side) only. `ThreadQuoteSection.tsx` and
  `IssuedQuotes.tsx` (contractor side) still show "Sent — awaiting response"
  for the same quote past its `valid_until`, since their `ThreadQuote`/
  `IssuedQuote` types don't carry `valid_until` through to their
  `toQuoteState()` calls yet. Same fix shape as `ReceivedQuotes.tsx`, just
  needs `valid_until` added to those two types' select queries.
- **Client-side snag visibility — deliberately out of scope for the
  job-execution build phase (2026-07-19).** `job_snag_items` remains
  contractor-only: no client read UI, no RLS SELECT policy for the
  client. Phase A flagged this as a one-party surface, not a defect;
  worth a product decision (should a client see open snags on their own
  job, or is that noise?) before building it, not a default yes.
- **job_photos true storage-level privacy.** The job-execution build
  phase (B1) made `visibility` meaningful at the row/metadata layer
  (client queries only return `visibility='customer'` rows via RLS), but
  the `job-photos` storage bucket itself is public — anyone with a
  photo's storage_path can fetch the raw file directly regardless of the
  visibility column, since there's no per-object ACL. Making the bucket
  genuinely private (flip to `public: false`, add storage-level RLS,
  switch to signed URLs everywhere) needs the portfolio/photo_approval_
  status feature audited first — `job_photos.portfolio` + its approval
  workflow strongly implies approved photos are meant to be public-facing
  on the contractor's profile, which a blanket-private bucket would
  break. See `20260719100000_job_photos_shape_and_visibility_rls.sql`'s
  header comment for the full reasoning.
- **Consolidate job_photos RLS.** Live `pg_policies` shows 5 policies on
  `job_photos`, confirmed 2026-07-19 while diagnosing the HEIC upload
  bug: the new visibility-scoped client read policy from
  `20260719100000_job_photos_shape_and_visibility_rls.sql` sits alongside
  a pre-existing near-duplicate client read policy ("Customers can view
  approved photos on their jobs"), an approve-portfolio policy, and a
  null-qual customer INSERT policy, plus the contractor's own full-access
  policy. All OR together with no exposure gap found, but five
  overlapping policies on one table (two of which do near-identical
  client-read jobs) is confusing to reason about and easy to get wrong
  next time someone touches this table. Tidy into one clear set in a
  dedicated migration — not done here, this pass didn't touch any policy.
  needed**, confirmed still true as of the job-execution build phase
  (2026-07-19): zero UI on either side, deliberately left unbuilt rather
  than wired up half-heartedly. Already tracked in the Dormant schema
  roster below — decide adopt-or-drop when checklists actually get
  designed, don't build a stub UI against it in the meantime.

## Dormant schema roster

Tables with zero application code reading or writing them as of this
audit (2026-07 tendering build). Not necessarily wrong to have — just
undecided: either a real feature needs designing around them, or they
should be dropped. Adopt or drop when the relevant feature gets designed,
don't leave them as silent dead weight indefinitely.

- `job_message_notifications` — sender-gated as of
  `20260709170000_security_fix_notifications_and_gdpr_log.sql` (was a real
  open write before that fix), but nothing currently inserts into it.
- `job_scheduling_proposals` — possible redundancy with `schedule_events`,
  which is the table actually wired into the live scheduling flow. Audit
  which one is canonical before building on either.
- `job_checklist_items` / `job_checklist_templates` — checklist schema with
  no UI.
- `favourites` — no UI reads or writes it.
- `quote_form_templates` — created by `handle_new_user()` on every signup
  (a default template row is inserted per new user) but nothing in the app
  reads the table back.
- `enquiry_measurements` — ties to the "Enriched enquiry" LATER item above
  (homeowner-submitted dimensions) — may already be the intended home for
  that, check before adding a new table when that feature gets built.
- `job_team_members` — deprecated-pending-drop as of the job-execution
  build phase (2026-07-19): never had a writer anywhere in the app (the
  contractor's real worker-assignment UI, JobManagement.tsx's Workers
  section, writes `job_assignments` instead). The client Team tab
  (`useJobTeam`) now reads `job_assignments` joined to `team_members`
  instead of this table — see
  `20260719100000_job_photos_shape_and_visibility_rls.sql`'s trailer
  comment. Safe to drop once confirmed nothing else references it.

## Tendering — deferred (from TENDERING-SCHEMA.md, chunks 1-7 built 2026-07-10 to 2026-07-12)

Carried over verbatim from TENDERING-SCHEMA.md's own DEFERRED section —
duplicated here so it surfaces in the general backlog review, not just a
schema doc most people won't open:

- B2B payment rails + monthly roll-up invoicing (Stripe Invoicing vs bank
  reconciliation — undecided). Job line data is already unaggregated and
  ready for this; schema does not block it.
- Business roles/approval thresholds on `business_members` — coverage-based
  member-wide RLS shipped first (see CLAUDE.md's B2B/FM foundation
  section); publish/award gating tightens later.
- Lots — `tender_lots` table + nullable `lot_id` on applications, for
  splitting a multi-site tender into independently-awarded pieces. Schema
  was written not to preclude this (e.g. `tender_sites` is a junction, not
  an array) but nothing implements it yet.
- Frameworks — ranked multi-award, call-out cascade (also the structural
  answer to an out-of-hours fallback contractor).
- Two-stage tendering (EOI → shortlist → full tender).
- Gradual strict-mode adoption for `tsconfig.app.json` — see the `tsc`
  caveat in CLAUDE.md's Commands section; not tendering-specific but
  surfaced during the tendering build's own review passes.

---

## FM feature backlog (from deployed-app review, 2026-06-13)

Captured from a full review of the live business dashboard. Almost all of this is
downstream of the job-raising flow (site → asset → panel contractor → enquiry):
the dashboard's job/SLA/spend tiles and "jobs across sites" panel are already built
but empty because no job can be raised yet. Build the job flow first; these become
meaningful only once jobs exist.

### Quick win — surface existing asset columns (UI only, NO schema work)
These columns already exist on `assets` but the Add Asset form / register don't
expose them: `status` (operational/faulty/decommissioned), `warranty_expiry`,
`last_serviced`, `next_service_due`, `reference`, `location_note`. Add to the form
and show on the register. "Asset condition + next service due" is core FM language
and demos well. → Designated FIRST easy win to slot in AFTER the job flow.

### Site card depth
Site contact / manager, access instructions / opening hours, site type/category,
photos/documents, and an asset-count summary on the site card ("HQ — 3 assets,
1 due for service").

### Compliance document management (needs schema)
No cert/insurance/expiry schema exists; the Compliance page is a read-only shell
with no add controls. Needs: tables for contractor certifications/insurance with
expiry dates, UI to add/request documents from the business side, and expiry /
renewal alerting. Tie to contractor profiles.

### SLA rules (needs schema + UI)
The "SLA Rules" section and the "SLA at risk" dashboard tile are vestigial — no UI
exists to create a rule. Needs SLA rule schema (response/priority tiers) + creation
UI, then the "SLA at risk" tile becomes live.

### Contractor profile depth / metrics (views over jobs)
Per-contractor: ratings, job completion rate, average response time, job history,
total spend, last active. Preferred contractor by trade or by site. All require
jobs to exist first.

### Asset register UX
Filter by category / service-due / status, RAG (red/amber/green) service-due
indicators, bulk export, asset-count summary tile, "assets due for service"
dashboard tile.

### Pure later
QR / asset-tag support for field scanning; lifecycle / depreciation tracking.

### Housekeeping to verify
Top-bar public nav exposes /projects and /contracts links. Confirm these are not
half-built routes visible to real visitors (Projects is a LATER item).

---

## Org / site-coverage model + TS-codes-everywhere (design target, per RB 2026-06-13)

NOT a nested hierarchy — a coverage model:
- A member's scope = the SET OF SITES they cover. Labels local/area/regional/
  national just describe breadth (one site / a cluster / wider / all), not nested
  region>area>site entities.
- ALL members can raise AND approve work. Scope only determines which sites' work
  they see and can act on — no per-action capability gradient on the work itself.
- Org management (invite/remove members, manage sites) stays owner/admin — a
  separate gate, unchanged.
- Open question for the design pass: are area/region reusable named site-groups
  (define once, assign), or ad-hoc per-member site sets? Resolve then.
- Likely future refinement (not v1): approval thresholds / spend limits — FM
  procurement usually wants approval gated above a value. Park for now.

Implementation seam (keeps the job flow built now forward-compatible):
- Work actions go through can_act_for_site(member, site). v1 fill = active member
  of the owning company (everyone effectively national until coverage assigned).
  Scope layer later narrows which sites, never who-can.
- Approvals view must be company-aware (raise and approve can be different people),
  not customer_id-keyed.
- business_members gains a coverage representation when this is built.

TS-codes-everywhere:
- Extend the TS-x scheme beyond profiles. Every SITE gets a code (e.g. TS-S-XXXXXX);
  every coverage level/group gets a code (e.g. TS-A- area / TS-R- region). Mirror
  the ts_profile_code generation pattern (unique, generated on insert).
- Site codes are a cheap standalone addition (sites.ts_site_code + generation);
  level codes depend on coverage entities existing. Decide letter scheme when built.

Links back to the dropped business_members.site_scope column (v1 rebuild).

---

## Business dashboard follow-ups (from asset compliance panel build verification, 2026-07-16)

- **Requests list rows are not clickable.** `BusinessRequestsView.tsx`'s
  request table has no click-through — no enquiry detail view exists anywhere
  in the app. Needs a dedicated enquiry record view before rows can link
  anywhere.
- **A direct job-creation path exists, bypassing the quote flow entirely** —
  jobs with `issued_quote_id IS NULL` (e.g. job_number 9/10) are not
  quote-driven (see CLAUDE.md's "Quote → job creation sequence" section:
  `createJobFromQuote` always sets `issued_quote_id`). The only matching path
  in the schema is the term-engagement call-out RPCs `create_callout_job` /
  `raise_callout` (`20260711130000_term_engagements_and_watchers.sql`) — but
  grepping `src/` turns up zero callers of either function; nothing in the UI
  invokes them today. Whatever created jobs 9/10 did so outside the app
  (direct RPC call / SQL editor), not through a real user flow. When a UI is
  eventually built for this path, it will need the same site→asset picker as
  the enquiry form (`BusinessRequestsView.tsx`'s pattern) — `create_callout_job`
  already accepts `p_site_id` but has no equivalent asset parameter yet.
- **Enquiry record view should display its linked asset** once that view
  exists (see the requests-list item above) — make the enquiry detail
  URL-addressable (its own route/deep-link, not just a modal).
- **Call-out jobs via `engagement_id` should carry `asset_id`** when a UI is
  built for `create_callout_job`/`raise_callout` — add the asset parameter
  alongside the site picker above rather than bolting it on afterward.
- **Service visit completion should write `assets.last_serviced` and roll
  `assets.next_service_due`** forward by the schedule's frequency — currently
  pure UI display (`AssetDetail.tsx` reads these columns but nothing writes
  them on visit completion). Build this alongside the
  `service_schedules`/`service_visits` UI (`MaintenanceManagement.tsx`'s
  Schedules/Visits tabs), not before — the visit-completion handler is the
  correct place, not a general job-completion hook.


  ## Staged Payments, Deposits & Retentions

**Status:** Designed at outline level. Highest-ranked money gap — will block real jobs over ~£1k and most B2B work.
**Why it matters:** Real jobs are deposit → stage payments → final balance, not one invoice at completion. B2B adds 30–60 day terms, applications for payment, and retentions. Current Stripe flow assumes one invoice per job.

### Design direction
- **Payment schedule object on the job:** ordered stages (label, amount or % of quote, trigger: on-acceptance / date / milestone / completion). Each stage generates its own invoice via existing INV- numbering — one invoice per stage, not a new document type.
- **Deposits:** just stage 1 with trigger on-acceptance. No separate deposit concept.
- **B2B payment terms:** `payment_terms_days` on the invoice (0 = due on receipt, 30/60 for B2B). Overdue cron already exists — extend to respect terms.
- **Retentions (B2B):** retention % on the payment schedule; final stage splits into "final balance" + "retention release" invoice with a future due date. Compliance watcher / cron surfaces retention releases falling due — genuinely valuable, contractors forget these and lose the money.
- **OPEN:** does Stripe handle B2B at all initially, or do B2B invoices support "paid off-platform / bank transfer" marking? (Likely yes — FM clients pay by BACS, not card. Platform fee model for off-platform payment needs deciding.)

## Job Variations / Change Orders

**Status:** Already on horizon — promoting to top of queue. Most common real-world job event not handled.
**Why it matters:** "While I'm up here, the joist is rotten." Happens on a huge share of jobs; without it, the final invoice can't legitimately differ from the quote and contractors route around the platform.

### Design direction
- `job_variations` table: description, amount (+/-), status (proposed → accepted/rejected), photos, who raised it, client assent timestamp. Numbering: V-1, V-2 within the job (contractor_counters pattern not needed — per-job sequence fine).
- Client acceptance is a hard gate before the variation amount is invoiceable — this is the dispute-defence artifact.
- Job total = quote + accepted variations; invoice/stage amounts reconcile against that.
- Feeds job record PDF (variations section with assent trail).
- Pairs with job photos (evidence attached to the variation).

## Job Photos

**Status:** Not built (enquiry photo upload also never built — separate item). Cheap, high value.
**Why it matters:** Before/during/after photos are how contractors defend disputes, evidence variations, and justify invoices.

### Design direction
- Reuse tender-documents pattern: private bucket, `{job_id}/{filename}`, signed URLs. Likely same `job_documents` table as RAMS Tier 1 with `kind = photo`, plus `phase` (before/during/after/variation/completion) and optional `variation_id`.
- Upload from job view, mobile-first (camera capture, not just file picker — contractors photograph on-site with phones).
- Surfaces: job record PDF (photo appendix), variation evidence, snagging/dispute path when built.
- Build alongside RAMS Tier 1 — same table, same bucket pattern, one migration.

## Certificates & Warranties on Job Completion

**Status:** Designed at outline level. Extends job_documents pattern.
**Why it matters:** The certificate is the real "done" artifact — EIC/minor works + Part P (electrical), CP12/commissioning record (gas). Contractors issue these via NICEIC/Gas Safe apps; attaching them makes the TradeStone job record the authoritative file. FM clients audit for exactly this.

### Design direction
- `job_documents` with `kind` values: `certificate`, `warranty` (alongside `rams`, `photo`). Metadata: cert type, reference number, expiry (for CP12s — annual).
- **Soft prompt, not hard gate:** at sign-off, prompt for certificates on trades that require them (keyed off job trade). Don't block completion — not every job needs one, and false gates train contractors to ignore gates. **OPEN:** B2B clients may want it as a hard gate per-contract — could be a client-side setting later.
- Warranties: workmanship guarantee terms + insurance-backed guarantee (IBG) doc where applicable (TrustMark requires IBGs for some work).
- Expiry radar potential: CP12 expiry feeds future FM reporting / renewal prompts — natural fit with the contract expiry radar pattern.

## Consumer Cooling-Off Notice (14-day)

**Status:** Designed. Small build, real legal exposure for contractors without it — and a selling point.
**Why it matters:** Contracts agreed off-premises/at the consumer's home fall under Consumer Contracts Regulations 2013. If no cancellation notice is served, the consumer's cancellation window extends up to 12 months and the contractor may be unable to enforce payment. Baking it into quote acceptance protects every contractor on the platform by default.

### Design direction
- Homeowner quote acceptance flow: cancellation-rights notice presented at acceptance, explicit acknowledgement recorded (timestamp + notice version — same terms_snapshot discipline as the agreement ceremony).
- If work starts inside the 14 days: capture the consumer's express request for early commencement + acknowledgement they'll pay for work done if they cancel (this is the bit contractors always miss).
- Cancellation notice text + model cancellation form stored versioned; appears in acceptance email and job record PDF.
- B2B jobs: not applicable, flow skipped entirely (keys off client type, same flag as RAMS gate).
- **Needs a solicitor's eye on the notice wording before launch** — pattern is standard but the text carries legal weight. Not professional advice from TradeStone; the platform serves the contractor's notice for them.