import { supabase } from "@/integrations/supabase/client";
import type { PipelineEngagement, PipelineStage } from "@/hooks/useContractorPipeline";
import {
  presentState,
  toJobState,
  toInvoiceState,
  toWorkOrderState,
  toCostLineState,
  toEngagementRateState,
  type PresenterResult,
} from "@/lib/statusPresenter";
import { displayStatus, isOverdue, type InvoiceMoneyFields } from "@/lib/invoiceMoney";
import { formatJobRef, formatInvoiceRef } from "@/lib/documentRefs";
import { formatWoNumber } from "@/hooks/useWorkOrders";

/**
 * The unified work list's item shape (Step 0) and the two adapters that
 * populate it — one from useContractorPipeline's output, one from direct
 * dashboard queries. useContractorPipeline itself is never modified; its
 * "job" and "invoice" stage items are dropped here, at adapter level,
 * because the dashboard adapter below queries jobs/invoices directly for
 * every origin (quote, work order, engagement) and fully supersedes what
 * the pipeline only ever covered for quote-originated records. Pipeline
 * remains the sole source for Enquiry/Offer(quote)/Scheduling, where its
 * grace-period and schedule_events resolution logic isn't reproduced
 * anywhere else.
 */

export type WorkItemStage = "enquiry" | "offer" | "scheduling" | "work" | "completion" | "invoicing";

export const WORK_ITEM_STAGES: WorkItemStage[] = ["enquiry", "offer", "scheduling", "work", "completion", "invoicing"];

export const STAGE_LABEL: Record<WorkItemStage, string> = {
  enquiry: "Enquiry",
  offer: "Offer",
  scheduling: "Scheduling",
  work: "Work",
  completion: "Completion",
  invoicing: "Invoicing",
};

export interface WorkItem {
  key: string;
  kind: "enquiry" | "quote" | "work_order" | "job" | "invoice" | "cost_line" | "engagement_rate";
  /** null only for engagement_rate — stage-less, shown outside the stage filter. */
  stage: WorkItemStage | null;
  reference: string | null;
  title: string;
  counterparty: { name: string; code?: string | null };
  site: string | null;
  amount: number | null;
  sinceIso: string;
  dueIso: string | null;
  overdue: boolean;
  band: "needs_you" | "waiting";
  actionLabel: string;
  actionTarget: { tab: string; recordId?: string };
}

function bandFrom(result: PresenterResult): "needs_you" | "waiting" {
  return result.tone === "action" ? "needs_you" : "waiting";
}

// ── Adapter 1: useContractorPipeline's output ──────────────────────────────

const PIPELINE_STAGE_MAP: Partial<Record<PipelineStage, WorkItemStage>> = {
  enquiry: "enquiry",
  quote_sent: "offer",
  scheduling: "scheduling",
};

export function mapPipelineToWorkItems(engagements: PipelineEngagement[]): WorkItem[] {
  const items: WorkItem[] = [];
  for (const e of engagements) {
    const stage = PIPELINE_STAGE_MAP[e.stage];
    // "job" and "invoice" stage engagements are dropped here — see file
    // header. Everything else pipeline produces (enquiry/quote_sent/
    // scheduling) has no other source and is carried through as-is,
    // including its already-presenter-driven band/action.
    if (!stage) continue;

    items.push({
      key: e.key,
      kind: e.stage === "enquiry" ? "enquiry" : "quote",
      stage,
      reference: e.reference,
      title: e.title ?? e.clientName,
      counterparty: { name: e.clientName, code: e.clientCode },
      site: e.address,
      // PipelineEngagement carries no money field at all (Step 0 finding) —
      // pipeline-sourced items sort without an amount tiebreaker until the
      // pipeline itself is extended, which is out of scope here.
      amount: null,
      sinceIso: e.sinceIso,
      dueIso: null,
      overdue: e.overdue,
      band: e.band,
      actionLabel: e.action,
      actionTarget: {
        tab: e.stage === "enquiry" ? "enquiries" : "issued-quotes",
        recordId: e.quoteId ?? e.enquiryRef?.id ?? undefined,
      },
    });
  }
  return items;
}

// ── Adapter 2: dashboard queries ────────────────────────────────────────────

interface DashboardWorkItemsParams {
  /** profiles.id */
  contractorId: string;
  /** auth.uid() — equal to contractorId under the profiles CHECK invariant, kept distinct to match each table's own FK convention (work_orders keys off dispatched_to = auth.uid()). */
  userId: string;
}

