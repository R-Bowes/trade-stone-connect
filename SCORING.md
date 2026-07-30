# SCORING.md — TradeStone Contractor Scoring & Verification Spec

> **Governing rule:** This document is a design spec. All SQL schema blocks are marked `DO NOT RUN` and are reference only. Run a Step-0 schema report against the live database before building any item. Nothing in this document touches the codebase until the core job flow is clean, end-to-end validated with a real user, and the first B2B onboarding milestone is closed.

---

## 1. Overview

TradeStone uses a **three-score system** instead of a single rating:

| Score | What it measures | Who/what assesses it | Primary data source |
|-------|-----------------|---------------------|-------------------|
| **Craft** | Quality of workmanship | TradeStone (system + third-party signals) | Inspections, callbacks, peer endorsement, rework rates |
| **Service** | Communication, reliability, professionalism | Client (validated by system signals) | Post-job review + system-derived behavioural data |
| **Value** | Pricing transparency and consistency | System (with one client input) | Quote-to-invoice variance, dispute rates, scope change documentation |

### Design principles

- **Each score is assessed by sources qualified to judge that dimension.** Homeowners never rate craft. The system never rates communication warmth. Everyone scores what they're equipped to score.
- **The only way to improve is to do better work, communicate better, or price more honestly.** No signal can be gamed without actually improving the underlying behaviour.
- **Transparency is the competitive advantage.** Every signal is visible to the contractor. The methodology is explained to clients. The architecture survives being looked at in daylight because the signals were chosen to be honest even when fully visible.
- **Price and speed never affect any score.** A premium contractor charging above market rate is not penalised. A contractor who takes longer because they do thorough work is not penalised.

---

## 2. Verification Tiers (Compliance Gate)

Verification and scoring are separate systems that interact. Verification is a one-time (but renewable) journey. Scores are a living signal.

Verification tiers are **not** scores — they are pass/fail gates that determine what a contractor can access on the platform. They are volume-independent and can be live from day one.

### Tier 1 — Claimed

- Just signed up
- Self-declared trade, self-declared certifications
- Can build a profile, **cannot take jobs**
- Score displays "Building" — Bayesian confidence too low to mean anything
- No badge shown on public profile

### Tier 2 — Identity Confirmed

- ID verified (passport / driving licence) — achieved via Stripe Connect KYC
- Phone number confirmed
- Companies House match if trading as a limited company
- Can start taking **low-value homeowner jobs**
- Score begins accumulating but marked as **provisional**
- Basic "Identity Verified" indicator on profile

### Tier 3 — Compliance Verified

- Public liability insurance certificate uploaded and **cross-checked against insurer** (not just self-declared)
- Trade certifications checked against the **live register** — Gas Safe, NICEIC, NAPIT, FGAS etc. — not a photo of a card
- DBS check where relevant (working in occupied homes, vulnerable adults, schools)
- TradeStone does the checking; the contractor does not self-certify
- Unlocks **mid-to-high value homeowner work**
- "Compliance Verified" badge on profile
- This tier proves they are **legal to operate**

### Tier 4 — Credential Verified

- Qualifications confirmed against the **awarding body** — NVQ level, City & Guilds, manufacturer accreditations (Worcester Bosch, Vaillant, Velux etc.)
- Unlocks **B2B and FM panel eligibility**
- "Credential Verified" badge on profile
- This tier proves they have **invested in getting good at the craft**

### Staying verified — currency, not a one-time stamp

- Insurance expiry tracked. Contractor warned at 30 days, 14 days, 7 days before expiry. If insurance lapses, verification drops back to Tier 2 and job-taking is suspended until renewed.
- Trade register checks re-run periodically (quarterly). If a contractor is removed from Gas Safe, their verification drops immediately.
- Companies House status checked periodically. Dissolved company = immediate flag.
- DBS rechecked at renewal intervals.

### Compliance Gate (Layer 1)

Before any score is displayed, the contractor must pass **all** of:

- [ ] Valid public liability insurance on file (not expired)
- [ ] Identity verified (Tier 2+)
- [ ] At least one verified trade qualification
- [ ] No active suspensions

If any gate condition fails, scores are hidden and replaced with the appropriate verification tier status. The contractor sees exactly which condition is failing and what to do about it.

---

## 3. Craft Score

**What it measures:** The quality of the work itself — was it done properly, did it last, would a professional peer consider it good work?

