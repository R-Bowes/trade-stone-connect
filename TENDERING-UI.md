# TENDERING-UI.md — Surface build plan for the tendering engine

Companion to B2B-TENDERING.md (design) and TENDERING-SCHEMA.md (engine,
locked & built). This governs the **UI/surface** build on top of the proven
engine.

**The bar is fixed: production-ready for any FM buyer, top of the scale.**
Every slice is measured against "would a real FM procurement team — including
one under the Procurement Act 2023 — accept this." Not pilot-grade. Not
"good enough to demo." Procurement-grade.

**Build discipline (inherited from the engine build):**
- Vertical slices, not horizontal layers. One lifecycle path made genuinely
  production-grade end-to-end before the next.
- Design/mock agreed → Claude Code inspect-first → build → review diff →
  deploy → click-through with evidence → next slice.
- SQL/screenshot evidence before any slice is called done.
- This doc is living: update marks as slices land.

Legend: ✅ built (engine + UI) · ⚙️ engine only, no UI · ❌ missing · ⚠️ gap/decision

---

## Status summary (as of drafting)

- **Engine:** ~95% complete, proven end-to-end (two full lifecycles: works→job,
  term→engagement→call-out; sealed bid proven via impersonation; publish
  proven).
- **UI:** business creation + publish flow built (slices 1–3). Everything else
  is ⚙️ or ❌.
- **Automation:** three crons live (sla-clock, mark-overdue-invoices,
  tendering-runner); Vault-secured secrets.

---

## Cross-cutting production-grade requirements

These are acceptance criteria that apply to MANY stages — not a stage
themselves. A slice isn't production-grade until the relevant ones are met.

### X1. Audit & defensibility
FM buyers must PROVE a fair process. Public-money buyers (housing
associations under the Procurement Act 2023) legally must.
- Exportable audit trail per tender: who saw what, when; every status
  transition; every score with its rationale.
- Sealed-bid integrity provable (the engine enforces it; the UI must never
  leak it and ideally shows the seal state).
- Assessment summaries (formal mode) generatable and defensible — engine
  builds them; UI must surface + export.
- **Acceptance:** a losing bidder's query can be answered with an exported,
  timestamped, immutable record.

### X2. Notifications that leave the building
In-app badges are not enough for commercial commitments.
- Email via Resend for: invitation, clarification answered, addendum issued,
  deadline approaching, shortlisted, awarded/unsuccessful, standstill ending.
- Engine already writes `notifications` rows; this is the delivery layer.
- **Acceptance:** an invited contractor who never opens the app still learns
  they've been invited and when it closes.

### X3. Multi-user & permissions
"Any FM buyer" means teams, not a single login.
- `business_members` roles (Owner / Ops manager / Finance / Viewer) — the
  role column does NOT exist yet (found during engine build).
- Approval thresholds: award/publish above £X requires elevated role.
- RLS already scopes by membership; this adds role-gating on consequential
  actions.
- **Acceptance:** award-above-threshold requires director sign-off; a Viewer
  cannot publish.

### X4. Accessibility & responsiveness
- Keyboard-navigable, screen-reader-sane, works on the ops manager's phone.
- **Acceptance:** the whole bidder flow is completable on mobile.

---

## Stage 1 — Business creates & publishes the tender

**Mostly ✅ (slices 1–3 built and proven).**

- ✅ Tender dashboard (list, metric strip, 9-state row actions)
- ✅ Creation form: essentials, requirement ticks, prequal, documents, SLA
  select, distribution, invitations
- ✅ Publish (server-side `publish_tender`, preconditions, notifications)
- ⚠️ **SLA single-rule-vs-set** — tender attaches ONE `sla_rules` row (e.g.
  P1), but an FM SLA is the full P1–P4 set. Decision: does `sla_rule_set_id`
  become a grouping, or do rules gain a `set` concept above them?
  **Production-blocking** — an FM buyer's SLA is the tier set.
- ❌ **SLA creation UI** — businesses cannot author SLA rules in-app (seeded
  via SQL during build). **Production-blocking.**
