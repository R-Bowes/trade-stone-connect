
# B2B-TENDERING.md — TradeStone Tendering & Term Contract System

Full-scope design. One package. Standalone objects with seams for Projects
(nullable project_id) and contract management (term engagements).

---

## 1. FOUNDATION OBJECTS (gate everything below)

### 1.1 Business Sites Register
- `business_sites`: name, address, postcode, access notes, site contact,
  active flag. Owned by business account.
- Referenced by: tenders (site selection), term engagements (coverage),
  call-out jobs, SLA clocks, PPM schedules, reporting (spend by site).

### 1.2 Multi-User Business Accounts
- Roles: Owner, Ops Manager, Finance, Viewer.
- Approval thresholds: award/spend above £X requires Owner approval.
- Touches all B2B RLS policies — designed before tender RLS is written.

### 1.3 B2B Payment Rails
- Consolidated monthly invoicing per engagement (roll-up of call-out jobs).
- 30-day credit terms; statement generation; 3.5% platform fee applied
  at roll-up. Mechanism: Stripe Invoicing vs bank transfer reconciliation
  — DECISION OPEN.

---

## 2. TENDER OBJECT

### 2.1 Core
- Number: `T-{businessCode}-NNNN`, server-side atomic allocator
  (business_counters table, same pattern as contractor_counters).
- Types: **Works** (lump sum → awards into single job) and
  **Term** (rates card → awards into term engagement).
- Required minimum: title, trade(s), site(s), type, response deadline.
- Optional progressive sections: scope prose, documents, SLA rule set
  (reference existing shipped SLA Rules), budget envelope (show/hide),
  contract term + start date, site visit requirement (bookable slots on
  existing scheduling rails), TUPE flag + employee liability doc slot,
  social value criterion slot.
- `project_id` nullable — Projects seam.

### 2.2 Response Requirements (business ticks → generates contractor stepper)
- Pricing (lump sum | line items | rates card — forced by type),
  references (count), methodology, programme, subcontracting declaration,
  capacity/conflict declarations, RAMS commitment.

### 2.3 Prequalification Requirements
- Per-requirement, each marked **mandatory** or **preferred**.
- Taxonomy: insurance (type + minimum cover), accreditations
  (Gas Safe, WaterSafe, NICEIC, etc.), **DBS** (housing/vulnerable
  residents), certifications. Extendable.

### 2.4 Evaluation Criteria (published at tender)
- Weighted split, e.g. Price 60 / Quality 30 / Social value 10.
- Drives scoring matrix at review (§6.2).

### 2.5 Distribution
- **Invite-only** (contractor picker + incumbent suggestion) and
  **Open** (discoverable by matching trade/area).
- Formal invitation states: invited → viewed → declined (with reason)
  / drafting / submitted / withdrawn.

### 2.6 Bid visibility
- **Sealed until deadline** (default) or open-on-arrival (business choice).
- Sealed: business sees response count only; padlock UI with unseal
  timestamp.

### 2.7 Lifecycle
draft → published → clarification window → deadline → unseal →
shortlist → award → converted (job or engagement)
Plus: **amended** (addenda, §4), **extended**, **cancelled** (with
reason, all bidders notified), **lapsed** (zero-bid path: reissue
one-tap / extend / close).

### 2.8 Bid validity period
- Field on tender: rates/prices held N days post-deadline. Award after
  expiry requires bidder reconfirmation.

---

## 3. CONTRACTOR SIDE

### 3.1 Tender Pipeline View
- Surfaces: invited / drafting / submitted / won / lost / withdrawn.
- Deadline countdowns; reminder nudges ("closes 48h, draft 60%").
- Sits alongside existing Work view.

### 3.2 Prequal Match (RAG) — contractor-facing during window
- Per-requirement checklist, not single blob. Summary: "2 of 3 met."
- GREEN: met, evidence in date. AMBER: preferred-not-held, or
  held-but-expiring-mid-term, or unverified. RED: mandatory not met —
  **blocks submission**, with one-tap path to update prequal profile;
  banner recalculates live.
- Frozen into application snapshot at submission. Business sees
  snapshot + current-state delta at unseal. Never business-visible
  pre-unseal (sealed principle).

### 3.3 Application
- Number: `TA-{contractorCode}-NNNN` from contractor_counters.
- Stepper generated from §2.2 ticks. Structured pricing inputs only
  (rates card = table: call-out std/OOH, hourly, materials markup %,
  minimum charge). Free text only for methodology (with guidance note).
