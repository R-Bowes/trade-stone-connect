import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatInvoiceRef, formatJobRef, formatQuoteRef } from "@/lib/documentRefs";

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
const CANCELLED_MARKER_EVENT_TYPE = "scheduling_cancelled";
const POST_EXHAUSTION_TITLE = "Quote schedule proposal (agreed date)";
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
  budget_range: string | null;
  status: string | null;
}

export interface PipelineEngagement {
  key: string;
  clientName: string;
  clientCode: string | null;
  companyId: string | null;
  stage: PipelineStage;
  stageLabel: string;
  reference: string | null;
  band: PipelineBand;
  action: string;
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
  company_id: string | null;
}

interface RawQuote {
  id: string;
  quote_number: number;
  version: number;
  status: string;
  client_name: string;
  recipient_id: string | null;
  enquiry_id: string | null;
  sent_at: string | null;
  responded_at: string | null;
  rejected_at: string | null;
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
}

interface RawJob {
  id: string;
  job_number: number;
  status: string;
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
  title: string;
  status: string;
  is_confirmed: boolean | null;
  proposed_by: string | null;
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
): {
  band: PipelineBand;
  action: string;
  sinceIso: string;
  confirmableProposalId: string | null;
} {
  const proposals = events.filter((e) => e.event_type === PROPOSAL_EVENT_TYPE);
  const markers = events.filter((e) => e.event_type === CANCELLED_MARKER_EVENT_TYPE);
  const lastCancelledAt = markers.length
    ? markers.reduce((max, m) => (m.created_at > max ? m.created_at : max), markers[0].created_at)
    : null;
  const currentCycle = proposals.filter(
    (p) => p.title !== POST_EXHAUSTION_TITLE && (!lastCancelledAt || p.created_at > lastCancelledAt),
  );

  const confirmed = proposals.find((p) => p.is_confirmed || p.status === "accepted") ?? null;
  if (confirmed) {
    return {
      band: "waiting",
      action: "Awaiting client job confirmation",
      sinceIso: confirmed.updated_at ?? confirmed.created_at,
      confirmableProposalId: null,
    };
  }

  const pendingFromOther = currentCycle.filter(
    (p) => p.status === "proposed" && !p.is_confirmed && p.proposed_by !== contractorId,
  );
  if (pendingFromOther.length > 0) {
    const oldest = pendingFromOther.reduce((a, b) => (a.created_at < b.created_at ? a : b));
    return {
      band: "needs_you",
      action: "Confirm or counter dates",
      sinceIso: oldest.created_at,
      confirmableProposalId: pendingFromOther.length === 1 ? pendingFromOther[0].id : null,
    };
  }

  const pendingFromMe = currentCycle.filter(
    (p) => p.status === "proposed" && !p.is_confirmed && p.proposed_by === contractorId,
  );
  if (pendingFromMe.length > 0) {
    const oldest = pendingFromMe.reduce((a, b) => (a.created_at < b.created_at ? a : b));
    return {
      band: "waiting",
      action: "Awaiting response",
      sinceIso: oldest.created_at,
      confirmableProposalId: null,
    };
  }

  const lastActivity = events.reduce((max, e) => (e.updated_at > max ? e.updated_at : max), acceptedAtIso);
  return {
    band: "needs_you",
    action: "Agree a date via message or final offer",
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

  const fetchPipeline = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setEngagements([]);
      setLoading(false);
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
      setLoading(false);
      return;
    }

    const [enquiriesRes, quotesRes, jobsRes, invoicesRes] = await Promise.all([
      supabase
        .from("enquiries")
        .select(
          "id, title, job_description, location, status, created_at, contractor_id, customer_id, customer_name, customer_email, customer_phone, customer_ts_code, budget_range, preferred_timeline, company_id",
        )
        .eq("contractor_id", contractorId)
        .in("status", ["new", "replied"]),
      supabase
        .from("issued_quotes")
        .select(
          "id, quote_number, version, status, client_name, recipient_id, enquiry_id, sent_at, responded_at, rejected_at, accepted_at, created_at, updated_at",
        )
        .eq("contractor_id", contractorId),
      supabase
        .from("jobs")
        .select(
          "id, job_number, status, issued_quote_id, company_id, customer_id, contract_value, completed_at, contractor_signed_off_at, signed_off_at, sla_status, sla_completion_due, created_at, updated_at",
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
    // schedule_events.
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

    const schedulingQuoteIds = rawQuotes
      .filter((q) => {
        const versions = quotesByNumber.get(q.quote_number) ?? [];
        const latest = versions.reduce((a, b) => (b.version > a.version ? b : a));
        return latest.id === q.id && latest.status === "accepted" && !hasJobForNumber(q.quote_number);
      })
      .map((q) => q.id);

    const scheduleEventsRes = schedulingQuoteIds.length
      ? await supabase
          .from("schedule_events")
          .select("id, quote_id, event_type, title, status, is_confirmed, proposed_by, created_at, updated_at")
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
      out.push({
        key: `enquiry:${enq.id}`,
        clientName: enq.customer_name ?? "Client",
        clientCode: enq.customer_ts_code ?? null,
        companyId: enq.company_id ?? null,
        stage: "enquiry",
        stageLabel: "Enquiry",
        reference: null,
        band: "needs_you",
        action: "Respond to enquiry",
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
      const latest = versions.reduce((a, b) => (b.version > a.version ? b : a));
      const job = versions.map((v) => jobByQuoteId.get(v.id)).find((j): j is RawJob => !!j);
      const clientProfile = latest.recipient_id ? profileById.get(latest.recipient_id) : undefined;
      const clientCode = clientProfile?.ts_profile_code ?? null;

      if (job) {
        const liveInvoice = (invoicesByJobId.get(job.id) ?? [])
          .filter((i) => i.status !== "void")
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

        if (liveInvoice) {
          if (liveInvoice.status === "paid") continue; // paid-and-done — excluded entirely

          out.push({
            key: `invoice:${liveInvoice.id}`,
            clientName: liveInvoice.client_name || latest.client_name,
            clientCode,
            companyId: job.company_id,
            stage: "invoice",
            stageLabel: liveInvoice.status === "overdue" ? "Invoice overdue" : liveInvoice.status === "sent" ? "Invoice sent" : "Invoice draft",
            reference: formatInvoiceRef(liveInvoice.invoice_number),
            band: liveInvoice.status === "draft" ? "needs_you" : "waiting",
            action: liveInvoice.status === "draft" ? "Send invoice" : "Awaiting payment",
            sinceIso: liveInvoice.sent_at ?? liveInvoice.created_at,
            overdue: liveInvoice.status === "overdue",
            slaStatus: job.sla_status,
            slaCompletionDue: job.sla_completion_due,
            enquiryRef: null,
            quoteId: latest.id,
            jobId: job.id,
            invoiceId: liveInvoice.id,
            confirmableProposalId: null,
          });
          continue;
        }

        if (job.status === "complete") {
          const needsSignOff = !job.contractor_signed_off_at;
          out.push({
            key: `job:${job.id}`,
            clientName: latest.client_name,
            clientCode,
            companyId: job.company_id,
            stage: "job",
            stageLabel: "Complete",
            reference: formatJobRef(job.job_number),
            band: "needs_you",
            action: needsSignOff ? "Sign off" : "Invoice?",
            sinceIso: needsSignOff ? job.completed_at ?? job.updated_at : job.contractor_signed_off_at!,
            overdue: false,
            slaStatus: job.sla_status,
            slaCompletionDue: job.sla_completion_due,
            enquiryRef: null,
            quoteId: latest.id,
            jobId: job.id,
            invoiceId: null,
            confirmableProposalId: null,
          });
          continue;
        }

        out.push({
          key: `job:${job.id}`,
          clientName: latest.client_name,
          clientCode,
          companyId: job.company_id,
          stage: "job",
          stageLabel: JOB_STAGE_LABELS[job.status] ?? job.status,
          reference: formatJobRef(job.job_number),
          band: "needs_you",
          action: job.status === "snagging" ? "Resolve snags" : "Progress job",
          sinceIso: job.created_at,
          overdue: false,
          slaStatus: job.sla_status,
          slaCompletionDue: job.sla_completion_due,
          enquiryRef: null,
          quoteId: latest.id,
          jobId: job.id,
          invoiceId: null,
          confirmableProposalId: null,
        });
        continue;
      }

      // No job yet — quote_sent or scheduling.
      if (latest.status === "accepted") {
        const substate = resolveSchedulingSubstate(
          eventsByQuoteId.get(latest.id) ?? [],
          contractorId,
          latest.accepted_at ?? latest.created_at,
        );
        out.push({
          key: `scheduling:${latest.id}`,
          clientName: latest.client_name,
          clientCode,
          companyId: null,
          stage: "scheduling",
          stageLabel: "Scheduling",
          reference: formatQuoteRef(latest.quote_number, { version: latest.version > 1 ? latest.version : undefined }),
          band: substate.band,
          action: substate.action,
          sinceIso: substate.sinceIso,
          overdue: false,
          slaStatus: null,
          slaCompletionDue: null,
          enquiryRef: null,
          quoteId: latest.id,
          jobId: null,
          invoiceId: null,
          confirmableProposalId: substate.confirmableProposalId,
        });
      } else if (latest.status === "sent") {
        out.push({
          key: `quote:${latest.id}`,
          clientName: latest.client_name,
          clientCode,
          companyId: null,
          stage: "quote_sent",
          stageLabel: "Quote sent",
          reference: formatQuoteRef(latest.quote_number, { version: latest.version > 1 ? latest.version : undefined }),
          band: "waiting",
          action: "Awaiting client response",
          sinceIso: latest.sent_at ?? latest.created_at,
          overdue: false,
          slaStatus: null,
          slaCompletionDue: null,
          enquiryRef: null,
          quoteId: latest.id,
          jobId: null,
          invoiceId: null,
          confirmableProposalId: null,
        });
      } else if (latest.status === "rejected") {
        const since = latest.rejected_at ?? latest.responded_at ?? latest.updated_at;
        if (daysSince(since) <= REJECTED_QUOTE_GRACE_DAYS) {
          out.push({
            key: `quote:${latest.id}`,
            clientName: latest.client_name,
            clientCode,
            companyId: null,
            stage: "quote_sent",
            stageLabel: "Quote declined",
            reference: formatQuoteRef(latest.quote_number, { version: latest.version > 1 ? latest.version : undefined }),
            band: "needs_you",
            action: "Revise or follow up",
            sinceIso: since,
            overdue: false,
            slaStatus: null,
            slaCompletionDue: null,
            enquiryRef: null,
            quoteId: latest.id,
            jobId: null,
            invoiceId: null,
            confirmableProposalId: null,
          });
        }
      }
      // draft / expired / superseded latest versions: no engagement.
    }

    out.sort((a, b) => new Date(a.sinceIso).getTime() - new Date(b.sinceIso).getTime());
    setEngagements(out);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchPipeline();
  }, [fetchPipeline]);

  return { engagements, loading, refetch: fetchPipeline };
}