- ❌ **Dynamic pricing table / schedule of rates** — "rates card" is a fixed
  5-field shape. Real works tenders need the business to define line items
  and columns; contractors price each row; bids compare line-by-line.
  New requirement kind (`pricing_schedule`), config jsonb holds the table
  definition. Business-side builder + contractor-side filler + comparison
  reads it. **Build before the comparison screen (Stage 4) — they're
  coupled.**
- ❌ **Document upload cap + friendly limit** — no client-side size cap;
  50MB/file, 1GB total on free plan. Cap client-side with a clear message;
  Pro plan before real onboarding (backups alone justify it).
- ⚠️ **TUPE / social value fields** (formal/term) — engine has the flags;
  form should surface them for term tenders.
- ⚠️ **Evaluation criteria UI** — engine stores weighted criteria; the
  creation form doesn't yet let the business define them (needed for
  scoring + formal-mode publishing).

---

## Stage 2 — Contractor discovers, opens & responds

**Entirely ⚙️/❌ — zero contractor UI exists. THIS IS THE CRITICAL PATH.**
The contractor invited to T-57B38C-0007 literally cannot see it.

- ❌ **Contractor tender pipeline** — inbox/list: invited / drafting /
  submitted / won / lost / declined, with deadline countdowns and reminders.
- ❌ **Tender detail ("the brief")** — scope as reading material, documents,
  SLA, deadline countdown, all the business set. Reads like a brief, not a
  form dump.
- ❌ **Prequal RAG banner** — per-requirement traffic light ("2 of 3 met"),
  the can-I-even-win-this signal, shown before any effort. Red (mandatory
  unmet) blocks; one-tap to update prequal profile. Highest respect-for-time
  signal on the platform.
- ❌ **Application stepper** — generated from the business's requirement ticks
  (the whole point: contractor faces a checklist someone else wrote, never a
  blank page). Structured pricing inputs (rates card / lump sum / the
  Stage-1 pricing schedule), references, methodology, etc.
- ❌ **Save-draft-and-return** on an application; completeness meter; submit
  disabled with plain-English reason until valid.
- ❌ **Submit** — wired to the RED-block engine (`submit_tender_application`,
  built & proven); no button yet.
- ❌ **Decline-to-bid** with optional reason.
- ⚠️ Prequal snapshot is server-stamped at submission (engine done); UI must
  show the contractor what will be snapshotted.

---

## Stage 3 — During the tender window (both sides)

**Procurement-grade REQUIRES these. Engine exists, no UI.**

- ⚙️ **Clarifications / Q&A** — bidder asks, business answers, answer visible
  to all invitees (fairness), asker anonymised to other bidders (data-layer
  enforced via the view already built). No UI either side. **Blocking.**
- ⚙️ **Addenda** — business issues a correction/extension mid-tender;
  versioned; all bidders notified; submitted bidders re-acknowledge or
  withdraw-and-resubmit. Engine + immutability built. No UI. **Blocking.**
- ❌ **Invitation status board (business)** — who's viewed / declined /
  drafting / submitted ("2 declined, 4 drafting, 1 submitted"). Engine
  tracks `viewed_at`/`declined`; no surface.
- ⚠️ **Site visits** — design specced bookable pre-bid visits on the existing
  scheduling rails; not built.
- ⚠️ **Deadline extension** — via addendum; needs UI.

---

## Stage 4 — Deadline, unseal, evaluation

**The business closes in on a decision. ⚙️ engine, ❌ UI.**

- ⚙️ **Unseal** transition built; the sealed→unsealed moment needs its UI
  (the "reveal" — padlock lifts, bids become readable).
- ❌ **Comparison screen ("the money screen")** — bids side by side, rates in
  aligned columns, prequal snapshot badges, written sections expandable.
  THE B2B sales demo moment. Reads the Stage-1 pricing schedule for
  line-by-line comparison → **build the pricing table first.**
- ⚙️ **Scoring matrix** — per-criterion, per-scorer, weighted; immutable
  post-award; engine built. No UI. Required for formal mode + defensibility.
- ❌ **Shortlisting** UI.
- ⚠️ **Zero/one-bid paths** — reissue / extend / proceed-with-one; engine
  supports, UI must offer.

---

## Stage 5 — Award, agreement, debrief

**⚙️ engine proven (award + accept + snapshot), ❌ UI.**

