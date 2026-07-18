import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatInvoiceRef, formatJobRef, formatQuoteRef } from "@/lib/documentRefs";
import {
  presentState,
  presentOrNeutral,
  toEnquiryState,
  toQuoteState,
  toJobState,
  toInvoiceState,
  type PresenterTone,
  type WaitingOn,
} from "@/lib/statusPresenter";

/**
 * The contractor's live-engagement pipeline for the Work view.
 *
 * An "engagement" is one deal (enquiry -> quote -> job -> invoice chain)
 * represented once, keyed by its furthest-along artefact. See
 * resolveEngagement() below for the exact precedence rules — they mirror
 * the stage-resolution spec in the Work-view build brief.
 */

export type PipelineBand = "needs_you" | "waiting";
export type PipelineStage = "enquiry" | "quote_sent" | "scheduling" | "job" | "invoice";

const PROPOSAL_EVENT_TYPE = "quote_proposal";
const REJECTED_QUOTE_GRACE_DAYS = 14;

// Shape RespondDialog / RejectDialog / SendQuoteDialog already expect —
// duplicated here (not imported from the page) to keep this hook free of
// page-level imports; kept structurally identical so callers can pass it
// straight through.
export interface PipelineEnquiryRef {
  id: string;
  contractor_id: string | null;
  customer_id: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  job_description: string;
  location: string;
  preferred_timeline: string | null;
  preferred_time_of_day: string | null;
  preferred_window_start: string | null;
  preferred_window_end: string | null;
  budget_range: string | null;
  status: string | null;
}

export interface PipelineEngagement {
  key: string;
  clientName: string;
  clientCode: string | null;
  companyId: string | null;
  title: string | null;
  stage: PipelineStage;
  stageLabel: string;
  reference: string | null;
  band: PipelineBand;
  action: string;
  tone: PresenterTone;
  waitingOn: WaitingOn;
  sinceIso: string;
  overdue: boolean;
  slaStatus: string | null;
  slaCompletionDue: string | null;
  enquiryRef: PipelineEnquiryRef | null;
  quoteId: string | null;
  jobId: string | null;
  invoiceId: string | null;
  confirmableProposalId: string | null;
}

interface RawEnquiry {
  id: string;
  title: string | null;
  job_description: string;
  location: string;
  status: string | null;
  created_at: string | null;
  contractor_id: string | null;
  customer_id: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  customer_ts_code: string | null;
  budget_range: string | null;
  preferred_timeline: string | null;
  preferred_time_of_day: string | null;
  preferred_window_start: string | null;
  preferred_window_end: string | null;
  company_id: string | null;
}

interface RawQuote {
  id: string;
  quote_number: number;
  version: number;
  status: string;
  title: string;
  client_name: string;
  recipient_id: string | null;
  enquiry_id: string | null;
  sent_at: string | null;
  responded_at: string | null;
  rejected_at: string | null;
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
  deposit_required: boolean | null;
  deposit_paid: boolean | null;
  viewed_at: string | null;
}

interface RawJob {
  id: string;
  job_number: number;
  status: string;
  title: string;
  issued_quote_id: string | null;
  company_id: string | null;
  customer_id: string;
  contract_value: number | null;
  completed_at: string | null;
  contractor_signed_off_at: string | null;
  signed_off_at: string | null;
  sla_status: string | null;
  sla_completion_due: string | null;
  created_at: string;
  updated_at: string;
}

interface RawInvoice {
  id: string;
  invoice_number: number;
  status: string;
  job_id: string | null;
  client_name: string;
  recipient_id: string | null;
  created_at: string;
  sent_at: string | null;
}

interface RawScheduleEvent {
  id: string;
  quote_id: string | null;
  event_type: string;
  status: string;
  is_confirmed: boolean | null;
  proposed_by: string | null;
  cycle: number;
  created_at: string;
  updated_at: string;
}

function daysSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 86_400_000;
}