**Who assesses it:** TradeStone, via system-derived and third-party signals. **The homeowner never rates craft quality directly.**

**Why:** A homeowner who chose the wrong worktop colour for their kitchen will leave a bad review for objectively flawless work. A homeowner thrilled with their new bathroom won't notice the silicone that'll yellow in six months. The client's emotional state is not a reliable indicator of workmanship.

### 3.1 Input signals

#### Inspection pass rate (highest weight, when available)

- **Source:** Third-party (building control, Part P certification bodies)
- **What:** Did notifiable work pass inspection on first submission?
- **Gameability:** Effectively zero — the contractor cannot influence the inspector
- **Availability:** Only fires on notifiable work (Part P electrical, structural alterations, gas work). Absent (not zero) for non-notifiable jobs.
- **Weight:** Highest individual signal weight when present. This is the single most objective craft signal available — a qualified professional saying "this work is safe and compliant."
- **Capture method:** Contractor uploads certificate/sign-off document. Platform verifies against issuing body where possible. Binary: passed first time / required remediation / failed.

#### 90-day no-callback window (high weight)

- **Source:** System-derived (time-gated, passive)
- **What:** Did the work hold up for 90 days without a client-initiated callback for a fault?
- **Gameability:** Effectively zero — the contractor cannot manufacture the passage of time without a complaint
- **Availability:** Every completed job starts a 90-day clock automatically
- **Weight:** High. This is deferred positive signal that rewards doing the job properly the first time.
- **Mechanics:**
  - Job marked complete → 90-day timer starts
  - If no callback raised in window → positive signal recorded
  - If callback raised → nature assessed:
    - **Original work at fault** → negative signal (strong)
    - **New unrelated issue** → not counted against contractor
    - **Normal wear / client misuse** → not counted against contractor
  - The distinction between fault types is critical and may require admin assessment in disputed cases

#### Rework rate (high weight)

