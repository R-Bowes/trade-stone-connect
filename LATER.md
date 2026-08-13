# LATER.md

**Last reviewed: 2026-08-06**

Parked ideas and out-of-scope features. Capture here, don't build now.

Active work — blocking-validation items, pre-launch fixes, data integrity,
housekeeping — lives in `NOW.md`, not this file.

---

## Reading rules

1. This file is reference, never instruction. Nothing here becomes work
   until it is turned into a detailed brief in conversation first.
   Claude Code never implements directly from this document.
2. All SQL is `DO NOT RUN`. Schema in here was written against the schema
   of the day and is assumed wrong until proven otherwise.
3. Step-0 schema audit is mandatory before any block becomes a brief:
   `information_schema.columns` + `pg_policies` output pasted from the
   live DB, never described, never reconstructed from code or memory.
4. Migrations are immutable. Nothing here is ever applied as an edit to
   an existing migration file — new timestamped file only, via
   `npx supabase db push`. Never the dashboard SQL editor.
5. Every block carries a `Last reviewed:` date where it has been checked
   against the live codebase. Unreviewed for 90 days = unverified, not spec.
6. Shipped items are deleted, not annotated as done. History is git's job.
7. Review cadence: monthly, against the live codebase — not from memory.

## Invariants any block must respect (fail = rewrite the block)

- Platform name is "TradeStone". No suffix, ever.
- No phone numbers or email addresses on platform-generated documents or
  contractor-facing views. All comms route through platform messaging —
  including any buyer/seller, hirer/owner, or client/contractor handoff.
- Document refs via `src/lib/documentRefs.ts` helpers only.
  Q- / J- / INV- / WO- prefixes. There is no TS-J scheme.
- Two-step RLS: `x_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())`.
- SECURITY DEFINER for admin operations and consequential state transitions.
- Craft score is never influenced by price or speed.
- Platform fee is 5%. No subscription-model assumptions anywhere.
- i18n-aware: no hardcoded currency symbols, locale-aware formatting,
  regulatory logic (VAT, HMRC, CIS, postcodes) behind country flags.
- Live quote table is `issued_quotes`. `quotes` is permanently legacy and empty.

## Retired — any block referencing these is stale and must be re-specced

`auth_user_company_ids()` · `team_members.is_active` · `assets.is_active` ·
`generate_invoice_number` trigger · database GUCs for cron secrets (use Vault /
`get_secret()`) · Lovable hosting · `PUBLIC_URL` / `PUBLIC_APP_URL`

---

## Next up after validation (design first, no code)

- **Contractor onboarding wizard** — not yet built. First-run guided setup:
  profile completion, trade selection, Stripe Connect, verification documents,
  quote template. Highest-value unbuilt item once validation closes.
- **Push notifications** — needs native app or service worker. See Mobile.

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

**Step-0 required before designing**
- The `enquiry-photos` bucket exists (private, authenticated SELECT). Establish
  what already writes to it and whether photo upload at enquiry stage is
  partially built.
- `enquiry_measurements` exists in the dormant schema roster and may already be
  the intended home for the dimensions half. Check before adding a new table.

---

## Trust, safety & anti-cowboy

- **Escrow / milestone fund holding** — funds held by the platform, released on
  customer milestone sign-off, auto-release timer if no response in window,
  frozen on dispute. Distinct from staged payments (shipped, which schedules
  invoices but does not hold funds). The anti-cowboy centrepiece and the
  hardest regulatory piece here — payment-institution territory. Needs proper
  legal review before design, not after.
- **Dispute resolution workflow** — platform-mediated fund hold, evidence
  submission from both sides, resolution decision. Needed before any real
  transaction volume, and a hard dependency of escrow above.
- **Trade licence API verification** — automated checks vs Gas Safe, NICEIC,
  Companies House. Verification tiers and the manual admin verification
  workflow shipped; this replaces the manual step with API calls. Verified
  credentials shown publicly (type, body, dates, reg number + register link);
  uploaded docs stay private. Unverified credentials don't appear publicly.
- **Insurance expiry enforcement** — contractor PL insurance with expiry date,
  warning before lapse, lapsed insurance blocks new enquiries.
  **Step-0 required:** team certifications shipped with expiry tracking —
  establish whether contractor-level insurance already uses the same tables
  before designing anything new.
- **Review challenge & moderation workflow** — contractor right of reply,
  admin adjudication, review removal criteria. Note the scoring invariant:
  reviews drive Service score only; Craft is system and third-party signal
  only, so a challenged review must not be able to move Craft.

---

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
  timeline, customer approve/decline. Distinct from job variations (shipped),
  which operate within a single job. Parked with Projects.
- **Sub-contractor hiring** — contractor as principal on a sub-job via
  `parent_job_id` FK (Option A), no tier escalation. Needs contractor volume.
- **Template schemas** for proposals — needs real tender data first.
- **Blocker:** `create-deposit-checkout` is quarantined (see tech debt) and
  must be fixed before Projects deposits can be taken.

---

## Financial & HMRC compliance

**Tier 2 (external partnerships required — gated behind Tier 1 validation)**
- **MTD VAT submission** via HMRC API — one-button quarterly return from
  platform data. HMRC Developer Hub registration starts the approval clock;
  worth beginning early even though the build is gated.
- **Bank feed reconciliation** (TrueLayer / Plaid) — auto-match bank
  transactions to invoices.

