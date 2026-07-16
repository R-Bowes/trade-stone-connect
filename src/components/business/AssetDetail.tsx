import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { formatJobRef } from "@/lib/documentRefs";
import { ASSET_CATEGORY_LABELS } from "@/components/business/maintenance-types";
import type { Asset } from "@/components/business/maintenance-types";

// Confirmed jobs.status values from migration 20260328170000
const JOB_STATUS_LABEL: Record<string, string> = {
  scheduled: "Scheduled",
  in_progress: "In Progress",
  snagging: "Snagging",
  complete: "Complete",
  cancelled: "Cancelled",
};

const JOB_STATUS_COLOUR: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-800",
  in_progress: "bg-yellow-100 text-yellow-800",
  snagging: "bg-orange-100 text-orange-800",
  complete: "bg-green-100 text-green-800",
  cancelled: "bg-gray-100 text-gray-600",
};

type Rag = "red" | "amber" | "green";

const RAG_STYLES: Record<Rag, string> = {
  red: "bg-red-100 text-red-800 border-red-200",
  amber: "bg-amber-100 text-amber-800 border-amber-200",
  green: "bg-green-100 text-green-800 border-green-200",
};

interface JobHistoryRow {
  id: string;
  job_number: number;
  title: string;
  status: string;
  completed_at: string | null;
  scheduled_start: string | null;
  created_at: string;
  contractor_name: string | null;
  contractor_ts_code: string | null;
}

interface Props {
  asset: Asset;
  onBack: () => void;
}

function fmtDate(iso: string): string {
  return format(new Date(iso), "d MMM yyyy");
}

// DATE columns only — compare as calendar days at UTC midnight, no local-timezone drift.
function daysUntil(dateStr: string): number {
  const due = new Date(`${dateStr}T00:00:00Z`).getTime();
  const today = new Date(`${format(new Date(), "yyyy-MM-dd")}T00:00:00Z`).getTime();
  return Math.round((due - today) / 86400000);
}

function complianceState(asset: Asset): { rag: Rag; headline: string } {
  if (!asset.next_service_due) {
    return { rag: "red", headline: "No service schedule recorded" };
  }
  const days = daysUntil(asset.next_service_due);
  if (days < 0) return { rag: "red", headline: "Service overdue" };
  if (days <= 30) return { rag: "amber", headline: "Service due soon" };
  return { rag: "green", headline: "Compliant" };
}

function warrantyLine(asset: Asset): string {
  if (!asset.warranty_expiry) return "Warranty not recorded";
  const expired = daysUntil(asset.warranty_expiry) < 0;
  return expired
    ? `Warranty expired ${fmtDate(asset.warranty_expiry)}`
    : `In warranty until ${fmtDate(asset.warranty_expiry)}`;
}

export function AssetDetail({ asset, onBack }: Props) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<JobHistoryRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("jobs")
      .select(
        "id, job_number, title, status, completed_at, scheduled_start, created_at, contractor:profiles!jobs_contractor_id_fkey(full_name, ts_profile_code)"
      )
      .eq("asset_id", asset.id)
      .order("created_at", { ascending: false });

    setJobs(
      (data ?? []).map((j: any) => ({
        id: j.id,
        job_number: j.job_number,
        title: j.title,
        status: j.status,
        completed_at: j.completed_at,
        scheduled_start: j.scheduled_start,
        created_at: j.created_at,
        contractor_name: j.contractor?.full_name ?? null,
        contractor_ts_code: j.contractor?.ts_profile_code ?? null,
      }))
    );
    setLoading(false);
  }, [asset.id]);

  useEffect(() => { load(); }, [load]);

  const compliance = complianceState(asset);

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Assets
      </button>

      <div className="space-y-1">
        <h2 className="font-heading text-2xl font-bold">{asset.name}</h2>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Badge variant="outline" className="text-xs">{ASSET_CATEGORY_LABELS[asset.category]}</Badge>
          {asset.reference && <span className="font-mono">{asset.reference}</span>}
          {(asset.make || asset.model) && <span>{[asset.make, asset.model].filter(Boolean).join(" — ")}</span>}
        </div>
      </div>

      {/* Compliance panel */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-sans font-medium text-base">Compliance</h3>
            <Badge variant="outline" className={`text-xs ${RAG_STYLES[compliance.rag]}`}>
              {compliance.headline}
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="font-sans font-medium text-muted-foreground text-xs mb-0.5">Next service due</p>
              <p className="font-mono">{asset.next_service_due ? fmtDate(asset.next_service_due) : "Not recorded"}</p>
            </div>
            <div>
              <p className="font-sans font-medium text-muted-foreground text-xs mb-0.5">Last serviced</p>
              <p className="font-mono">{asset.last_serviced ? fmtDate(asset.last_serviced) : "Not recorded"}</p>
            </div>
          </div>
          <p className="text-sm">{warrantyLine(asset)}</p>
        </CardContent>
      </Card>

      {/* Job history */}
      <div className="space-y-3">
        <h3 className="font-sans font-medium text-base">Job history</h3>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : jobs.length === 0 ? (
          <Card><CardContent className="p-8 text-center text-muted-foreground text-sm">
            No jobs recorded against this asset yet.
          </CardContent></Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              {jobs.map((job) => {
                const dateIso = job.completed_at ?? job.scheduled_start ?? job.created_at;
                const colour = JOB_STATUS_COLOUR[job.status] ?? "bg-gray-100 text-gray-600";
                const label = JOB_STATUS_LABEL[job.status] ?? job.status;
                return (
                  <button
                    key={job.id}
                    onClick={() => navigate(`/dashboard/business?view=jobs&jobId=${job.id}`)}
                    className="w-full text-left flex items-center justify-between px-4 py-3 border-b last:border-0 hover:bg-muted/40 transition-colors gap-4"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-muted-foreground">
                          {formatJobRef(job.job_number, { contractorCode: job.contractor_ts_code ?? undefined })}
                        </span>
                        <p className="text-sm font-medium truncate">{job.title}</p>
                      </div>
                      <p className="text-xs text-muted-foreground">{job.contractor_name ?? "—"}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-muted-foreground font-mono">{fmtDate(dateIso)}</span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colour}`}>{label}</span>
                    </div>
                  </button>
                );
              })}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