const JOB_LIVE_STATUSES = ["scheduled", "in_progress", "snagging", "complete"] as const;
const WORK_ORDER_LIVE_STATUSES = ["dispatched", "accepted"] as const;

export async function fetchDashboardWorkItems({ contractorId, userId }: DashboardWorkItemsParams): Promise<WorkItem[]> {
  const items: WorkItem[] = [];

  // ---- Work orders: dispatched (Offer) / accepted (Work) ----
  const WORK_ORDER_SELECT = "id, wo_number, title, status, dispatched_at, site:sites(id, name), company:companies(name, company_code)" as const;
  const woRes = await supabase.from("work_orders").select(WORK_ORDER_SELECT).eq("dispatched_to", userId).in("status", WORK_ORDER_LIVE_STATUSES);
  if (woRes.error) {
    console.error("workItems: error loading work orders", woRes.error);
  } else {
    for (const wo of woRes.data ?? []) {
      const state = toWorkOrderState(wo.status);
      if (!state) continue;
      const result = presentState(state, "contractor");
      items.push({
        key: `work_order:${wo.id}`,
        kind: "work_order",
        stage: wo.status === "dispatched" ? "offer" : "work",
        reference: formatWoNumber(wo.company?.company_code ?? null, wo.wo_number),
        title: wo.title,
        counterparty: { name: wo.company?.name ?? "Business", code: wo.company?.company_code ?? null },
        site: wo.site?.name ?? null,
        amount: null,
        sinceIso: wo.dispatched_at ?? new Date(0).toISOString(),
        dueIso: null,
        overdue: false,
        band: bandFrom(result),
        actionLabel: result.label,
        actionTarget: { tab: "work-orders", recordId: wo.id },
      });
    }
  }

  // ---- Jobs: any origin. Not-complete -> Work; complete -> Completion,
  // unless a live (unpaid, non-void) invoice already exists for it, in
  // which case the invoice (below) represents it instead — mirrors the
  // pipeline's own invoice-before-completion precedence. ----
  const JOB_SELECT =
    "id, title, status, job_number, start_date, contract_value, engagement_id, customer_id, company_id, site_id, sla_completion_due, completed_at, contractor_signed_off_at, updated_at, created_at" as const;
  const jobsRes = await supabase.from("jobs").select(JOB_SELECT).eq("contractor_id", contractorId).in("status", JOB_LIVE_STATUSES);
  if (jobsRes.error) {
    console.error("workItems: error loading jobs", jobsRes.error);
  } else {
    const jobs = jobsRes.data ?? [];
    const completeJobIds = jobs.filter((j) => j.status === "complete").map((j) => j.id);

    let jobsWithLiveInvoice = new Set<string>();
    if (completeJobIds.length > 0) {
      const invRes = await supabase.from("invoices").select("job_id").in("job_id", completeJobIds).neq("status", "paid").neq("status", "void");
      if (invRes.error) console.error("workItems: error loading job invoices", invRes.error);
      else jobsWithLiveInvoice = new Set((invRes.data ?? []).map((r) => r.job_id).filter((id): id is string => !!id));
    }

    const siteIds = [...new Set(jobs.map((j) => j.site_id).filter((id): id is string => !!id))];
    const companyIds = [...new Set(jobs.map((j) => j.company_id).filter((id): id is string => !!id))];
    const customerIds = [...new Set(jobs.map((j) => j.customer_id).filter((id): id is string => !!id))];

    const [sitesRes, companiesRes, customersRes] = await Promise.all([
      siteIds.length > 0 ? supabase.from("sites").select("id, name").in("id", siteIds) : Promise.resolve({ data: [], error: null }),
      companyIds.length > 0 ? supabase.from("companies").select("id, name").in("id", companyIds) : Promise.resolve({ data: [], error: null }),
      customerIds.length > 0 ? supabase.from("profiles").select("id, full_name").in("id", customerIds) : Promise.resolve({ data: [], error: null }),
    ]);
    if (sitesRes.error) console.error("workItems: error loading job sites", sitesRes.error);
    if (companiesRes.error) console.error("workItems: error loading job companies", companiesRes.error);
    if (customersRes.error) console.error("workItems: error loading job customers", customersRes.error);

    const siteMap = new Map((sitesRes.data ?? []).map((s) => [s.id, s.name]));
    const companyMap = new Map((companiesRes.data ?? []).map((c) => [c.id, c.name]));
    const customerMap = new Map((customersRes.data ?? []).map((p) => [p.id, p.full_name]));

    for (const job of jobs) {
      if (job.status === "complete" && jobsWithLiveInvoice.has(job.id)) continue;

      const state = toJobState(job.status, !!job.contractor_signed_off_at);
      if (!state) continue;
      const result = presentState(state, "contractor");
      const counterpartyName = job.company_id
        ? companyMap.get(job.company_id) ?? "Business"
        : job.customer_id
          ? customerMap.get(job.customer_id) ?? "Client"
          : "Client";

      items.push({
        key: `job:${job.id}`,
        kind: "job",
        stage: job.status === "complete" ? "completion" : "work",
        reference: job.job_number != null ? formatJobRef(job.job_number) : null,
        title: job.title,
        counterparty: { name: counterpartyName },
        site: job.site_id ? siteMap.get(job.site_id) ?? null : null,
        // Engagement-origin jobs are always 0 on contract_value — they bill
        // through cost lines instead (see lib/jobValue.ts) — so amount is
        // deliberately left null rather than showing a misleading 0.
        amount: job.engagement_id ? null : job.contract_value,
        sinceIso: job.status === "complete" ? job.completed_at ?? job.updated_at : job.created_at,
        dueIso: job.start_date,
        overdue: job.status !== "complete" && !!job.sla_completion_due && new Date(job.sla_completion_due) < new Date(),
        band: bandFrom(result),
        actionLabel: result.label,
        actionTarget: { tab: "jobs", recordId: job.id },
      });
    }
  }

  // ---- Invoices: any origin, any non-terminal status ----
  const INVOICE_SELECT = "id, invoice_number, status, total, due_date, sent_at, created_at, client_name, deposit_amount, deposit_deducted, deposit_paid" as const;
  const invRes = await supabase.from("invoices").select(INVOICE_SELECT).eq("contractor_id", contractorId).neq("status", "paid").neq("status", "void");
  if (invRes.error) {
    console.error("workItems: error loading invoices", invRes.error);
  } else {
    for (const inv of invRes.data ?? []) {
      const moneyFields: InvoiceMoneyFields = inv;
      const state = toInvoiceState(displayStatus(moneyFields));
      if (!state) continue;
      const result = presentState(state, "contractor");
      items.push({
        key: `invoice:${inv.id}`,
        kind: "invoice",
        stage: "invoicing",
        reference: formatInvoiceRef(inv.invoice_number),
        title: inv.client_name,
        counterparty: { name: inv.client_name },
        site: null,
        amount: inv.total,
        sinceIso: inv.sent_at ?? inv.created_at,
        dueIso: inv.due_date,
        overdue: isOverdue(moneyFields),
        band: bandFrom(result),
        actionLabel: result.label,
        actionTarget: { tab: "invoices", recordId: inv.id },
      });
    }
  }

  // ---- Queried cost lines (Invoicing) ----
  const costRes = await supabase
    .from("work_order_costs")
    .select("id, work_order_id, line_total, queried_at, created_at")
    .eq("contractor_id", contractorId)
    .eq("status", "queried");
  if (costRes.error) {
    console.error("workItems: error loading queried cost lines", costRes.error);
  } else {
    const lines = costRes.data ?? [];
    const woIds = [...new Set(lines.map((l) => l.work_order_id))];
    const woInfoMap = new Map<string, { title: string; wo_number: number; company_name: string | null; company_code: string | null }>();
    if (woIds.length > 0) {
      const linkedWoRes = await supabase.from("work_orders").select("id, title, wo_number, company:companies(name, company_code)").in("id", woIds);
      if (linkedWoRes.error) {
        console.error("workItems: error loading work orders for queried cost lines", linkedWoRes.error);
      } else {
        for (const wo of linkedWoRes.data ?? []) {
          woInfoMap.set(wo.id, { title: wo.title, wo_number: wo.wo_number, company_name: wo.company?.name ?? null, company_code: wo.company?.company_code ?? null });
        }
      }
    }

    const queriedState = toCostLineState("queried");
    const queriedResult = queriedState ? presentState(queriedState, "contractor") : null;
    if (queriedResult) {
      for (const line of lines) {
        const wo = woInfoMap.get(line.work_order_id);
        items.push({
          key: `cost_line:${line.id}`,
          kind: "cost_line",
          stage: "invoicing",
          reference: wo ? formatWoNumber(wo.company_code, wo.wo_number) : null,
          title: wo?.title ?? "Queried cost line",
          counterparty: { name: wo?.company_name ?? "Business" },
          site: null,
          amount: line.line_total,
          sinceIso: line.queried_at ?? line.created_at,
          dueIso: null,
          overdue: false,
          band: bandFrom(queriedResult),
          actionLabel: queriedResult.label,
          actionTarget: { tab: "work-orders", recordId: line.work_order_id },
        });
      }
    }
  }

  // ---- Rates awaiting acceptance (stage-less) ----
  const engRes = await supabase.from("term_engagements").select("id, engagement_number, company_id").eq("contractor_id", contractorId).in("status", ["active", "suspended", "notice_given"]);
  if (engRes.error) {
    console.error("workItems: error loading engagements", engRes.error);
  } else {
    const engRows = engRes.data ?? [];
    if (engRows.length > 0) {
      const engIds = engRows.map((e) => e.id);
      const [ratesRes, companiesRes] = await Promise.all([
        supabase
          .from("engagement_rates")
          .select("id, engagement_id, version, effective_from, agreed_by_business_at, agreed_by_contractor_at")
          .in("engagement_id", engIds)
          .order("version", { ascending: false }),
        supabase.from("companies").select("id, name").in("id", [...new Set(engRows.map((e) => e.company_id))]),
      ]);
      if (ratesRes.error) console.error("workItems: error loading engagement rates", ratesRes.error);
      if (companiesRes.error) console.error("workItems: error loading engagement companies", companiesRes.error);

      if (!ratesRes.error && !companiesRes.error) {
        const latestRateByEngagement = new Map<string, { effective_from: string; agreed_by_business_at: string | null; agreed_by_contractor_at: string | null }>();
        for (const r of ratesRes.data ?? []) if (!latestRateByEngagement.has(r.engagement_id)) latestRateByEngagement.set(r.engagement_id, r);
        const companyMap = new Map((companiesRes.data ?? []).map((c) => [c.id, c.name]));

        for (const eng of engRows) {
          const rate = latestRateByEngagement.get(eng.id);
          if (!rate) continue;
          const state = toEngagementRateState(!!rate.agreed_by_business_at, !!rate.agreed_by_contractor_at);
          // Only the state where the contractor has something to do belongs
          // in this stage-less section — matches the original dashboard
          // section's exact scope, not every engagement-rate state.
          if (!(state.agreedByBusiness && !state.agreedByContractor)) continue;
          const result = presentState(state, "contractor");
          const companyName = companyMap.get(eng.company_id) ?? "Business";
          items.push({
            key: `engagement_rate:${eng.id}`,
            kind: "engagement_rate",
            stage: null,
            reference: eng.engagement_number,
            title: companyName,
            counterparty: { name: companyName },
            site: null,
            amount: null,
            sinceIso: rate.effective_from,
            dueIso: null,
            overdue: false,
            band: bandFrom(result),
            actionLabel: result.label,
            actionTarget: { tab: "engagements", recordId: eng.id },
          });
        }
      }
    }
  }

  return items;
}

