# TENDERING-SCHEMA.md — Locked Schema for B2B Tendering & Term Contracts

Companion to B2B-TENDERING.md. This is the build source of truth, locked
2026-07-10 after the full schema walk. Migrations are written FROM this
document, chunk by chunk, in the order below. Design changes require
re-locking here first — never in a migration directly.

Conventions (inherited, non-negotiable):
- All document numbers server-side via SECURITY DEFINER allocators. Never client-side.
- RLS: direct auth.uid() against profiles-keyed columns is valid under the
  id==user_id CHECK (see CLAUDE.md). Membership checks go through
  business_members / profiles as shown.
- Applied migrations immutable. Snapshots immutable. Append-only tables have
  no UPDATE/DELETE policies at all.
- State transitions with consequences run through SECURITY DEFINER functions,
  not raw UPDATEs.
- Numbering convention split, deliberate: party-coded document families
  (T-/TA-/TE-) store the full composed string in the number column itself,
  because they cross a party boundary at creation — a tender number is seen
  by a different company than the one whose counter produced it, an
  application number by the business that receives it — so the identifier
  must be globally unique and self-identifying without a join back to the
  issuing party. Intra-contractor families (Q-/J-/INV-, per CLAUDE.md's
  document reference system) stay integer + render-time composition via
  documentRefs.ts, because they're only ever read in the context of the
  contractor that issued them — no cross-party join problem to solve.

---

## CHUNK 1 — Foundations (numbering)

### companies.company_code  (ALTER)
- `company_code text UNIQUE NOT NULL` (after backfill)
- Backfill: existing rows from owner's TS-B code fragment (e.g. '57B38C').
- New companies: stamped at creation alongside profile code generation.
- NOTE: companies has duplicate contact fields (address vs address_line1/2,
  email vs contact_email, phone vs contact_phone) — audit which set is live
  BEFORE tendering UI reads company details. Also inspect sourcing_policy
  values; tender distribution default may read from it.

### business_counters  (NEW — BUILT, see 20260710130000)
| column     | type    | notes                                          |
|------------|---------|------------------------------------------------|
| company_id | uuid    | NOT NULL → companies(id) ON DELETE CASCADE      |
| entity     | text    | NOT NULL CHECK IN ('tender','engagement')       |
| next_value | int     | NOT NULL DEFAULT 1                              |
| —          | —       | PRIMARY KEY (company_id, entity)                |

- Entity-row shape (mirrors contractor_counters), not the fixed
  tender_counter/engagement_counter columns originally floated here.
  Amended after build: the fixed-column shape can't be addressed by a
  single `RETURNING` without CASE-branching per column, and the entity-row
  shape extends cleanly if a third business entity type ever appears.
- RLS enabled, ZERO policies. Written only by allocator. (Same pattern as
  contractor_counters — documented in CLAUDE.md.)

### Allocator (BUILT, see 20260710130000)
- Sibling function chosen over extending next_document_number(): different
  table shape (business_counters keys on company_id, not contractor_id) and
  different FK domain (companies vs profiles). next_business_document_number
  (p_company_id, p_entity) — same atomic INSERT ... ON CONFLICT DO UPDATE ...
  RETURNING idiom as next_document_number(), same REVOKE ALL FROM PUBLIC,
  anon, authenticated.
- Application counter (`TA-{contractor_code}-NNNN`) is contractor-keyed —
  same FK domain as quote/job/invoice — so it reuses contractor_counters
  and next_document_number() unchanged. Amended after build: no new column
  was added; contractor_counters.entity CHECK was extended to include
  'application', consistent with the existing entity-row design.
- Formats: tender `T-{company_code}-NNNN`, engagement `TE-{company_code}-NNNN`,
  application `TA-{contractor_code}-NNNN`. Zero-padded to 4.

---

## CHUNK 2 — Tender object

