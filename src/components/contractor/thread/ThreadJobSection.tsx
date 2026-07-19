import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { Check, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SlaStatusPill } from "@/components/SlaStatusPill";
import { useToast } from "@/hooks/use-toast";
import { useSubmitGuard } from "@/hooks/useSubmitGuard";
import { supabase } from "@/integrations/supabase/client";
import { formatJobRef } from "@/lib/documentRefs";

export interface ThreadJob {
  id: string;
  job_number: number;
  title: string;
  status: string;
  contract_value: number | null;
  start_date: string | null;
  end_date: string | null;
  contractor_id: string;
  contractor_signed_off_at: string | null;
  sla_status: string | null;
  sla_completion_due: string | null;
}

const STATUS_ORDER = ["scheduled", "in_progress", "snagging", "complete"] as const;
const STATUS_LABEL: Record<string, string> = {
  scheduled: "Scheduled",
  in_progress: "In progress",
  snagging: "Snagging",
  complete: "Complete",
};

function fmtMoney(n: number): string {
  return `£${Number(n).toLocaleString("en-GB")}`;
}

/**
 * Stepper + sign-off inline; snag-item detail and photos stay in the full
 * Jobs tab (JobManagement.tsx) — multi-field editing surfaces that don't
 * compress into a thread section without becoming their own dialog again.
 * The button below deep-links straight into this job's own detail modal
 * there (?view=jobs&jobId=..., mirrors BusinessJobsView's existing
 * ?jobId= pattern) rather than dropping the contractor on the flat list.
 * Timesheets live on a separate dashboard tab entirely (?view=timesheets)
 * — reachable from JobManagement's own "Log time" link, not from here.
 */
export function ThreadJobSection({
  job,
  onChanged,
}: {
  job: ThreadJob;
  onChanged: () => void;
}) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { pending: transitionPending, guard: guardTransition } = useSubmitGuard();
  const { pending: signOffPending, guard: guardSignOff } = useSubmitGuard();
  const [busyDirection, setBusyDirection] = useState<"forward" | "back" | null>(null);

  const statusIdx = STATUS_ORDER.indexOf(job.status as typeof STATUS_ORDER[number]);
  const nextStatus = statusIdx >= 0 && statusIdx < STATUS_ORDER.length - 1 ? STATUS_ORDER[statusIdx + 1] : null;
  const prevStatus = statusIdx > 0 ? STATUS_ORDER[statusIdx - 1] : null;

  const changeStatus = guardTransition(async (newStatus: string, direction: "forward" | "back") => {
    setBusyDirection(direction);
    const { error } = await supabase.from("jobs").update({ status: newStatus }).eq("id", job.id);
    setBusyDirection(null);
    if (error) {
      // enforce_job_status_transition (DB trigger) is the authority here —
      // e.g. it blocks snagging -> complete while snag items are unresolved.
      toast({ title: "Can't change status", description: error.message, variant: "destructive" });
      return;
    }
    onChanged();
  });

  const handleSignOff = guardSignOff(async () => {
    const { data: contractorProfile } = await supabase
      .from("profiles")
      .select("full_name, company_name")
      .eq("id", job.contractor_id)
      .maybeSingle();
    const signOffName = contractorProfile?.company_name || contractorProfile?.full_name || "Contractor";

    const { error } = await supabase
      .from("jobs")
      .update({ contractor_signed_off_at: new Date().toISOString(), contractor_signed_off_name: signOffName })
      .eq("id", job.id);
    if (error) {
      toast({ title: "Error", description: "Failed to sign off job", variant: "destructive" });
      return;
    }
    toast({ title: "Signed off" });
    onChanged();
  });

  const needsSignOff = job.status === "complete" && !job.contractor_signed_off_at;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Job</h3>
        <span className="font-mono text-xs text-muted-foreground">{formatJobRef(job.job_number)}</span>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-1.5">
        {STATUS_ORDER.map((s, i) => (
          <div key={s} className="flex items-center gap-1.5 flex-1">
            <div
              className={`flex-1 text-center text-[11px] font-medium py-1 rounded ${
                i === statusIdx
                  ? "bg-[#f07820] text-white"
                  : i < statusIdx
                    ? "bg-green-100 text-green-800"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {STATUS_LABEL[s]}
            </div>
            {i < STATUS_ORDER.length - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2">
        <SlaStatusPill status={job.sla_status} completionDue={job.sla_completion_due} />
        <div className="flex gap-2">
          {prevStatus && (
            <Button
              variant="outline"
              size="sm"
              disabled={transitionPending}
              onClick={() => changeStatus(prevStatus, "back")}
            >
              {transitionPending && busyDirection === "back" ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <ChevronLeft className="h-3.5 w-3.5 mr-1" />
              )}
              {STATUS_LABEL[prevStatus]}
            </Button>
          )}
          {nextStatus && (
            <Button size="sm" disabled={transitionPending} onClick={() => changeStatus(nextStatus, "forward")}>
              {transitionPending && busyDirection === "forward" && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
              {STATUS_LABEL[nextStatus]}
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4 text-sm">
        <span>{job.contract_value ? fmtMoney(job.contract_value) : "Value TBC"}</span>
        {job.start_date && <span className="text-muted-foreground">Start {format(new Date(job.start_date), "d MMM yyyy")}</span>}
        {job.end_date && <span className="text-muted-foreground">Deadline {format(new Date(job.end_date), "d MMM yyyy")}</span>}
      </div>

      {job.contractor_signed_off_at && (
        <Badge variant="outline" className="gap-1 text-xs"><Check className="h-3 w-3" />Signed off</Badge>
      )}

      <div className="flex flex-wrap justify-end gap-2 pt-2 border-t">
        {needsSignOff && (
          <Button size="sm" disabled={signOffPending} onClick={handleSignOff}>
            {signOffPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}Add your sign-off
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => navigate(`/dashboard/contractor?view=jobs&jobId=${job.id}`)}>
          Snags &amp; photos
        </Button>
      </div>
    </div>
  );
}
