/**
 * The single source of truth for "what state is this thing in, and whose
 * move is it" across every surface that shows an enquiry/quote/scheduling/
 * job/invoice card to either party. Absorbs useContractorPipeline.ts's
 * former inline stage/band/action logic (that hook now calls presentState()
 * instead of hand-writing labels) and replaces the two independent
 * "Awaiting deposit" badges that used to live separately in
 * ReceivedQuotes.tsx and IssuedQuotes.tsx.
 *
 * Compile-time exhaustive: EntityState is a discriminated union and every
 * presenter switches on it with an assertNever() default arm, so adding a
 * new status/substate without a matching case is a type error, not a silent
 * runtime fallback.
 *
 * Every state is resolved relative to a `viewer` ("contractor" | "recipient")
 * because the same underlying fact reads differently depending who's
 * looking — "the customer proposed a date" is tone:'action' waitingOn:'you'
 * for the contractor, but tone:'waiting' waitingOn:'them' for the customer
 * who just proposed it.
 */

export type PresenterTone = "action" | "waiting" | "neutral" | "done";
export type WaitingOn = "you" | "them" | null;
export type Viewer = "contractor" | "recipient";

export interface PresenterResult {
  label: string;
  tone: PresenterTone;
  waitingOn: WaitingOn;
}

export type EnquiryState = {
  kind: "enquiry";
  status: "new" | "replied" | "archived" | "declined" | "converted";
};

export type QuoteState =
  | { kind: "quote"; status: "draft" }
  | { kind: "quote"; status: "sent"; viewed: boolean }
  | { kind: "quote"; status: "rejected"; withinFollowUpWindow: boolean }
  | { kind: "quote"; status: "stalled" }
  | { kind: "quote"; status: "expired" }
  | { kind: "quote"; status: "lapsed" }
  | { kind: "quote"; status: "superseded" }
  | { kind: "quote"; status: "accepted"; depositRequired: boolean; depositPaid: boolean };

export type SchedulingState =
  | { kind: "scheduling"; substate: "pending"; proposedByViewer: boolean }
  | { kind: "scheduling"; substate: "confirmed_awaiting_job" }
  | { kind: "scheduling"; substate: "dead_end" };

export type JobState =
  | { kind: "job"; status: "scheduled" | "in_progress" | "snagging" | "cancelled" }
  | { kind: "job"; status: "complete"; contractorSignedOff: boolean };

export type InvoiceState = {
  kind: "invoice";
  status: "draft" | "sent" | "overdue" | "paid" | "void";
};

export type EntityState = EnquiryState | QuoteState | SchedulingState | JobState | InvoiceState;

function assertNever(x: never): never {
  throw new Error(`statusPresenter: unhandled state ${JSON.stringify(x)}`);
}

function chip(label: string, tone: PresenterTone, waitingOn: WaitingOn): PresenterResult {
  return { label, tone, waitingOn };
}

// ── DB string -> union narrowing ─────────────────────────────────────────
//
// assertNever guards the union INTERNALLY (every presenter switch is
// exhaustive over already-typed EntityState values) — it must never be the
// thing that turns an untyped DB string into an EntityState. A raw `as`
// cast at that boundary defeats the exhaustiveness check entirely: an
// unexpected live status value would pass the compiler silently and then
// hit assertNever at runtime, crashing the render. These toXState()
// functions are the ONLY sanctioned way to cross that boundary — they
// return null for anything outside the presenter's known input domain
// (Phase A4), and every caller must treat null as "skip this card" or
// "show a neutral fallback," never throw.
//
// Includes every value the live domain is known to produce, not just the
// ones each specific caller happens to see today: 'archived' (enquiries'
// legacy value, still write-once via historical rows) and 'declined'/
// 'converted' all narrow to real states here even though, e.g., the
// pipeline's own fetch filters them out at the query level — the
// narrowing function's job is to describe the presenter's whole input
// domain, not just one caller's slice of it.

export function toEnquiryState(status: string | null | undefined): EnquiryState | null {
  switch (status) {
    case "new":
    case "replied":
    case "archived":
    case "declined":
    case "converted":
      return { kind: "enquiry", status };
    default:
      return null;
  }
}

