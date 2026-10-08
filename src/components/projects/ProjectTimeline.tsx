import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ContractorSummary, ProjectJob, ProjectPackage } from "@/hooks/useProjectDetail";
import { jobStatusChip } from "@/lib/jobStatus";
import { orderPackages } from "@/lib/projectPackages";
import { formatDate } from "@/lib/formatDate";

type Props = {
  targetStart: string | null;
  targetEnd: string | null;
  packages: ProjectPackage[];
  jobs: Record<string, ProjectJob>;
  contractors: Record<string, ContractorSummary>;
};

const DAY_PX = 12;
const WEEK_PX = DAY_PX * 7;
const LABEL_PX = 200;
const MS_PER_DAY = 86_400_000;

// ── Local calendar-day helpers (no time-of-day, no time zone drift) ─────────
function parseDay(value: string): Date {
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}
function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}
/** Whole days from a to b (rounded, so a clock change cannot shift it). */
function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
}
function mondayOf(date: Date): Date {
  return addDays(date, -((date.getDay() + 6) % 7));
}
function today(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

interface TimelineRow {
  pkg: ProjectPackage;
  kind: "job" | "needed" | "none";
  start: Date | null;
  /** Inclusive last day. */
  end: Date | null;
  openEnd: boolean;
  job?: ProjectJob;
}

/** Works out each package's bar, in the packages list order. */
function buildRows(packages: ProjectPackage[], jobs: Record<string, ProjectJob>, targetEnd: Date | null): TimelineRow[] {
  return orderPackages(packages).map((pkg) => {
    const job = pkg.job_id ? jobs[pkg.job_id] : undefined;

    if (job) {
      // A filled package follows its job's dates.
      if (!job.start_date) return { pkg, kind: "none", start: null, end: null, openEnd: false, job };
      const start = parseDay(job.start_date);
      if (job.end_date) return { pkg, kind: "job", start, end: parseDay(job.end_date), openEnd: false, job };
      // No end date: run to the project's target finish, drawn open-ended.
      const end = targetEnd && targetEnd >= start ? targetEnd : addDays(start, 6);
      return { pkg, kind: "job", start, end, openEnd: true, job };
    }

    // An unfilled package shows when it is needed.
    if (pkg.needed_from) {
      const start = parseDay(pkg.needed_from);
      const end = pkg.needed_to ? parseDay(pkg.needed_to) : addDays(start, 6);
      return { pkg, kind: "needed", start, end, openEnd: false };
    }
    if (pkg.needed_to) {
      const end = parseDay(pkg.needed_to);
      return { pkg, kind: "needed", start: addDays(end, -6), end, openEnd: false };
    }
    return { pkg, kind: "none", start: null, end: null, openEnd: false };
  });
}

/**
 * One bar per package across whole weeks (Monday starts), with a Today
 * marker. Plain CSS; scrolls sideways inside its own box on narrow screens.
 * Read-only.
 */
export function ProjectTimeline({ targetStart, targetEnd, packages, jobs, contractors }: Props) {
  const projectEnd = targetEnd ? parseDay(targetEnd) : null;
  const rows = buildRows(packages, jobs, projectEnd);

  const allDates: Date[] = [
    ...(targetStart ? [parseDay(targetStart)] : []),
    ...(projectEnd ? [projectEnd] : []),
    ...rows.flatMap((r) => (r.start && r.end ? [r.start, r.end] : [])),
  ];

  const header = (
    <CardHeader>
      <CardTitle className="font-heading text-lg">Timeline</CardTitle>
    </CardHeader>
  );

  if (packages.length === 0 || allDates.length === 0) {
    return (
      <Card>
        {header}
        <CardContent className="text-sm text-muted-foreground">
          {packages.length === 0
            ? "Add packages to see them on a timeline."
            : "Add dates to the project or its packages to see a timeline."}
        </CardContent>
      </Card>
    );
  }

  const earliest = new Date(Math.min(...allDates.map((d) => d.getTime())));
  const latest = new Date(Math.max(...allDates.map((d) => d.getTime())));
  const rangeStart = mondayOf(earliest);
  const rangeEnd = addDays(mondayOf(latest), 7); // exclusive
  const totalDays = daysBetween(rangeStart, rangeEnd);
  const trackWidth = totalDays * DAY_PX;
  const weeks = Array.from({ length: totalDays / 7 }, (_, i) => addDays(rangeStart, i * 7));

  const now = today();
  const todayX = now >= rangeStart && now < rangeEnd ? daysBetween(rangeStart, now) * DAY_PX + DAY_PX / 2 : null;

  const weekLines: React.CSSProperties = {
    backgroundImage: `repeating-linear-gradient(to right, hsl(var(--border)) 0 1px, transparent 1px ${WEEK_PX}px)`,
  };

  return (
    <Card>
      {header}
      <CardContent className="space-y-4">
        {/* Only this box scrolls sideways; the page never does. */}
        <div className="max-w-full overflow-x-auto rounded-md border">
          <div className="relative" style={{ width: LABEL_PX + trackWidth }}>
            {/* Month names, then each week's Monday date. */}
            <div className="flex border-b bg-muted/40 text-xs">
              <div className="sticky left-0 z-20 shrink-0 bg-card" style={{ width: LABEL_PX }} />
              <div className="relative" style={{ width: trackWidth }}>
                <div className="flex h-5">
                  {weeks.map((monday, i) => {
                    const showMonth = i === 0 || monday.getMonth() !== weeks[i - 1].getMonth();
                    return (
                      <div key={monday.getTime()} className="shrink-0 truncate px-1 font-semibold" style={{ width: WEEK_PX }}>
                        {showMonth ? format(monday, "MMM yyyy") : ""}
                      </div>
                    );
                  })}
                </div>
                <div className="flex h-5 text-muted-foreground">
                  {weeks.map((monday) => (
                    <div key={monday.getTime()} className="shrink-0 border-l px-1" style={{ width: WEEK_PX }}>
                      {format(monday, "d")}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* One row per package. */}
            {rows.map((row) => {
              const chip = row.job ? jobStatusChip(row.job.status) : null;
              const contractor = row.job ? contractors[row.job.contractor_id] : undefined;
              const left = row.start ? daysBetween(rangeStart, row.start) * DAY_PX : 0;
              const width = row.start && row.end ? (daysBetween(row.start, row.end) + 1) * DAY_PX : 0;
              const dateText = row.start && row.end
                ? `${formatDate(row.start)} to ${row.openEnd ? "end not set" : formatDate(row.end)}`
                : "No dates yet";
              return (
                <div key={row.pkg.id} className="flex border-b last:border-b-0">
                  <div
                    className="sticky left-0 z-10 shrink-0 border-r bg-card px-3 py-2 text-sm"
                    style={{ width: LABEL_PX }}
                  >
                    <p className="truncate font-medium" title={row.pkg.title}>{row.pkg.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {row.kind === "job" && chip ? `${chip.label}${contractor ? ` · ${contractor.name}` : ""}` : null}
                      {row.kind === "needed" && "No contractor yet"}
                      {row.kind === "none" && "No dates yet"}
                      {row.kind === "job" && row.openEnd && " · end not set"}
                    </p>
                  </div>
                  <div className="relative h-14" style={{ width: trackWidth, ...weekLines }}>
                    {row.kind === "job" && chip && (
                      <div
                        className={`absolute top-1/2 h-6 -translate-y-1/2 border ${chip.className} ${row.openEnd ? "rounded-l-md" : "rounded-md"}`}
                        style={{
                          left,
                          width,
                          // Open end: fades out instead of stopping, so it reads as "not finished".
                          ...(row.openEnd
                            ? { maskImage: "linear-gradient(to right, black 70%, transparent)", WebkitMaskImage: "linear-gradient(to right, black 70%, transparent)" }
                            : {}),
                        }}
                        title={`${row.pkg.title}: ${chip.label}, ${dateText}`}
                      />
                    )}
                    {row.kind === "needed" && (
                      <div
                        className="absolute top-1/2 h-6 -translate-y-1/2 rounded-md border-2 border-dashed border-[#1e3a5f]/60 bg-transparent"
                        style={{ left, width }}
                        title={`${row.pkg.title}: needed ${dateText}`}
                      />
                    )}
                    {row.kind === "none" && (
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">No dates yet</span>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Today marker, across the header and every row. */}
            {todayX != null && (
              <div
                // Above the bars, below the frozen package-name column (z-10/20).
                className="pointer-events-none absolute bottom-0 top-0 z-[5]"
                style={{ left: LABEL_PX + todayX }}
                aria-label={`Today, ${formatDate(now)}`}
              >
                <div className="h-full w-0.5 bg-red-600" />
                <span className="absolute left-1 top-0 whitespace-nowrap rounded bg-red-600 px-1 text-[10px] font-semibold text-white">
                  Today
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Each bar style named in words. */}
        <ul className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
          <li className="flex items-center gap-2">
            <span className="inline-block h-3 w-6 shrink-0 rounded-sm bg-[#f07820]" aria-hidden="true" />
            Solid bar: a contractor's job, coloured by its status (named beside each package)
          </li>
          <li className="flex items-center gap-2">
            <span
              className="inline-block h-3 w-6 shrink-0 rounded-l-sm bg-[#f07820]"
              style={{ maskImage: "linear-gradient(to right, black 40%, transparent)", WebkitMaskImage: "linear-gradient(to right, black 40%, transparent)" }}
              aria-hidden="true"
            />
            Fading end: the job has no end date yet
          </li>
          <li className="flex items-center gap-2">
            <span className="inline-block h-3 w-6 shrink-0 rounded-sm border-2 border-dashed border-[#1e3a5f]/60" aria-hidden="true" />
            Dashed bar: no contractor yet, when the work is needed
          </li>
          <li className="flex items-center gap-2">
            <span className="inline-block h-3 w-0.5 shrink-0 bg-red-600" aria-hidden="true" />
            Red line: today
          </li>
        </ul>
      </CardContent>
    </Card>
  );
}