function resolveSchedulingSubstate(
  events: RawScheduleEvent[],
  contractorId: string,
  acceptedAtIso: string,
  deposit: { required: boolean; paid: boolean },
): {
  band: PipelineBand;
  action: string;
  tone: PresenterTone;
  waitingOn: WaitingOn;
  sinceIso: string;
  confirmableProposalId: string | null;
} {
  // Cycle now reads directly off the `cycle` column (bumped by
  // cancelScheduling's marker row) — no more inferring cycle boundaries from
  // marker created_at timestamps.
  const currentCycle = events.length ? Math.max(...events.map((e) => e.cycle)) : 1;
  const proposals = events.filter((e) => e.event_type === PROPOSAL_EVENT_TYPE && e.cycle === currentCycle);

  const confirmed = proposals.find((p) => p.is_confirmed || p.status === "accepted") ?? null;
  if (confirmed) {
    // The chosen slot is confirmed the moment accept_quote_with_slot runs,
    // even when a deposit is still outstanding — the true bottleneck in
    // that case is the deposit, not the date, so present it as that
    // instead of a generic "awaiting job confirmation".
    const result = deposit.required && !deposit.paid
      ? presentState({ kind: "quote", status: "accepted", depositRequired: true, depositPaid: false }, "contractor")
      : presentState({ kind: "scheduling", substate: "confirmed_awaiting_job" }, "contractor");
    return {
      band: result.tone === "action" ? "needs_you" : "waiting",
      action: result.label,
      tone: result.tone,
      waitingOn: result.waitingOn,
      sinceIso: confirmed.updated_at ?? confirmed.created_at,
      confirmableProposalId: null,
    };
  }

  const pendingFromOther = proposals.filter(
    (p) => p.status === "proposed" && !p.is_confirmed && p.proposed_by !== contractorId,
  );
  if (pendingFromOther.length > 0) {
    const oldest = pendingFromOther.reduce((a, b) => (a.created_at < b.created_at ? a : b));
    const result = presentState({ kind: "scheduling", substate: "pending", proposedByViewer: false }, "contractor");
    return {
      band: "needs_you",
      action: result.label,
      tone: result.tone,
      waitingOn: result.waitingOn,
      sinceIso: oldest.created_at,
      confirmableProposalId: pendingFromOther.length === 1 ? pendingFromOther[0].id : null,
    };
  }

  const pendingFromMe = proposals.filter(
    (p) => p.status === "proposed" && !p.is_confirmed && p.proposed_by === contractorId,
  );
  if (pendingFromMe.length > 0) {
    const oldest = pendingFromMe.reduce((a, b) => (a.created_at < b.created_at ? a : b));
    const result = presentState({ kind: "scheduling", substate: "pending", proposedByViewer: true }, "contractor");
    return {
      band: "waiting",
      action: result.label,
      tone: result.tone,
      waitingOn: result.waitingOn,
      sinceIso: oldest.created_at,
      confirmableProposalId: null,
    };
  }

  // Nothing pending from anyone and nothing confirmed: the dead-end state
  // (both parties out of ordinary turns) — previously described in plain
  // words ("Agree a date via message or final offer") with no distinct
  // tone, now the presenter's explicit dead_end case.
  const lastActivity = events.reduce((max, e) => (e.updated_at > max ? e.updated_at : max), acceptedAtIso);
  const result = presentState({ kind: "scheduling", substate: "dead_end" }, "contractor");
  return {
    band: "needs_you",
    action: result.label,
    tone: result.tone,
    waitingOn: result.waitingOn,
    sinceIso: lastActivity,
    confirmableProposalId: null,
  };
}

const JOB_STAGE_LABELS: Record<string, string> = {
  scheduled: "Scheduled",
  in_progress: "In progress",
  snagging: "Snagging",
  complete: "Complete",
};

