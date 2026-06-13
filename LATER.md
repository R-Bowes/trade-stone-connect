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

## Materials marketplace
- **Materials / equipment marketplace** — deferred. Different product surface
  (sellers, listings, own trust/payment flow), distracts from the core loop.
  The existing materials page is hidden/quiet for now; the "marketplace" that
  matters near-term is contractor discovery, not C2C materials.

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
- `notify_job_note_added` references a possibly non-existent `jobs.client_id`
  — flagged, uninvestigated.
- Job sign-off approval — `jobs.portfolio_approved` column unused; business
  Approvals view is quote-approvals only until job sign-off is scoped.
- Business tier SLA per-contractor pairing (matching `applies_to_trade` to a
  contractor's declared trade) — follow-on, currently a reference table only.

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