### tenders  (NEW)
| column               | type        | notes |
|----------------------|-------------|-------|
| id                   | uuid PK     | gen_random_uuid() |
| tender_number        | text        | NOT NULL UNIQUE, allocator |
| company_id           | uuid        | NOT NULL → companies(id) |
| created_by           | uuid        | NOT NULL → profiles(id) |
| project_id           | uuid        | NULL → projects(id) — the seam |
| tender_type          | text        | NOT NULL CHECK IN ('works','term') |
| title                | text        | NOT NULL |
| trade_categories     | text[]      | NOT NULL |
| scope_description    | text        | NULL |
| status               | text        | NOT NULL DEFAULT 'draft' CHECK IN ('draft','published','closed','unsealed','awarded','cancelled','lapsed') |
| response_deadline    | timestamptz | NULL (enforced NOT NULL at publish, in function not schema) |
| bid_visibility       | text        | NOT NULL DEFAULT 'sealed' CHECK IN ('sealed','open') |
| distribution         | text        | NOT NULL DEFAULT 'invite' CHECK IN ('invite','open') |
| bid_validity_days    | int         | NOT NULL DEFAULT 30 |
| site_visit_required  | boolean     | NOT NULL DEFAULT false |
| budget_min/budget_max| numeric     | NULL |
| budget_visible       | boolean     | NOT NULL DEFAULT false |
| contract_start_date  | date        | NULL (term) |
| contract_term_months | int         | NULL (term) |
| tupe_applies         | boolean     | NULL = not stated (term only) |
| formal_procurement   | boolean     | NOT NULL DEFAULT false (Procurement Act mode) |
| cancelled_reason     | text        | NULL |
| published_at / closed_at / awarded_at | timestamptz | NULL lifecycle stamps |
| created_at / updated_at | timestamptz | defaults |

Status model (deliberately minimal): draft → published → closed → unsealed
→ awarded; exits: cancelled, lapsed (zero-bid path). Addenda/extensions are
NOT statuses. closed vs unsealed separate: sealed tenders auto-close at
deadline; business chooses unseal moment. Open-visibility tenders may collapse
the two in the transition function.

### tender_sites  (NEW)
(tender_id → tenders, site_id → sites) — junction, UNIQUE pair. Not an array:
RLS/reporting join sites properly; lots (deferred) hang off per-site groupings.

### tender_response_requirements  (NEW)
(id, tender_id, kind CHECK IN ('pricing','references','methodology',
'programme','subcontracting','declarations','rams'), config jsonb)
— drives the contractor stepper by query.

### tender_prequal_requirements  (NEW)
(id, tender_id, kind, detail jsonb, mandatory boolean NOT NULL)
— RAG source. mandatory=true + unmet = RED = blocks submission.

### tender_evaluation_criteria  (NEW)
(id, tender_id, label, weight numeric) — published at tender; drives scoring.

### tender_documents  (NEW)
(id, tender_id, uploaded_by, file_path, label, addendum_id uuid NULL
→ tender_addenda) — addendum attachments live here via the nullable link.

### RLS — tenders and satellites (BUILT, see 20260710150000)
- Business (ALL): `is_company_member(company_id)` — the SECURITY DEFINER
  helper from the B2B foundation (20260612120000), not the raw subquery
  originally drafted here. Amended after build: reusing the helper matches
  every other business-tier policy in the codebase (sites, assets,
  companies, enquiries, jobs) instead of introducing a second form of the
  same check. Role/threshold gating on publish/award still deferred to the
  roles chunk; member-wide first.
- Contractor (SELECT only): status != 'draft' AND (invited via
  tender_invitations OR distribution = 'open'). Built as a SECURITY
  DEFINER helper `contractor_can_view_tender(p_tender_id)` (table
  allowlist: tenders, tender_invitations only) so the same predicate isn't
  duplicated across tenders + 5 satellite tables. Satellite business-side
  policies use a second helper, `tender_company_id(p_tender_id)` (allowlist:
  tenders only), so they can call `is_company_member(tender_company_id(...))`
  without re-deriving company_id per table.
  LOCKED DECISION (Option B): trade matching is a QUERY-LAYER relevance
  filter, NOT in RLS. Open tenders are public to contractors by design.
  If a credential-gated visibility class is ever required, it enters RLS
  as its own explicit clause at that point.
- Contractors never write to tenders or satellites.
- tender_invitations pulled forward from chunk 3 in the chunk-2 migration:
  the contractor SELECT policy on tenders/satellites depends on it existing.
  Its own RLS (business ALL via the same tender_company_id/is_company_member
  pair; contractor SELECT own row; contractor UPDATE own row constrained to
  WITH CHECK status = 'declined') was built now too — see chunk 3 for the
  narrative version of this table.

---

## CHUNK 3 — Invitations, clarifications, addenda