**Tier 3**
- **Receipt OCR** and **smart categorisation**.
- **Year-end tax pack** (extends the shipped year-end pack PDF).
- **MTD for Income Tax** submission.
- **Self Assessment summaries.**

**Other**
- **HMRC CIS API** — deduction automation. Labour/materials split on quote
  lines (below) is a prerequisite, since the two carry different deduction
  treatment.
- **Basic payroll (PAYE)** for contractors with employees — deferred, PAYE
  complexity vs small user slice. Interacts with team member sub-logins.
- **Invoice factoring / financing** — deferred. FCA territory, capital +
  credit risk; can sink the business if done naively.

---

## Labour / Materials categorisation on quote lines

Contractors want to see what they quoted for labour versus materials.

This is a finance feature more than a quoting one. Job profitability currently
shows what a job *cost* by category but not what it was *quoted* at, so the
question "did I underprice labour or did materials overrun?" is unanswerable.
Splitting quote lines by type closes that loop.

Also feeds CIS, where labour and materials carry different deduction treatment.

Schema options: a `line_type` field on the existing `items` jsonb (cheap, hard
to aggregate), or a proper `quote_line_items` table (correct if profitability
is going to group on it). Recommend the table.

Step-0 required: `issued_quotes.items` jsonb shape, and every reader of it —
quote PDF generation duplicates the structure inline.

---

## Notifications

- **Push notifications** — needs native app + service worker.
- **SMS notifications** (configurable per user).
- **In-app notification centre** with read/unread state.
- **Granular notification preferences** per event type.

Dependency: the watcher nudge dedup fix in `NOW.md` — do not add channels to
a notification system that re-fires the same nudge on every cron run.

---

## Discovery & growth

- **SEO-optimised public contractor directory.**
- **Geolocation-based search results** — distance weighting in the ranking
  pipeline. Scoring-driven ranking shipped; this adds the geo dimension.
- **Promoted listings / pay-to-rank** — deferred until trust is established.
  If built, promoted placement must be visually distinct and must never alter
  the underlying score. Layer in carefully.
- **Google AdSense** — Publisher ID obtained, awaiting site review for
  tradesltd.co.uk. `AdBanner` component once approved, placed in contractor
  dashboard sidebar and public directory footer. Long-term: negotiate direct
  supplier partnerships (Screwfix, Toolstation) using traffic data.

---

## Retention & stickiness

- **Repeat / recurring job scheduling** — boiler service, gutter clean;
  auto-creates enquiry/job at interval. Homeowner-side equivalent of the
  shipped PPM auto-rolling visits; check whether that machinery can be reused
  before designing new.
- **One-click rebook** of a preferred contractor.
- **Homeowner job history** view — jobs exist and certificates/warranties
  ship with them; this is the homeowner-facing aggregation surface plus
  warranty expiry prompts.

---

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
| `job_id` | uuid FK | Optional. Links to `jobs.id`. Display uses the job ref from `documentRefs.ts` (`J-4AE203-0008`) — there is no TS-J scheme |
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
-- DO NOT RUN
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
(TS code, trade, score, job count — links to public profile), optional job
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
Platform fee: to be decided at build time. Job payments are 5%; marketplace
carries lower relationship value and higher dispute risk on physical goods,
so a higher rate is arguable — but decide it deliberately, don't inherit a
number from this document.
Buyer protection: 48-hour dispute window after collection confirmed.
No physical fulfilment handling by TradeStone — collection or local delivery
arranged between buyer and seller **through platform messaging**. Offers,
collection arrangements and address exchange all route through the messaging
system; no phone numbers or email addresses are exposed at any point.

---

### Explicitly out of scope until Phase 3
- Delivery/logistics integration
- Retail outlet onboarding and merchant agreements
- VAT invoice generation for merchant sales (contractor P2P surplus sales
  carry no VAT obligation for non-VAT-registered sellers)
- Product catalogue / SKU database (listings are free-text, not catalogue-matched)
- Tool and equipment hire (separate liability model — see Tool Hire below)

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

**Check first:** My Kit inventory management shipped, including document
attachments. Establish whether hire listings should extend My Kit rather than
introduce a parallel asset concept — a contractor should not maintain the same
tool in two places.

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
| `delivery_available` | boolean | Lister offers delivery (hirer pays delivery cost separately) |
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
-- DO NOT RUN
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
(Phase 2 of hire). Note the shipped team availability calendar as a possible
pattern source.

**Platform fee:** decide at build time; higher than materials sale is arguable
given deposit handling, dispute mediation and return coordination. Deposit
itself carries no platform fee.

**Handover:** collection, return and damage discussion all route through
platform messaging. No contact details exchanged.

**Explicitly out of scope until Phase 2 of hire:**
- Delivery cost calculation or logistics integration
- Verified insurance document upload
- Availability calendar with date-range picker
- Multi-item hire bundles
- Long-term rental (>30 days — different tax/legal treatment)
- Commercial hire companies listing fleet (separate merchant relationship)

---

## Profile customisation — freeform content block

**Status:** Designed, not built. The rest of the "replace your website" set
(social links, video embeds, before/after sliders, featured testimonials,
service area) has shipped. This is the remaining item.

**Priority:** Covers the widest range of "I can't do X on my profile."
Contractors need to explain their process, list guarantees, describe aftercare,
write FAQs. The bio section covers "about me" but trades often need multiple
distinct text sections ("Our Process", "Warranty Information", "Why Choose Us",
"Areas We Cover").