- Prequal docs auto-attach from profile. Completeness meter; submit
  disabled with plain-English reason until valid.
- Save-as-draft; withdraw before deadline; terms snapshot on submit.

### 3.4 Clarifications
- `tender_clarifications`: bidder question → business answer visible to
  all invitees, timestamped. Immutable once answered.

---

## 4. AMENDMENTS
- `tender_addenda`: versioned, all bidders notified, submitted bidders
  prompted to review/reconfirm or revise. Deadline extension optionally
  bundled. Applied addenda immutable.

---

## 5. AWARD & AGREEMENT

### 5.1 Review (business, post-unseal)
- Comparison view: rates aligned monospace columns, one bidder per
  column; prequal snapshot badges; expandable written sections.
- **Scoring matrix**: per-criterion scores × published weights →
  ranked result. Immutable audit trail (Procurement Act 2023-friendly).
- Shortlist → optional site visit (existing scheduling rails).

### 5.2 Award ceremony
- Full-screen agreement moment: tender terms snapshot + submitted
  rates/price + SLA rules + explicit assent. Not a toast.
- Losing bidders: decline notice + optional structured debrief +
  anonymised winning score band.

### 5.3 Conversion
- Works → job (existing J- pipeline).
- Term → **term engagement** (§7).

---

## 6. TERM ENGAGEMENT (contract management foundation)

- Locked rates card, term dates, covered sites, attached SLA rules,
  TUPE record if flagged.
- **Call-outs**: raised under engagement → spawn standard jobs
  (J- number, stepper, scheduling) priced from locked rates; SLA clock
  writes to sla_clock_events from raise.
- **PPM**: recurring scheduled jobs from compliance calendar (quarterly
  gas checks etc.) generated under engagement.
- **RAMS**: per-job attach slot.
- **Mid-term compliance monitoring**: expiry watch on contractor certs;
  escalating nudges; business-visible flag; auto-suspend new call-outs
  on lapse — DECISION OPEN on auto-suspend.
- **Rate indexation**: annual review mechanic (CPI uplift proposal →
  business assent → new rates version, old preserved).
- **Break clauses / early termination**: notice-based end-early path,
  reason recorded.
- **Out-of-hours dispatch**: SLA-critical call-outs escalate beyond
  in-app (SMS/phone) — DECISION OPEN on mechanism & fallback.
- Invoicing: monthly roll-up per engagement (§1.3).

---

## 7. EXPIRY RADAR & RETENDER
- Engagement fields: expiry_date, retender_notice_months (default 6,
  independent of term length; nudge clamped to fire no earlier than
  term midpoint).
- Business nudge at notice point → **"Retender from this engagement"**:
  clones tender (scope, sites, SLA, requirements) as new draft.
- Incumbent contractor gets parallel soft notification; flagged as
  incumbent in invite picker.
- **Off-platform contract logging**: businesses log existing external
  contracts (supplier, trade, sites, expiry) → radar covers them →
  retender prompt lands on-platform. Acquisition mechanic.

---

## 8. STRUCTURAL OPTIONS (designed-in, schema must not preclude)
- **Lots**: applications target lots; awards per-lot to different
  contractors. tender_lots table; lot_id nullable on applications.
- **Frameworks**: ranked multi-award (2–3 contractors); call-out
  cascade #1 → #2 on no-response. Also answers OOH fallback.
- **Two-stage** (EOI → shortlist → full tender).

---

## 9. REPORTING / MI
- Business surface over sla_clock_events + jobs + invoices:
  SLA performance by period, spend by site, jobs by trade, contractor
  performance per engagement. Exportable (board packs).

---

## 10. RLS BOUNDARIES (principles)
- Contractors: own applications only, ever. Tender visible if invited
  or (open AND trade/area match).
- Business: applications invisible until unseal (sealed mode);
  clarification answers visible to all invitees; scoring visible to
  business roles per §1.2 permissions.
- Two-step profiles lookup pattern mandatory throughout.
- All state transitions server-side; snapshots immutable; addenda,
  clarifications, scores, sla_clock_events append-only.

## OPEN DECISIONS
1. B2B payment mechanism (Stripe Invoicing vs reconciliation)
2. Auto-suspend call-outs on compliance lapse — hard or flag-only
3. OOH escalation mechanism and framework-cascade fallback