### tender_invitations  (NEW)
(id, tender_id, contractor_id → profiles, status NOT NULL DEFAULT 'invited'
CHECK IN ('invited','viewed','declined','withdrawn_by_business'),
declined_reason NULL, is_incumbent boolean NOT NULL DEFAULT false,
invited_by → profiles, created_at, viewed_at, responded_at,
UNIQUE(tender_id, contractor_id))
- Application states NOT duplicated here; dashboards join to applications.
- viewed_at stamped when contractor opens the tender (locked: keep).
- RLS: business members full control on their tenders' invitations;
  contractor SELECT own row; contractor UPDATE own row limited to the
  decline transition (status/declined_reason/responded_at).

### tender_clarifications  (NEW)
(id, tender_id, asked_by → profiles, question NOT NULL, answer NULL,
answered_by NULL → profiles, answered_at NULL, created_at)
- Append-only. No edits post-answer; corrections are new clarifications
  or addenda.
- RLS: business sees all for their tenders. Contractor sees own questions
  always; OTHER bidders' questions ONLY once answered (unanswered pool
  would leak who's bidding — sealed principle). Asker identity never
  rendered to other contractors (UI anonymises; business sees asker).
- This is the ONLY mid-tender channel. No private business↔bidder chat
  during the window, by design. Post-award, engagement messaging takes over.

### tender_addenda  (NEW)
(id, tender_id, sequence int NOT NULL, summary NOT NULL, detail NULL,
new_deadline timestamptz NULL, issued_by → profiles, created_at,
UNIQUE(tender_id, sequence))
- Immutable once issued: NO update policy exists. Mistakes → next addendum.
- new_deadline set ⇒ issuing transaction updates tenders.response_deadline.
- Issue ⇒ notify all invitees; submitted applications flip to
  reconfirm_requested (chunk 4).

---

## CHUNK 4 — Applications & rates cards

### tender_applications  (NEW)
| column               | type | notes |
|----------------------|------|-------|
| id                   | uuid PK | |
| application_number   | text | NOT NULL UNIQUE ('TA-...'), allocated at DRAFT creation |
| tender_id            | uuid | NOT NULL → tenders(id) |
| contractor_id        | uuid | NOT NULL → profiles(id) |
| status               | text | NOT NULL DEFAULT 'draft' CHECK IN ('draft','submitted','withdrawn','reconfirm_requested','shortlisted','awarded','unsuccessful') |
| cover_note           | text | NULL |
| lump_sum_total       | numeric | NULL (works) |
| methodology          | text | NULL |
| programme_detail     | text | NULL |
| subcontracting       | jsonb | NULL — self-deliver/sub declaration |
| declarations         | jsonb | NULL — capacity, conflicts |
| prequal_snapshot     | jsonb | NULL — RAG frozen at submission, SERVER-SIDE ONLY |
| addendum_ack_sequence| int  | NULL — highest addendum acknowledged |
| submitted_at / withdrawn_at | timestamptz | NULL |
| created_at / updated_at | | |
| UNIQUE(tender_id, contractor_id) | | one application per contractor per tender |

Immutability rules (load-bearing):
- draft: contractor full control.
- submitted: UPDATE policy permits ONLY withdraw transition and addendum
  reacknowledgement. Content columns frozen.
- post-deadline: nothing.
- Content changes after submission = withdraw + resubmit. ALWAYS. No
  in-place editing, including during reconfirm_requested (reconfirmation
  is an acknowledgement, not an edit window).
- shortlisted is CONTRACTOR-VISIBLE (locked decision).
- prequal_snapshot computed and stamped by server (edge fn / SECURITY
  DEFINER) at submission. Never client-supplied.

### tender_application_references  (NEW)
(id, application_id, client_name, contact jsonb, project_summary) —
structured rows; the stepper counts them against requirements config.

### tender_rates_cards  (NEW — term tenders)
(id, application_id NOT NULL → tender_applications, callout_standard,
callout_out_of_hours, hourly_rate, materials_markup_pct all numeric
NOT NULL, minimum_charge numeric NULL, extra_lines jsonb NULL)
- Real table, not jsonb: award copies it; comparison view queries columnar.

### RLS — the sealed mechanic (most important policies of the build)
- Contractor: SELECT/UPDATE own rows only, ever. No contractor ever reads
  another's application, unseal or not.
