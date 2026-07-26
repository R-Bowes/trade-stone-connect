import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";

type TeamMember = Database["public"]["Tables"]["team_members"]["Row"];
type WorkingPattern = Database["public"]["Tables"]["team_member_working_patterns"]["Row"];
type Absence = Database["public"]["Tables"]["team_member_absences"]["Row"];
type JobStub = { id: string; title: string; status: string; scheduled_start: string | null };
type AssignmentStub = { id: string; team_member_id: string | null; assigned_date: string | null; job: JobStub | null };

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const ABSENCE_TYPES = [
  { value: "holiday", label: "Holiday" },
  { value: "sickness", label: "Sickness" },
  { value: "training", label: "Training" },
  { value: "personal", label: "Personal" },
  { value: "other", label: "Other" },
];

const ABSENCE_TYPE_BADGE: Record<string, string> = {
  holiday: "bg-blue-100 text-blue-800 hover:bg-blue-100",
  sickness: "bg-red-100 text-red-800 hover:bg-red-100",
  training: "bg-purple-100 text-purple-800 hover:bg-purple-100",
  personal: "bg-amber-100 text-amber-800 hover:bg-amber-100",
  other: "bg-gray-100 text-gray-800 hover:bg-gray-100",
};

const STATUS_BADGE: Record<string, string> = {
  requested: "bg-amber-100 text-amber-800 hover:bg-amber-100",
  approved: "bg-green-100 text-green-800 hover:bg-green-100",
  declined: "bg-red-100 text-red-800 hover:bg-red-100",
};

function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function dayOfWeekOf(date: Date): number {
  return (date.getDay() + 6) % 7;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

const monthLabelFmt = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });
const longDateFmt = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const shortDateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

function formatDate(value: string | null) {
  if (!value) return "—";
  return shortDateFmt.format(new Date(value));
}

function daysBetweenInclusive(start: string, end: string): number {
  const s = new Date(start);
  const e = new Date(end);
  return Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
}

interface DayStats {
  dateISO: string;
  availableCount: number;
  availableNames: string[];
  absentMembers: { name: string; type: string }[];
  jobCount: number;
  jobTitles: string[];
  remaining: number;
}

