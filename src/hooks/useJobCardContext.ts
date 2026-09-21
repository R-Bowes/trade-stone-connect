import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatWoNumber } from "@/hooks/useWorkOrders";
import type { JobCostSummary } from "@/lib/jobValue";

interface JobRefs {
  site_id: string | null;
  asset_id: string | null;
  work_order_id: string | null;
  engagement_id: string | null;
}

export interface JobWorkOrderInfo {
  id: string;
  ref: string;
  title: string;
  status: string;
  rate_snapshot: Record<string, unknown> | null;
  /** The work order's own site/asset — call-out jobs are minted without an asset_id. */
  site: { id: string; name: string } | null;
  asset: { id: string; name: string } | null;
}

export interface JobCardContext {
  sites: Record<string, { id: string; name: string }>;
  assets: Record<string, { id: string; name: string }>;
  workOrders: Record<string, JobWorkOrderInfo>;
  engagements: Record<string, string>;
  costs: Record<string, JobCostSummary>;
}

const EMPTY: JobCardContext = { sites: {}, assets: {}, workOrders: {}, engagements: {}, costs: {} };
const uniq = (values: (string | null)[]) => [...new Set(values.filter((v): v is string => !!v))];

/**
 * Looks up what a job card needs beyond the jobs row: site and asset names,
 * the linked work order (reference + rate snapshot), the engagement number,
 * and the work order's cost-line totals. Every query's error is checked; a
 * failed lookup leaves that part empty rather than showing wrong values.
 */
export function useJobCardContext(jobs: JobRefs[]) {
  const [ctx, setCtx] = useState<JobCardContext>(EMPTY);
  const key = jobs.map((j) => `${j.site_id}|${j.asset_id}|${j.work_order_id}|${j.engagement_id}`).join(",");

  const load = useCallback(async () => {
    const siteIds = uniq(jobs.map((j) => j.site_id));
    const assetIds = uniq(jobs.map((j) => j.asset_id));
    const woIds = uniq(jobs.map((j) => j.work_order_id));
    const engagementIds = uniq(jobs.map((j) => j.engagement_id));

    const [siteRes, assetRes, woRes, engRes, costRes] = await Promise.all([
      siteIds.length ? supabase.from("sites").select("id, name").in("id", siteIds) : Promise.resolve(null),
      assetIds.length ? supabase.from("assets").select("id, name").in("id", assetIds) : Promise.resolve(null),
      woIds.length
        ? supabase.from("work_orders").select("id, wo_number, title, status, rate_snapshot, company:companies(company_code), site:sites(id, name), asset:assets(id, name)").in("id", woIds)
        : Promise.resolve(null),
      engagementIds.length
        ? supabase.from("term_engagements").select("id, engagement_number").in("id", engagementIds)
        : Promise.resolve(null),
      woIds.length
        ? supabase.from("work_order_costs").select("work_order_id, status, line_total").in("work_order_id", woIds)
        : Promise.resolve(null),
    ]);

    for (const [name, res] of [["sites", siteRes], ["assets", assetRes], ["work orders", woRes], ["engagements", engRes], ["cost lines", costRes]] as const) {
      if (res?.error) console.error(`Job cards: failed to load ${name}`, res.error);
    }

    const next: JobCardContext = { sites: {}, assets: {}, workOrders: {}, engagements: {}, costs: {} };
    for (const s of siteRes?.data ?? []) next.sites[s.id] = s;
    for (const a of assetRes?.data ?? []) next.assets[a.id] = a;
    for (const w of woRes?.data ?? []) {
      next.workOrders[w.id] = {
        id: w.id,
        ref: formatWoNumber(w.company?.company_code, w.wo_number),
        title: w.title,
        status: w.status,
        rate_snapshot: (w.rate_snapshot as Record<string, unknown> | null) ?? null,
        site: w.site ?? null,
        asset: w.asset ?? null,
      };
    }
    for (const e of engRes?.data ?? []) next.engagements[e.id] = e.engagement_number;

    // Only when the cost query succeeded: a failed read must not look like
    // "no costs recorded".
    if (costRes && !costRes.error) {
      for (const woId of woIds) next.costs[woId] = { total: 0, approved: 0, lineCount: 0 };
      for (const c of costRes.data ?? []) {
        if (c.status === "rejected") continue;
        const summary = next.costs[c.work_order_id];
        const amount = Number(c.line_total);
        summary.total += amount;
        summary.lineCount += 1;
        if (c.status === "approved") summary.approved += amount;
      }
    }
    setCtx(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (jobs.length === 0) {
      setCtx(EMPTY);
      return;
    }
    void load();
  }, [load, jobs.length]);

  return { ctx, reload: load };
}

/**
 * A job's site/asset: its own column when set, otherwise the linked work
 * order's. create_callout_job mints jobs with no asset_id, so an engagement
 * job's asset lives only on its work order.
 */
export function resolveJobAsset(ctx: JobCardContext, job: { asset_id: string | null; work_order_id: string | null }) {
  if (job.asset_id && ctx.assets[job.asset_id]) return ctx.assets[job.asset_id];
  return job.work_order_id ? ctx.workOrders[job.work_order_id]?.asset ?? null : null;
}

export function resolveJobSite(ctx: JobCardContext, job: { site_id: string | null; work_order_id: string | null }) {
  if (job.site_id && ctx.sites[job.site_id]) return ctx.sites[job.site_id];
  return job.work_order_id ? ctx.workOrders[job.work_order_id]?.site ?? null : null;
}