- Business SELECT: (tender unsealed) OR (tender.bid_visibility='open' AND
  status != 'draft'). Sealed + pre-unseal ⇒ business reads NO rows.
- "4 of 6 received" count: SECURITY DEFINER counter fn returning a number,
  never rows.
- Drafts invisible to business in every mode, always.
- Write policies authored knowing PostgREST zero-row silent failures
  (CLAUDE.md): UI checks state before offering edit.

---

## CHUNK 5 — Scoring, award, agreement

### tender_scores  (NEW)
(id, application_id, criterion_id → tender_evaluation_criteria, score
numeric NOT NULL (0–10), note text NULL — REQUIRED when tender.formal_procurement,
scored_by → profiles, created_at, UNIQUE(application_id, criterion_id, scored_by))
- Per-scorer rows; comparison view averages. Weighted totals COMPUTED,
  never stored.
- Immutable after award (audit trail). Append-only before.
- RLS: business members of the tender's company only. Contractors NEVER
  see score rows, including their own — they receive debriefs.

### tender_debriefs  (NEW)
(id, application_id UNIQUE, feedback text NULL, score_band text NULL,
own_scores_snapshot jsonb NULL, winning_scores_snapshot jsonb NULL,
created_at)
- Normal mode: band + optional feedback.
- Formal mode (assessment summaries): per-criterion reasons for own scores
  + winning tender's scores (redacted), generated from tender_scores,
  released to ALL assessed bidders simultaneously as one atomic act at award.
- RLS: that contractor + business members only.

### tender_agreements  (NEW)
(id, tender_id UNIQUE, application_id, terms_snapshot jsonb NOT NULL,
business_accepted_by/at NOT NULL, contractor_accepted_by/at NULL,
status NOT NULL DEFAULT 'offered' CHECK IN ('offered','accepted',
'declined','expired'), declined_reason text NULL, standstill_ends_at
timestamptz NULL, created_at)
- terms_snapshot: COMPLETE self-contained copy (tender + addenda + winning
  application + rates card + SLA rules). Server-assembled (SECURITY
  DEFINER). Immutable from contractor acceptance. No FKs-to-live-rows as
  the record of assent.
- Award preconditions (in function): tender unsealed; application submitted
  or shortlisted; bid_validity_days unexpired (else bidder reconfirmation
  demanded first).
- Formal mode: standstill_ends_at set (business enters date; platform
  suggests 8-working-day minimum but does NOT compute UK bank holidays —
  buyer owns the date); contractor acceptance BLOCKED until it passes;
  debriefs/summaries must be released before announcement.
- declined_reason: optional, business-visible (locked decision).
- Acceptance fires conversion: works → job (existing J- pipeline);
  term → term_engagement.
- Platform provides mechanics, does not warrant Procurement Act compliance —
  toggle copy + T&Cs make the buyer own the determination. Solicitor review
  of wording before first public-sector client.

---

## CHUNK 6 — Term engagements

### term_engagements  (NEW)
(id, engagement_number text NOT NULL UNIQUE ('TE-...'), agreement_id UNIQUE
→ tender_agreements, tender_id → tenders, company_id → companies,
contractor_id → profiles, status NOT NULL DEFAULT 'active' CHECK IN
('active','suspended','notice_given','ended','expired'), start_date date
NOT NULL, expiry_date date NOT NULL, retender_notice_months int NOT NULL
DEFAULT 6, notice_period_days int NOT NULL DEFAULT 30,
notice_effective_date date NULL, sla_rule_set_id NULL → sla_rules,
auto_suspend_on_lapse boolean NOT NULL DEFAULT true,
suspended_reason NULL, ended_at/ended_reason NULL,
retendered_as uuid NULL → tenders(id), created_at/updated_at)

- LOCKED: auto-suspend on compliance lapse is DEFAULT ON with per-engagement
  toggle (business may opt for flag-only). In-flight carve-out: suspension
  blocks NEW call-outs; in-flight jobs continue.
- Status transitions via SECURITY DEFINER functions only.

### engagement_sites  (NEW)
(engagement_id, site_id, UNIQUE pair) — copied from tender_sites at
conversion; independently editable after (portfolio changes mid-term;
the agreement snapshot preserves the original).