export function AvailabilityManagement() {
  const navigate = useNavigate();
  const [contractorId, setContractorId] = useState<string | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [patterns, setPatterns] = useState<WorkingPattern[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [assignments, setAssignments] = useState<AssignmentStub[]>([]);
  const [scheduledJobs, setScheduledJobs] = useState<JobStub[]>([]);
  const [contractorOverrideCount, setContractorOverrideCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const [currentMonth, setCurrentMonth] = useState<Date>(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const [availabilityOpen, setAvailabilityOpen] = useState(true);
  const [patternsOpen, setPatternsOpen] = useState(true);
  const [absencesOpen, setAbsencesOpen] = useState(true);

  const [patternTarget, setPatternTarget] = useState<{ member: TeamMember; dayOfWeek: number } | null>(null);
  const [absenceDialogOpen, setAbsenceDialogOpen] = useState(false);

  const [absenceWorkerFilter, setAbsenceWorkerFilter] = useState<string>("all");
  const [absenceTypeFilter, setAbsenceTypeFilter] = useState<string>("all");
  const [absenceFromFilter, setAbsenceFromFilter] = useState<string>("");
  const [absenceToFilter, setAbsenceToFilter] = useState<string>("");

  const getContractorId = useCallback(async (): Promise<string | null> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    return data?.id ?? null;
  }, []);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
  const gridStart = addDays(monthStart, -dayOfWeekOf(monthStart));
  const gridEnd = addDays(monthEnd, 6 - dayOfWeekOf(monthEnd));
  const gridStartISO = toISODate(gridStart);
  const gridEndISO = toISODate(gridEnd);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const cId = contractorId ?? (await getContractorId());
      if (!cId) {
        setLoading(false);
        return;
      }
      if (!contractorId) setContractorId(cId);

      const { data: memberRows, error: memberError } = await supabase
        .from("team_members")
        .select("*")
        .eq("contractor_id", cId)
        .eq("status", "active")
        .order("full_name", { ascending: true });
      if (memberError) throw memberError;

      const members = memberRows ?? [];
      setTeamMembers(members);

      const memberIds = members.map((m) => m.id);
      if (memberIds.length === 0) {
        setPatterns([]);
        setAbsences([]);
        setAssignments([]);
      } else {
        const [patternsRes, absencesRes, assignmentsRes] = await Promise.all([
          supabase
            .from("team_member_working_patterns")
            .select("*")
            .in("team_member_id", memberIds),
          supabase
            .from("team_member_absences")
            .select("*")
            .in("team_member_id", memberIds)
            .order("start_date", { ascending: false }),
          supabase
            .from("job_assignments")
            .select("id, team_member_id, assigned_date, job:jobs(id, title, status, scheduled_start)")
            .in("team_member_id", memberIds)
            .gte("assigned_date", gridStartISO)
            .lte("assigned_date", gridEndISO),
        ]);

        if (patternsRes.error) throw patternsRes.error;
        if (absencesRes.error) throw absencesRes.error;
        if (assignmentsRes.error) throw assignmentsRes.error;

        setPatterns(patternsRes.data ?? []);
        setAbsences(absencesRes.data ?? []);
        setAssignments((assignmentsRes.data ?? []) as unknown as AssignmentStub[]);
      }

      const { data: jobRows, error: jobsError } = await supabase
        .from("jobs")
        .select("id, title, status, scheduled_start")
        .eq("contractor_id", cId)
        .in("status", ["scheduled", "in_progress"])
        .gte("scheduled_start", gridStart.toISOString())
        .lte("scheduled_start", addDays(gridEnd, 1).toISOString());
      if (jobsError) throw jobsError;
      setScheduledJobs(jobRows ?? []);

      const { count: overrideCount, error: overrideError } = await supabase
        .from("contractor_availability_overrides")
        .select("id", { count: "exact", head: true })
        .eq("contractor_id", cId)
        .gte("date", toISODate(new Date()));
      if (overrideError) throw overrideError;
      setContractorOverrideCount(overrideCount ?? 0);
    } catch (error) {
      console.error("Error loading availability data:", error);
      toast.error("Failed to load availability data");
    } finally {
      setLoading(false);
    }
  }, [contractorId, getContractorId, gridStartISO, gridEndISO]);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridStartISO, gridEndISO]);

  const isWorkingByDefault = (dayOfWeek: number) => dayOfWeek <= 4;

  const getDayStats = useCallback((dateISO: string): DayStats => {
    const date = new Date(dateISO);
    const dow = dayOfWeekOf(date);

    const availableNames: string[] = [];
    const absentMembers: { name: string; type: string }[] = [];

    for (const member of teamMembers) {
      const pattern = patterns.find((p) => p.team_member_id === member.id && p.day_of_week === dow);
      const isWorking = pattern ? pattern.is_working : isWorkingByDefault(dow);
      if (!isWorking) continue;

      const absence = absences.find(
        (a) => a.team_member_id === member.id && a.status === "approved" && a.start_date <= dateISO && a.end_date >= dateISO,
      );
      if (absence) {
        absentMembers.push({ name: member.full_name, type: absence.absence_type });
        continue;
      }
      availableNames.push(member.full_name);
    }

    const availableCount = availableNames.length + 1;

    const jobIds = new Set<string>();
    const jobTitleMap = new Map<string, string>();

    for (const assignment of assignments) {
      if (assignment.assigned_date === dateISO && assignment.job) {
        jobIds.add(assignment.job.id);
        jobTitleMap.set(assignment.job.id, assignment.job.title);
      }
    }
    for (const job of scheduledJobs) {
      if (job.scheduled_start && toISODate(new Date(job.scheduled_start)) === dateISO) {
        jobIds.add(job.id);
        jobTitleMap.set(job.id, job.title);
      }
    }

    return {
      dateISO,
      availableCount,
      availableNames,
      absentMembers,
      jobCount: jobIds.size,
      jobTitles: Array.from(jobTitleMap.values()),
      remaining: availableCount - jobIds.size,
    };
  }, [teamMembers, patterns, absences, assignments, scheduledJobs]);

  const calendarDays = useMemo(() => {
    const days: Date[] = [];
    let cursor = gridStart;
    while (cursor <= gridEnd) {
      days.push(cursor);
      cursor = addDays(cursor, 1);
    }
    return days;
  }, [gridStartISO, gridEndISO]);

  const handleSavePattern = async (dayOfWeek: number, isWorking: boolean, startTime: string, endTime: string) => {
    if (!patternTarget) return;
    try {
      const { error } = await supabase
        .from("team_member_working_patterns")
        .upsert(
          {
            team_member_id: patternTarget.member.id,
            day_of_week: dayOfWeek,
            is_working: isWorking,
            start_time: isWorking ? (startTime || null) : null,
            end_time: isWorking ? (endTime || null) : null,
          },
          { onConflict: "team_member_id,day_of_week" },
        );
      if (error) throw error;
      toast.success("Working pattern updated");
      setPatternTarget(null);
      loadData();
    } catch (error) {
      console.error("Error saving working pattern:", error);
      toast.error("Failed to update working pattern");
    }
  };

  const filteredAbsences = useMemo(() => {
    return absences.filter((a) => {
      if (absenceWorkerFilter !== "all" && a.team_member_id !== absenceWorkerFilter) return false;
      if (absenceTypeFilter !== "all" && a.absence_type !== absenceTypeFilter) return false;
      if (absenceFromFilter && a.end_date < absenceFromFilter) return false;
      if (absenceToFilter && a.start_date > absenceToFilter) return false;
      return true;
    });
  }, [absences, absenceWorkerFilter, absenceTypeFilter, absenceFromFilter, absenceToFilter]);

  const pendingAbsences = useMemo(() => absences.filter((a) => a.status === "requested"), [absences]);

  const handleAbsenceStatus = async (absence: Absence, status: "approved" | "declined") => {
    try {
      const { error } = await supabase
        .from("team_member_absences")
        .update({ status })
        .eq("id", absence.id);
      if (error) throw error;
      toast.success(status === "approved" ? "Absence approved" : "Absence declined");
      loadData();
    } catch (error) {
      console.error("Error updating absence:", error);
      toast.error("Failed to update absence");
    }
  };

  const memberName = (id: string | null) => teamMembers.find((m) => m.id === id)?.full_name ?? "Unknown";

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <i className="ti ti-loader-2 animate-spin text-3xl text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setCurrentMonth((m) => addMonths(m, -1))}>
            <i className="ti ti-chevron-left" />
          </Button>
          <div className="rounded-md border px-3 py-2 text-sm font-medium">
            {monthLabelFmt.format(currentMonth)}
          </div>
          <Button variant="outline" size="icon" onClick={() => setCurrentMonth((m) => addMonths(m, 1))}>
            <i className="ti ti-chevron-right" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setCurrentMonth(startOfMonth(new Date()))}>
            Today
          </Button>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-green-500" /> Available</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Full</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-red-500" /> Over-committed</span>
        </div>
      </div>

      <div className="overflow-hidden rounded-md border">
        <div className="grid grid-cols-7 border-b bg-muted/50 text-center text-xs font-medium text-muted-foreground">
          {DAY_LABELS.map((label) => (
            <div key={label} className="p-2">{label}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {calendarDays.map((day) => {
            const dateISO = toISODate(day);
            const stats = getDayStats(dateISO);
            const inMonth = day.getMonth() === currentMonth.getMonth();
            const isToday = dateISO === toISODate(new Date());
            const capacityClass =
              stats.jobCount === 0
                ? "text-muted-foreground"
                : stats.remaining > 0
                  ? "text-green-700 bg-green-50"
                  : stats.remaining === 0
                    ? "text-amber-700 bg-amber-50"
                    : "text-red-700 bg-red-50";

            return (
              <button
                key={dateISO}
                onClick={() => setSelectedDate(dateISO)}
                className={cn(
                  "flex min-h-[84px] flex-col items-start gap-1 border-b border-r p-2 text-left transition-colors hover:bg-muted/40",
                  !inMonth && "bg-muted/20 text-muted-foreground",
                )}
              >
                <span className={cn("text-sm font-medium", isToday && "flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground")}>
                  {day.getDate()}
                </span>
                <div className={cn("flex w-full flex-col gap-0.5 rounded px-1.5 py-1 text-xs", capacityClass)}>
                  <span>{stats.availableCount} available</span>
                  {stats.jobCount > 0 && (
                    <span className="flex items-center gap-1">
                      <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">{stats.jobCount} job{stats.jobCount === 1 ? "" : "s"}</Badge>
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <Collapsible open={availabilityOpen} onOpenChange={setAvailabilityOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <button className="flex w-full items-center justify-between p-4 text-left">
              <span className="font-heading text-lg font-semibold">Your availability</span>
              <i className={cn("ti ti-chevron-down transition-transform", availabilityOpen && "rotate-180")} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-3 pt-0">
              <p className="text-sm text-muted-foreground">
                You're counted as available Mon–Fri. To block specific dates, use Date overrides on the Schedule page.
              </p>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
                <div>
                  <p className="text-sm font-medium">Upcoming blocked dates</p>
                  <p className="text-2xl font-bold">{contractorOverrideCount}</p>
                </div>
                <Button variant="outline" onClick={() => navigate("/dashboard/contractor?view=schedule")}>
                  <i className="ti ti-calendar-off mr-2" />
                  Manage date overrides
                </Button>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <Collapsible open={patternsOpen} onOpenChange={setPatternsOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <button className="flex w-full items-center justify-between p-4 text-left">
              <span className="font-heading text-lg font-semibold">Working patterns</span>
              <i className={cn("ti ti-chevron-down transition-transform", patternsOpen && "rotate-180")} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0">
              {teamMembers.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No active team members yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[160px]">Worker</TableHead>
                        {DAY_LABELS.map((label) => (
                          <TableHead key={label} className="text-center">{label}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {teamMembers.map((member) => (
                        <TableRow key={member.id}>
                          <TableCell className="font-medium">{member.full_name}</TableCell>
                          {DAY_LABELS.map((_, dow) => {
                            const pattern = patterns.find((p) => p.team_member_id === member.id && p.day_of_week === dow);
                            const isWorking = pattern ? pattern.is_working : isWorkingByDefault(dow);
                            return (
                              <TableCell key={dow} className="text-center">
                                <button
                                  onClick={() => setPatternTarget({ member, dayOfWeek: dow })}
                                  className={cn(
                                    "flex h-10 w-full flex-col items-center justify-center rounded-md border text-xs transition-colors",
                                    isWorking
                                      ? "border-green-300 bg-green-50 text-green-800 hover:bg-green-100"
                                      : "border-dashed text-muted-foreground hover:bg-muted",
                                  )}
                                >
                                  {isWorking ? (
                                    <>
                                      <i className="ti ti-check" />
                                      {pattern?.start_time && pattern?.end_time && (
                                        <span className="text-[10px]">{pattern.start_time.slice(0, 5)}–{pattern.end_time.slice(0, 5)}</span>
                                      )}
                                    </>
                                  ) : (
                                    <i className="ti ti-minus" />
                                  )}
                                </button>
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <Collapsible open={absencesOpen} onOpenChange={setAbsencesOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <button className="flex w-full items-center justify-between p-4 text-left">
              <span className="font-heading text-lg font-semibold">Absences</span>
              <i className={cn("ti ti-chevron-down transition-transform", absencesOpen && "rotate-180")} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-4 pt-0">
              <div className="flex justify-end">
                <Button onClick={() => setAbsenceDialogOpen(true)}>
                  <i className="ti ti-plus mr-2" />
                  Log absence
                </Button>
              </div>

              <Tabs defaultValue="pending">
                <TabsList>
                  <TabsTrigger value="pending">Pending requests ({pendingAbsences.length})</TabsTrigger>
                  <TabsTrigger value="all">All absences</TabsTrigger>
                </TabsList>

                <TabsContent value="pending" className="space-y-2">
                  {pendingAbsences.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">No pending requests.</p>
                  ) : (
                    pendingAbsences.map((absence) => (
                      <div key={absence.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
                        <div>
                          <p className="text-sm font-medium">{memberName(absence.team_member_id)}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <Badge className={ABSENCE_TYPE_BADGE[absence.absence_type] ?? ABSENCE_TYPE_BADGE.other}>
                              {absence.absence_type}
                            </Badge>
                            <span>{formatDate(absence.start_date)} – {formatDate(absence.end_date)}</span>
                            <span>({daysBetweenInclusive(absence.start_date, absence.end_date)} day{daysBetweenInclusive(absence.start_date, absence.end_date) === 1 ? "" : "s"})</span>
                          </div>
                          {absence.notes && <p className="mt-1 text-xs text-muted-foreground">{absence.notes}</p>}
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => handleAbsenceStatus(absence, "declined")}>Decline</Button>
                          <Button size="sm" onClick={() => handleAbsenceStatus(absence, "approved")}>Approve</Button>
                        </div>
                      </div>
                    ))
                  )}
                </TabsContent>

                <TabsContent value="all" className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    <Select value={absenceWorkerFilter} onValueChange={setAbsenceWorkerFilter}>
                      <SelectTrigger className="w-44"><SelectValue placeholder="Worker" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All workers</SelectItem>
                        {teamMembers.map((m) => (
                          <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={absenceTypeFilter} onValueChange={setAbsenceTypeFilter}>
                      <SelectTrigger className="w-40"><SelectValue placeholder="Type" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All types</SelectItem>
                        {ABSENCE_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input type="date" className="w-40" value={absenceFromFilter} onChange={(e) => setAbsenceFromFilter(e.target.value)} placeholder="From" />
                    <Input type="date" className="w-40" value={absenceToFilter} onChange={(e) => setAbsenceToFilter(e.target.value)} placeholder="To" />
                  </div>

                  {filteredAbsences.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">No absences match these filters.</p>
                  ) : (
                    <div className="space-y-2">
                      {filteredAbsences.map((absence) => (
                        <div key={absence.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
                          <div>
                            <p className="text-sm font-medium">{memberName(absence.team_member_id)}</p>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              <Badge className={ABSENCE_TYPE_BADGE[absence.absence_type] ?? ABSENCE_TYPE_BADGE.other}>
                                {absence.absence_type}
                              </Badge>
                              <span>{formatDate(absence.start_date)} – {formatDate(absence.end_date)}</span>
                              <span>({daysBetweenInclusive(absence.start_date, absence.end_date)} day{daysBetweenInclusive(absence.start_date, absence.end_date) === 1 ? "" : "s"})</span>
                            </div>
                            {absence.notes && <p className="mt-1 text-xs text-muted-foreground">{absence.notes}</p>}
                          </div>
                          <Badge className={STATUS_BADGE[absence.status] ?? STATUS_BADGE.requested}>{absence.status}</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {selectedDate && (
        <DayDetailDialog
          dateISO={selectedDate}
          stats={getDayStats(selectedDate)}
          onClose={() => setSelectedDate(null)}
        />
      )}

      {patternTarget && (
        <PatternDialog
          member={patternTarget.member}
          dayOfWeek={patternTarget.dayOfWeek}
          existing={patterns.find((p) => p.team_member_id === patternTarget.member.id && p.day_of_week === patternTarget.dayOfWeek) ?? null}
          onClose={() => setPatternTarget(null)}
          onSave={handleSavePattern}
        />
      )}

      {absenceDialogOpen && (
        <LogAbsenceDialog
          teamMembers={teamMembers}
          onClose={() => setAbsenceDialogOpen(false)}
          onSaved={() => {
            setAbsenceDialogOpen(false);
            loadData();
          }}
        />
      )}
    </div>
  );
}

function DayDetailDialog({ dateISO, stats, onClose }: { dateISO: string; stats: DayStats; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{longDateFmt.format(new Date(dateISO))}</DialogTitle>
          <DialogDescription>
            Remaining capacity: <span className={cn("font-semibold", stats.remaining < 0 ? "text-red-600" : stats.remaining === 0 ? "text-amber-600" : "text-green-600")}>{stats.remaining}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <p className="mb-1 text-sm font-medium">Available ({stats.availableCount})</p>
            <p className="text-sm text-muted-foreground">You (contractor){stats.availableNames.length > 0 ? `, ${stats.availableNames.join(", ")}` : ""}</p>
          </div>

          <div>
            <p className="mb-1 text-sm font-medium">Absent ({stats.absentMembers.length})</p>
            {stats.absentMembers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No absences on this day.</p>
            ) : (
              <ul className="space-y-1">
                {stats.absentMembers.map((m, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <Badge className={ABSENCE_TYPE_BADGE[m.type] ?? ABSENCE_TYPE_BADGE.other}>{m.type}</Badge>
                    {m.name}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <p className="mb-1 text-sm font-medium">Jobs scheduled ({stats.jobCount})</p>
            {stats.jobTitles.length === 0 ? (
              <p className="text-sm text-muted-foreground">No jobs scheduled.</p>
            ) : (
              <ul className="list-inside list-disc text-sm text-muted-foreground">
                {stats.jobTitles.map((title, i) => (
                  <li key={i}>{title}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PatternDialog({
  member,
  dayOfWeek,
  existing,
  onClose,
  onSave,
}: {
  member: TeamMember;
  dayOfWeek: number;
  existing: WorkingPattern | null;
  onClose: () => void;
  onSave: (dayOfWeek: number, isWorking: boolean, startTime: string, endTime: string) => void;
}) {
  const defaultWorking = existing ? existing.is_working : dayOfWeek <= 4;
  const [isWorking, setIsWorking] = useState(defaultWorking);
  const [startTime, setStartTime] = useState(existing?.start_time?.slice(0, 5) ?? "08:00");
  const [endTime, setEndTime] = useState(existing?.end_time?.slice(0, 5) ?? "17:00");

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{member.full_name} — {DAY_LABELS[dayOfWeek]}</DialogTitle>
          <DialogDescription>Set this worker's regular working pattern for {DAY_LABELS[dayOfWeek]}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={isWorking}
              onChange={(e) => setIsWorking(e.target.checked)}
              className="h-4 w-4"
            />
            Working this day
          </label>

          {isWorking && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="pattern_start">Start time</Label>
                <Input id="pattern_start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pattern_end">End time</Label>
                <Input id="pattern_end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button onClick={() => onSave(dayOfWeek, isWorking, startTime, endTime)} className="w-full">
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LogAbsenceDialog({
  teamMembers,
  onClose,
  onSaved,
}: {
  teamMembers: TeamMember[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [workerId, setWorkerId] = useState("");
  const [absenceType, setAbsenceType] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!workerId) {
      toast.error("Select a worker");
      return;
    }
    if (!absenceType) {
      toast.error("Select an absence type");
      return;
    }
    if (!startDate || !endDate) {
      toast.error("Start and end dates are required");
      return;
    }
    if (endDate < startDate) {
      toast.error("End date must be on or after the start date");
      return;
    }

    setSaving(true);
    try {
      const status = absenceType === "holiday" ? "requested" : "approved";
      const { error } = await supabase.from("team_member_absences").insert({
        team_member_id: workerId,
        absence_type: absenceType,
        start_date: startDate,
        end_date: endDate,
        notes: notes.trim() || null,
        status,
      });
      if (error) throw error;
      toast.success("Absence logged");
      onSaved();
    } catch (error) {
      console.error("Error logging absence:", error);
      toast.error("Failed to log absence");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log absence</DialogTitle>
          <DialogDescription>Record holiday, sickness or other time off for a team member</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="absence_worker">Worker</Label>
            <Select value={workerId} onValueChange={setWorkerId}>
              <SelectTrigger id="absence_worker">
                <SelectValue placeholder="Select worker" />
              </SelectTrigger>
              <SelectContent>
                {teamMembers.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="absence_type">Type</Label>
            <Select value={absenceType} onValueChange={setAbsenceType}>
              <SelectTrigger id="absence_type">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {ABSENCE_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="absence_start">Start date</Label>
              <Input id="absence_start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="absence_end">End date</Label>
              <Input id="absence_end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="absence_notes">Notes</Label>
            <Textarea id="absence_notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? "Saving…" : "Log absence"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
