import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { useFieldTeamMember } from "@/hooks/useFieldTeamMember";
import FieldHeader, { ORANGE, NAVY } from "@/components/field/FieldHeader";
import FieldStatusPill from "@/components/field/FieldStatusPill";
import ClockStrip from "@/components/field/ClockStrip";
import { jobTypeLabel, jobHeading } from "@/lib/jobLabels";
import type { Database } from "@/integrations/supabase/types";

type Job = Database["public"]["Tables"]["jobs"]["Row"];
type Tab = "mine" | "firm";

const WINDOW_DAYS = 7; // today + next 6 days, per brief
const FIRM_CAP = 20;

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

function sortJobs(a: Job, b: Job): number {
  if (a.scheduled_start && b.scheduled_start) return a.scheduled_start.localeCompare(b.scheduled_start);
  if (a.scheduled_start) return -1;
  if (b.scheduled_start) return 1;
  return (a.start_date ?? "").localeCompare(b.start_date ?? "");
}

function JobRow({ job, customerName, onOpen }: { job: Job; customerName: string | null; onOpen: () => void }) {
  const isActive = job.status === "in_progress";
  const time = timeLabel(job);
  const typeLabel = jobTypeLabel(job.job_type);
  const heading = jobHeading(job, customerName);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left px-4 py-3.5 flex items-center justify-between gap-3 border-b"
      style={isActive ? { borderLeft: `3px solid ${ORANGE}` } : undefined}
    >
      <div className="min-w-0">
        <p className="font-semibold text-base truncate" style={{ color: NAVY }}>
          {heading}
        </p>
        {typeLabel && job.location && (
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

function Section({
  title,
  jobs,
  customerNames,
  onOpen,
}: {
  title: string;
  jobs: Job[];
  customerNames: Record<string, string | null>;
  onOpen: (id: string) => void;
}) {
  if (jobs.length === 0) return null;
  return (
    <div className="pt-4">
      <p className="px-4 pb-1.5 text-sm font-semibold uppercase tracking-wide" style={{ color: "#6b7280" }}>
        {title}
      </p>
      <div>
        {jobs.map((job) => (
          <JobRow
            key={job.id}
            job={job}
            customerName={job.customer_id ? customerNames[job.customer_id] ?? null : null}
            onOpen={() => onOpen(job.id)}
          />
        ))}
      </div>
    </div>
  );
}

interface Grouped {
  today: Job[];
  tomorrow: Job[];
  restOfWeek: Job[];
}

function groupByDate(jobs: Job[]): Grouped {
  const today = dateStr(0);
  const tomorrow = dateStr(1);
  return {
    today: jobs.filter((j) => j.start_date === today),
    tomorrow: jobs.filter((j) => j.start_date === tomorrow),
    restOfWeek: jobs.filter((j) => j.start_date !== null && j.start_date > tomorrow),
  };
}

export default function FieldJobList() {
  const navigate = useNavigate();
  const { loading: teamLoading, teamMember, employerName, employerTsCode } = useFieldTeamMember();
  const [myJobs, setMyJobs] = useState<Job[]>([]);
  const [unassignedJobs, setUnassignedJobs] = useState<Job[]>([]);
  const [unassignedTotal, setUnassignedTotal] = useState(0);
  const [customerNames, setCustomerNames] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("mine");

  useEffect(() => {
    if (!teamMember) return;
    (async () => {
      setLoading(true);

      const today = dateStr(0);
      const weekEnd = dateStr(WINDOW_DAYS - 1);

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

      // Forward-looking window only [today, today+6] — a job dated before
      // today must not silently count toward a total while falling into
      // none of the three date groups below (found live: with no lower
      // bound this happened for real once "today" rolled past a job's
      // start_date between test sessions).
      const withinWindow = (job: Job) => job.start_date !== null && job.start_date >= today && job.start_date <= weekEnd;

      const mine = (assignmentsRes.data ?? [])
        .map((row) => row.jobs)
        .filter((job): job is Job => !!job && withinWindow(job) && job.status !== "cancelled" && job.status !== "complete")
        .sort(sortJobs);
      setMyJobs(mine);

      const allUnassigned = (employerJobsRes.data ?? [])
        .filter((row: any) => (row.job_assignments ?? []).length === 0)
        .map((row: any) => {
          const { job_assignments, ...job } = row;
          return job as Job;
        })
        .filter(withinWindow)
        .sort(sortJobs);
      setUnassignedTotal(allUnassigned.length);
      setUnassignedJobs(allUnassigned.slice(0, FIRM_CAP));

      // Customer names — only needed for jobs missing a location (jobHeading's
      // second-choice fallback). Batched, not one query per job.
      const needNameFor = [...mine, ...allUnassigned]
        .filter((j) => !j.location && j.customer_id)
        .map((j) => j.customer_id as string);
      if (needNameFor.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", Array.from(new Set(needNameFor)));
        const names: Record<string, string | null> = {};
        for (const p of profiles ?? []) names[p.id] = p.full_name;
        setCustomerNames(names);
      }

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

  const mineGrouped = groupByDate(myJobs);
  const firmGrouped = groupByDate(unassignedJobs);
  const firmHiddenCount = unassignedTotal - unassignedJobs.length;

  return (
    <div className="min-h-screen bg-white flex flex-col" style={{ fontFamily: "Lexend, sans-serif" }}>
      {/* Header shows only "Today" and the date — nothing else lives here,
          including the employer name/TS code, which sits in the footer
          strip below instead. */}
      <FieldHeader title="Today" subtitle={todayLabel()} />

      {/* Tabs — 44px min height, thumb-reachable directly under the header. */}
      <div className="w-full max-w-xl mx-auto flex border-b" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "mine"}
          onClick={() => setTab("mine")}
          className="flex-1 font-semibold border-b-2"
          style={{
            minHeight: 48,
            fontSize: 16,
            borderColor: tab === "mine" ? ORANGE : "transparent",
            color: tab === "mine" ? NAVY : "#9ca3af",
          }}
        >
          My jobs
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "firm"}
          onClick={() => setTab("firm")}
          className="flex-1 font-semibold border-b-2"
          style={{
            minHeight: 48,
            fontSize: 16,
            borderColor: tab === "firm" ? ORANGE : "transparent",
            color: tab === "firm" ? NAVY : "#9ca3af",
          }}
        >
          Firm-wide {!loading && `(${unassignedTotal})`}
        </button>
      </div>

      <div className="flex-1 w-full max-w-xl mx-auto pb-4">
        {loading && (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && tab === "mine" && myJobs.length === 0 && (
          <div className="text-center py-12 px-4 text-base text-muted-foreground">
            No jobs assigned to you today.
          </div>
        )}

        {!loading && tab === "mine" && myJobs.length > 0 && (
          <>
            <Section title="Today" jobs={mineGrouped.today} customerNames={customerNames} onOpen={(id) => navigate(`/field/job/${id}`)} />
            <Section title="Tomorrow" jobs={mineGrouped.tomorrow} customerNames={customerNames} onOpen={(id) => navigate(`/field/job/${id}`)} />
            <Section title="Rest of week" jobs={mineGrouped.restOfWeek} customerNames={customerNames} onOpen={(id) => navigate(`/field/job/${id}`)} />
          </>
        )}

        {!loading && tab === "firm" && unassignedJobs.length === 0 && (
          <div className="text-center py-12 px-4 text-base text-muted-foreground">
            No unassigned jobs this week.
          </div>
        )}

        {!loading && tab === "firm" && unassignedJobs.length > 0 && (
          <>
            {/* Read-only — no claim button, no write path to job_assignments
                anywhere in this tab. */}
            <Section title="Today" jobs={firmGrouped.today} customerNames={customerNames} onOpen={(id) => navigate(`/field/job/${id}`)} />
            <Section title="Tomorrow" jobs={firmGrouped.tomorrow} customerNames={customerNames} onOpen={(id) => navigate(`/field/job/${id}`)} />
            <Section title="Rest of week" jobs={firmGrouped.restOfWeek} customerNames={customerNames} onOpen={(id) => navigate(`/field/job/${id}`)} />
            {firmHiddenCount > 0 && (
              <p className="px-4 pt-3 text-sm text-muted-foreground text-center">
                +{firmHiddenCount} more this week, not shown
              </p>
            )}
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
