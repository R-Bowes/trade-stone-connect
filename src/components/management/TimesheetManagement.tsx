import { useCallback, useEffect, useMemo, useState } from "react";
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

type Timesheet = Database["public"]["Tables"]["timesheets"]["Row"];
type TeamMember = Database["public"]["Tables"]["team_members"]["Row"];
type Job = { id: string; title: string; status: string };

type StatusFilter = "all" | "pending" | "approved" | "queried";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function getMonday(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const longDateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const shortDateFmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" });

function formatDate(value: string | null) {
  if (!value) return "—";
  return longDateFmt.format(new Date(value));
}

function formatGBP(value: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(value);
}

function timeToMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
}

function computeHoursFromClock(arrivedAt: string, leftAt: string, breakMinutes: number): number | null {
  const start = timeToMinutes(arrivedAt);
  const end = timeToMinutes(leftAt);
  if (start === null || end === null) return null;
  const diffMinutes = end - start - breakMinutes;
  if (diffMinutes <= 0) return 0;
  return Math.round((diffMinutes / 60) * 100) / 100;
}

interface CellData {
  entries: Timesheet[];
  totalHours: number;
  status: "empty" | "pending" | "approved" | "queried";
}

export function TimesheetManagement() {
  const [contractorId, setContractorId] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState<Date>(() => getMonday(new Date()));
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [entries, setEntries] = useState<Timesheet[]>([]);
  const [activeJobs, setActiveJobs] = useState<Job[]>([]);
  const [jobTitles, setJobTitles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const [workerFilter, setWorkerFilter] = useState<string>("all");
  const [jobFilter, setJobFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [reviewPending, setReviewPending] = useState(false);

  const [dialogTarget, setDialogTarget] = useState<{ member: TeamMember; date: string } | null>(null);

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const weekStartISO = toISODate(weekDays[0]);
  const weekEndISO = toISODate(weekDays[6]);

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

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const cId = contractorId ?? (await getContractorId());
      if (!cId) {
        setLoading(false);
        return;
      }
      if (!contractorId) setContractorId(cId);

      const [membersRes, entriesRes, jobsRes] = await Promise.all([
        supabase
          .from("team_members")
          .select("*")
          .eq("contractor_id", cId)
          .eq("status", "active")
          .order("full_name", { ascending: true }),
        supabase
          .from("timesheets")
          .select("*")
          .eq("contractor_id", cId)
          .gte("date", weekStartISO)
          .lte("date", weekEndISO),
        supabase
          .from("jobs")
          .select("id, title, status")
          .eq("contractor_id", cId)
          .in("status", ["scheduled", "in_progress"])
          .order("title", { ascending: true }),
      ]);

      if (membersRes.error) throw membersRes.error;
      if (entriesRes.error) throw entriesRes.error;
      if (jobsRes.error) throw jobsRes.error;

      setTeamMembers(membersRes.data ?? []);
      setEntries(entriesRes.data ?? []);
      setActiveJobs(jobsRes.data ?? []);

      const jobIds = Array.from(new Set((entriesRes.data ?? []).map((e) => e.job_id).filter((id): id is string => !!id)));
      if (jobIds.length > 0) {
        const { data: jobRows, error: jobRowsError } = await supabase
          .from("jobs")
          .select("id, title")
          .in("id", jobIds);
        if (jobRowsError) throw jobRowsError;
        const map: Record<string, string> = {};
        for (const row of jobRows ?? []) map[row.id] = row.title;
        setJobTitles(map);
      } else {
        setJobTitles({});
      }
    } catch (error) {
      console.error("Error loading timesheets:", error);
      toast.error("Failed to load timesheets");
    } finally {
      setLoading(false);
    }
  }, [contractorId, getContractorId, weekStartISO, weekEndISO]);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStartISO]);

  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      if (workerFilter !== "all" && e.worker_id !== workerFilter) return false;
      if (jobFilter !== "all" && e.job_id !== jobFilter) return false;
      if (statusFilter !== "all" && e.status !== statusFilter) return false;
      if (reviewPending && e.status !== "pending") return false;
      return true;
    });
  }, [entries, workerFilter, jobFilter, statusFilter, reviewPending]);

  const displayedMembers = useMemo(
    () => teamMembers.filter((m) => workerFilter === "all" || m.id === workerFilter),
    [teamMembers, workerFilter],
  );

  const getCell = useCallback((memberId: string, dateISO: string): CellData => {
    const cellEntries = filteredEntries.filter((e) => e.worker_id === memberId && e.date === dateISO);
    const totalHours = cellEntries.reduce((sum, e) => sum + Number(e.hours || 0), 0);
    let status: CellData["status"] = "empty";
    if (cellEntries.some((e) => e.status === "queried")) status = "queried";
    else if (cellEntries.some((e) => e.status === "pending")) status = "pending";
    else if (cellEntries.length > 0) status = "approved";
    return { entries: cellEntries, totalHours, status };
  }, [filteredEntries]);

  const rateFor = (entry: Timesheet, member: TeamMember | undefined) => {
    if (entry.rate_applied !== null) return Number(entry.rate_applied);
    if (!member) return 0;
    if (entry.is_overtime && member.overtime_rate !== null) return Number(member.overtime_rate);
    return Number(member.hourly_rate ?? member.day_rate ?? 0);
  };

  const summary = useMemo(() => {
    let totalHours = 0;
    let totalCost = 0;
    let pending = 0;
    let approved = 0;
    for (const entry of filteredEntries) {
      const member = teamMembers.find((m) => m.id === entry.worker_id);
      totalHours += Number(entry.hours || 0);
      totalCost += Number(entry.hours || 0) * rateFor(entry, member);
      if (entry.status === "pending") pending += 1;
      if (entry.status === "approved") approved += 1;
    }
    return { totalHours, totalCost, pending, approved };
  }, [filteredEntries, teamMembers]);

  const memberWeekTotal = (memberId: string) =>
    weekDays.reduce((sum, day) => sum + getCell(memberId, toISODate(day)).totalHours, 0);

  const handleApprove = async (entry: Timesheet) => {
    if (!contractorId) return;
    try {
      const { error } = await supabase
        .from("timesheets")
        .update({ status: "approved", approved_at: new Date().toISOString(), approved_by: contractorId })
        .eq("id", entry.id);
      if (error) throw error;
      toast.success("Timesheet approved");
      loadData();
    } catch (error) {
      console.error("Error approving timesheet:", error);
      toast.error("Failed to approve timesheet");
    }
  };

  const handleQuery = async (entry: Timesheet) => {
    try {
      const { error } = await supabase
        .from("timesheets")
        .update({ status: "queried" })
        .eq("id", entry.id);
      if (error) throw error;
      toast.success("Timesheet queried");
      loadData();
    } catch (error) {
      console.error("Error querying timesheet:", error);
      toast.error("Failed to query timesheet");
    }
  };

  const handleBulkApprove = async () => {
    if (!contractorId) return;
    const pendingIds = filteredEntries.filter((e) => e.status === "pending").map((e) => e.id);
    if (pendingIds.length === 0) {
      toast.error("No pending entries to approve");
      return;
    }
    try {
      const { error } = await supabase
        .from("timesheets")
        .update({ status: "approved", approved_at: new Date().toISOString(), approved_by: contractorId })
        .in("id", pendingIds);
      if (error) throw error;
      toast.success(`Approved ${pendingIds.length} timesheet${pendingIds.length === 1 ? "" : "s"}`);
      loadData();
    } catch (error) {
      console.error("Error bulk approving:", error);
      toast.error("Failed to approve entries");
    }
  };

  const handleExportCsv = () => {
    const header = ["Worker", "Date", "Job", "Arrived", "Left", "Break", "Hours", "Overtime", "Rate", "Cost", "Status"];
    const rows = filteredEntries.map((entry) => {
      const member = teamMembers.find((m) => m.id === entry.worker_id);
      const rate = rateFor(entry, member);
      const cost = Number(entry.hours || 0) * rate;
      return [
        member?.full_name ?? "Unknown",
        entry.date,
        entry.job_id ? (jobTitles[entry.job_id] ?? "") : "",
        entry.arrived_at ?? "",
        entry.left_at ?? "",
        String(entry.break_minutes ?? 0),
        String(entry.hours),
        entry.is_overtime ? "Yes" : "No",
        rate.toFixed(2),
        cost.toFixed(2),
        entry.status,
      ];
    });
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `timesheets_${weekStartISO}_${weekEndISO}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <i className="ti ti-loader-2 animate-spin text-3xl text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-heading text-2xl font-bold">Timesheets</h2>
          <p className="text-muted-foreground">Log and approve hours for your team</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={reviewPending ? "default" : "outline"}
            onClick={() => setReviewPending((prev) => !prev)}
          >
            <i className="ti ti-clock-exclamation mr-2" />
            Review pending
          </Button>
          <Button variant="outline" onClick={handleExportCsv}>
            <i className="ti ti-download mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setWeekStart((prev) => addDays(prev, -7))}>
            <i className="ti ti-chevron-left" />
          </Button>
          <div className="rounded-md border px-3 py-2 text-sm font-medium">
            Week of {longDateFmt.format(weekDays[0])}
          </div>
          <Button variant="outline" size="icon" onClick={() => setWeekStart((prev) => addDays(prev, 7))}>
            <i className="ti ti-chevron-right" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setWeekStart(getMonday(new Date()))}>
            This week
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          <Select value={workerFilter} onValueChange={setWorkerFilter}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Worker" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All workers</SelectItem>
              {teamMembers.map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={jobFilter} onValueChange={setJobFilter}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Job" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All jobs</SelectItem>
              {activeJobs.map((j) => (
                <SelectItem key={j.id} value={j.id}>{j.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="queried">Queried</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total hours</p>
            <p className="text-2xl font-bold">{summary.totalHours.toFixed(1)}h</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total cost</p>
            <p className="text-2xl font-bold">{formatGBP(summary.totalCost)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Pending</p>
            <p className="text-2xl font-bold text-amber-600">{summary.pending}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Approved</p>
            <p className="text-2xl font-bold text-green-600">{summary.approved}</p>
          </CardContent>
        </Card>
      </div>

      {reviewPending ? (
        <PendingReviewTable
          entries={filteredEntries.filter((e) => e.status === "pending")}
          teamMembers={teamMembers}
          jobTitles={jobTitles}
          onApprove={handleApprove}
          onQuery={handleQuery}
          onBulkApprove={handleBulkApprove}
        />
      ) : displayedMembers.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            No active team members. Add team members to start logging their hours.
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[200px]">Worker</TableHead>
                {weekDays.map((day) => (
                  <TableHead key={toISODate(day)} className="text-center">
                    <div>{DAY_LABELS[weekDays.indexOf(day)]}</div>
                    <div className="text-xs font-normal text-muted-foreground">{shortDateFmt.format(day)}</div>
                  </TableHead>
                ))}
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayedMembers.map((member) => {
                const weekTotal = memberWeekTotal(member.id);
                const rate = member.hourly_rate !== null
                  ? `${formatGBP(member.hourly_rate)}/hr`
                  : member.day_rate !== null
                    ? `${formatGBP(member.day_rate)}/day`
                    : null;
                return (
                  <TableRow key={member.id}>
                    <TableCell>
                      <p className="font-medium">{member.full_name}</p>
                      <div className="mt-1 flex items-center gap-1.5">
                        <Badge variant="secondary" className="text-xs">{member.role}</Badge>
                        {rate && <span className="text-xs text-muted-foreground">{rate}</span>}
                      </div>
                    </TableCell>
                    {weekDays.map((day) => {
                      const iso = toISODate(day);
                      const cell = getCell(member.id, iso);
                      return (
                        <TableCell key={iso} className="text-center">
                          <button
                            onClick={() => setDialogTarget({ member, date: iso })}
                            className={cn(
                              "flex h-12 w-full items-center justify-center rounded-md border text-sm font-medium transition-colors",
                              cell.status === "empty" && "border-dashed text-muted-foreground hover:bg-muted",
                              cell.status === "pending" && "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100",
                              cell.status === "approved" && "border-green-300 bg-green-50 text-green-800 hover:bg-green-100",
                              cell.status === "queried" && "border-red-300 bg-red-50 text-red-800 hover:bg-red-100",
                            )}
                          >
                            {cell.totalHours > 0 ? `${cell.totalHours}h` : ""}
                          </button>
                        </TableCell>
                      );
                    })}
                    <TableCell className={cn("text-right font-semibold", weekTotal > 40 && "text-amber-600")}>
                      {weekTotal.toFixed(1)}h
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {dialogTarget && (
        <EntryDialog
          member={dialogTarget.member}
          date={dialogTarget.date}
          entry={getCell(dialogTarget.member.id, dialogTarget.date).entries[0] ?? null}
          contractorId={contractorId}
          onClose={() => setDialogTarget(null)}
          onSaved={() => {
            setDialogTarget(null);
            loadData();
          }}
        />
      )}
    </div>
  );
}

function PendingReviewTable({
  entries,
  teamMembers,
  jobTitles,
  onApprove,
  onQuery,
  onBulkApprove,
}: {
  entries: Timesheet[];
  teamMembers: TeamMember[];
  jobTitles: Record<string, string>;
  onApprove: (entry: Timesheet) => void;
  onQuery: (entry: Timesheet) => void;
  onBulkApprove: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{entries.length} pending entr{entries.length === 1 ? "y" : "ies"}</p>
        <Button size="sm" onClick={onBulkApprove} disabled={entries.length === 0}>
          <i className="ti ti-checks mr-2" />
          Bulk approve
        </Button>
      </div>
      {entries.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">Nothing pending review.</CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Worker</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Job</TableHead>
                <TableHead className="text-right">Hours</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => {
                const member = teamMembers.find((m) => m.id === entry.worker_id);
                return (
                  <TableRow key={entry.id}>
                    <TableCell>{member?.full_name ?? "Unknown"}</TableCell>
                    <TableCell>{formatDate(entry.date)}</TableCell>
                    <TableCell>{entry.job_id ? jobTitles[entry.job_id] ?? "—" : "—"}</TableCell>
                    <TableCell className="text-right">{entry.hours}h</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => onQuery(entry)}>Query</Button>
                        <Button size="sm" onClick={() => onApprove(entry)}>Approve</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function EntryDialog({
  member,
  date,
  entry,
  contractorId,
  onClose,
  onSaved,
}: {
  member: TeamMember;
  date: string;
  entry: Timesheet | null;
  contractorId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [jobId, setJobId] = useState(entry?.job_id ?? "");
  const [arrivedAt, setArrivedAt] = useState(entry?.arrived_at?.slice(0, 5) ?? "");
  const [leftAt, setLeftAt] = useState(entry?.left_at?.slice(0, 5) ?? "");
  const [breakMinutes, setBreakMinutes] = useState(String(entry?.break_minutes ?? 0));
  const [hours, setHours] = useState(entry ? String(entry.hours) : "");
  const [description, setDescription] = useState(entry?.description ?? "");
  const [isOvertime, setIsOvertime] = useState(entry?.is_overtime ?? false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const loadJobs = async () => {
      setJobsLoading(true);
      const { data, error } = await supabase
        .from("job_assignments")
        .select("job:jobs!inner(id, title, status)")
        .eq("team_member_id", member.id)
        .in("job.status", ["scheduled", "in_progress"]);
      if (error) {
        console.error("Error loading assigned jobs:", error);
        toast.error("Failed to load jobs for this worker");
      } else {
        const jobList = (data ?? [])
          .map((row) => row.job as unknown as Job)
          .filter((j): j is Job => !!j);
        setJobs(jobList);
      }
      setJobsLoading(false);
    };
    loadJobs();
  }, [member.id]);

  useEffect(() => {
    if (arrivedAt && leftAt) {
      const computed = computeHoursFromClock(arrivedAt, leftAt, parseInt(breakMinutes, 10) || 0);
      if (computed !== null) setHours(String(computed));
    }
  }, [arrivedAt, leftAt, breakMinutes]);

  const rate = isOvertime && member.overtime_rate !== null
    ? Number(member.overtime_rate)
    : Number(member.hourly_rate ?? member.day_rate ?? 0);

  const handleSave = async () => {
    const parsedHours = parseFloat(hours);
    if (!parsedHours || parsedHours <= 0) {
      toast.error("Enter valid hours");
      return;
    }
    if (!contractorId) return;

    setSaving(true);
    try {
      const monday = getMonday(new Date(date));
      const payload = {
        contractor_id: contractorId,
        worker_id: member.id,
        job_id: jobId || null,
        date,
        hours: parsedHours,
        description: description.trim() || null,
        arrived_at: arrivedAt || null,
        left_at: leftAt || null,
        break_minutes: parseInt(breakMinutes, 10) || 0,
        is_overtime: isOvertime,
        rate_applied: rate || null,
        timesheet_week: toISODate(monday),
        status: entry?.status ?? "pending",
      };

      if (entry) {
        const { error } = await supabase.from("timesheets").update(payload).eq("id", entry.id);
        if (error) throw error;
        toast.success("Timesheet updated");
      } else {
        const { error } = await supabase.from("timesheets").insert(payload);
        if (error) throw error;
        toast.success("Timesheet logged");
      }
      onSaved();
    } catch (error) {
      console.error("Error saving timesheet:", error);
      toast.error("Failed to save timesheet");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!entry) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("timesheets").delete().eq("id", entry.id);
      if (error) throw error;
      toast.success("Timesheet entry removed");
      onSaved();
    } catch (error) {
      console.error("Error deleting timesheet:", error);
      toast.error("Failed to remove entry");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{entry ? "Edit" : "Add"} timesheet entry</DialogTitle>
          <DialogDescription>{member.full_name} · {formatDate(date)}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="job">Job</Label>
            <Select value={jobId} onValueChange={setJobId}>
              <SelectTrigger id="job">
                <SelectValue placeholder={jobsLoading ? "Loading jobs…" : "Select job"} />
              </SelectTrigger>
              <SelectContent>
                {jobs.map((j) => (
                  <SelectItem key={j.id} value={j.id}>{j.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="arrived_at">Arrived</Label>
              <Input id="arrived_at" type="time" value={arrivedAt} onChange={(e) => setArrivedAt(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="left_at">Left</Label>
              <Input id="left_at" type="time" value={leftAt} onChange={(e) => setLeftAt(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="break_minutes">Break (minutes)</Label>
              <Input
                id="break_minutes"
                type="number"
                min="0"
                step="5"
                value={breakMinutes}
                onChange={(e) => setBreakMinutes(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hours">Hours</Label>
              <Input
                id="hours"
                type="number"
                min="0"
                step="0.25"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <label htmlFor="is_overtime" className="flex items-center gap-2 text-sm font-medium">
              <input
                id="is_overtime"
                type="checkbox"
                checked={isOvertime}
                onChange={(e) => setIsOvertime(e.target.checked)}
                className="h-4 w-4"
              />
              Overtime
            </label>
            <span className="text-sm text-muted-foreground">Rate: {formatGBP(rate)}/hr</span>
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          {entry && (
            <Button variant="destructive" onClick={handleDelete} disabled={saving} className="sm:mr-auto">
              Delete
            </Button>
          )}
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : entry ? "Update entry" : "Add entry"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