- ⚙️ **Award** — preconditions, atomic winner-flip, agreement creation;
  built. No UI.
- ⚙️ **Agreement ceremony** — full-screen terms snapshot + explicit assent,
  two-sided; the weight matches a commercial commitment. Engine done. No UI.
- ⚙️ **Standstill gate** (formal mode) — engine blocks acceptance until the
  period passes; UI must surface the countdown + the "why."
- ⚙️ **Debriefs / assessment summaries** — losing bidders get structured
  feedback (formal mode: per-criterion reasons + winner's scores, released
  simultaneously). Engine builds them. No UI — losers currently get silence.
  **Blocking for defensibility (X1).**
- ⚠️ **Bid-validity expiry** — award after validity lapses demands
  reconfirmation; engine gate exists; UI must handle it.

---

## Stage 6 — Post-award (term contracts): contract management

**The entire contract-management surface. ⚙️ engine (all built & proven), ❌ UI.**

- ⚙️ **Term engagement view** — rates, sites, SLA, term dates, status.
- ⚙️ **Raise a call-out** — spawns a normal J-job priced from the effective
  rates version; engine built (`raise_callout`). No UI.
- ⚙️ **Rate versions** — propose/accept (two-party), indexation; engine built.
  No UI.
- ⚙️ **PPM schedules** — recurring compliance jobs; engine built. No UI.
- ⚙️ **Compliance watcher** — auto-suspend on lapse (with toggle); running.
  Needs a business-facing status surface.
- ⚙️ **Expiry radar + retender** — nudges, one-tap clone; engine + cron built.
  No UI.
- ⚙️ **Off-platform contract logging** — the acquisition mechanic; engine
  built. No UI.
- ❌ **Monthly roll-up invoicing** — DEFERRED in engine (depends on B2B
  payment rails decision: Stripe Invoicing vs reconciliation). Still open.

---

## Sequencing (critical path first)

Each is a vertical slice, built to the production bar, proven before the next.

1. **Contractor tender experience (Stage 2)** — non-negotiable, biggest gap,
   nothing downstream matters without it. Sets the quality bar. Includes:
   pipeline → detail/brief → prequal RAG → application stepper → save/submit →
   decline. Makes T-0007 actually *do* something.
2. **Clarifications + addenda UI (Stage 3)** + invitation status board —
   procurement-grade requires them; both sides.
3. **Dynamic pricing table (Stage 1 builder + Stage 2 filler)** — before
   comparison, because comparison consumes it.
4. **Unseal + comparison + scoring (Stage 4)** — the money screen; reads the
   pricing table.
5. **Award + agreement + debrief UI (Stage 5)** — close the loop, incl.
   standstill surfacing + assessment summaries (X1).
6. **SLA set model + SLA creation UI (Stage 1 gaps)** — before real SLAs
   matter at award; can slot earlier if a pilot needs it.
7. **Contract-management UI (Stage 6)** — largest, last; the post-award world.
8. **Cross-cutting hardening (X1–X4)** — audit export, email delivery,
   roles/permissions, a11y — woven through, not bolted on. Some (email,
   roles) may need to jump earlier if a specific slice depends on them.

### Cross-cutting items that may need to jump the queue
- **X2 email** — likely needed as soon as Stage 2 ships (an invited
  contractor should get an email, not just an in-app row).
- **X3 roles** — needed before award-with-approval is meaningful (Stage 5),
  but the `business_members` role column could be added anytime.

---

## Open decisions (carried, must resolve before their stage)

1. SLA single-rule vs set model (Stage 1 / blocks award snapshot fidelity).
2. B2B payment rails: Stripe Invoicing vs reconciliation (Stage 6 invoicing).
3. Pricing-schedule table: cell types supported (text/number/currency/
   dropdown?), and whether it's works-only or also term add-ons.
4. Email escalation for time-critical events — in-app + email, or SMS too
   for emergencies (ties to the OOH dispatch question from the engine build).
5. Roles taxonomy + threshold model (X3).
6. Two-envelope evaluation: does the pricing section seal separately from
   quality, and is the two-phase unseal worth the engine change? (Decide
   at Stage 4.)
