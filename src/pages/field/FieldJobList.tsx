import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, MapPin } from "lucide-react";
import { useFieldTeamMember } from "@/hooks/useFieldTeamMember";
import FieldHeader, { ORANGE, NAVY } from "@/components/field/FieldHeader";
import FieldStatusPill from "@/components/field/FieldStatusPill";
import FieldRamsMarker, { type FieldRamsStatus } from "@/components/field/FieldRamsMarker";
import ClockStrip from "@/components/field/ClockStrip";
import { jobTypeLabel, jobHeading } from "@/lib/jobLabels";
import { formatJobRef } from "@/lib/documentRefs";
import {
  type FieldJob,
  fieldJobAddress,
  fieldTimeLabel,
  fieldWhenLabel,
  isLiveJob,
  localDateStr,
} from "@/lib/fieldJobs";

type Tab = "mine" | "firm";

const FIRM_WINDOW_DAYS = 7; // Firm-wide: today + next 6 days
const COMING_UP_DAYS = 7; // My jobs: "Coming up" = the next 7 days after today
const FIRM_CAP = 20;

// Explicit column lists — never `*`: contract_value must not reach a team
// member's browser. Keep in step with FieldJob (src/lib/fieldJobs.ts).
const MY_ASSIGNMENTS_SELECT =
  "job_id, jobs(id, job_number, title, description, status, job_type, start_date, scheduled_start, location, addr_line1, addr_line2, addr_city, addr_region, addr_postcode, addr_country, customer_id, contractor_id, site_signed_off_at, site_signed_off_name, site_signed_off_by)" as const;
const FIRM_JOBS_SELECT =
  "id, job_number, title, description, status, job_type, start_date, scheduled_start, location, addr_line1, addr_line2, addr_city, addr_region, addr_postcode, addr_country, customer_id, contractor_id, site_signed_off_at, site_signed_off_name, site_signed_off_by, job_assignments(id)" as const;
const RAMS_STATUS_SELECT = "job_id, status, version" as const;