export interface QuoteStateExtras {
  viewed?: boolean;
  withinFollowUpWindow?: boolean;
  depositRequired?: boolean;
  depositPaid?: boolean;
  /**
   * Display-layer-only expiry: nothing in the DB ever flips a quote's
   * status to 'expired' (readiness-audit A1) — a quote past its
   * valid_until sits at status='sent' forever unless a human acts on it.
   * Passing validUntil lets a still-'sent' quote present as expired
   * without waiting for (or requiring) a DB-side flip. Ignored for every
   * other status — a rejected/accepted/etc quote's validUntil having
   * passed is not "expired," it's just old.
   */
  validUntil?: string | null;
}

export function toQuoteState(status: string | null | undefined, extra: QuoteStateExtras = {}): QuoteState | null {
  switch (status) {
    case "draft":
      return { kind: "quote", status: "draft" };
    case "sent":
      if (extra.validUntil && new Date(extra.validUntil) < new Date()) {
        return { kind: "quote", status: "expired" };
      }
      return { kind: "quote", status: "sent", viewed: !!extra.viewed };
    case "rejected":
      return { kind: "quote", status: "rejected", withinFollowUpWindow: !!extra.withinFollowUpWindow };
    case "stalled":
      return { kind: "quote", status: "stalled" };
    case "expired":
      return { kind: "quote", status: "expired" };
    case "lapsed":
      return { kind: "quote", status: "lapsed" };
    case "superseded":
      return { kind: "quote", status: "superseded" };
    case "accepted":
      return {
        kind: "quote",
        status: "accepted",
        depositRequired: !!extra.depositRequired,
        depositPaid: !!extra.depositPaid,
      };
    default:
      return null;
  }
}

export function toSchedulingState(
  substate: "pending" | "confirmed_awaiting_job" | "dead_end",
  proposedByViewer?: boolean,
): SchedulingState {
  // No DB string crosses directly into this one (callers already resolve
  // "pending/confirmed/dead_end" from schedule_events rows themselves) —
  // kept here only so every EntityState kind has one canonical constructor.
  return substate === "pending"
    ? { kind: "scheduling", substate: "pending", proposedByViewer: !!proposedByViewer }
    : { kind: "scheduling", substate };
}

export function toJobState(status: string | null | undefined, contractorSignedOff?: boolean): JobState | null {
  switch (status) {
    case "scheduled":
    case "in_progress":
    case "snagging":
    case "cancelled":
      return { kind: "job", status };
    case "complete":
      return { kind: "job", status: "complete", contractorSignedOff: !!contractorSignedOff };
    default:
      return null;
  }
}

export function toInvoiceState(status: string | null | undefined): InvoiceState | null {
  switch (status) {
    case "draft":
    case "sent":
    case "overdue":
    case "paid":
    case "void":
      return { kind: "invoice", status };
    default:
      return null;
  }
}

/** For render sites that must show *something* even when a status falls outside the known domain. */
export function presentOrNeutral(state: EntityState | null, viewer: Viewer, fallbackLabel: string): PresenterResult {
  if (!state) return chip(fallbackLabel, "neutral", null);
  return presentState(state, viewer);
}

/** Picks between a contractor-perspective and recipient-perspective result. */
function perspective(viewer: Viewer, contractor: PresenterResult, recipient: PresenterResult): PresenterResult {
  return viewer === "contractor" ? contractor : recipient;
}

function presentEnquiry(state: EnquiryState, viewer: Viewer): PresenterResult {
  switch (state.status) {
    case "new":
      return perspective(
        viewer,
        chip("New enquiry", "action", "you"),
        chip("Awaiting response", "waiting", "them"),
      );
    case "replied":
      // The CONTRACTOR replied asking for more info — now waiting on the
      // customer to answer back.
      return perspective(
        viewer,
        chip("Replied — awaiting customer", "waiting", "them"),
        chip("Contractor asked a question", "action", "you"),
      );
    case "archived":
      // Legacy value, superseded by 'declined' — mapped so old rows don't
      // hit the exhaustiveness error, not a live write path.
      return chip("Archived", "neutral", null);
    case "declined":
      return chip("Declined", "neutral", null);
    case "converted":
      return chip("Converted to quote", "done", null);
    default:
      return assertNever(state.status);
  }
}

