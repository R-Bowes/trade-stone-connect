import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { ScoreConfidence } from "@/lib/scoring";

export interface ContractorScoresRow {
  craft_score: number | null;
  craft_confidence: ScoreConfidence | null;
  craft_signal_count: number;
  service_score: number | null;
  service_confidence: ScoreConfidence | null;
  service_review_count: number;
  value_score: number | null;
  value_confidence: ScoreConfidence | null;
  value_signal_count: number;
  last_calculated_at: string | null;
}

export interface ScoreHistoryRow {
  score_type: "craft" | "service" | "value";
  score_value: number | null;
  confidence: ScoreConfidence | null;
  recorded_at: string;
}

export interface CraftBreakdown {
  timerWindowsClear: number;
  timerWindowsTotal: number;
  inspectionPassed: number;
  inspectionTotal: number;
  callbackCount: number;
  completedJobCount: number;
  warrantyHonoured: number;
  warrantyTotal: number;
  endorsementCount: number;
  photoDocumentedJobs: number;
}

export interface ServiceBreakdown {
  avgCommunication: number | null;
  avgReliability: number | null;
  avgPropertyRespect: number | null;
  avgExpectationManagement: number | null;
  acceptedJobCount: number;
  completedJobCount: number;
  cancelledJobCount: number;
  reviewCount: number;
}

export interface ValueBreakdown {
  avgVariancePct: number | null;
  transparencyYes: number;
  transparencyTotal: number;
  sampleSize: number;
}