// ── Merge + sort ────────────────────────────────────────────────────────────

function daysLate(item: WorkItem): number {
  if (!item.overdue || !item.dueIso) return 0;
  return Math.floor((Date.now() - new Date(item.dueIso).getTime()) / 86_400_000);
}

/**
 * One flat sort regardless of filter — stage is a filter, never a sort key.
 * 1. band: needs_you before waiting
 * 2. overdue, worst first by days late
 * 3. age, oldest first
 * 4. amount as a tiebreaker only
 */
export function compareWorkItems(a: WorkItem, b: WorkItem): number {
  if (a.band !== b.band) return a.band === "needs_you" ? -1 : 1;
  const overdueDiff = daysLate(b) - daysLate(a);
  if (overdueDiff !== 0) return overdueDiff;
  const ageDiff = new Date(a.sinceIso).getTime() - new Date(b.sinceIso).getTime();
  if (ageDiff !== 0) return ageDiff;
  return (b.amount ?? 0) - (a.amount ?? 0);
}

export function mergeWorkItems(pipelineItems: WorkItem[], dashboardItems: WorkItem[]): WorkItem[] {
  return [...pipelineItems, ...dashboardItems].sort(compareWorkItems);
}

export function countByStage(items: WorkItem[]): Record<WorkItemStage, number> {
  const counts: Record<WorkItemStage, number> = { enquiry: 0, offer: 0, scheduling: 0, work: 0, completion: 0, invoicing: 0 };
  for (const item of items) {
    if (item.stage) counts[item.stage] += 1;
  }
  return counts;
}