**Build prerequisite:** slots into the existing profile editor widget system
(`profile_widgets`, `CanvasEditor.tsx`, section type registry). No changes to
the widget architecture itself. Run Step-0 against the live DB first.

**Section type:** `content` — repeatable, max 5 instances, reorderable,
togglable.

**Editor panel fields**
- Section heading input (saves to `meta.heading`, same as other sections)
- Content body textarea with markdown-lite formatting: bold, bullet list,
  numbered list, and links only. No images (use galleries), no headings (the
  section heading covers that), no colours, no custom fonts.
- Character limit: 2,000.

**Data model:** No new table. Lives in `profile_widgets.meta` as
`{ heading: string, body: string }`. Body stored as markdown-lite string,
rendered on public profile.

**Canvas preview:** Renders heading and body with formatting applied.
Truncates at ~200 chars with "…" to keep canvas blocks consistent height.

**Public profile rendering:** Heading in Lexend 600, body in Source Serif 4
400. Bullet/numbered lists render natively. Links render as orange text.
Max-width prose container for readability.

**Sanitisation:** markdown-lite is parsed to a fixed allow-list of tags, never
rendered as raw HTML. Link `href` validated to `https://` only.

**What it doesn't do:** No images, custom fonts, background colours, or
columns. Those break brand consistency. Visual content goes in galleries or
projects.

---

## Payment reliability warnings

**Purpose:** Surface payment track record when a contractor is about to engage
with a client (quote creation, enquiry review, tender application). Builds
platform trust and protects contractors from repeat late-payers.

**Trigger points (UI banners):**
- `SendQuoteDialog` — before issuing a quote
- Enquiry detail view — when reviewing an inbound request
- Tender application stepper — before applying to a business tender
- B2B panel overview — aggregated reliability per business account

**Display rules:**
- Show: count of outstanding invoices + longest overdue age in days
- Example copy: "This account has 2 outstanding invoices with another party,
  oldest 47 days overdue"
- RAG colouring: amber 1–30 days, red 31+ days, no banner if clean
- Never reveal: other contractor's identity, invoice amounts, or job details
- Lookback window: 12 months rolling
- Exclude: invoices with status `disputed` (requires adding dispute status)

**Data source:**
Query `invoices` where `client_id = target_profile_id` AND (`status = 'overdue'`
OR (`status = 'sent'` AND `due_date < NOW()`)) AND
`created_at > NOW() - INTERVAL '12 months'` AND `status != 'disputed'`.
Aggregate across all contractors, not just the viewing contractor.

**Schema additions:**

```sql
-- DO NOT RUN
-- Add disputed status to invoices (extend existing invoices_status_valid CHECK)
-- Exact constraint shape TBD — run Step-0 against live DB first

-- Optional: materialised summary for performance at scale
CREATE TABLE payment_reliability_summary (
  profile_id          UUID PRIMARY KEY REFERENCES profiles(id),
  outstanding_count   INTEGER NOT NULL DEFAULT 0,
  oldest_overdue_days INTEGER,
  last_calculated     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS: contractors can SELECT where profile_id matches the client
-- they are about to quote/engage. Business panel managers can
-- SELECT for any contractor on their panel.
-- SECURITY DEFINER function to recalculate on invoice status change.
```

**Privacy & fairness considerations:**
- No public-facing "score" — information shown only to the party about to
  transact. This must never feed the contractor scoring engine.
- Disputed invoices excluded to prevent weaponising non-payment flags
- Client can see their own record (future: "Your payment profile")
- Consider: grace period before flag activates (e.g. 7 days past due)
- Consider: contractor-side equivalent for B2B clients
- GDPR: legitimate interest for platform trust; include in the Privacy Policy
  data processing schedule before launch, not after

**Dependencies:**
- Invoice dispute status (not yet built)
- Reliable `due_date` population on all invoices — **currently broken**, see
  "Zero-day payment terms" in `NOW.md`. Do not build this until that is fixed;
  every client would be flagged.
- Core job flow validated end to end

**Not in scope:** automated credit checks or external bureau integration;
public client ratings; automatic service refusal based on payment history.

---

## Mobile

- **Native app (React Native)** — iOS/Android, offline timesheets/job notes,
  camera integration. WebView wrappers (Capacitor, GoNative) rejected as
  "still the website." Decision deferred. Note that contractor and homeowner
  responsive layouts have shipped, which lowers the urgency but does not
  address offline or push.

---

## Platform infra & observability

- **PostHog analytics** (funnel, usage, retention). GA4 is live
  (`G-67CCVE770P`); this is the product-analytics layer, not a replacement.
- **Sentry error tracking** (frontend + Edge Functions).
- **2FA** and **end-to-end message encryption.**
- **GDPR data retention** — user-controlled export & deletion. ICO
  registration C1969229 is in place; the self-service mechanism is not.

---

## Integrations (Phase 2+)

- **Accounting: Xero, QuickBooks export.** Note the strategic tension — the
  moat is contractors *cancelling* Xero. Frame any integration as one-way
  export for their accountant, not two-way sync that keeps Xero in the stack.
- **Calendar:** Google Calendar, Outlook.
- **E-signature:** DocuSign or native.
- **API access** for Business tier enterprise integrations.

---

## Speculative / long-term

- **AI quote generation** from past job data — only viable once real data
  exists; a bad AI quote to a real customer damages trust.