export function useContractorPipeline() {
  const [engagements, setEngagements] = useState<PipelineEngagement[]>([]);
  const [loading, setLoading] = useState(true);

  // `silent` powers the tab-focus-return refresh below: fresh data is
  // fetched, but `loading` never flips, so the card list isn't swapped for
  // a spinner mid-visit — stale cards stay mounted (same `key`s) and just
  // re-render with new props once `setEngagements` resolves.
  const fetchPipeline = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false;
    if (!silent) setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setEngagements([]);
      if (!silent) setLoading(false);
      return;
    }

    const { data: profileRow } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    const contractorId = profileRow?.id;
    if (!contractorId) {
      setEngagements([]);
      if (!silent) setLoading(false);
      return;
    }

    const [enquiriesRes, quotesRes, jobsRes, invoicesRes] = await Promise.all([
      supabase
        .from("enquiries")
        .select(
          "id, title, job_description, location, status, created_at, contractor_id, customer_id, customer_name, customer_email, customer_phone, customer_ts_code, budget_range, preferred_timeline, preferred_time_of_day, preferred_window_start, preferred_window_end, company_id",
        )
        .eq("contractor_id", contractorId)
        .in("status", ["new", "replied"]),
      supabase
        .from("issued_quotes")
        .select(
          "id, quote_number, version, status, title, client_name, recipient_id, enquiry_id, sent_at, responded_at, rejected_at, accepted_at, created_at, updated_at, deposit_required, deposit_paid, viewed_at",
        )
        .eq("contractor_id", contractorId),
      supabase
        .from("jobs")
        .select(
          "id, job_number, status, title, issued_quote_id, company_id, customer_id, contract_value, completed_at, contractor_signed_off_at, signed_off_at, sla_status, sla_completion_due, created_at, updated_at",
        )
        .eq("contractor_id", contractorId)
        .neq("status", "cancelled"),
      supabase
        .from("invoices")
        .select("id, invoice_number, status, job_id, client_name, recipient_id, created_at, sent_at")
        .eq("contractor_id", contractorId),
    ]);

    const rawEnquiries = (enquiriesRes.data as RawEnquiry[]) ?? [];
    const rawQuotes = (quotesRes.data as RawQuote[]) ?? [];
    const rawJobs = (jobsRes.data as RawJob[]) ?? [];
    const rawInvoices = (invoicesRes.data as RawInvoice[]) ?? [];

    // Which quotes are still candidates for the 'scheduling' stage (accepted,
    // no live job for any version of that quote_number) — only those need
    // schedule_events. Selected by the accepted version itself, not by
    // version rank — an unrelated newer draft/rejected sibling must not hide
    // the accepted version that's actually driving scheduling.
    const quoteById = new Map(rawQuotes.map((q) => [q.id, q]));
    const jobByQuoteId = new Map<string, RawJob>();
    for (const job of rawJobs) {
      if (job.issued_quote_id) jobByQuoteId.set(job.issued_quote_id, job);
    }
    const quotesByNumber = new Map<number, RawQuote[]>();
    for (const q of rawQuotes) {
      quotesByNumber.set(q.quote_number, [...(quotesByNumber.get(q.quote_number) ?? []), q]);
    }
    const hasJobForNumber = (quoteNumber: number) =>
      (quotesByNumber.get(quoteNumber) ?? []).some((q) => jobByQuoteId.has(q.id));

    const schedulingQuoteIds: string[] = [];
    for (const [quoteNumber, versions] of quotesByNumber) {
      if (hasJobForNumber(quoteNumber)) continue;
      const acceptedVersion = versions
        .filter((v) => v.status === "accepted")
        .reduce<RawQuote | undefined>((a, b) => (!a || b.version > a.version ? b : a), undefined);
      if (acceptedVersion) schedulingQuoteIds.push(acceptedVersion.id);
    }

    const scheduleEventsRes = schedulingQuoteIds.length
      ? await supabase
          .from("schedule_events")
          .select("id, quote_id, event_type, status, is_confirmed, proposed_by, cycle, created_at, updated_at")
          .in("quote_id", schedulingQuoteIds)
      : { data: [] as RawScheduleEvent[] };
    const scheduleEvents = (scheduleEventsRes.data as RawScheduleEvent[]) ?? [];
    const eventsByQuoteId = new Map<string, RawScheduleEvent[]>();
    for (const e of scheduleEvents) {
      if (!e.quote_id) continue;
      eventsByQuoteId.set(e.quote_id, [...(eventsByQuoteId.get(e.quote_id) ?? []), e]);
    }

    // Batch-resolve client TS codes for quote/job/invoice-stage engagements
    // that carry a registered recipient (guest quotes have none).
    const recipientIds = new Set<string>();
    for (const q of rawQuotes) if (q.recipient_id) recipientIds.add(q.recipient_id);
    for (const j of rawJobs) if (j.customer_id) recipientIds.add(j.customer_id);
    for (const i of rawInvoices) if (i.recipient_id) recipientIds.add(i.recipient_id);
    const profilesRes = recipientIds.size
      ? await supabase.from("profiles").select("id, full_name, ts_profile_code").in("id", Array.from(recipientIds))
      : { data: [] as { id: string; full_name: string | null; ts_profile_code: string | null }[] };
    const profileById = new Map((profilesRes.data ?? []).map((p) => [p.id, p]));

    const invoicesByJobId = new Map<string, RawInvoice[]>();
    for (const inv of rawInvoices) {
      if (inv.job_id) invoicesByJobId.set(inv.job_id, [...(invoicesByJobId.get(inv.job_id) ?? []), inv]);
    }

    const out: PipelineEngagement[] = [];

    // ---- enquiry stage ----
    for (const enq of rawEnquiries) {
      // The fetch already filters to status IN ('new','replied') at the
      // query level, but that's a query-time constraint, not a type-level
      // guarantee — narrow properly rather than casting, and skip the card
      // entirely if a future value somehow slips through unrecognised
      // rather than crashing the whole pipeline render on it.
      const enquiryState = toEnquiryState(enq.status);
      if (!enquiryState) continue;
      const enquiryResult = presentState(enquiryState, "contractor");
      out.push({
        key: `enquiry:${enq.id}`,
        clientName: enq.customer_name ?? "Client",
        clientCode: enq.customer_ts_code ?? null,
        companyId: enq.company_id ?? null,
        title: enq.title ?? enq.job_description,
        stage: "enquiry",
        stageLabel: "Enquiry",
        reference: null,
        band: enquiryResult.tone === "action" ? "needs_you" : "waiting",
        action: enquiryResult.label,
        tone: enquiryResult.tone,
        waitingOn: enquiryResult.waitingOn,
        sinceIso: enq.created_at ?? new Date().toISOString(),
        overdue: false,
        slaStatus: null,
        slaCompletionDue: null,
        enquiryRef: {
          id: enq.id,
          contractor_id: enq.contractor_id,
          customer_id: enq.customer_id,
          customer_name: enq.customer_name,
          customer_email: enq.customer_email,
          customer_phone: enq.customer_phone,
          job_description: enq.job_description,
          location: enq.location,
          preferred_timeline: enq.preferred_timeline,
          preferred_time_of_day: enq.preferred_time_of_day,
          preferred_window_start: enq.preferred_window_start,
          preferred_window_end: enq.preferred_window_end,
          budget_range: enq.budget_range,
          status: enq.status,
        },
        quoteId: null,
        jobId: null,
        invoiceId: null,
        confirmableProposalId: null,
      });
    }

    // ---- quote_sent / scheduling / job / invoice stages, per quote_number ----
    for (const [quoteNumber, versions] of quotesByNumber) {
      const job = versions.map((v) => jobByQuoteId.get(v.id)).find((j): j is RawJob => !!j);
      const jobQuote = job ? versions.find((v) => v.id === job.issued_quote_id) : undefined;
      const acceptedVersion = versions
        .filter((v) => v.status === "accepted")
        .reduce<RawQuote | undefined>((a, b) => (!a || b.version > a.version ? b : a), undefined);
      const nonDraftVersions = versions.filter((v) => v.status !== "draft");
      const latestNonDraft = nonDraftVersions.length
        ? nonDraftVersions.reduce((a, b) => (b.version > a.version ? b : a))
        : undefined;
      const latestVersion = versions.reduce((a, b) => (b.version > a.version ? b : a));

      // Semantic selector, not version-rank: the version governing the
      // engagement's stage is whichever already has a job, else whichever is
      // currently accepted, else the newest non-draft version for display.
      // Picking by raw "highest version wins" let any unrelated newer
      // draft/expired/rejected/superseded sibling mask a live job or an
      // accepted-but-unscheduled version — this closes that whole class
      // rather than just the single unsent-draft instance.
      const governing = jobQuote ?? acceptedVersion ?? latestNonDraft;

      const clientProfile = governing?.recipient_id ? profileById.get(governing.recipient_id) : undefined;
      const clientCode = clientProfile?.ts_profile_code ?? null;

      let skipDraftCard = false;

      if (job && jobQuote) {
        const liveInvoice = (invoicesByJobId.get(job.id) ?? [])
          .filter((i) => i.status !== "void")
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

        if (liveInvoice?.status === "paid") {
          skipDraftCard = true; // paid-and-done — excluded entirely
        } else if (liveInvoice) {
          const invoiceResult = presentOrNeutral(toInvoiceState(liveInvoice.status), "contractor", liveInvoice.status);
          out.push({
            key: `invoice:${liveInvoice.id}`,
            clientName: liveInvoice.client_name || jobQuote.client_name,
            clientCode,
            companyId: job.company_id,
            title: job.title ?? jobQuote.title,
            stage: "invoice",
            stageLabel: liveInvoice.status === "overdue" ? "Invoice overdue" : liveInvoice.status === "sent" ? "Invoice sent" : "Invoice draft",
            reference: formatInvoiceRef(liveInvoice.invoice_number),
            band: invoiceResult.tone === "action" ? "needs_you" : "waiting",
            action: invoiceResult.label,
            tone: invoiceResult.tone,
            waitingOn: invoiceResult.waitingOn,
            sinceIso: liveInvoice.sent_at ?? liveInvoice.created_at,
            overdue: liveInvoice.status === "overdue",
            slaStatus: job.sla_status,
            slaCompletionDue: job.sla_completion_due,
            enquiryRef: null,
            quoteId: jobQuote.id,
            jobId: job.id,
            invoiceId: liveInvoice.id,
            confirmableProposalId: null,
          });
        } else if (job.status === "complete") {
          const needsSignOff = !job.contractor_signed_off_at;
          const jobResult = presentState(toJobState("complete", !needsSignOff)!, "contractor");
          out.push({
            key: `job:${job.id}`,
            clientName: jobQuote.client_name,
            clientCode,
            companyId: job.company_id,
            title: job.title ?? jobQuote.title,
            stage: "job",
            stageLabel: "Complete",
            reference: formatJobRef(job.job_number),
            band: jobResult.tone === "action" ? "needs_you" : "waiting",
            action: jobResult.label,
            tone: jobResult.tone,
            waitingOn: jobResult.waitingOn,
            sinceIso: needsSignOff ? job.completed_at ?? job.updated_at : job.contractor_signed_off_at!,
            overdue: false,
            slaStatus: job.sla_status,
            slaCompletionDue: job.sla_completion_due,
            enquiryRef: null,
            quoteId: jobQuote.id,
            jobId: job.id,
            invoiceId: null,
            confirmableProposalId: null,
          });
        } else {
          const jobResult = presentOrNeutral(toJobState(job.status), "contractor", job.status);
          out.push({
            key: `job:${job.id}`,
            clientName: jobQuote.client_name,
            clientCode,
            companyId: job.company_id,
            title: job.title ?? jobQuote.title,
            stage: "job",
            stageLabel: JOB_STAGE_LABELS[job.status] ?? job.status,
            reference: formatJobRef(job.job_number),
            band: jobResult.tone === "action" ? "needs_you" : "waiting",
            action: jobResult.label,
            tone: jobResult.tone,
            waitingOn: jobResult.waitingOn,
            sinceIso: job.created_at,
            overdue: false,
            slaStatus: job.sla_status,
            slaCompletionDue: job.sla_completion_due,
            enquiryRef: null,
            quoteId: jobQuote.id,
            jobId: job.id,
            invoiceId: null,
            confirmableProposalId: null,
          });
        }
      } else if (governing?.status === "accepted") {
        // No job yet — scheduling, driven by the accepted version.
        const substate = resolveSchedulingSubstate(
          eventsByQuoteId.get(governing.id) ?? [],
          contractorId,
          governing.accepted_at ?? governing.created_at,
          { required: !!governing.deposit_required, paid: !!governing.deposit_paid },
        );
        out.push({
          key: `scheduling:${governing.id}`,
          clientName: governing.client_name,
          clientCode,
          companyId: null,
          title: governing.title,
          stage: "scheduling",
          stageLabel: "Scheduling",
          reference: formatQuoteRef(governing.quote_number, { version: governing.version > 1 ? governing.version : undefined }),
          band: substate.band,
          action: substate.action,
          tone: substate.tone,
          waitingOn: substate.waitingOn,
          sinceIso: substate.sinceIso,
          overdue: false,
          slaStatus: null,
          slaCompletionDue: null,
          enquiryRef: null,
          quoteId: governing.id,
          jobId: null,
          invoiceId: null,
          confirmableProposalId: substate.confirmableProposalId,
        });
      } else if (governing?.status === "sent") {
        const sentResult = presentState({ kind: "quote", status: "sent", viewed: !!governing.viewed_at }, "contractor");
        out.push({
          key: `quote:${governing.id}`,
          clientName: governing.client_name,
          clientCode,
          companyId: null,
          title: governing.title,
          stage: "quote_sent",
          stageLabel: "Quote sent",
          reference: formatQuoteRef(governing.quote_number, { version: governing.version > 1 ? governing.version : undefined }),
          band: sentResult.tone === "action" ? "needs_you" : "waiting",
          action: sentResult.label,
          tone: sentResult.tone,
          waitingOn: sentResult.waitingOn,
          sinceIso: governing.sent_at ?? governing.created_at,
          overdue: false,
          slaStatus: null,
          slaCompletionDue: null,
          enquiryRef: null,
          quoteId: governing.id,
          jobId: null,
          invoiceId: null,
          confirmableProposalId: null,
        });
      } else if (governing?.status === "rejected") {
        const since = governing.rejected_at ?? governing.responded_at ?? governing.updated_at;
        if (daysSince(since) <= REJECTED_QUOTE_GRACE_DAYS) {
          const rejectedResult = presentState(
            { kind: "quote", status: "rejected", withinFollowUpWindow: true },
            "contractor",
          );
          out.push({
            key: `quote:${governing.id}`,
            clientName: governing.client_name,
            clientCode,
            companyId: null,
            title: governing.title,
            stage: "quote_sent",
            stageLabel: "Quote declined",
            reference: formatQuoteRef(governing.quote_number, { version: governing.version > 1 ? governing.version : undefined }),
            band: rejectedResult.tone === "action" ? "needs_you" : "waiting",
            action: rejectedResult.label,
            tone: rejectedResult.tone,
            waitingOn: rejectedResult.waitingOn,
            sinceIso: since,
            overdue: false,
            slaStatus: null,
            slaCompletionDue: null,
            enquiryRef: null,
            quoteId: governing.id,
            jobId: null,
            invoiceId: null,
            confirmableProposalId: null,
          });
        }
      }
      // else governing is undefined: every version is an unsent draft — no
      // engagement, same as before. This also silently covers governing
      // being DEFINED with a status no branch above handles (e.g.
      // 'lapsed', set by EngagementThread.tsx) — no lapsed branch is
      // intentional: a lapsed quote produces no pipeline card. That's
      // exclusion by absence of a branch, not a fetch filter — if this
      // chain ever gains a case that should also exclude lapsed quotes
      // from view, remember this fallthrough is silent and easy to break
      // by accidentally adding a catch-all branch here.

      // An unsent draft revision beyond whatever's governing the engagement
      // gets its own card so it can't mask the governing stage above it.
      if (!skipDraftCard && governing && latestVersion.status === "draft" && latestVersion.id !== governing.id) {
        const draftResult = presentState({ kind: "quote", status: "draft" }, "contractor");
        out.push({
          key: `draft:${latestVersion.id}`,
          clientName: latestVersion.client_name,
          clientCode,
          companyId: null,
          title: latestVersion.title,
          stage: "quote_sent",
          stageLabel: "Draft revision",
          reference: formatQuoteRef(latestVersion.quote_number, { version: latestVersion.version }),
          band: "needs_you",
          action: "Send revised quote",
          tone: draftResult.tone,
          waitingOn: draftResult.waitingOn,
          sinceIso: latestVersion.created_at,
          overdue: false,
          slaStatus: null,
          slaCompletionDue: null,
          enquiryRef: null,
          quoteId: latestVersion.id,
          jobId: null,
          invoiceId: null,
          confirmableProposalId: null,
        });
      }
    }

    // B7: action-needed first, then recency (oldest-waiting-on-you first
    // within that group) — needing action always outranks how long
    // something's simply been sitting waiting on the other party.
    out.sort((a, b) => {
      if (a.band !== b.band) return a.band === "needs_you" ? -1 : 1;
      return new Date(a.sinceIso).getTime() - new Date(b.sinceIso).getTime();
    });
    setEngagements(out);
    if (!silent) setLoading(false);
  }, []);

  useEffect(() => {
    fetchPipeline();
  }, [fetchPipeline]);

  // Fresh data on tab-focus-return is desirable, but must never re-arm the
  // loading gate — that would swap the card list for a spinner and undo
  // whatever the contractor was mid-way through reading. `key={e.key}` on
  // each PipelineCard (see ContractorDashboard.tsx) is already a stable
  // per-engagement id rather than an array index, so replacing `engagements`
  // in place reconciles onto the same DOM nodes without a remount.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void fetchPipeline({ silent: true });
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [fetchPipeline]);

  return { engagements, loading, refetch: fetchPipeline };
}
