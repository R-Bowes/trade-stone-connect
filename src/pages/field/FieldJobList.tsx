import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { useFieldTeamMember } from "@/hooks/useFieldTeamMember";
import FieldHeader, { ORANGE, NAVY } from "@/components/field/FieldHeader";
import FieldStatusPill from "@/components/field/FieldStatusPill";
import ClockStrip from "@/components/field/ClockStrip";
import { jobTypeLabel } from "@/lib/jobLabels";
import type { Database } from "@/integrations/supabase/types";

type Job = Database["public"]["Tables"]["jobs"]["Row"];

function dateStr(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function todayLabel(): string {
  return new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

function timeLabel(job: Job): string | null {
  if (!job.scheduled_start) return null;
  return new Date(job.scheduled_start).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function JobRow({ job, onOpen }: { job: Job; onOpen: () => void }) {
  const isActive = job.status === "in_progress";
  const time = timeLabel(job);
  const typeLabel = jobTypeLabel(job.job_type);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left px-4 py-3.5 flex items-center justify-between gap-3 border-b"
      style={isActive ? { borderLeft: `3px solid ${ORANGE}` } : undefined}
    >
      <div className="min-w-0">
        {/* Location first, title only as fallback — a mint-from-quote job's
            auto-title ("Quote for X") is meaningless on site; the address
            is what the engineer actually needs to see. */}
        <p className="font-semibold text-base truncate" style={{ color: NAVY }}>
          {job.location || job.title || "Job"}
        </p>
        {typeLabel && (
          <p className="text-sm text-muted-foreground truncate mt-0.5">{typeLabel}</p>
        )}
      </div>
      <div className="shrink-0 text-right space-y-1">
        {time && (
          <p
            className="text-sm tabular-nums"
            style={{ fontFamily: "'Roboto Mono', monospace", color: NAVY }}
          >
            {time}
          </p>
        )}
        <FieldStatusPill status={job.status} />
      </div>
    </button>
  );
}

function Section({ title, jobs, onOpen, muted }: { title: string; jobs: Job[]; onOpen: (id: string) => void; muted?: boolean }) {
  if (jobs.length === 0) return null;
  return (
    <div className="pt-4">
      <p
        className="px-4 pb-1.5 text-sm font-semibold uppercase tracking-wide"
        style={muted ? { color: "#b45309" } : { color: "#6b7280" }}
      >
        {title}
      </p>
      <div>
        {jobs.map((job) => (
          <JobRow key={job.id} job={job} onOpen={() => onOpen(job.id)} />
        ))}
      </div>
    </div>
  );
}

export default function FieldJobList() {
  const navigate = useNavigate();
  const { loading: teamLoading, teamMember, employerName, employerTsCode } = useFieldTeamMember();
  const [myJobs, setMyJobs] = useState<Job[]>([]);
  const [unassignedJobs, setUnassignedJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teamMember) return;
    (async () => {
      setLoading(true);

      const weekEnd = dateStr(6);

      const [assignmentsRes, employerJobsRes] = await Promise.all([
        supabase
          .from("job_assignments")
          .select("job_id, jobs(*)")
          .eq("team_member_id", teamMember.id),
        // Tier A grants team members SELECT on every one of their
        // employer's jobs, not just assigned ones (confirmed against live
        // pg_policies) — this is what makes "unassigned" visibility a
        // frontend-only concern.
        supabase
          .from("jobs")
          .select("*, job_assignments(id)")
          .eq("contractor_id", teamMember.contractor_id)
          .not("status", "in", "(complete,cancelled)"),
      ]);

      if (assignmentsRes.error || employerJobsRes.error) {
        console.error("[FieldJobList] failed to load jobs", assignmentsRes.error, employerJobsRes.error);
        setLoading(false);
        return;
      }

      const mine = (assignmentsRes.data ?? [])
        .map((row) => row.jobs)
        .filter((job): job is Job => !!job && job.start_date !== null && job.start_date <= weekEnd && job.status !== "cancelled" && job.status !== "complete")
        .sort((a, b) => {
          if (a.scheduled_start && b.scheduled_start) return a.scheduled_start.localeCompare(b.scheduled_start);
          if (a.scheduled_start) return -1;
          if (b.scheduled_start) return 1;
          return (a.location ?? a.title ?? "").localeCompare(b.location ?? b.title ?? "");
        });
      setMyJobs(mine);

      const unassigned = (employerJobsRes.data ?? [])
        .filter((row: any) => (row.job_assignments ?? []).length === 0)
        .map((row: any) => {
          const { job_assignments, ...job } = row;
          return job as Job;
        })
        .sort((a, b) => (a.start_date ?? "9999").localeCompare(b.start_date ?? "9999"));
      setUnassignedJobs(unassigned);

      setLoading(false);
    })();
  }, [teamMember]);

  if (teamLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: NAVY }}>
        <Loader2 className="h-6 w-6 animate-spin text-white" />
      </div>
    );
  }

  if (!teamMember) return null; // FieldGuard handles the redirect

  const today = dateStr(0);
  const tomorrow = dateStr(1);
  const todaysJobs = myJobs.filter((j) => j.start_date === today);
  const tomorrowsJobs = myJobs.filter((j) => j.start_date === tomorrow);
  const restOfWeekJobs = myJobs.filter((j) => j.start_date! > tomorrow);

  return (
    <div className="min-h-screen bg-white flex flex-col" style={{ fontFamily: "Lexend, sans-serif" }}>
      {/* Header shows only "Today" and the date — nothing else lives here,
          including the employer name/TS code, which sits in the footer
          strip below instead. */}
      <FieldHeader title="Today" subtitle={todayLabel()} />

      <div className="flex-1 w-full max-w-xl mx-auto pb-4">
        {loading && (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && myJobs.length === 0 && unassignedJobs.length === 0 && (
          <div className="text-center py-12 px-4 text-base text-muted-foreground">
            No jobs assigned to you this week.
          </div>
        )}

        {!loading && (
          <>
            <Section title="Today" jobs={todaysJobs} onOpen={(id) => navigate(`/field/job/${id}`)} />
            <Section title="Tomorrow" jobs={tomorrowsJobs} onOpen={(id) => navigate(`/field/job/${id}`)} />
            <Section title="Later this week" jobs={restOfWeekJobs} onOpen={(id) => navigate(`/field/job/${id}`)} />
            {/* Visually distinct — amber section label — so these are never
                mistaken for the engineer's own assigned work. View-only:
                no claim/assign action anywhere here or on the job row. */}
            <Section title="Unassigned — firm-wide" jobs={unassignedJobs} onOpen={(id) => navigate(`/field/job/${id}`)} muted />
          </>
        )}

        <div className="px-4 pt-6 pb-2 text-center text-sm text-muted-foreground">
          {employerName}
          {employerTsCode && (
            <>
              {" "}·{" "}
              <span style={{ fontFamily: "'Roboto Mono', monospace" }}>{employerTsCode}</span>
            </>
          )}
        </div>
      </div>

      <ClockStrip teamMemberId={teamMember.id} contractorId={teamMember.contractor_id} />
    </div>
  );
}
