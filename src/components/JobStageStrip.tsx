import { Fragment } from "react";
import { Calendar, Hammer, AlertTriangle, CheckCircle, Check, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export const JOB_STAGE_ORDER = ["scheduled", "in_progress", "snagging", "complete"] as const;
export type JobStageStatus = (typeof JOB_STAGE_ORDER)[number] | "cancelled";

const STEPS = [
  { status: "scheduled" as const, label: "Job Scheduled", Icon: Calendar },
  { status: "in_progress" as const, label: "Work Started", Icon: Hammer },
  { status: "snagging" as const, label: "Final Checks", Icon: AlertTriangle },
  { status: "complete" as const, label: "Job Complete", Icon: CheckCircle },
];

interface JobStageStripProps {
  status: JobStageStatus;
  /** Only meaningful once status is 'complete' — shows sign-off state at that step. */
  signedOff?: boolean;
}

/**
 * Read-only job-stage progress strip — shared visual language between the
 * contractor's job detail modal (JobManagement.tsx) and the client's job
 * detail view (ClientJobsView.tsx). No interactive elements here; status
 * transitions happen elsewhere (contractor-only, via the status buttons).
 */
export function JobStageStrip({ status, signedOff }: JobStageStripProps) {
  const isCancelled = status === "cancelled";
  const currentIdx = isCancelled ? -1 : JOB_STAGE_ORDER.indexOf(status as (typeof JOB_STAGE_ORDER)[number]);

  return (
    <div className="flex items-start w-full">
      {STEPS.map((step, idx) => {
        const isCompleted = currentIdx !== -1 && idx < currentIdx;
        const isActive = currentIdx !== -1 && idx === currentIdx;
        const isCompleteStep = step.status === "complete";

        return (
          <Fragment key={step.status}>
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "h-10 w-10 rounded-full border-2 flex items-center justify-center shrink-0 transition-all relative",
                  isCompleted && "bg-[#1e3a5f] border-[#1e3a5f]",
                  isActive && "border-[#f07820] animate-pulse",
                  !isCompleted && !isActive && "border-muted-foreground/30 bg-muted/30",
                )}
              >
                {isCompleted ? (
                  <Check className="h-4 w-4 text-white" />
                ) : (
                  <step.Icon
                    className={cn("h-4 w-4", isActive ? "text-[#f07820]" : "text-muted-foreground/40")}
                  />
                )}
                {isCompleteStep && isActive && signedOff && (
                  <ShieldCheck className="h-3.5 w-3.5 text-green-600 absolute -top-1.5 -right-1.5 bg-white rounded-full" />
                )}
              </div>
              <span
                className={cn(
                  "mt-1.5 text-[10px] text-center leading-tight w-16",
                  isCompleted && "font-medium text-[#1e3a5f]",
                  !isCompleted && !isActive && "text-muted-foreground/40",
                )}
                style={isActive ? { color: "#f07820", fontWeight: 600 } : undefined}
              >
                {step.label}
              </span>
              {isCompleteStep && isActive && (
                <span className={cn("text-[9px] mt-0.5", signedOff ? "text-green-600 font-medium" : "text-muted-foreground")}>
                  {signedOff ? "Signed off" : "Awaiting sign-off"}
                </span>
              )}
            </div>
            {idx < STEPS.length - 1 && (
              <div
                className={cn(
                  "flex-1 h-0.5 mt-5",
                  idx < currentIdx ? "bg-[#1e3a5f]" : "bg-muted-foreground/20",
                )}
              />
            )}
          </Fragment>
        );
      })}
    </div>
  );
}
