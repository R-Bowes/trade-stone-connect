import { useEffect, useMemo, useState } from "react";
import { addDays, format, startOfWeek } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type JobOption = { id: string; title: string; contractor_id: string };
type WorkerRow = { workerId: string; label: string };
type TimesheetCell = {
  id?: string;
  job_id: string;
  worker_id: string;
  contractor_id: string;
  date: string;
  hours: number;
  approved: boolean;
};

const MIN_HOURS = 0;
const MAX_HOURS = 12;
const STEP = 0.5;

const toISODate = (date: Date) => format(date, "yyyy-MM-dd");

export function TimesheetManagement() {
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string>("");
  const [selectedWeekStart, setSelectedWeekStart] = useState<Date>(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [workers, setWorkers] = useState<WorkerRow[]>([]);
  const [cellsByKey, setCellsByKey] = useState<Record<string, TimesheetCell>>({});
  const [loading, setLoading] = useState(true);
  const [timesheetLoading, setTimesheetLoading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isContractorForSelectedJob, setIsContractorForSelectedJob] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { toast } = useToast();

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(selectedWeekStart, index)),
    [selectedWeekStart]
  );

  const selectedJob = jobs.find((job) => job.id === selectedJobId) || null;

  const getCellKey = (workerId: string, date: string) => `${workerId}|${date}`;

  const loadJobs = async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData.user;
      if (!user) {
        setErrorMessage("You must be signed in to view timesheets.");
        return;
      }

      setCurrentUserId(user.id);

      const [{ data: contractorJobs, error: contractorErr }, { data: workerRows, error: workerErr }] = await Promise.all([
        supabase
          .from("jobs")
          .select("id, title, contractor_id")
          .eq("contractor_id", user.id)
          .order("start_date", { ascending: false }),
        supabase
          .from("timesheets")
          .select("job_id, jobs!inner(id, title, contractor_id)")
          .eq("worker_id", user.id),
      ]);

      if (contractorErr) throw contractorErr;
      if (workerErr) throw workerErr;

      const fromContractor = (contractorJobs || []).map((job: any) => ({
        id: job.id,
        title: job.title,
        contractor_id: job.contractor_id,
      }));

      const fromWorker = (workerRows || []).map((row: any) => ({
        id: row.jobs.id,
        title: row.jobs.title,
        contractor_id: row.jobs.contractor_id,
      }));

      const merged = [...fromContractor, ...fromWorker].reduce<Record<string, JobOption>>((acc, job) => {
        acc[job.id] = job;
        return acc;
      }, {});

      const jobList = Object.values(merged);
      setJobs(jobList);

      if (jobList.length > 0) {
        setSelectedJobId((current) => current || jobList[0].id);
      }
    } catch (error: any) {
      setErrorMessage(error.message || "Failed to load jobs.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadJobs();
  }, []);

  const loadTimesheetsForSelection = async () => {
    if (!selectedJobId || !currentUserId) {
      setWorkers([]);
      setCellsByKey({});
      return;
    }

    setTimesheetLoading(true);
    setErrorMessage(null);

    try {
      const weekStartISO = toISODate(weekDays[0]);
      const weekEndISO = toISODate(weekDays[6]);

      const { data: jobRow, error: jobError } = await supabase
        .from("jobs")
        .select("contractor_id")
        .eq("id", selectedJobId)
        .single();

      if (jobError) throw jobError;

      const isContractor = jobRow.contractor_id === currentUserId;
      setIsContractorForSelectedJob(isContractor);

      const [{ data: teamMembersData, error: teamErr }, { data: timesheetData, error: tsErr }, { data: profileRows, error: profileErr }] = await Promise.all([
        supabase
          .from("job_team_members")
          .select("team_members!inner(user_id, full_name)")
          .eq("job_id", selectedJobId),
        supabase
          .from("timesheets")
          .select("id, job_id, contractor_id, worker_id, date, hours, approved")
          .eq("job_id", selectedJobId)
          .gte("date", weekStartISO)
          .lte("date", weekEndISO),
        supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", [jobRow.contractor_id]),
      ]);

      if (teamErr) throw teamErr;
      if (tsErr) throw tsErr;
      if (profileErr) throw profileErr;

      const contractorName = profileRows?.[0]?.full_name || "Contractor";
      const teamWorkerRows: WorkerRow[] = (teamMembersData || [])
        .map((row: any) => ({
          workerId: row.team_members.user_id,
          label: row.team_members.full_name || "Team member",
        }))
        .filter((row: WorkerRow) => Boolean(row.workerId));

      const workerMap = new Map<string, WorkerRow>();
      workerMap.set(jobRow.contractor_id, { workerId: jobRow.contractor_id, label: `${contractorName} (You${isContractor ? "" : " - contractor"})` });
      teamWorkerRows.forEach((row) => workerMap.set(row.workerId, row));

      (timesheetData || []).forEach((row: any) => {
        if (row.worker_id && !workerMap.has(row.worker_id)) {
          workerMap.set(row.worker_id, { workerId: row.worker_id, label: row.worker_id });
        }
      });

      const mappedCells = (timesheetData || []).reduce<Record<string, TimesheetCell>>((acc, row: any) => {
        const cell: TimesheetCell = {
          id: row.id,
          job_id: row.job_id,
          worker_id: row.worker_id,
          contractor_id: row.contractor_id,
          date: row.date,
          hours: Number(row.hours || 0),
          approved: Boolean(row.approved),
        };

        acc[getCellKey(cell.worker_id, cell.date)] = cell;
        return acc;
      }, {});

      setWorkers(Array.from(workerMap.values()));
      setCellsByKey(mappedCells);
    } catch (error: any) {
      setErrorMessage(error.message || "Failed to load timesheet grid.");
    } finally {
      setTimesheetLoading(false);
    }
  };

  useEffect(() => {
    loadTimesheetsForSelection();
  }, [selectedJobId, selectedWeekStart, currentUserId]);

  const canEditRow = (workerId: string) => {
    if (!currentUserId) return false;
    return isContractorForSelectedJob || currentUserId === workerId;
  };

  const getCell = (workerId: string, dateISO: string): TimesheetCell => {
    const key = getCellKey(workerId, dateISO);
    return (
      cellsByKey[key] || {
        job_id: selectedJobId,
        contractor_id: selectedJob?.contractor_id || "",
        worker_id: workerId,
        date: dateISO,
        hours: 0,
        approved: false,
      }
    );
  };

  const setHours = async (workerId: string, dateISO: string, nextHoursRaw: string) => {
    if (!selectedJob || !currentUserId) return;

    const parsed = Number(nextHoursRaw);
    if (Number.isNaN(parsed)) return;

    const normalized = Math.max(MIN_HOURS, Math.min(MAX_HOURS, Math.round(parsed / STEP) * STEP));
    const previous = getCell(workerId, dateISO);

    if (previous.approved) {
      toast({ title: "Locked", description: "Approved rows cannot be edited.", variant: "destructive" });
      return;
    }

    if (!canEditRow(workerId)) {
      toast({ title: "Not allowed", description: "You can only edit your own rows unless you are the contractor.", variant: "destructive" });
      return;
    }

    const optimistic: TimesheetCell = { ...previous, hours: normalized };
    setCellsByKey((current) => ({ ...current, [getCellKey(workerId, dateISO)]: optimistic }));

    const { data, error } = await supabase
      .from("timesheets")
      .upsert(
        {
          id: previous.id,
          contractor_id: selectedJob.contractor_id,
          job_id: selectedJob.id,
          worker_id: workerId,
          date: dateISO,
          hours: normalized,
          approved: previous.approved,
        },
        { onConflict: "job_id,worker_id,date" }
      )
      .select("id, job_id, contractor_id, worker_id, date, hours, approved")
      .single();

    if (error) {
      setCellsByKey((current) => ({ ...current, [getCellKey(workerId, dateISO)]: previous }));
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }

    setCellsByKey((current) => ({
      ...current,
      [getCellKey(workerId, dateISO)]: {
        id: data.id,
        job_id: data.job_id,
        contractor_id: data.contractor_id,
        worker_id: data.worker_id,
        date: data.date,
        hours: Number(data.hours || 0),
        approved: Boolean(data.approved),
      },
    }));
  };

  const approveWorkerWeek = async (workerId: string) => {
    if (!selectedJob || !isContractorForSelectedJob) return;

    const weekStartISO = toISODate(weekDays[0]);
    const weekEndISO = toISODate(weekDays[6]);

    const previous = { ...cellsByKey };

    setCellsByKey((current) => {
      const next = { ...current };
      weekDays.forEach((day) => {
        const iso = toISODate(day);
        const key = getCellKey(workerId, iso);
        const currentCell = getCell(workerId, iso);
        next[key] = { ...currentCell, approved: true };
      });
      return next;
    });

    const { error } = await supabase
      .from("timesheets")
      .update({ approved: true })
      .eq("job_id", selectedJob.id)
      .eq("worker_id", workerId)
      .gte("date", weekStartISO)
      .lte("date", weekEndISO);

    if (error) {
      setCellsByKey(previous);
      toast({ title: "Approval failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Week approved", description: "The selected worker's week has been approved." });
    }
  };

  const workerTotals = useMemo(() => {
    const totals: Record<string, number> = {};

    workers.forEach((worker) => {
      totals[worker.workerId] = weekDays.reduce((sum, day) => {
        const cell = getCell(worker.workerId, toISODate(day));
        return sum + Number(cell.hours || 0);
      }, 0);
    });

    return totals;
  }, [workers, weekDays, cellsByKey]);

  const weekTotal = useMemo(() => Object.values(workerTotals).reduce((sum, total) => sum + total, 0), [workerTotals]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (errorMessage && jobs.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Timesheets unavailable</CardTitle>
          <CardDescription>{errorMessage}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (jobs.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No jobs with timesheets</CardTitle>
          <CardDescription>Start a job (move it to in progress) to generate timesheet rows for this week.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Weekly Timesheets</CardTitle>
          <CardDescription>Edit daily hours (0–12 in 0.5 steps). Contractor can approve each worker's week.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <label className="text-sm font-medium mb-2 block">Job</label>
              <Select value={selectedJobId} onValueChange={setSelectedJobId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select job" />
                </SelectTrigger>
                <SelectContent>
                  {jobs.map((job) => (
                    <SelectItem key={job.id} value={job.id}>
                      {job.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end gap-2">
              <Button variant="outline" onClick={() => setSelectedWeekStart((current) => addDays(current, -7))}>Previous week</Button>
              <Button variant="outline" onClick={() => setSelectedWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>This week</Button>
              <Button variant="outline" onClick={() => setSelectedWeekStart((current) => addDays(current, 7))}>Next week</Button>
            </div>

            <div className="flex items-end justify-start md:justify-end">
              <div className="rounded-md border px-3 py-2 text-sm">
                Week total: <span className="font-semibold">{weekTotal.toFixed(1)}h</span>
              </div>
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            Week: {format(weekDays[0], "dd MMM yyyy")} – {format(weekDays[6], "dd MMM yyyy")}
          </p>

          {timesheetLoading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : workers.length === 0 ? (
            <div className="rounded-md border p-4 text-sm text-muted-foreground">No workers assigned to this job.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="p-2 text-left">Worker</th>
                    {weekDays.map((day) => (
                      <th key={toISODate(day)} className="p-2 text-center text-xs">
                        {format(day, "EEE dd")}
                      </th>
                    ))}
                    <th className="p-2 text-right">Total</th>
                    <th className="p-2 text-right">Approval</th>
                  </tr>
                </thead>
                <tbody>
                  {workers.map((worker) => {
                    const rowApproved = weekDays.every((day) => getCell(worker.workerId, toISODate(day)).approved);
                    const editable = canEditRow(worker.workerId) && !rowApproved;

                    return (
                      <tr key={worker.workerId} className="border-b align-top">
                        <td className="p-2 text-sm font-medium">{worker.label}</td>

                        {weekDays.map((day) => {
                          const iso = toISODate(day);
                          const cell = getCell(worker.workerId, iso);

                          return (
                            <td key={iso} className="p-2">
                              <Input
                                type="number"
                                min={MIN_HOURS}
                                max={MAX_HOURS}
                                step={STEP}
                                value={cell.hours}
                                disabled={!editable || cell.approved}
                                onChange={(event) => setHours(worker.workerId, iso, event.target.value)}
                                className="w-20"
                              />
                            </td>
                          );
                        })}

                        <td className="p-2 text-right text-sm font-semibold">{workerTotals[worker.workerId]?.toFixed(1) || "0.0"}h</td>
                        <td className="p-2 text-right">
                          <Button
                            size="sm"
                            disabled={!isContractorForSelectedJob || rowApproved}
                            onClick={() => approveWorkerWeek(worker.workerId)}
                          >
                            {rowApproved ? "Approved" : "Approve"}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