- **AR site survey / measurement tool.**
- **Carbon footprint tracking per job.**
- **Revenue-based lending.**
- **Internationalisation build** — no build now; write i18n-aware code going
  forward. Target expansion: US, Canada, Australia, New Zealand, then Europe.

---

## Tech debt / known issues to revisit

- **`.update()` without `.select()`, then patching local state with what the
  client sent, diverges from the database wherever a trigger computes a
  value on that write.** Confirmed root cause of a real bug (2026-08-09):
  `JobManagement.tsx`'s `changeStatus`/`moveToPrevStatus` sent
  `{status: nextStatus}` and patched only `status` into local state —
  `actual_start`/`actual_end` (set server-side by `set_job_timestamps()`)
  and `sla_status`/`sla_completion_due` (set by `trigger_check_sla_breach()`)
  never reached the client without a full page reload, which is why a job
  completed via `/field` (a different tab/session entirely) didn't appear
  in the "Completed · last 90 days" section — that filter reads
  `actual_end`. Fixed there by chaining `.select(...).single()` and
  spreading the full returned row into local state instead of the sent
  field alone. **Not yet applied to the other call sites with the identical
  shape** (grepped, not fixed, this pass):
  - `ThreadJobSection.tsx:68` — `changeStatus`, same `{status: newStatus}`
    pattern, same missing `.select()`, contractor-side thread view (a
    second, separate path to the same bug `JobManagement.tsx` had).
  - `FieldStatusStepper.tsx:50` — `/field`'s own status stepper, identical
    shape. Lower priority today only because nothing in `/field` currently
    renders `actual_end`/`sla_status` — but the same trigger-divergence
    exists the moment something there reads either.
  - `useQuoteScheduling.ts:640` — `{start_date: confirmedDate}} — worth
    checking whether anything trigger-derived reacts to `start_date`
    changes (e.g. `trg_block_date_on_job_confirmed`) before assuming this
    one's safe.
  - `ClientJobsView.tsx` (two `jobs` updates, ~205/221),
    `useCoolingOff.ts:112`, `ProjectDelivery.tsx:464` — not yet checked
    against which trigger-computed columns each write could be diverging
    from; listed for the audit, not confirmed bugs.
  Audit each against the specific triggers on `jobs` (`pg_trigger`, not the
  migration files, per the completion-certificate audit's own lesson) before
  deciding whether it needs the same `.select()` fix.
- **Field view — untested in browser** (`/field`, team member sub-account
  build, 2026-08-08). The location-first rendering, address block,
  Navigate/Call buttons, and bare-em-dash gaps noted here previously are
  fixed as of the status/signature/notes build (2026-08-09). Still
  untested in an actual browser: photo capture + client-side compression,
  clock in/out across a real shift, signature capture with a finger on a
  real touchscreen, the status stepper against the live
  `enforce_job_status_transition` trigger (in particular the
  snagging→complete block on unresolved snag items), and the Tier B
  boundary (invoices/quotes/enquiries/finance never reachable from
  `/field`) beyond "no code path references them."
- **`jobs` Tier A UPDATE policy is row-level only, not column-level** — a
  team member can write `contractor_signed_off_at`/`contractor_signed_off_name`
  (the CONTRACTOR's own counter-signature, i.e. the firm asserting it
  considers the work done) on any of their employer's jobs, because
  Postgres RLS has no column-level restriction and the Tier A jobs UPDATE
  policy (`20260808110000`) grants the whole row. This was never a
  deliberate decision — it's a side effect of RLS's row-level nature
  discovered while scoping the field completion flow. Nothing in this
  build's UI currently exposes a way to trigger it from `/field` (the field
  view writes `status` and the new `site_signed_off_*` columns only), but
  the RLS layer itself does not prevent a team member writing those two
  columns directly via the API. Column-level restriction needs either a
  trigger guard (reject the write unless the actor is the contractor
  themselves) or moving contractor sign-off to a SECURITY DEFINER RPC —
  RLS cannot express "this column, only this actor" on its own.
- **Jobs minted from quotes have no site details.** `location`,
  `description`, `job_type`, and `scheduled_start` are all NULL on jobs
  created via `mint_job_from_quote` — confirmed against live `jobs` rows.
  An engineer cannot be dispatched to a job with no address. This blocks
  the field view being useful for quote-originated jobs specifically
  (FM/tender-originated jobs carry more of this data already). Check this
  before the next validation walk — it's a data-completeness gap, not a
  `/field` bug.
- Standardise all Edge Functions on `SITE_URL`; remove `PUBLIC_URL` and
  `PUBLIC_APP_URL` reads.
- Job sign-off approval — `jobs.portfolio_approved` column unused; business
  Approvals view is quote-approvals only until job sign-off is scoped.
- Business tier SLA per-contractor pairing (matching `applies_to_trade` to a
  contractor's declared trade) — follow-on, currently a reference table only.
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
  (`accept_quote_with_slot`,
  `20260717150000_accept_quote_with_slot_full_contract.sql`) and un-confirm
  the held `schedule_events` row for that quote — not just flip the quote's
  own status — or a lapsed quote leaves the contractor's calendar permanently
  blocked with no path back to available.
- **`create-deposit-checkout` (Projects deposits) — quarantined, not fixed**,
  readiness-audit R2 decision 2 (2026-07-18): no live caller invokes it
  (`ProposalReview.tsx` shows an honest "coming soon" message instead).
  Before re-enabling: (a) `stripe-webhook` has no `type:"project_deposit"`
  branch for the checkout session this creates — a payment made through it
  today is captured by Stripe and never recorded anywhere in the DB;
  (b) `contractor_stripe_account` is taken directly from the request body with
  no server-side lookup against `profiles.stripe_account_id`, so nothing stops
  a modified payload redirecting the transfer to an arbitrary connected
  account; (c) no idempotency guard at all. **Hard dependency of Projects.**
- **Homeowner job view: no per-job messaging entry point.** The rails exist
  (`job_conversations`/`job_messages`) but there's no button on the
  homeowner-facing job view that deep-links into the existing thread —
  needs one UI affordance, not new schema.
- **Scope `contractor_availability_overrides` SELECT down from
  `auth.role() = 'authenticated'`.** Flagged in CLAUDE.md's "Deliberately
  public / known-broad RLS policies" section: any logged-in user can currently
  read every contractor's override rows, including the free-text `reason`
  column. Not fixed yet because the booking-slot picker's current behaviour
  depends on the broad read — needs the picker reworked alongside the policy
  tightening, not a policy-only change.
- **Expired-quote DB flip.** R3-5 added a *display-layer* "Expired" state
  (computed from `valid_until` when a quote is still `status='sent'`) and
  disabled Accept for it — nothing in the DB ever actually flips
  `issued_quotes.status` to `'expired'`. A real flip (cron or trigger) is a
  separate piece of work; the display fix means it's no longer urgent, but the
  underlying quote will sit at `status='sent'` forever without one.
- **Contractor-side quote badges don't reflect display-layer expiry.** R3-5's
  `toQuoteState({validUntil})` expiry computation was wired into
  `ReceivedQuotes.tsx` (recipient side) only. `ThreadQuoteSection.tsx` and
  `IssuedQuotes.tsx` (contractor side) still show "Sent — awaiting response"
  for the same quote past its `valid_until`, since their `ThreadQuote` /
  `IssuedQuote` types don't carry `valid_until` through to their
  `toQuoteState()` calls yet. Same fix shape as `ReceivedQuotes.tsx`, just
  needs `valid_until` added to those two types' select queries.
- **Enquiry staleness.** Confirmed in the readiness audit (A1): `enquiries` has
  no time-based staleness/expiry concept at all — status changes are purely
  event-driven (new/replied/declined/converted/archived, all human-triggered).
  An enquiry a contractor never responds to just sits at `new` indefinitely
  with no nudge or auto-close. Not designed yet. Interacts with the responsive
  ness component of the scoring engine — a contractor should not be scored on
  an enquiry nobody ever chased.
- **Client-side snag visibility — deliberately out of scope for the
  job-execution build phase (2026-07-19).** `job_snag_items` remains
  contractor-only: no client read UI, no RLS SELECT policy for the client.
  Phase A flagged this as a one-party surface, not a defect; worth a product
  decision (should a client see open snags on their own job, or is that
  noise?) before building it, not a default yes.
- **`job_photos` true storage-level privacy.** The job-execution build phase
  (B1) made `visibility` meaningful at the row/metadata layer (client queries
  only return `visibility='customer'` rows via RLS), but the `job-photos`
  storage bucket itself is public — anyone with a photo's storage_path can
  fetch the raw file directly regardless of the visibility column, since
  there's no per-object ACL. Making the bucket genuinely private (flip to
  `public: false`, add storage-level RLS, switch to signed URLs everywhere)
  needs the portfolio / `photo_approval_status` feature audited first —
  `job_photos.portfolio` + its approval workflow strongly implies approved
  photos are meant to be public-facing on the contractor's profile, which a
  blanket-private bucket would break. See
  `20260719100000_job_photos_shape_and_visibility_rls.sql`'s header comment.
- **Consolidate `job_photos` RLS (table AND `storage.objects`).** Live
  `pg_policies` shows 5 policies on the `job_photos` TABLE, confirmed
  2026-07-19: the visibility-scoped client read policy sits alongside a
  pre-existing near-duplicate client read policy ("Customers can view approved
  photos on their jobs"), an approve-portfolio policy, a null-qual customer
  INSERT policy, and the contractor's own full-access policy. All OR together
  with no exposure gap found, but five overlapping policies (two doing
  near-identical client-read jobs) is confusing to reason about and easy to
  get wrong next time. Separately, on `storage.objects` for bucket
  `job-photos`: the two over-permissive SELECT policies were replaced with
  scoped ones in `20260719140000_job_photos_storage_read_policies.sql`, but a
  **broad INSERT policy remains untouched** — it allows any authenticated user
  to upload into the bucket, not scoped to job ownership. Fold both into one
  consolidation migration.
- **`job_checklist_items` / `job_checklist_templates` — decision still
  needed**, confirmed still true as of 2026-07-19: zero UI on either side,
  deliberately left unbuilt rather than wired up half-heartedly. Also in the
  Dormant schema roster — decide adopt-or-drop when checklists actually get
  designed; don't build a stub UI against it in the meantime.
- **`create-payment-intent` — closed, retained for context.** Both findings
  from the 2026-07-18 syntax-error repair were fixed in the readiness-audit
  R1-R3 slice: partial idempotency (R3-4, now checks the retrieved PI's
  `.status` before reuse) and the missing authorization check on
  `create_client_secret` (R3-3, verify-if-present against the invoice's
  `recipient_id`; the anonymous overdue-invoice email-link flow still allowed
  through, bounded by the invoice id being an unguessable UUID).
  Delete this entry at the next review if nothing has regressed.

---

## Dormant schema roster

Tables with zero application code reading or writing them as of the 2026-07
tendering build audit. Not necessarily wrong to have — just undecided: either
a real feature needs designing around them, or they should be dropped. Adopt
or drop when the relevant feature gets designed; don't leave them as silent
dead weight indefinitely.

- `job_message_notifications` — sender-gated as of
  `20260709170000_security_fix_notifications_and_gdpr_log.sql` (was a real
  open write before that fix), but nothing currently inserts into it.
- `job_scheduling_proposals` — possible redundancy with `schedule_events`,
  which is the table actually wired into the live scheduling flow. Audit which
  one is canonical before building on either.
- `job_checklist_items` / `job_checklist_templates` — checklist schema with
  no UI.
- `favourites` — no UI reads or writes it.
- `quote_form_templates` — created by `handle_new_user()` on every signup (a
  default template row is inserted per new user) but nothing in the app reads
  the table back.
- `enquiry_measurements` — ties to the Enriched enquiry item above; may already
  be the intended home for that. Check before adding a new table.
- `job_team_members` — deprecated-pending-drop as of 2026-07-19: never had a
  writer anywhere in the app (the contractor's real worker-assignment UI,
  `JobManagement.tsx`'s Workers section, writes `job_assignments` instead).
  The client Team tab (`useJobTeam`) now reads `job_assignments` joined to
  `team_members`. Safe to drop once confirmed nothing else references it.

---

## Tendering — deferred

Carried over from `TENDERING-SCHEMA.md`'s own DEFERRED section (chunks 1–7
built 2026-07-10 to 2026-07-12) — duplicated here so it surfaces in the
general backlog review, not just a schema doc most people won't open:

- B2B payment rails + monthly roll-up invoicing (Stripe Invoicing vs bank
  reconciliation — undecided). Job line data is already unaggregated and ready
  for this; schema does not block it. Note the economics: BACS Direct Debit
  (1%, capped at £2) is substantially more profitable than card on large B2B
  contracts, where domestic card processing comes out of platform balance
  under destination charges.
- Business roles/approval thresholds on `business_members` — coverage-based
  member-wide RLS shipped first (see CLAUDE.md's B2B/FM foundation section);
  publish/award gating tightens later.
- Lots — `tender_lots` table + nullable `lot_id` on applications, for splitting
  a multi-site tender into independently-awarded pieces. Schema was written not
  to preclude this (e.g. `tender_sites` is a junction, not an array) but
  nothing implements it yet.
- Frameworks — ranked multi-award, call-out cascade (also the structural answer
  to an out-of-hours fallback contractor).
- Two-stage tendering (EOI → shortlist → full tender).
- Gradual strict-mode adoption for `tsconfig.app.json` — see the `tsc` caveat
  in CLAUDE.md's Commands section; not tendering-specific but surfaced during
  the tendering build's own review passes.

---

## FM feature backlog

**Last reviewed: 2026-08-06.** Several original items (compliance document
management, SLA rule schema, contractor profile metrics) are wholly or partly
superseded by the shipped PPM compliance dashboard, verification tiers, and
scoring display layer. What remains:

### Quick win — surface existing asset columns (UI only, NO schema work)
These columns already exist on `assets` but the Add Asset form / register may
not expose them: `status` (operational/faulty/decommissioned — canonical;
`is_active` must never be read or written), `warranty_expiry`, `last_serviced`,
`next_service_due`, `reference`, `location_note`. "Asset condition + next
service due" is core FM language and demos well.
**Verify current state before building — this may be partly done.**

### Site card depth
Site contact / manager, access instructions / opening hours, site type/category,
photos/documents, and an asset-count summary on the site card ("HQ — 3 assets,
1 due for service"). Cross-check against the shipped site contacts portal and
site autonomy model before designing.

### Asset register UX
Filter by category / service-due / status, RAG service-due indicators, bulk
export, asset-count summary tile, "assets due for service" dashboard tile.

### Pure later
QR / asset-tag support for field scanning; lifecycle / depreciation tracking.

---

## Org / site-coverage model + TS-codes-everywhere

**Design target, per RB 2026-06-13. Cross-check against the shipped site
autonomy model (four configurable levels) before treating any of this as
unbuilt.**

NOT a nested hierarchy — a coverage model:
- A member's scope = the SET OF SITES they cover. Labels local/area/regional/
  national just describe breadth (one site / a cluster / wider / all), not
  nested region>area>site entities.
- ALL members can raise AND approve work. Scope only determines which sites'
  work they see and can act on — no per-action capability gradient on the work
  itself.
- Org management (invite/remove members, manage sites) stays owner/admin — a
  separate gate, unchanged.
- Open question for the design pass: are area/region reusable named site-groups
  (define once, assign), or ad-hoc per-member site sets? Resolve then.
- Likely future refinement (not v1): approval thresholds / spend limits — FM
  procurement usually wants approval gated above a value. Park for now.

Implementation seam (keeps the job flow built now forward-compatible):
- Work actions go through `can_act_for_site(member, site)`. v1 fill = active
  member of the owning company (everyone effectively national until coverage
  assigned). Scope layer later narrows which sites, never who-can.
- Approvals view must be company-aware (raise and approve can be different
  people), not `customer_id`-keyed.
- `business_members` gains a coverage representation when this is built.

TS-codes-everywhere:
- Extend the TS-x scheme beyond profiles. Every SITE gets a code (e.g.
  TS-S-XXXXXX); every coverage level/group gets a code (e.g. TS-A- area /
  TS-R- region). Mirror the `ts_profile_code` generation pattern (unique,
  generated on insert).
- Site codes are a cheap standalone addition (`sites.ts_site_code` +
  generation); level codes depend on coverage entities existing. Decide letter
  scheme when built.
- Note: TS-x codes identify *accounts and entities*. Documents use the
  `documentRefs.ts` scheme (Q- / J- / INV- / WO-). Do not blur the two.

Links back to the dropped `business_members.site_scope` column (v1 rebuild).

---

## Business dashboard follow-ups (from asset compliance panel build, 2026-07-16)

- **Requests list rows are not clickable.** `BusinessRequestsView.tsx`'s
  request table has no click-through — no enquiry detail view exists anywhere
  in the app. Needs a dedicated enquiry record view before rows can link
  anywhere.
- **A direct job-creation path exists, bypassing the quote flow entirely** —
  jobs with `issued_quote_id IS NULL` (e.g. job_number 9/10) are not
  quote-driven (see CLAUDE.md's "Quote → job creation sequence":
  `createJobFromQuote` always sets `issued_quote_id`). The only matching path
  in the schema is the term-engagement call-out RPCs `create_callout_job` /
  `raise_callout` (`20260711130000_term_engagements_and_watchers.sql`) — but
  grepping `src/` turns up zero callers of either function. Whatever created
  jobs 9/10 did so outside the app (direct RPC call / SQL editor), not through
  a real user flow. When a UI is eventually built for this path, it will need
  the same site→asset picker as the enquiry form —  `create_callout_job`
  already accepts `p_site_id` but has no equivalent asset parameter yet.
- **Enquiry record view should display its linked asset** once that view
  exists — make the enquiry detail URL-addressable (its own route/deep-link,
  not just a modal).
- **Call-out jobs via `engagement_id` should carry `asset_id`** when a UI is
  built for `create_callout_job` / `raise_callout` — add the asset parameter
  alongside the site picker rather than bolting it on afterward.
- **Service visit completion should write `assets.last_serviced` and roll
  `assets.next_service_due`** forward by the schedule's frequency — currently
  pure UI display (`AssetDetail.tsx` reads these columns but nothing writes
  them on visit completion). The visit-completion handler is the correct place,
  not a general job-completion hook. **Verify against the shipped PPM
  auto-rolling visits before building — this may now be done.**

## Team member account self-service (from /field routing fix, 2026-08-09)

`/field` has no settings surface. Proposal: `/field/account` behind
`FieldGuard`, reusing the account fields from `HomeownerDashboard`'s
settings view (full name, password change) with `FieldHeader` chrome. Needs
an entry point from `FieldHeader`. No TS-P code — resolve employer TS-C via
`team_members.contractor_id`, same pattern as `useFieldTeamMember.ts`.
Sign-out shipped separately with the `/field` routing fix.


- Client/B2B visibility of RAMS and checklists: job_rams_select RLS
  already permits jobs.customer_id and is_company_member(); "Participants
  can view checklist items" permits customer_id on job_checklist_items.
  No client- or business-facing screen reads either table. FM clients
  typically require RAMS pre-start — likely needed before B2B validation.
- Field view cannot apply checklist templates: FieldChecklist.tsx supports
  one-off items only. Team members on site must have the contractor
  pre-apply the template.
- CLAUDE.md drift found in Step-0 audit: contractor_credentials RLS is
  narrower than documented (verified = true, not USING(true)); four
  undocumented columns incl. expires_at, which contradicts the documented
  "no expiry dates here" rule — confirm whether expires_at has any write
  path. WO- prefix documented in CLAUDE.md but absent from documentRefs.ts.


  ## Internationalisation — country_code and currency migration

Deferred until there is a named US or Canadian prospect AND a
confirmed answer from Stripe on cross-border connected accounts
under a UK platform account.

Full schema audit in I18N-AUDIT.md. Design already worked through:
- ISO 3166-1 alpha-2 ('GB', not 'UK'); ISO 4217 for currency
- Tier A (carries country_code): profiles, companies, jobs,
  enquiries, issued_quotes, invoices, payments
- Tier B (inherits via FK, no column): line items, attachments,
  status history, messages
- Tier C (country-scoped reference data): mileage rates, tax rates,
  trades taxonomy, compliance certificate types
- currency only on issued_quotes, invoices, payments, with a
  cross-column CHECK pinning currency to country
- Immutable via trigger on records (jobs, enquiries, issued_quotes,
  invoices, payments); mutable on people (profiles, companies)
- Transitional 'GB'/'GBP' defaults must be DROPPED in the same
  migration as first non-UK launch, so unstamped inserts fail loudly

Not urgent: money is stored as numeric decimal, which serves GBP,
USD and CAD without modification. Backfill cost scales with row
count, which is currently near zero.

## Date handling — 9 unsafe toLocaleDateString call sites

Zero timezone literals exist anywhere in the codebase. Invisible in
the UK because GMT == UTC. West of Greenwich, a date-only value
parsed as UTC midnight renders as the previous day — an off-by-one
on invoice due dates, quote expiry and job dates.

The ~90 files using date-fns "d MMM yyyy" tokens are SAFE: parseISO
returns local midnight, not UTC. The risk is confined to the 9
toLocaleDateString call sites called without a locale argument
(listed in I18N-AUDIT.md Section 6). Nine-line fix, not a sweep.

## Mileage — hmrc_mileage_rates is a tax regime, not a rate table

UK tax year runs 6 April to 5 April; US and Canada use calendar
years. HMRC is two-tier by mileage threshold; IRS is a single rate;
CRA is two-tier by kilometre threshold. mileage_trips.tax_year holds
a UK-shaped string ("2025-26") that becomes an integer in both other
countries. Redesign required before any non-UK mileage support —
this is not a currency-symbol problem.

## Currency and number formatting — single formatter module

~90 files contain a literal `£`; 20 contain the string "GBP".
Additionally, 6 call sites use `.toLocaleString()` on numeric values
with no locale argument (ContractManagement.tsx:384;
CRMManagement.tsx:119,171; crm/ClientDetail.tsx:78,147;
ui/chart.tsx:212). With no locale argument these follow the viewer's
browser locale — 1,234.56 in en-GB, 1 234,56 in fr-CA.

Fix is a single formatMoney(amount, currency) module that reads the
record's stored currency column (now present on issued_quotes,
invoices, payments) rather than assuming GBP. Note
`pdfBranding.ts` already has the only currency-parameterised code
path in the codebase, currently unused by any caller — wire it up
as part of this work.

## issued_quotes tax model is UK-VAT-shaped

`issued_quotes` stores a single quote-level `tax_rate` scalar with a
derived `tax_amount`. That is a UK VAT shape. US sales tax is
multi-jurisdiction with taxability differing between labour and
materials by state; Canada is GST/HST federal plus PST/QST
provincial. A single quote-level rate will not survive either.
Requires a tax-lines-per-line-item model, and realistically a vendor
(Stripe Tax, Avalara) rather than own logic. Blocks any non-UK
launch.

## Completion PDF — stray glyph under logo

The completion certificate PDF renders a stray "M" glyph directly
beneath the contractor logo. Observed on J-4AE203-0003. Cosmetic but
customer-facing.

## Stripe cross-border — ANSWERED (11 Aug 2026)

A single UK platform account CAN onboard US and Canadian connected
accounts under destination charges. No separate platform account
per country required. Confirms the single-codebase /
single-platform architecture.

Requirements:
- `on_behalf_of` must be set to the connected account ID on the
  PaymentIntent for cross-region charges. Drives local acquiring
  and regulatory compliance. Not currently set anywhere in
  create-payment-intent or accept-quote.
- 0.25% cross-border payout fee on transfers to US/CA connected
  accounts. Against a 5% platform fee this is ~5% relative margin
  loss on non-UK jobs. Argues for a US entity at volume, not now.
- Settlement: US accounts in USD, CA accounts in CAD (or USD with
  an eligible USD-denominated Canadian bank account).
- FX conversion fees (1-2%) apply where charge currency differs
  from the connected account's payout currency.

UNVERIFIED — confirm with Stripe support directly:
- Whether `on_behalf_of` genuinely transfers chargeback liability
  to the connected account, or whether the platform remains
  merchant of record and liable under destination charges. This
  determines who bears a disputed job and interacts with the
  existing `chargebacks` table.
- The exact cross-border payout fee figure.


## Directory search — geocoding coverage gap

The service-area feature is shipped but effectively inert. Two
compounding causes (LOCATION-AUDIT.md finding 2):
- 6 of 7 live contractor rows have no service_area_center_lat/lng,
  so they fall through to the ILIKE path.
- Place-name searches never reach the haversine path at all. Only a
  full postcode entered by the searcher triggers geometry.

Net effect: nearly every directory search still runs on substring
match, so the originating Bournemouth problem (a Southampton
contractor who would travel to Bournemouth being invisible to a
Bournemouth search) is still live. Needs: backfill geocoding for
existing contractors, and a place-name → coordinates path on the
search side.

## Two radius fields, only one canonical

working_radius is actively read in 9 files for display, but
service_area_radius_miles is canonical for search
(LOCATION-AUDIT.md finding 1). If they disagree, a contractor sees
a coverage number that does not match their actual directory reach.
Either collapse to one field or derive display from the canonical
one.

## /projects/:id queries the legacy projects table

Two parallel tendering location models coexist live: the current
tenders → tender_sites → sites system, and a legacy `projects`
table with structured city/postcode columns and 0 rows.
TenderDetail.tsx at the live /projects/:id route still queries the
legacy one (LOCATION-AUDIT.md finding 3). Verify in the browser
whether that route is broken.

## issued_quotes.client_address is a dead column

0 of 22 rows non-null; nothing in the current codebase writes it.
mint_job_from_quote's comment describes a SendQuoteDialog.tsx write
that no longer exists (LOCATION-AUDIT.md finding 4). Either wire it
up or drop the column and correct the RPC comment.

## sites has no country_code

sites was deliberately excluded from migration 20260811090000
pending the location design pass. A site's country cannot currently
be read off its own row, despite jobs and enquiries referencing it
(LOCATION-AUDIT.md finding 5). It is the most country-bound record
in the schema. Include in the structured location capture work.

## geocode-postcode is UK-only by construction

The edge function is postcodes.io-backed, which is UK-only and has
no US or Canadian equivalent behind the same interface. Any non-UK
geocoding needs either a per-country provider switch or a
multi-country service. Decision deferred until non-UK addresses
actually exist.