function presentQuote(state: QuoteState, viewer: Viewer): PresenterResult {
  switch (state.status) {
    case "draft":
      return perspective(
        viewer,
        chip("Draft", "action", "you"),
        chip("Draft", "neutral", null), // recipient never actually sees a draft
      );
    case "sent":
      return perspective(
        viewer,
        chip(state.viewed ? "Viewed — awaiting response" : "Sent — awaiting response", "waiting", "them"),
        chip("Awaiting your response", "action", "you"),
      );
    case "rejected":
      return perspective(
        viewer,
        state.withinFollowUpWindow
          ? chip("Rejected — revise or follow up", "action", "you")
          : chip("Rejected", "neutral", null),
        chip("You declined this quote", "neutral", null),
      );
    case "stalled":
      return perspective(
        viewer,
        chip("Stalled — follow up", "action", "you"),
        chip("You stalled this quote", "neutral", null),
      );
    case "expired":
      return chip("Expired", "neutral", null);
    case "lapsed":
      return chip("Lapsed", "neutral", null);
    case "superseded":
      return chip("Superseded by a revision", "neutral", null);
    case "accepted":
      if (state.depositRequired && !state.depositPaid) {
        return perspective(
          viewer,
          chip("Awaiting deposit — waiting on client", "waiting", "them"),
          chip("Awaiting deposit — waiting on you", "action", "you"),
        );
      }
      if (state.depositRequired && state.depositPaid) {
        return chip("Deposit paid", "done", null);
      }
      return chip("Accepted", "done", null);
    default:
      return assertNever(state);
  }
}

function presentScheduling(state: SchedulingState, viewer: Viewer): PresenterResult {
  switch (state.substate) {
    case "pending":
      return state.proposedByViewer
        ? chip("Proposed — awaiting response", "waiting", "them")
        : chip("Confirm or counter dates", "action", "you");
    case "confirmed_awaiting_job":
      // Only the recipient can confirm the job (accept_quote_with_slot is
      // recipient-only) — the contractor is always waiting here.
      return perspective(
        viewer,
        chip("Date agreed — awaiting job confirmation", "waiting", "them"),
        chip("Confirm the job", "action", "you"),
      );
    case "dead_end":
      // Both parties are out of ordinary turns but either can still message
      // or send a final offer — invisible today, a silent flow-killer.
      // Deliberately the same for both viewers: nobody progresses this
      // automatically, and either party genuinely can still move it.
      return chip("Stuck — message or send a final offer", "action", "you");
    default:
      return assertNever(state);
  }
}

function presentJob(state: JobState, viewer: Viewer): PresenterResult {
  switch (state.status) {
    case "scheduled":
      return perspective(
        viewer,
        chip("Scheduled — start the job", "action", "you"),
        chip("Job scheduled", "waiting", "them"),
      );
    case "in_progress":
      return perspective(
        viewer,
        chip("In progress — update as you go", "action", "you"),
        chip("Job in progress", "waiting", "them"),
      );
    case "snagging":
      return perspective(
        viewer,
        chip("Snagging — resolve issues", "action", "you"),
        chip("Snagging in progress", "waiting", "them"),
      );
    case "cancelled":
      return chip("Cancelled", "neutral", null);
    case "complete":
      if (!state.contractorSignedOff) {
        return perspective(
          viewer,
          chip("Complete — add your sign-off", "action", "you"),
          chip("Awaiting contractor sign-off", "waiting", "them"),
        );
      }
      return perspective(
        viewer,
        chip("Signed off — create invoice", "action", "you"),
        chip("Job complete", "done", null),
      );
    default:
      return assertNever(state);
  }
}

function presentInvoice(state: InvoiceState, viewer: Viewer): PresenterResult {
  switch (state.status) {
    case "draft":
      return perspective(
        viewer,
        chip("Draft — send invoice", "action", "you"),
        chip("Draft", "neutral", null),
      );
    case "sent":
      return perspective(
        viewer,
        chip("Sent — awaiting payment", "waiting", "them"),
        chip("Payment due", "action", "you"),
      );
    case "overdue":
      return perspective(
        viewer,
        chip("Overdue — chase payment", "action", "them"),
        chip("Overdue — pay now", "action", "you"),
      );
    case "paid":
      return chip("Paid", "done", null);
    case "void":
      return chip("Void", "neutral", null);
    default:
      return assertNever(state);
  }
}

export function presentState(state: EntityState, viewer: Viewer): PresenterResult {
  switch (state.kind) {
    case "enquiry":
      return presentEnquiry(state, viewer);
    case "quote":
      return presentQuote(state, viewer);
    case "scheduling":
      return presentScheduling(state, viewer);
    case "job":
      return presentJob(state, viewer);
    case "invoice":
      return presentInvoice(state, viewer);
    default:
      return assertNever(state);
  }
}
