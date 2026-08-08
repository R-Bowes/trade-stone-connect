import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { NAVY, ORANGE } from "./FieldHeader";

// Same vocabulary and forward/back rules as ThreadJobSection.tsx's stepper —
// the DB trigger enforce_job_status_transition() is the actual authority
// (blocks snagging->complete with unresolved snags, blocks skipping stages),
// this just mirrors its shape so the UI's happy path matches what's allowed.
const STATUS_ORDER = ["scheduled", "in_progress", "snagging", "complete"] as const;
export const STATUS_LABEL: Record<string, string> = {
  scheduled: "Scheduled",
  in_progress: "In progress",
  snagging: "Snagging",
  complete: "Complete",
  cancelled: "Cancelled",
};

// The forward-transition button's label describes the ACTION, not the
// destination state — reads better as a primary CTA ("Start job" vs
// "In progress").
const FORWARD_ACTION_LABEL: Record<string, string> = {
  scheduled: "Start job",
  in_progress: "Move to snagging",
  snagging: "Mark work finished",
};

export default function FieldStatusStepper({
  jobId,
  status,
  onChanged,
}: {
  jobId: string;
  status: string;
  onChanged: (newStatus: string) => void;
}) {
  const [pending, setPending] = useState<"forward" | "back" | null>(null);

  const statusIdx = STATUS_ORDER.indexOf(status as (typeof STATUS_ORDER)[number]);
  const nextStatus = statusIdx >= 0 && statusIdx < STATUS_ORDER.length - 1 ? STATUS_ORDER[statusIdx + 1] : null;
  const prevStatus = statusIdx > 0 ? STATUS_ORDER[statusIdx - 1] : null;

  // Single-column write, exactly matching the existing contractor flow
  // (ThreadJobSection.tsx / JobManagement.tsx) — the DB trigger is what
  // sets actual_start/actual_end and validates the transition. Writing
  // anything else here would desync from what that flow does.
  const changeStatus = async (newStatus: string, direction: "forward" | "back") => {
    setPending(direction);
    const { error } = await supabase.from("jobs").update({ status: newStatus }).eq("id", jobId);
    setPending(null);
    if (error) {
      toast.error("Couldn't update status", { description: error.message });
      return;
    }
    onChanged(newStatus);
  };

  if (status === "cancelled" || status === "complete") {
    return null;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1">
        {STATUS_ORDER.map((s, i) => (
          <div
            key={s}
            className="flex-1 h-1.5 rounded-full"
            style={{ backgroundColor: i <= statusIdx ? ORANGE : "#e5e7eb" }}
          />
        ))}
      </div>
      <p className="text-sm" style={{ color: NAVY }}>
        Currently: <span className="font-semibold">{STATUS_LABEL[status] ?? status}</span>
      </p>

      <div className="flex gap-2 pt-1">
        {prevStatus && (
          <button
            type="button"
            disabled={pending !== null}
            onClick={() => changeStatus(prevStatus, "back")}
            className="rounded-lg border font-medium text-muted-foreground disabled:opacity-60"
            style={{ minHeight: 44, padding: "0 16px", fontSize: 16 }}
          >
            {pending === "back" ? <Loader2 className="h-4 w-4 animate-spin" /> : `Back to ${STATUS_LABEL[prevStatus]}`}
          </button>
        )}
        {nextStatus && (
          <button
            type="button"
            disabled={pending !== null}
            onClick={() => changeStatus(nextStatus, "forward")}
            className="flex-1 rounded-lg font-semibold text-white disabled:opacity-60 flex items-center justify-center gap-2"
            style={{ backgroundColor: ORANGE, minHeight: 48, fontSize: 16 }}
          >
            {pending === "forward" && <Loader2 className="h-4 w-4 animate-spin" />}
            {FORWARD_ACTION_LABEL[status] ?? STATUS_LABEL[nextStatus]}
          </button>
        )}
      </div>
    </div>
  );
}