7. ESG criterion type: a distinct weightable category, or handled via the
   existing generic criteria + a convention? (Decide at Stage 1 criteria
   UI.)

---

## Notes carried from the engine build (still live)

- `business_members` has no `role` column (divergence found during build).
- `sla_rules` is per-priority (P1–P4), no `set` grouping.
- Contractor clarifications MUST read `tender_clarifications_for_contractor`
  (the view), never the base table (silent-empty otherwise).
- `job_message_notifications` etc. dormant tables — adopt or drop when their
  features are designed.
- sla-clock / mark-overdue are unauthenticated edge functions
  (`verify_jwt=false`) — add shared-secret header if they ever do anything
  outsider-abusable.

---

## Global procurement standards: considered scope

Researched against World Bank / UNCITRAL Model Law / EU directives /
ISO 20400 and 2026 e-procurement practice. The engine already implements
most of the international reference framework by design (sealed bids,
prequalification, published weighted criteria, immutable audit trail,
standstill, assessment summaries). The following are deliberate ADDITIONS
to reach full procurement-grade for a global FM buyer — folded in at the
stage each belongs to, not built speculatively.

### G1. Tender types beyond works/term — add RFI
Global standard distinguishes RFI (market intelligence, no award, no
pricing), RFQ (price for scoped items), RFP (solution approach). We have
works + term. Add **RFI** as a lightweight type: structured questions, no
pricing section, no award — a business gathers market intelligence before
committing to a full tender. Cheap given the engine (a tender with no
pricing kind and a terminal "close, no award" path). Two-stage (EOI →
shortlist → full) already deferred in engine notes — keep deferred.
**Belongs to: Stage 1 (creation) — a type toggle + suppressed sections.**

### G2. Two-envelope (technical-then-commercial) evaluation
World Bank / multilateral / much public-sector standard: technical and
commercial proposals sealed SEPARATELY. Evaluators score the technical
response WITHOUT seeing price (removes price bias from quality scoring);
bids below the technical qualifying score are eliminated before price is
opened. This is an EXTENSION of the existing seal, not a rebuild — a
`price_sealed_separately` flag on the tender, a two-phase unseal (quality
first, then price for qualifying bids only), and the comparison screen
respects the phase. A genuine procurement-integrity feature.
**Belongs to: Stage 4 (unseal/comparison/scoring). Engine addition:
separate seal/unseal for the pricing section vs the rest.**

### G3. ESG / social value as a weightable criterion type
ISO 20400 + 2026 practice: ESG/social value is now a business imperative,
and housing-association buyers increasingly MUST score it. Engine has
evaluation criteria + a social-value slot; production-grade makes ESG/
social-value a proper, weightable criterion TYPE (not a free-text field),
so it scores and weights like price/quality in the matrix.
**Belongs to: Stage 1 (criteria definition) + Stage 4 (scoring). Engine
addition: a criterion `type`/category so ESG is first-class.**

### G4. Exportable audit pack
The anti-corruption core of e-procurement: an auditable record removing
subjectivity and increasing accountability. The engine already produces
the immutable record (snapshots, append-only scores, transition log). Make
it a ONE-CLICK exportable pack per tender: timeline (who saw what, when),
every status transition, scores with rationale, the assessment summaries,
sealed-bid integrity proof. Turns a byproduct into a headline feature and
satisfies X1 concretely.
**Belongs to: Stage 5 (post-award) + available anytime post-unseal.
Standalone — mostly a read + format of data that already exists.**

---

## Explicitly OUT of scope (deliberate boundary)

Named so the boundary is a decision, not an accident. TradeStone's wedge is
marketplace + contractor OS + FM-grade procurement — not enterprise
source-to-pay.

- **e-reverse auctions** (live price-dropping bidding wars) — races quality
  to the bottom, wrong for FM relationships, large build. No.
- **Full source-to-pay / spend analytics / agentic AI bid-scoring**
  (Zycus/Simfoni territory) — a different product.
- **Deep ERP / e-ordering / e-invoicing integrations** — enterprise
  plumbing, not the first buyers' need.
- **Two-stage tendering (EOI → full)** — deferred, not rejected; revisit
  after core flow if a buyer needs it.