### engagement_rates  (NEW — versioned)
(id, engagement_id, version int NOT NULL, callout_standard, callout_ooh,
hourly_rate, materials_markup_pct, minimum_charge, extra_lines jsonb,
effective_from date NOT NULL, agreed_by_business/at, agreed_by_contractor/at,
created_at, UNIQUE(engagement_id, version))
- v1 copied from winning rates card at conversion. Indexation = new version
  with both-party assent. Versions immutable; call-outs price from the
  version effective on their RAISE date — historical invoices always
  reconcile. INSERT-only.

### engagement_ppm_schedules  (NEW)
(id, engagement_id, site_id NULL = all covered sites, title, frequency,
next_due date, assigned_trade, active boolean)
- Generator function walks due schedules, spawns jobs under the engagement.

### jobs.engagement_id  (ALTER)
- `engagement_id uuid NULL → term_engagements(id)` — THE call-out mechanic.
  Call-outs are normal J-number jobs: existing stepper, scheduling, SLA
  columns. Quote phase skipped; pricing from effective rates version;
  invoice lines reference rates. No parallel pipeline.

### Compliance watcher (scheduled edge function)
- Checks active engagements' contractors vs live credential/prequal expiry.
- Ladder: 30d nudge → 14d nudge + business amber flag → lapse: if
  auto_suspend_on_lapse, engagement → suspended (new call-outs blocked,
  in-flight continue); else business-visible red flag.
- NOTE: SLA clock, compliance watcher, expiry radar should share one
  scheduled runner.

### Monthly roll-up invoicing
- DEFERRED to payment-rails chunk (depends on Stripe-vs-reconciliation).
  Jobs carry line data unaggregated meanwhile. Schema does not block.

### RLS
- SELECT: business members of company + engaged contractor.
- Consequential transitions (suspend, notice, end): functions only.
- engagement_rates: INSERT-only via propose/accept flow.

---

## CHUNK 7 — Expiry radar & retender

### logged_contracts  (NEW — deliberately thin)
(id, company_id → companies, supplier_name text NOT NULL, trade_category
NULL, site_ids uuid[] NULL — loose array acceptable here, no RLS/joins
hang off it, expiry_date date NOT NULL, retender_notice_months int NOT
NULL DEFAULT 6, notes NULL, created_by, created_at)
- Off-platform contract logging: ninety-second entry or nobody does it.
  No status machine. RLS: company members only.
- THE acquisition mechanic: every logged contract = a scheduled retender
  prompt landing on-platform.

### Radar = view + watcher (no new table)
- View unions active term_engagements (expiry_date, notice months,
  notice_given as early trigger) and logged_contracts.
- Watcher nudges: business at notice point ("expires [date] — start your
  retender?" one-tap); incumbent contractor soft parallel notification
  (engagement-sourced only). Nudge clamped: never earlier than term midpoint.
- retendered_as set ⇒ radar shows "retender in progress", stops re-nudging.

### clone_tender_for_retender(engagement_id)  (SECURITY DEFINER function)
- New tender, new T-number, status draft.
- Copies from ORIGINAL tender: title, type, trades, scope, response
  requirements, prequal requirements, evaluation criteria, SLA ref,
  formal_procurement flag.
- Sites from engagement_sites (CURRENT portfolio), not the original tender.
- Does NOT copy: invitations (fresh distribution each cycle; invite picker
  flags incumbent via is_incumbent), addenda, clarifications, deadlines.
- Stamps term_engagements.retendered_as.
- logged_contracts variant: no source to clone — one-tap opens a pre-filled
  draft (trade, sites, title from supplier/notes).

---

## DEFERRED (deliberate, not forgotten)
1. B2B payment rails + monthly roll-up invoicing (Stripe Invoicing vs
   bank reconciliation — undecided).
2. Business roles/approval thresholds on business_members (member-wide
   RLS ships first; publish/award gating tightens later).
3. Lots: schema must not preclude — tender_lots table + nullable lot_id
   on applications when built.
4. Frameworks (ranked multi-award, call-out cascade — also answers OOH
   fallback structurally).
5. Two-stage tendering (EOI → shortlist → full tender).
6. companies duplicate-contact-fields audit (PREREQUISITE for tendering
   UI reading company details — cheap, do early).

## BUILD ORDER
Chunk 1 → 2 → 3 → 4 → 5 → 6 → 7. Each chunk: migration(s) from this doc →
review → db push → types regen → tsc → git status → verification evidence
→ next chunk. Companies contact-field audit rides with chunk 1.