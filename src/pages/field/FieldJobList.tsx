import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { useFieldTeamMember } from "@/hooks/useFieldTeamMember";
import FieldHeader, { ORANGE } from "@/components/field/FieldHeader";
import FieldStatusPill from "@/components/field/FieldStatusPill";
import ClockStrip from "@/components/field/ClockStrip";
import type { Database } from "@/integrations/supabase/types";

type Job = Database["public"]["Tables"]["jobs"]["Row"];

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function todayLabel(): string {
  return new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

function timeLabel(job: Job): string {
  if (!job.scheduled_start) return "—";
  return new Date(job.scheduled_start).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export default function FieldJobList() {
  const navigate = useNavigate();
  const { loading: teamLoading, teamMember, employerName, employerTsCode } = useFieldTeamMember();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teamMember) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("job_assignments")
        .select("job_id, jobs(*)")
        .eq("team_member_id", teamMember.id);

      if (error) {
        console.error("[FieldJobList] failed to load assignments", error);
        setLoading(false);
        return;
      }

      const today = todayStr();
      const todaysJobs = (data ?? [])
        .map((row) => row.jobs)
        .filter((job): job is Job => !!job && job.start_date === today)
        .sort((a, b) => {
          if (a.scheduled_start && b.scheduled_start) return a.scheduled_start.localeCompare(b.scheduled_start);
          if (a.scheduled_start) return -1;
          if (b.scheduled_start) return 1;
          return (a.title ?? "").localeCompare(b.title ?? "");
        });

      setJobs(todaysJobs);
      setLoading(false);
    })();
  }, [teamMember]);

  if (teamLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#1a2744" }}>
        <Loader2 className="h-6 w-6 animate-spin text-white" />
      </div>
    );
  }

  if (!teamMember) return null; // FieldGuard handles the redirect

  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: "Lexend, sans-serif" }}>
      {/* Header shows only "Today" and the date — nothing else lives here,
          including the employer name/TS code, which sits in the footer
          strip below instead (brief: header area OR a small footer). */}
      <FieldHeader title="Today" subtitle={todayLabel()} />
      <ClockStrip teamMemberId={teamMember.id} contractorId={teamMember.contractor_id} />

      <div>
        {loading && (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && jobs.length === 0 && (
          <div className="text-center py-12 text-sm text-muted-foreground">
            No jobs assigned to you today.
          </div>
        )}

        {!loading &&
          jobs.map((job) => {
            const isActive = job.status === "in_progress";
            return (
              <button
                key={job.id}
                type="button"
                onClick={() => navigate(`/field/job/${job.id}`)}
                className="w-full text-left px-4 py-3 flex items-center justify-between gap-3 border-b"
                style={isActive ? { borderLeft: `3px solid ${ORANGE}` } : undefined}
              >
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate" style={{ color: "#1a2744" }}>
                    {job.title || job.location || "Job"}
                  </p>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {job.job_type
                      ? job.job_type.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())
                      : (job.description ?? "").slice(0, 60) || "—"}
                  </p>
                </div>
                <div className="shrink-0 text-right space-y-1">
                  <p
                    className="text-sm tabular-nums"
                    style={{ fontFamily: "'Roboto Mono', monospace", color: "#1a2744" }}
                  >
                    {timeLabel(job)}
                  </p>
                  <FieldStatusPill status={job.status} />
                </div>
              </button>
            );
          })}
      </div>

      {/* Small footer identifying the FIRM, not the engineer — the team
          member's own ts_profile_code (a meaningless TS-P-... code, minted
          off user_type='personal') must never appear anywhere in /field. */}
      <div className="px-4 py-3 text-center text-xs text-muted-foreground border-t">
        {employerName}
        {employerTsCode && (
          <>
            {" "}·{" "}
            <span style={{ fontFamily: "'Roboto Mono', monospace" }}>{employerTsCode}</span>
          </>
        )}
      </div>
    </div>
  );
}