function todayLabel(): string {
  return new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

function sortJobs(a: FieldJob, b: FieldJob): number {
  const byDate = (a.start_date ?? "").localeCompare(b.start_date ?? "");
  if (byDate !== 0) return byDate;
  if (a.scheduled_start && b.scheduled_start) return a.scheduled_start.localeCompare(b.scheduled_start);
  if (a.scheduled_start) return -1;
  if (b.scheduled_start) return 1;
  return 0;
}

// ── My jobs ────────────────────────────────────────────────────────────────

function MyJobCard({
  job,
  jobRef,
  customerName,
  rams,
  onOpen,
}: {
  job: FieldJob;
  jobRef: string;
  customerName: string | null;
  rams: FieldRamsStatus | null;
  onOpen: () => void;
}) {
  const isActive = job.status === "in_progress";
  const address = fieldJobAddress(job);
  const when = fieldWhenLabel(job);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left px-4 py-3.5 border-b space-y-1.5"
      style={isActive ? { borderLeft: `3px solid ${ORANGE}` } : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-sm" style={{ color: "#6b7280" }}>{jobRef}</p>
          <p className="font-semibold text-base truncate" style={{ color: NAVY }}>{job.title}</p>
          {customerName && <p className="text-sm text-muted-foreground truncate">{customerName}</p>}
        </div>
        <div className="shrink-0">
          <FieldStatusPill status={job.status} />
        </div>
      </div>
      <p className="text-sm font-medium" style={{ color: when ? NAVY : "#6b7280" }}>{when ?? "Not scheduled yet"}</p>
      {address ? (
        <p className="text-sm text-muted-foreground flex items-start gap-1.5 min-w-0">
          <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
          <span className="truncate">{address}</span>
        </p>
      ) : (
        <p className="text-sm" style={{ color: "#b45309" }}>No address yet, ask the office</p>
      )}
      <FieldRamsMarker rams={rams} />
    </button>
  );
}

function MySection({
  title,
  jobs,
  render,
}: {
  title: string;
  jobs: FieldJob[];
  render: (job: FieldJob) => React.ReactNode;
}) {
  if (jobs.length === 0) return null;
  return (
    <div className="pt-4">
      <p className="px-4 pb-1.5 text-sm font-semibold uppercase tracking-wide" style={{ color: title === "Overdue" ? "#dc2626" : "#6b7280" }}>
        {title}
      </p>
      <div>{jobs.map(render)}</div>
    </div>
  );
}

// ── Firm-wide (unchanged layout) ───────────────────────────────────────────

function JobRow({ job, customerName, onOpen }: { job: FieldJob; customerName: string | null; onOpen: () => void }) {
  const isActive = job.status === "in_progress";
  const time = fieldTimeLabel(job.scheduled_start);
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
          <p className="text-sm tabular-nums font-mono" style={{ color: NAVY }}>
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
  jobs: FieldJob[];
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

interface FirmGrouped {
  today: FieldJob[];
  tomorrow: FieldJob[];
  restOfWeek: FieldJob[];
}

function groupFirmByDate(jobs: FieldJob[]): FirmGrouped {
  const today = localDateStr(0);
  const tomorrow = localDateStr(1);
  return {
    today: jobs.filter((j) => j.start_date === today),
    tomorrow: jobs.filter((j) => j.start_date === tomorrow),
    restOfWeek: jobs.filter((j) => j.start_date !== null && j.start_date > tomorrow),
  };
}

export default function FieldJobList() {
  const navigate = useNavigate();
  const { loading: teamLoading, teamMember, employerName, employerTsCode } = useFieldTeamMember();
  const [myJobs, setMyJobs] = useState<FieldJob[]>([]);
  const [unassignedJobs, setUnassignedJobs] = useState<FieldJob[]>([]);
  const [unassignedTotal, setUnassignedTotal] = useState(0);
  const [customerNames, setCustomerNames] = useState<Record<string, string | null>>({});
  const [ramsByJob, setRamsByJob] = useState<Record<string, FieldRamsStatus>>({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("mine");

  useEffect(() => {
    if (!teamMember) return;
    (async () => {
      setLoading(true);

      const today = localDateStr(0);
      const firmEnd = localDateStr(FIRM_WINDOW_DAYS - 1);
      const comingUpEnd = localDateStr(COMING_UP_DAYS);

      const [assignmentsRes, employerJobsRes] = await Promise.all([
        supabase
          .from("job_assignments")
          .select(MY_ASSIGNMENTS_SELECT)
          .eq("team_member_id", teamMember.id),
        // Tier A grants team members SELECT on every one of their
        // employer's jobs, not just assigned ones (confirmed against live
        // pg_policies) — this is what makes "unassigned" visibility a
        // frontend-only concern.
        supabase
          .from("jobs")
          .select(FIRM_JOBS_SELECT)
          .eq("contractor_id", teamMember.contractor_id)
          .not("status", "in", "(complete,cancelled)"),
      ]);

      if (assignmentsRes.error || employerJobsRes.error) {
        console.error("[FieldJobList] failed to load jobs", assignmentsRes.error, employerJobsRes.error);
        setLoading(false);
        return;
      }

      // My jobs: overdue (dated before today, not finished), today, the next
      // 7 days, and undated jobs (their own "Not scheduled yet" group — an
      // assigned job must never silently disappear for lack of a date).
      const mine = (assignmentsRes.data ?? [])
        .map((row) => row.jobs as FieldJob | null)
        .filter((job): job is FieldJob => !!job && isLiveJob(job.status) && (!job.start_date || job.start_date <= comingUpEnd))
        .sort(sortJobs);
      setMyJobs(mine);

      // Firm-wide: forward-looking window only [today, today+6].
      const allUnassigned = (employerJobsRes.data ?? [])
        .filter((row) => (row.job_assignments ?? []).length === 0)
        .map(({ job_assignments: _assignments, ...job }) => job as FieldJob)
        .filter((job) => job.start_date !== null && job.start_date >= today && job.start_date <= firmEnd)
        .sort(sortJobs);
      setUnassignedTotal(allUnassigned.length);
      setUnassignedJobs(allUnassigned.slice(0, FIRM_CAP));

      // Customer names for every listed job, and the live RAMS for my jobs —
      // each batched, not one query per job.
      const customerIds = Array.from(
        new Set([...mine, ...allUnassigned].map((j) => j.customer_id).filter((id): id is string => !!id)),
      );
      const myJobIds = mine.map((j) => j.id);
      const [profilesRes, ramsRes] = await Promise.all([
        customerIds.length > 0
          ? supabase.from("profiles").select("id, full_name").in("id", customerIds)
          : Promise.resolve({ data: [] as { id: string; full_name: string | null }[], error: null }),
        myJobIds.length > 0
          ? supabase.from("job_rams").select(RAMS_STATUS_SELECT).in("job_id", myJobIds).neq("status", "superseded")
          : Promise.resolve({ data: [] as { job_id: string; status: string; version: number }[], error: null }),
      ]);

      const names: Record<string, string | null> = {};
      for (const p of profilesRes.data ?? []) names[p.id] = p.full_name;
      setCustomerNames(names);

      const rams: Record<string, FieldRamsStatus> = {};
      for (const r of ramsRes.data ?? []) rams[r.job_id] = { status: r.status, version: r.version };
      setRamsByJob(rams);

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

  const today = localDateStr(0);
  const overdue = myJobs.filter((j) => !!j.start_date && j.start_date < today);
  const todayJobs = myJobs.filter((j) => j.start_date === today);
  const comingUp = myJobs.filter((j) => !!j.start_date && j.start_date > today);
  const notScheduled = myJobs.filter((j) => !j.start_date);

  const renderMine = (job: FieldJob) => (
    <MyJobCard
      key={job.id}
      job={job}
      jobRef={formatJobRef(job.job_number, employerTsCode ? { contractorCode: employerTsCode } : undefined)}
      customerName={job.customer_id ? customerNames[job.customer_id] ?? null : null}
      rams={ramsByJob[job.id] ?? null}
      onOpen={() => navigate(`/field/job/${job.id}`)}
    />
  );

  const firmGrouped = groupFirmByDate(unassignedJobs);
  const firmHiddenCount = unassignedTotal - unassignedJobs.length;

  return (
    <div className="min-h-screen bg-white flex flex-col">
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
            No jobs assigned to you
          </div>
        )}

        {!loading && tab === "mine" && myJobs.length > 0 && (
          <>
            <MySection title="Overdue" jobs={overdue} render={renderMine} />
            <MySection title="Today" jobs={todayJobs} render={renderMine} />
            <MySection title="Coming up" jobs={comingUp} render={renderMine} />
            <MySection title="Not scheduled yet" jobs={notScheduled} render={renderMine} />
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
              <span className="font-mono">{employerTsCode}</span>
            </>
          )}
        </div>
      </div>

      <ClockStrip teamMemberId={teamMember.id} contractorId={teamMember.contractor_id} />
    </div>
  );
}