- **Source:** System-derived
- **What:** When callbacks happen, how often is the original work at fault versus an unrelated issue?
- **Gameability:** Low — requires actual callbacks to exist
- **Availability:** Accumulates over time as callbacks occur (or don't)
- **Weight:** High. Distinguishes between "the work failed" and "the client has a new problem"

#### Warranty honour rate (medium-high weight)

- **Source:** System-derived
- **What:** When a callback is raised and the original work is at fault, does the contractor return and fix it without additional charge?
- **Gameability:** Low — requires the contractor to actually return and resolve
- **Availability:** Only fires when callbacks exist and fault is established
- **Weight:** Medium-high. Measures integrity and confidence in own work.
- **Signals:**
  - Contractor responds to callback → positive
  - Contractor returns and resolves → positive
  - No additional invoice raised for warranty work → positive
  - Contractor ghosts callback → strong negative
  - Contractor charges for fixing own faulty work → strong negative

#### Peer endorsement (medium weight, capped)

- **Source:** Other verified contractors on the platform
- **What:** Professional peers vouching for the quality of this contractor's work
- **Gameability:** Very low at scale — requires multiple verified tradespeople to collude
- **Availability:** Rare early on, grows with platform tenure and cross-trade collaboration
- **Weight:** Medium. Each verified endorsement adds a fixed positive increment, **capped** (e.g., max 5 endorsements count — 10 is not meaningfully different from 5).
- **Weighting modifier:** The endorser's own Craft score weights the endorsement. An endorsement from a high-Craft contractor carries more weight than one from a low-Craft contractor.
- **Why this matters:** A plumber saying "this electrician is solid, I've worked alongside them on three kitchens" is a signal no amount of client reviews can replicate — the plumber actually understands the quality of the electrical work.

#### Photo documentation completeness (low-medium weight)

- **Source:** System-derived
- **What:** Did the contractor photograph key stages of the work? (Before, during, after as applicable)
- **Gameability:** Medium — a contractor could take photos of poor work, but the correlation between documenting work and doing it properly holds over large numbers
- **Availability:** Every job where photos are uploaded
- **Weight:** Low-medium. Process discipline signal, not a direct craft indicator. Measures whether the evidence trail exists.

#### Complexity adjustment (modifier, not a signal)

- **Source:** System-derived from job metadata
- **What:** Normalises signals by job difficulty so that contractors who take on hard, multi-trade, diagnostic work are not penalised relative to those who only take simple like-for-like swaps.
- **Mechanics:** Job complexity classification derived from:
  - Job category / trade type
  - Job value
  - Duration
  - Number of trades involved
  - Whether diagnostic work was required
- Higher complexity jobs carry more weight in the score — a clean completion on a difficult job is worth more than a clean completion on a simple one.

### 3.2 Calculation mechanics

**Bayesian prior:** Every new contractor starts at the **trade average for their area** — not at zero, not at maximum. This is the starting assumption: "we don't know yet, so we assume average until proven otherwise."

**Evidence accumulation:** As jobs complete and signals arrive, each piece of evidence pulls the score away from the trade average — upward if the work is good, downward if it isn't.

- With 3 completed jobs: the trade average still dominates the score
- With 30 completed jobs: the contractor's own record dominates and the trade average barely matters

**Signal normalisation:** Each signal is normalised to a common 0–10 scale before combination:

- Inspection pass rate: percentage → 0–10 scale
- Callback rate: inverse percentage → 0–10 scale (lower callbacks = higher score)
- Peer endorsements: count (capped) → 0–10 scale with diminishing returns
- Warranty honour: percentage of warranty callbacks honoured → 0–10 scale

**Recency decay:** Recent evidence counts more than old evidence. Half-life of **9–12 months** — a signal from a year ago carries approximately half the weight of the same signal from last month.

- A contractor who is genuinely improving sees their Craft score rise without waiting for the lifetime average to catch up
- A contractor who is declining sees it fall before a full year of decline drags the average down

**Confidence indicator:** The score carries an internal confidence level based on evidence volume. At low confidence, the score is marked "Building" or "Provisional" rather than displayed as a definitive number.

**Absent vs zero:** Signals that haven't fired yet (e.g., no notifiable work done, so no inspection data) are **absent**, not zero. They don't penalise the score — they just don't contribute. The confidence level reflects that less evidence is available.

---

## 4. Service Score

**What it measures:** Communication, reliability, professionalism, respect for the client's property and time.

**Who assesses it:** The client, via structured post-job review — **validated and supplemented by system-derived signals.**

**Why the client is qualified:** These are things the homeowner experiences directly and can assess accurately regardless of whether they know what good plumbing looks like. Did they show up? Did they communicate? Did they leave the place in a state?

### 4.1 Client review structure

The post-job review asks **four specific questions** — not one overall rating:

1. **Communication** — How was their communication throughout the job? Did they keep you informed, respond to questions, explain what they were doing?
2. **Reliability** — Did they show up when agreed, stick to the timeline, let you know if anything changed?
3. **Respect for property** — Did they protect floors, clean up, leave the space in a reasonable state?
4. **Expectation management** — When something changed or an issue arose, did they explain it clearly before acting?

**Scale:** Three-point per question:
- Below expectations
- Met expectations
- Exceeded expectations

Three points rather than five because granularity on subjective questions creates false precision. "Met expectations" is the baseline — most contractors should sit here. "Exceeded" is genuinely noteworthy. "Below" is a problem.

### 4.2 System-derived validation signals

These confirm or challenge the client ratings and catch blind spots (e.g., survivorship bias from clients who were dropped and never got to review).

#### Message response time (validation signal)

- **What:** Median time to **substantive** reply (not first message — an auto-acknowledgement doesn't count)
- **Why median:** One slow reply during a bank holiday weekend shouldn't tank the metric
- **Role:** Validates or challenges the client's communication rating. If every client says communication is excellent but median response time is 3 days, something is off.

#### Job completion rate (independent signal)

- **What:** Percentage of accepted jobs that reach "completed" status
- **Gameability:** Low — requires actually completing work
- **Role:** Low completion rate is a reliability signal regardless of what individual clients say

#### Cancellation rate (independent signal)

- **What:** How often does this contractor cancel after accepting a job?
- **Role:** High cancellation rate is a service failure that individual reviews might not capture — the cancelled clients never got to leave a review (survivorship bias)

#### Calendar accuracy (independent signal)

- **What:** Does their stated availability match their actual response patterns?
- **Role:** A contractor who lists themselves as available but doesn't respond to enquiries during those windows is creating a misleading impression

### 4.3 Calculation mechanics

**Blend:** Client ratings are the **primary** input. System signals are a **validation layer** that catches blind spots and adjusts when client ratings conflict with observable behaviour.

- If client ratings and system signals align → score reflects both
- If client ratings are high but system signals flag issues (e.g., high cancellation rate, slow response times) → score is moderated downward
- If client ratings are low but system signals are strong → score holds closer to system signals (possible client with unreasonable expectations)

**Bayesian prior:** New contractors start at the trade average for Service. Score becomes their own as reviews accumulate.

**Recency decay:** Same 9–12 month half-life as Craft. Recent service performance matters more than historical.

**Confidence:** Marked as "Building" until sufficient reviews exist (minimum threshold TBD based on platform volume — likely 5+ reviews).

---

## 5. Value Score

**What it measures:** Pricing transparency, consistency, and whether the financial relationship was fair and clearly communicated.

**Who assesses it:** Primarily the system (arithmetic). One narrow client input.

**What it does NOT measure:** Whether the contractor was cheap or expensive. A premium contractor charging above market rate is not penalised. Value measures whether the price was **transparent and consistent with what was agreed**, not whether it was low.

### 5.1 Input signals

#### Quote-to-invoice variance (highest weight)

- **Source:** System-derived (arithmetic comparison)
- **What:** Percentage difference between the agreed quote total and the final invoice total
- **Gameability:** Zero — the numbers are what they are
- **Mechanics:**
  - Tracked per job, aggregated over time
  - Contractor consistently invoicing within 5% of quote → strong positive signal
  - Contractor regularly invoicing 20–30% above quote → negative signal (either underquoting to win work or failing to scope properly)
  - **Critical distinction:** Documented scope changes (extras communicated to client and agreed before work done) are **legitimate** and excluded from variance calculation. Undocumented extras that appear on the final invoice without prior agreement **are** counted as variance.
  - The platform captures this through the existing job workflow: quotes have line items, change requests can be documented, final invoices have line items. The comparison is mechanical.

#### Invoice dispute rate (medium weight)

- **Source:** System-derived
- **What:** How often do clients query or dispute an invoice from this contractor?
- **Gameability:** Low
- **Role:** Frequent disputes suggest pricing friction regardless of whether each individual dispute is resolved in the contractor's favour

#### Payment speed (contextual signal, low weight)

- **Source:** System-derived
- **What:** How quickly are invoices paid without chasing?
- **Role:** Not a direct score input but a contextual signal. Invoices paid quickly without reminders suggest the client felt the price was fair. Invoices requiring multiple chasers may indicate disagreement about value even without a formal dispute.
- **Weight:** Low — many factors affect payment speed that are unrelated to the contractor

#### Client transparency question (single input, medium weight)

- **Source:** Client (post-job review)
- **What:** "Were all costs communicated clearly before work began?" — **Yes / No**
- **Why binary:** The client either felt informed about the cost or they didn't. A rating scale on this question creates false precision.
- **Role:** Captures the transparency experience that arithmetic can't — did the contractor explain costs clearly, or did the client feel blindsided?

### 5.2 Calculation mechanics

Value is the **simplest** of the three to calculate because it's mostly maths.

- Quote total vs invoice total (excluding documented agreed changes)
- Dispute count as a proportion of total invoices
- Binary transparency input from client

**Bayesian prior:** Same approach — new contractors start at trade average, score becomes their own as evidence accumulates.

**Recency decay:** Same 9–12 month half-life. A contractor who used to underquote but has improved their scoping is not permanently punished.

---

## 6. Display Architecture

All three scores are continuous values internally: **0 to 10, one decimal place.**

### 6.1 Contractor view (full transparency)

The contractor sees:

- All three scores with trend lines (improving / stable / declining)
- Full breakdown of every signal feeding each score, with current status
- Specific, actionable guidance: "Your Craft score is 8.2 — here's what's contributing. Your Service score dropped 0.3 this month — message response times have slipped from 2h median to 8h."
- Confidence level for each score
- Trade average comparison (where they sit relative to their trade and area)

This is coaching, not just scoring. The contractor can see exactly what good work looks like in TradeStone's eyes, and none of it can be shortcut.

### 6.2 Homeowner view (simplified trust)

The homeowner sees:

- Three scores presented as a **visual indicator** (filled bars, shield icons, or similar) — not raw numbers
- Plain-English explanation of what each score measures:
  - **Craft** — "Measures the quality of their work based on inspections, callbacks, and professional peer review — not customer opinions."
  - **Service** — "Measures communication, reliability, and professionalism — based on reviews from people like you."
  - **Value** — "Measures pricing transparency and whether the final cost matched what was agreed."
- Enough to trust the scores, not so much that it overwhelms
- "Building" state for new contractors with insufficient data, rather than no score at all

### 6.3 FM / B2B buyer view (full scorecard)

The FM buyer sees:

- All three scores as raw numbers with one decimal place
- Every signal, with individual values and trend lines
- Confidence levels
- Historical trend over time (6-month / 12-month view)
- Additional **operational signals** relevant to B2B only (not a fourth score — a supplementary view):
  - SLA adherence rates (P1/P2/P3/P4 response and resolution)
  - Documentation compliance (completion reports, certificates, RAMS)
  - Panel reliability (attendance, availability consistency)
  - Capacity consistency (can they sustain volume across the panel?)

### 6.4 Search ranking (internal composite, never displayed)

For search result ordering, an internal composite is calculated from the three scores but **never shown** to any audience. The weighting of the composite varies by context:

- **Homeowner search:** Service and Value weighted higher (they want someone reliable who won't overcharge)
- **FM panel view:** Craft and Service weighted higher (rates already negotiated, Value less relevant)
- **Emergency / reactive work:** Service weighted highest (response time and reliability matter most)

The three visible scores are what the user sees. The composite only determines sort order.

---

## 7. Anomaly Detection (Hidden Layer)

This is the **one part** that is not transparent to contractors. Showing how manipulation is detected helps people circumvent it.

### Patterns to detect and suppress:

- **Review bursts:** Sudden cluster of 5-star reviews from new or low-activity accounts
- **Timing anomalies:** Reviews submitted suspiciously quickly after job completion (before work quality could reasonably be assessed)
- **Acceptance-completion mismatch:** High acceptance rate but low completion rate (accepting jobs then ghosting or cancelling)
- **Review solicitation patterns:** Multiple reviews from accounts that only ever review one contractor
- **Cross-referencing:** IP address, device, or account creation patterns suggesting manufactured reviews

### Response:

- Flagged inputs are **suppressed** (not counted) rather than deleted
- Contractor is not notified that specific reviews were flagged (to avoid teaching the detection boundary)
- Repeated patterns escalate to admin review
- Severe or persistent manipulation → account suspension

---

## 8. Score Lifecycle

### New contractor (0 jobs)

- Verification tier progress is the only visible trust signal
- All three scores show "Building"
- Bayesian prior = trade average (invisible, used only for initial ranking)

### Early stage (1–5 jobs)

- Scores marked as "Provisional"
- Trade average still dominates (low evidence = low confidence)
- Each new job moves the score noticeably

### Established (6–20 jobs)

- Scores displayed as definitive (confidence threshold met)
- Contractor's own record starts to dominate over trade average
- Trend lines become meaningful

### Mature (20+ jobs)

- Score is stable and representative
- New evidence still moves the score but more gradually
- Recency decay means the score stays current rather than anchored to early performance
- Anomaly detection has enough baseline data to spot irregularities

---

## 9. Score Independence

The three scores are **fully independent**. A contractor can have:

- High Craft, low Service (brilliant work, terrible communicator)
- High Service, low Craft (lovely person, mediocre workmanship)
- High Craft, high Service, low Value (great work, great communication, but invoices always exceed quotes)
- Any other combination

This independence is a feature. It gives homeowners genuinely useful information for their specific priorities, and it gives contractors specific, actionable areas to improve rather than a single opaque number.

---

## 10. Schema Outline

> **`DO NOT RUN`** — Reference only. Run Step-0 schema report against live DB before building.

```sql
-- DO NOT RUN

-- Verification tier tracking
CREATE TABLE contractor_verification (
  contractor_id UUID PRIMARY KEY REFERENCES profiles(id),
  current_tier INTEGER NOT NULL DEFAULT 1 CHECK (current_tier BETWEEN 1 AND 4),
  tier_2_achieved_at TIMESTAMPTZ,
  tier_3_achieved_at TIMESTAMPTZ,
  tier_4_achieved_at TIMESTAMPTZ,
  insurance_expires_at DATE,
  insurance_verified BOOLEAN DEFAULT FALSE,
  dbs_expires_at DATE,
  dbs_verified BOOLEAN DEFAULT FALSE,
  companies_house_status TEXT, -- 'active', 'dissolved', etc.
  companies_house_checked_at TIMESTAMPTZ,
  last_register_check_at TIMESTAMPTZ,
  suspended BOOLEAN DEFAULT FALSE,
  suspended_reason TEXT,
  suspended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Register check results (Gas Safe, NICEIC, NAPIT, FGAS etc.)
CREATE TABLE contractor_register_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id UUID NOT NULL REFERENCES profiles(id),
  register_name TEXT NOT NULL, -- 'gas_safe', 'niceic', 'napit', 'fgas'
  registration_number TEXT,
  status TEXT NOT NULL, -- 'verified', 'not_found', 'expired', 'revoked'
  checked_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at DATE,
  raw_response JSONB -- store API response for audit
);

-- Credential verifications (awarding body checks)
CREATE TABLE contractor_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id UUID NOT NULL REFERENCES profiles(id),
  credential_type TEXT NOT NULL, -- 'nvq', 'city_guilds', 'manufacturer_accreditation'
  credential_name TEXT NOT NULL,
  awarding_body TEXT NOT NULL,
  registration_number TEXT,
  verified BOOLEAN DEFAULT FALSE,
  verified_at TIMESTAMPTZ,
  expires_at DATE,
  document_path TEXT, -- storage bucket reference
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Craft score signals
CREATE TABLE craft_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id UUID NOT NULL REFERENCES profiles(id),
  job_id UUID NOT NULL REFERENCES jobs(id),
  signal_type TEXT NOT NULL, -- 'inspection_pass', 'inspection_remediation', 'inspection_fail',
                             -- 'callback_clear_90d', 'callback_fault', 'callback_unrelated',
                             -- 'warranty_honoured', 'warranty_ghosted', 'warranty_charged',
                             -- 'photo_documentation'
  signal_value NUMERIC NOT NULL, -- normalised 0-10
  raw_data JSONB, -- original data before normalisation
  job_complexity NUMERIC, -- complexity multiplier
  recorded_at TIMESTAMPTZ DEFAULT NOW(),
  decay_anchor TIMESTAMPTZ DEFAULT NOW() -- for recency weighting
);

-- Peer endorsements
CREATE TABLE peer_endorsements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endorser_id UUID NOT NULL REFERENCES profiles(id),
  endorsed_id UUID NOT NULL REFERENCES profiles(id),
  endorsement_text TEXT,
  endorser_craft_score_at_time NUMERIC, -- snapshot for weighting
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(endorser_id, endorsed_id) -- one endorsement per pair
);

-- Service score: post-job review (client-submitted)
CREATE TABLE service_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) UNIQUE, -- one review per job
  contractor_id UUID NOT NULL REFERENCES profiles(id),
  reviewer_id UUID NOT NULL REFERENCES profiles(id),
  communication SMALLINT NOT NULL CHECK (communication BETWEEN 1 AND 3),
  reliability SMALLINT NOT NULL CHECK (reliability BETWEEN 1 AND 3),
  property_respect SMALLINT NOT NULL CHECK (property_respect BETWEEN 1 AND 3),
  expectation_management SMALLINT NOT NULL CHECK (expectation_management BETWEEN 1 AND 3),
  costs_communicated_clearly BOOLEAN, -- Value score input (yes/no)
  free_text TEXT, -- optional comment
  suppressed BOOLEAN DEFAULT FALSE, -- anomaly detection flag
  suppressed_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Callback tracking (feeds Craft score)
CREATE TABLE job_callbacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_job_id UUID NOT NULL REFERENCES jobs(id),
  callback_job_id UUID REFERENCES jobs(id), -- if a new job is created for the fix
  contractor_id UUID NOT NULL REFERENCES profiles(id),
  raised_by UUID NOT NULL REFERENCES profiles(id), -- client who raised it
  raised_at TIMESTAMPTZ DEFAULT NOW(),
  fault_classification TEXT, -- 'original_fault', 'unrelated', 'wear_and_tear', 'client_misuse', 'pending_assessment'
  classified_by TEXT, -- 'system', 'admin', 'contractor_accepted'
  classified_at TIMESTAMPTZ,
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  additional_charge BOOLEAN, -- did contractor charge for the callback?
  notes TEXT
);

-- 90-day timer tracking
CREATE TABLE craft_timer_windows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) UNIQUE,
  contractor_id UUID NOT NULL REFERENCES profiles(id),
  window_start TIMESTAMPTZ NOT NULL, -- job completion timestamp
  window_end TIMESTAMPTZ NOT NULL, -- window_start + 90 days
  outcome TEXT DEFAULT 'pending', -- 'pending', 'clear', 'callback_raised'
  callback_id UUID REFERENCES job_callbacks(id),
  evaluated_at TIMESTAMPTZ
);

-- Computed scores (materialised, recalculated periodically)
CREATE TABLE contractor_scores (
  contractor_id UUID PRIMARY KEY REFERENCES profiles(id),
  craft_score NUMERIC(3,1), -- 0.0 to 10.0
  craft_confidence TEXT, -- 'building', 'provisional', 'established'
  craft_signal_count INTEGER DEFAULT 0,
  service_score NUMERIC(3,1),
  service_confidence TEXT,
  service_review_count INTEGER DEFAULT 0,
  value_score NUMERIC(3,1),
  value_confidence TEXT,
  value_signal_count INTEGER DEFAULT 0,
  trade_average_craft NUMERIC(3,1), -- for Bayesian prior
  trade_average_service NUMERIC(3,1),
  trade_average_value NUMERIC(3,1),
  last_calculated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Score history for trend lines
CREATE TABLE contractor_score_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id UUID NOT NULL REFERENCES profiles(id),
  score_type TEXT NOT NULL, -- 'craft', 'service', 'value'
  score_value NUMERIC(3,1),
  confidence TEXT,
  signal_count INTEGER,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trade averages (recalculated periodically, used as Bayesian prior)
CREATE TABLE trade_averages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade TEXT NOT NULL,
  region TEXT, -- nullable for national average
  avg_craft NUMERIC(3,1),
  avg_service NUMERIC(3,1),
  avg_value NUMERIC(3,1),
  sample_size INTEGER,
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(trade, region)
);
```

---

## 11. Build Sequence

### Phase 1 — Verification tiers & compliance gate (no job volume needed)

1. `contractor_verification` table + RLS
2. `contractor_register_checks` table + RLS
3. `contractor_credentials` table + RLS
4. Verification status display on contractor profile (public)
5. Verification progress view in contractor dashboard
6. Insurance expiry tracking + warning notifications (edge function + pg_cron)
7. Compliance gate enforcement: block job-taking below Tier 2

### Phase 2 — Data collection infrastructure (ships silently, no UI display of scores yet)

1. `service_reviews` table + RLS + post-job review prompt UI
2. `job_callbacks` table + RLS + callback submission flow
3. `craft_timer_windows` table + 90-day timer trigger on job completion
4. `craft_signals` table + RLS
5. `peer_endorsements` table + RLS + endorsement UI (simple)
6. Photo documentation tracking (extend existing job-photos logic)
7. Quote-to-invoice variance calculation (extend existing invoice flow)

### Phase 3 — Score calculation engine (activate when volume justifies)

1. `contractor_scores` table + `contractor_score_history`
2. `trade_averages` table + periodic recalculation
3. Score calculation function (SECURITY DEFINER, called by pg_cron or edge function)
4. Bayesian prior + recency decay implementation
5. Confidence level calculation
6. Anomaly detection layer

### Phase 4 — Score display

1. Contractor dashboard: full breakdown, trend lines, actionable guidance
2. Homeowner profile view: simplified three-score display with explanations
3. FM/B2B scorecard view: full data, signals, trends
4. Search ranking composite (internal, never displayed)

---

## 12. Open Decisions

1. **Confidence thresholds:** Exact job/review counts for "Building" → "Provisional" → "Established" transitions. TBD based on actual platform volume.
2. **Recency half-life:** 9 months or 12 months? Needs testing with real data.
3. **Complexity classification:** How to derive job complexity from metadata. May need a lookup table by trade/category or a simple heuristic (value × duration × trade count).
4. **Peer endorsement cap:** 5 endorsements counting, or some other number?
5. **Inspection capture:** How to verify building control sign-offs? Manual upload + admin verification initially, API integration with certification bodies later?
6. **Callback fault classification:** Admin-only initially, or allow contractor to accept fault? Risk of gaming if contractor can classify their own callbacks.
7. **Review timing:** When does the review prompt fire? Immediately on job completion, or after a delay (e.g., 48 hours) to let the client live with the work before rating service?
8. **FM operational signals:** Are these a formal fourth dimension for B2B, or purely supplementary data in the scorecard view? Current design says supplementary — revisit if FM clients want a sortable operational score.