export function useContractorScoreBreakdown() {
  const [loading, setLoading] = useState(true);
  const [contractorId, setContractorId] = useState<string | null>(null);
  const [tsCode, setTsCode] = useState<string | null>(null);
  const [scores, setScores] = useState<ContractorScoresRow | null>(null);
  const [history, setHistory] = useState<ScoreHistoryRow[]>([]);
  const [craft, setCraft] = useState<CraftBreakdown | null>(null);
  const [service, setService] = useState<ServiceBreakdown | null>(null);
  const [value, setValue] = useState<ValueBreakdown | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, ts_profile_code")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!profile) { setLoading(false); return; }
    setContractorId(profile.id);
    setTsCode(profile.ts_profile_code ?? null);

    const [
      scoresRes,
      historyRes,
      craftSignalsRes,
      timerWindowsRes,
      callbacksRes,
      endorsementsRes,
      reviewsRes,
      jobsRes,
    ] = await Promise.all([
      supabase.from("contractor_scores").select("*").eq("contractor_id", profile.id).maybeSingle(),
      supabase.from("contractor_score_history").select("score_type, score_value, confidence, recorded_at").eq("contractor_id", profile.id).order("recorded_at", { ascending: false }),
      supabase.from("craft_signals").select("signal_type, signal_value").eq("contractor_id", profile.id),
      supabase.from("craft_timer_windows").select("outcome").eq("contractor_id", profile.id),
      supabase.from("job_callbacks").select("fault_classification, additional_charge").eq("contractor_id", profile.id),
      supabase.from("peer_endorsements").select("id", { count: "exact", head: true }).eq("endorsed_id", profile.id),
      supabase.from("service_reviews").select("communication, reliability, property_respect, expectation_management, costs_communicated_clearly").eq("contractor_id", profile.id).eq("suppressed", false),
      supabase.from("jobs").select("id, status, issued_quote_id, completed_at").eq("contractor_id", profile.id),
    ]);

    setScores((scoresRes.data as ContractorScoresRow | null) ?? null);
    setHistory((historyRes.data as ScoreHistoryRow[]) ?? []);

    const jobs = jobsRes.data ?? [];
    const completedJobs = jobs.filter((j) => j.status === "complete");
    const cancelledJobs = jobs.filter((j) => j.status === "cancelled");

    // ── Craft breakdown ──────────────────────────────────────────────────
    const craftSignals = craftSignalsRes.data ?? [];
    const inspectionSignals = craftSignals.filter((s) =>
      s.signal_type === "inspection_pass" || s.signal_type === "inspection_remediation" || s.signal_type === "inspection_fail"
    );
    const timerWindows = timerWindowsRes.data ?? [];
    const callbacks = callbacksRes.data ?? [];
    const warrantyRelevant = callbacks.filter((c) => c.fault_classification === "original_fault");

    let photoDocumentedJobs = 0;
    if (completedJobs.length > 0) {
      const { data: photoRows } = await supabase
        .from("job_photos")
        .select("job_id, photo_stage")
        .in("job_id", completedJobs.map((j) => j.id))
        .not("photo_stage", "is", null)
        .not("tags", "cs", '{signature}');
      photoDocumentedJobs = new Set((photoRows ?? []).map((p) => p.job_id)).size;
    }

    setCraft({
      timerWindowsClear: timerWindows.filter((w) => w.outcome === "clear").length,
      timerWindowsTotal: timerWindows.length,
      inspectionPassed: craftSignals.filter((s) => s.signal_type === "inspection_pass").length,
      inspectionTotal: inspectionSignals.length,
      callbackCount: callbacks.length,
      completedJobCount: completedJobs.length,
      warrantyHonoured: warrantyRelevant.filter((c) => c.additional_charge === false).length,
      warrantyTotal: warrantyRelevant.length,
      endorsementCount: endorsementsRes.count ?? 0,
      photoDocumentedJobs,
    });

    // ── Service breakdown ────────────────────────────────────────────────
    const reviews = reviewsRes.data ?? [];
    const mean = (nums: number[]) => nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
    setService({
      avgCommunication: mean(reviews.map((r) => r.communication)),
      avgReliability: mean(reviews.map((r) => r.reliability)),
      avgPropertyRespect: mean(reviews.map((r) => r.property_respect)),
      avgExpectationManagement: mean(reviews.map((r) => r.expectation_management)),
      acceptedJobCount: jobs.length,
      completedJobCount: completedJobs.length,
      cancelledJobCount: cancelledJobs.length,
      reviewCount: reviews.length,
    });

    // ── Value breakdown ──────────────────────────────────────────────────
    const quoteInvoiceJobs = completedJobs.filter((j) => j.issued_quote_id);
    let variances: number[] = [];
    if (quoteInvoiceJobs.length > 0) {
      const quoteIds = quoteInvoiceJobs.map((j) => j.issued_quote_id!).filter(Boolean);
      const [quotesRes, invoicesRes] = await Promise.all([
        supabase.from("issued_quotes").select("id, total").in("id", quoteIds),
        supabase.from("invoices").select("job_id, total, created_at").in("job_id", quoteInvoiceJobs.map((j) => j.id)).order("created_at", { ascending: false }),
      ]);
      const quoteTotalById = new Map((quotesRes.data ?? []).map((q) => [q.id, q.total]));
      const latestInvoiceByJob = new Map<string, number>();
      for (const inv of invoicesRes.data ?? []) {
        if (!latestInvoiceByJob.has(inv.job_id) && inv.total != null) latestInvoiceByJob.set(inv.job_id, inv.total);
      }
      variances = quoteInvoiceJobs
        .map((j) => {
          const quoteTotal = j.issued_quote_id ? quoteTotalById.get(j.issued_quote_id) : null;
          const invoiceTotal = latestInvoiceByJob.get(j.id);
          if (!quoteTotal || invoiceTotal == null) return null;
          return Math.abs(invoiceTotal - quoteTotal) / quoteTotal * 100;
        })
        .filter((v): v is number => v !== null);
    }

    const reviewsWithTransparency = reviews.filter((r) => r.costs_communicated_clearly !== null);
    setValue({
      avgVariancePct: variances.length ? variances.reduce((a, b) => a + b, 0) / variances.length : null,
      transparencyYes: reviewsWithTransparency.filter((r) => r.costs_communicated_clearly === true).length,
      transparencyTotal: reviewsWithTransparency.length,
      sampleSize: variances.length,
    });

    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return { loading, contractorId, tsCode, scores, history, craft, service, value, refetch: load };
}
