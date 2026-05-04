import { Fragment, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useInvoices, type InvoiceItem } from "@/hooks/useInvoices";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  Loader2,
  Wrench,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Hammer,
  Clock,
  Check,
  CheckCircle,
  MapPin,
  ChevronLeft,
  Users,
  UserPlus,
} from "lucide-react";
import { InvoiceFormDialog, type InvoiceFormInitialData } from "@/components/management/invoices/InvoiceFormDialog";

const STATUS_ORDER = ["scheduled", "in_progress", "snagging", "complete"] as const;
type JobStatus = (typeof STATUS_ORDER)[number] | "cancelled";

const statusLabel: Record<JobStatus, string> = {
  scheduled: "Scheduled",
  in_progress: "In progress",
  snagging: "Snagging",
  complete: "Complete",
  cancelled: "Cancelled",
};

const STEPS = [
  { status: "scheduled" as const, label: "Job Scheduled", Icon: Calendar },
  { status: "in_progress" as const, label: "Work Started", Icon: Hammer },
  { status: "snagging" as const, label: "Final Checks", Icon: AlertTriangle },
  { status: "complete" as const, label: "Job Complete", Icon: CheckCircle },
];

const COMPLETION_TIME_HOURS: Record<string, number> = {
  half_day: 4,
  full_day: 8,
  "2_days": 16,
  "3_days": 24,
  "1_week": 40,
  "2_weeks": 80,
  "1_month": 160,
};

type JobCardData = {
  id: string;
  title: string;
  status: JobStatus;
  start_date: string | null;
  actual_start: string | null;
  actual_end: string | null;
  estimated_completion: string | null;
  location: string | null;
  customer_id: string;
  client_name: string;
  client_ts_code: string | null;
  quote_number: string | null;
  issued_quote_id: string | null;
};

type TimesheetEntry = {
  id: string;
  job_id: string;
  date: string;
  hours: number;
  worker_id: string | null;
  description: string | null;
};

type SnagItem = {
  id: string;
  job_id: string;
  title: string;
  is_resolved: boolean;
};

type TeamMember = {
  id: string;
  full_name: string;
  role: string;
  is_active: boolean;
};

type JobAssignment = {
  id: string;
  job_id: string;
  team_member_id: string | null;
  is_contractor: boolean;
};

function formatHours(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  const days = Math.floor(hours / 8);
  const rem = hours % 8;
  return rem > 0 ? `${days}d ${rem.toFixed(0)}h` : `${days}d`;
}

function JobTimer({ actualStart, actualEnd, estimatedCompletion, status }: {
  actualStart: string | null;
  actualEnd: string | null;
  estimatedCompletion: string | null;
  status: JobStatus;
}) {
  const [elapsed, setElapsed] = useState<number>(0);

  useEffect(() => {
    if (!actualStart) return;
    const end = actualEnd ? new Date(actualEnd) : null;

    const compute = () => {
      const endTime = end ?? new Date();
      const diffMs = endTime.getTime() - new Date(actualStart).getTime();
      setElapsed(Math.max(0, diffMs / 3_600_000));
    };

    compute();
    if (!actualEnd) {
      const id = setInterval(compute, 60_000);
      return () => clearInterval(id);
    }
  }, [actualStart, actualEnd]);

  if (!actualStart) return null;

  const estimatedHours = estimatedCompletion ? COMPLETION_TIME_HOURS[estimatedCompletion] ?? null : null;
  const isComplete = !!actualEnd;
  const isOver = estimatedHours !== null && elapsed > estimatedHours;
  const color = isComplete && isOver ? "#dc2626" : isComplete ? "#16a34a" : "#f07820";

  return (
    <div className="rounded-md border p-3 space-y-2 text-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-medium" style={{ color }}>
          <Clock className="h-4 w-4" />
          {isComplete ? "Completed in" : "In progress for"} {formatHours(elapsed)}
        </div>
        {estimatedHours && (
          <span className="text-xs text-muted-foreground">
            Estimated: {formatHours(estimatedHours)}
          </span>
        )}
      </div>
      {estimatedHours && (
        <div className="w-full bg-muted rounded-full h-1.5">
          <div
            className="h-1.5 rounded-full transition-all"
            style={{
              width: `${Math.min(100, (elapsed / estimatedHours) * 100)}%`,
              backgroundColor: isOver ? "#dc2626" : "#f07820",
            }}
          />
        </div>
      )}
      {isComplete && estimatedHours && (
        <p className={`text-xs font-medium ${isOver ? "text-red-600" : "text-green-600"}`}>
          {isOver
            ? `${formatHours(elapsed - estimatedHours)} over estimate`
            : `${formatHours(estimatedHours - elapsed)} under estimate`}
        </p>
      )}
    </div>
  );
}

function StepTracker({ currentStatus }: { currentStatus: JobStatus }) {
  const isCancelled = currentStatus === "cancelled";
  const currentIdx = isCancelled
    ? -1
    : STATUS_ORDER.indexOf(currentStatus as (typeof STATUS_ORDER)[number]);

  return (
    <div className="flex items-start w-full">
      {STEPS.map((step, idx) => {
        const isCompleted = currentIdx !== -1 && idx < currentIdx;
        const isActive = currentIdx !== -1 && idx === currentIdx;

        return (
          <Fragment key={step.status}>
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "h-10 w-10 rounded-full border-2 flex items-center justify-center shrink-0 transition-all",
                  isCompleted && "bg-[#1e3a5f] border-[#1e3a5f]",
                  isActive && "border-[#f07820] animate-pulse",
                  !isCompleted && !isActive && "border-muted-foreground/30 bg-muted/30",
                )}
              >
                {isCompleted ? (
                  <Check className="h-4 w-4 text-white" />
                ) : (
                  <step.Icon
                    className={cn(
                      "h-4 w-4",
                      isActive ? "text-[#f07820]" : "text-muted-foreground/40",
                    )}
                  />
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

export function JobManagement() {
  const [jobs, setJobs] = useState<JobCardData[]>([]);
  const [snagItemsByJob, setSnagItemsByJob] = useState<Record<string, SnagItem[]>>({});
  const [newSnagByJob, setNewSnagByJob] = useState<Record<string, string>>({});
  const [timesheetsByJob, setTimesheetsByJob] = useState<Record<string, TimesheetEntry[]>>({});
  const [assignmentsByJob, setAssignmentsByJob] = useState<Record<string, JobAssignment[]>>({});
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingJobId, setSavingJobId] = useState<string | null>(null);
  const [assigningJobId, setAssigningJobId] = useState<string | null>(null);
  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false);
  const [invoiceInitialData, setInvoiceInitialData] = useState<InvoiceFormInitialData | null>(null);
  const [invoicedQuoteIds, setInvoicedQuoteIds] = useState<Set<string>>(new Set());
  const { toast } = useToast();
  const { createInvoice } = useInvoices();

  const loadJobs = async () => {
    setLoading(true);
    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;
    if (!user) { setLoading(false); return; }

    const { data: profileRow } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!profileRow?.id) { setLoading(false); return; }

    // Load team members for this contractor
    const { data: teamData } = await supabase
      .from("team_members")
      .select("id, full_name, role, is_active")
      .eq("contractor_id", profileRow.id)
      .eq("is_active", true)
      .order("full_name");
    setTeamMembers(teamData || []);

    const { data, error } = await supabase
      .from("jobs")
      .select(`
        id,
        title,
        status,
        start_date,
        actual_start,
        actual_end,
        location,
        customer_id,
        issued_quote_id,
        client:profiles!jobs_customer_id_fkey(full_name, company_name, ts_profile_code),
        quote:issued_quotes!jobs_issued_quote_id_fkey(quote_number, completion_time)
      `)
      .eq("contractor_id", profileRow.id)
      .order("start_date", { ascending: true, nullsFirst: false });

    if (error) {
      toast({ title: "Error", description: "Failed to load jobs", variant: "destructive" });
      setLoading(false);
      return;
    }

    const mapped = (data || []).map((job: any) => ({
      id: job.id,
      title: job.title,
      status: job.status,
      start_date: job.start_date,
      actual_start: job.actual_start ?? null,
      actual_end: job.actual_end ?? null,
      estimated_completion: job.quote?.completion_time ?? null,
      location: job.location ?? null,
      customer_id: job.customer_id,
      client_name: job.client?.company_name || job.client?.full_name || "Unknown client",
      client_ts_code: job.client?.ts_profile_code ?? null,
      quote_number: job.quote?.quote_number ?? null,
      issued_quote_id: job.issued_quote_id ?? null,
    })) as JobCardData[];

    setJobs(mapped);

    const jobIds = mapped.map((j) => j.id);

    if (jobIds.length > 0) {
      // Load snag items
      const { data: snagData, error: snagError } = await supabase
        .from("job_snag_items")
        .select("id, job_id, title, is_resolved")
        .in("job_id", jobIds)
        .order("created_at", { ascending: true });

      if (snagError) {
        toast({ title: "Warning", description: "Could not load snag items", variant: "destructive" });
      } else {
        const grouped = (snagData || []).reduce<Record<string, SnagItem[]>>((acc, item: any) => {
          if (!acc[item.job_id]) acc[item.job_id] = [];
          acc[item.job_id].push(item);
          return acc;
        }, {});
        setSnagItemsByJob(grouped);
      }

      // Load assignments
      const { data: assignData } = await supabase
        .from("job_assignments")
        .select("id, job_id, team_member_id, is_contractor")
        .in("job_id", jobIds);

      const groupedAssign = ((assignData || []) as JobAssignment[]).reduce<Record<string, JobAssignment[]>>((acc, row) => {
        if (!acc[row.job_id]) acc[row.job_id] = [];
        acc[row.job_id].push(row);
        return acc;
      }, {});
      setAssignmentsByJob(groupedAssign);

      // Load timesheets
      const { data: tsData } = await supabase
        .from("timesheets")
        .select("id, job_id, date, hours, worker_id, description")
        .in("job_id", jobIds);

      const groupedTs = ((tsData || []) as any[]).reduce((acc: Record<string, TimesheetEntry[]>, row: any) => {
        if (!acc[row.job_id]) acc[row.job_id] = [];
        acc[row.job_id].push(row as TimesheetEntry);
        return acc;
      }, {});
      setTimesheetsByJob(groupedTs);
    } else {
      setSnagItemsByJob({});
      setAssignmentsByJob({});
      setTimesheetsByJob({});
    }

    const quoteIds = mapped.map((j) => j.issued_quote_id).filter(Boolean) as string[];
    if (quoteIds.length > 0) {
      const { data: existingInvoices } = await supabase
        .from("invoices")
        .select("quote_id")
        .in("quote_id", quoteIds);
      setInvoicedQuoteIds(new Set((existingInvoices || []).map((i: any) => i.quote_id).filter(Boolean)));
    } else {
      setInvoicedQuoteIds(new Set());
    }

    setLoading(false);
  };

  useEffect(() => { loadJobs(); }, []);

  const sortedJobs = useMemo(
    () => [...jobs].sort((a, b) => {
      const aCancelled = a.status === "cancelled" ? 1 : 0;
      const bCancelled = b.status === "cancelled" ? 1 : 0;
      if (aCancelled !== bCancelled) return aCancelled - bCancelled;
      if (a.start_date && b.start_date) return a.start_date.localeCompare(b.start_date);
      if (a.start_date) return -1;
      if (b.start_date) return 1;
      return a.id.localeCompare(b.id);
    }),
    [jobs],
  );

  const toggleAssignment = async (jobId: string, memberId: string) => {
    setAssigningJobId(jobId);
    const existing = (assignmentsByJob[jobId] || []).find((a) => a.team_member_id === memberId);

    if (existing) {
      const { error } = await supabase
        .from("job_assignments")
        .delete()
        .eq("id", existing.id);

      if (error) {
        toast({ title: "Error", description: "Failed to remove assignment", variant: "destructive" });
      } else {
        setAssignmentsByJob((cur) => ({
          ...cur,
          [jobId]: (cur[jobId] || []).filter((a) => a.id !== existing.id),
        }));
      }
    } else {
      const { data, error } = await supabase
        .from("job_assignments")
        .insert({ job_id: jobId, team_member_id: memberId, is_contractor: false })
        .select("id, job_id, team_member_id, is_contractor")
        .single();

      if (error) {
        toast({ title: "Error", description: "Failed to assign worker", variant: "destructive" });
      } else {
        setAssignmentsByJob((cur) => ({
          ...cur,
          [jobId]: [...(cur[jobId] || []), data as JobAssignment],
        }));
      }
    }
    setAssigningJobId(null);
  };

  const changeStatus = async (job: JobCardData, nextStatus: JobStatus) => {
    if (job.status === "snagging" && nextStatus === "complete") {
      const openCount = (snagItemsByJob[job.id] || []).filter((i) => !i.is_resolved).length;
      if (openCount > 0) {
        toast({
          title: "Cannot complete job",
          description: "Resolve all snag items before moving this job to complete.",
          variant: "destructive",
        });
        return;
      }
    }

    setSavingJobId(job.id);
    const { error } = await supabase.from("jobs").update({ status: nextStatus }).eq("id", job.id);

    if (error) {
      toast({ title: "Status update failed", description: error.message, variant: "destructive" });
    } else {
      setJobs((cur) => cur.map((j) => (j.id === job.id ? { ...j, status: nextStatus } : j)));
      toast({ title: "Job updated", description: `${job.title} moved to ${statusLabel[nextStatus]}.` });
    }
    setSavingJobId(null);
  };

  const moveToPrevStatus = async (job: JobCardData) => {
    const statusIdx = STATUS_ORDER.indexOf(job.status as (typeof STATUS_ORDER)[number]);
    if (statusIdx <= 0) return;
    const prevStatus = STATUS_ORDER[statusIdx - 1];

    setSavingJobId(job.id);
    const { error } = await supabase.from("jobs").update({ status: prevStatus }).eq("id", job.id);

    if (error) {
      toast({ title: "Status update failed", description: error.message, variant: "destructive" });
    } else {
      setJobs((cur) => cur.map((j) => (j.id === job.id ? { ...j, status: prevStatus } : j)));
      toast({ title: "Job moved back", description: `${job.title} moved to ${statusLabel[prevStatus]}.` });
    }
    setSavingJobId(null);
  };

  const addSnagItem = async (jobId: string) => {
    const title = (newSnagByJob[jobId] || "").trim();
    if (!title) return;

    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;
    if (!user) return;

    const { data: profileRow } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    const { data, error } = await supabase
      .from("job_snag_items")
      .insert({ job_id: jobId, raised_by: profileRow?.id, title })
      .select("id, job_id, title, is_resolved")
      .single();

    if (error) {
      toast({ title: "Error", description: "Failed to add snag item", variant: "destructive" });
      return;
    }

    setSnagItemsByJob((cur) => ({ ...cur, [jobId]: [...(cur[jobId] || []), data as SnagItem] }));
    setNewSnagByJob((cur) => ({ ...cur, [jobId]: "" }));
  };

  const toggleSnagResolved = async (jobId: string, item: SnagItem, isResolved: boolean) => {
    const optimistic: SnagItem = { ...item, is_resolved: isResolved };
    setSnagItemsByJob((cur) => ({
      ...cur,
      [jobId]: (cur[jobId] || []).map((row) => (row.id === item.id ? optimistic : row)),
    }));

    const { error } = await supabase
      .from("job_snag_items")
      .update({ is_resolved: isResolved, resolved_at: isResolved ? new Date().toISOString() : null })
      .eq("id", item.id);

    if (error) {
      setSnagItemsByJob((cur) => ({
        ...cur,
        [jobId]: (cur[jobId] || []).map((row) => (row.id === item.id ? item : row)),
      }));
      toast({ title: "Error", description: "Failed to update snag item", variant: "destructive" });
    }
  };

  const buildInvoiceFromJob = async (job: JobCardData) => {
    const { data: fullJob, error: jobError } = await supabase
      .from("jobs")
      .select("id, issued_quote_id, contractor_id, customer_id")
      .eq("id", job.id)
      .single();

    if (jobError || !fullJob) throw new Error("Unable to load job details.");

    const { data: quote } = await supabase
      .from("issued_quotes")
      .select("id, client_name, client_email, client_phone, client_address, items")
      .eq("id", fullJob.issued_quote_id)
      .maybeSingle();

    const quoteItemsRaw = Array.isArray(quote?.items) ? quote.items : [];
    const quoteItems: InvoiceItem[] = quoteItemsRaw.map((item: any) => ({
      description: item.description ?? "Quote item",
      quantity: Number(item.quantity ?? 1),
      unit_price: Number(item.unit_price ?? 0),
      total: Number(item.total ?? Number(item.quantity ?? 1) * Number(item.unit_price ?? 0)),
    }));

    const { data: expenses } = await supabase
      .from("expenses" as any)
      .select("description, amount, is_approved, is_rechargeable, job_id")
      .eq("job_id", fullJob.id)
      .eq("is_approved", true)
      .eq("is_rechargeable", true);

    const expenseItems: InvoiceItem[] = (expenses || []).map((expense: any) => ({
      description: `Rechargeable expense: ${expense.description}`,
      quantity: 1,
      unit_price: Number(expense.amount ?? 0),
      total: Number(expense.amount ?? 0),
    }));

    const { data: contractorProfile } = await supabase
      .from("profiles")
      .select("vat_registered, hourly_rate")
      .eq("id", fullJob.contractor_id)
      .maybeSingle() as { data: { vat_registered?: boolean; hourly_rate?: number } | null };

    const jobTimesheets = timesheetsByJob[fullJob.id] || [];
    let labourItems: InvoiceItem[] = [];
    if (jobTimesheets.length > 0 && contractorProfile?.hourly_rate) {
      const hourlyRate = Number(contractorProfile.hourly_rate);
      const workerIds = [...new Set(jobTimesheets.map((t) => t.worker_id).filter(Boolean))] as string[];
      let workerNames: Record<string, string> = {};
      if (workerIds.length > 0) {
        const { data: members } = await supabase
          .from("team_members" as any)
          .select("id, full_name")
          .in("id", workerIds);
        for (const tm of members || []) {
          workerNames[(tm as any).id] = (tm as any).full_name || "Team member";
        }
      }
      labourItems = jobTimesheets.map((ts) => {
        const workerLabel = ts.worker_id ? (workerNames[ts.worker_id] || "Team member") : "Contractor";
        const hours = Number(ts.hours ?? 0);
        return {
          description: `Labour: ${workerLabel} — ${ts.date}${ts.description ? ` (${ts.description})` : ""}`,
          quantity: hours,
          unit_price: hourlyRate,
          total: hours * hourlyRate,
        };
      });
    }

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 14);

    setInvoiceInitialData({
      client_name: quote?.client_name || job.client_name,
      client_email: quote?.client_email || "",
      client_phone: quote?.client_phone || "",
      client_address: quote?.client_address || "",
      notes: `Generated from completed job: ${job.title}`,
      items: [...quoteItems, ...expenseItems, ...labourItems],
      defaultDueDate: dueDate.toISOString().slice(0, 10),
      defaultTaxRate: contractorProfile?.vat_registered ? 20 : 0,
      contractorId: fullJob.contractor_id,
      clientId: fullJob.customer_id,
      quoteId: fullJob.issued_quote_id,
    });
    setInvoiceDialogOpen(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <Wrench className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No jobs yet</h3>
          <p className="text-muted-foreground">Your assigned jobs will appear here once created.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {sortedJobs.map((job) => {
          const snagItems = snagItemsByJob[job.id] || [];
          const openSnags = snagItems.filter((i) => !i.is_resolved).length;
          const assignments = assignmentsByJob[job.id] || [];
          const assignedIds = new Set(assignments.map((a) => a.team_member_id).filter(Boolean));
          const statusIdx = STATUS_ORDER.indexOf(job.status as (typeof STATUS_ORDER)[number]);
          const nextStatus = statusIdx >= 0 && statusIdx < STATUS_ORDER.length - 1
            ? STATUS_ORDER[statusIdx + 1]
            : null;
          const prevStatus = statusIdx > 0 ? STATUS_ORDER[statusIdx - 1] : null;
          const canProgress = !!nextStatus;
          const canGoBack = !!prevStatus;
          const isSaving = savingJobId === job.id;
          const isAssigning = assigningJobId === job.id;

          return (
            <Card
              key={job.id}
              className={cn("transition-opacity", job.status === "cancelled" && "opacity-60")}
            >
              <CardContent className="p-6 space-y-5">
                <StepTracker currentStatus={job.status} />

                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-lg leading-tight">{job.title}</h3>
                      {job.quote_number && (
                        <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          {job.quote_number}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      <span>{job.client_name}</span>
                      {job.client_ts_code && (
                        <span className="ml-2 text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{job.client_ts_code}</span>
                      )}
                      {job.start_date
                        ? ` • Started ${format(new Date(job.start_date), "dd MMM yyyy")}`
                        : ""}
                    </p>
                    {job.location && (
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" />{job.location}
                      </p>
                    )}
                  </div>
                  {job.status === "cancelled" && (
                    <Badge variant="destructive">Cancelled</Badge>
                  )}
                </div>

                {(job.status === "in_progress" || job.status === "snagging" || job.status === "complete") && (
                  <JobTimer
                    actualStart={job.actual_start}
                    actualEnd={job.actual_end}
                    estimatedCompletion={job.estimated_completion}
                    status={job.status}
                  />
                )}

                {/* Worker assignments */}
                {job.status !== "cancelled" && (
                  <div className="rounded-md border p-3 space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Users className="h-4 w-4" />
                      Workers assigned
                    </div>
                    {assignments.length === 0 && teamMembers.length === 0 && (
                      <p className="text-xs text-muted-foreground">No team members added yet. Add team members in Team Management.</p>
                    )}
                    {assignments.length === 0 && teamMembers.length > 0 && (
                      <p className="text-xs text-muted-foreground">No workers assigned. Select from your team below.</p>
                    )}
                    {assignments.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {assignments.map((a) => {
                          const member = teamMembers.find((m) => m.id === a.team_member_id);
                          if (!member) return null;
                          return (
                            <Badge key={a.id} variant="secondary" className="gap-1 pr-1">
                              {member.full_name}
                              <button
                                type="button"
                                className="ml-1 hover:text-destructive transition-colors"
                                onClick={() => toggleAssignment(job.id, member.id)}
                                disabled={isAssigning}
                              >
                                ×
                              </button>
                            </Badge>
                          );
                        })}
                      </div>
                    )}
                    {teamMembers.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {teamMembers
                          .filter((m) => !assignedIds.has(m.id))
                          .map((m) => (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => toggleAssignment(job.id, m.id)}
                              disabled={isAssigning}
                              className="text-xs px-2 py-0.5 rounded border border-dashed border-muted-foreground/40 text-muted-foreground hover:border-[#f07820] hover:text-[#f07820] transition-colors flex items-center gap-1"
                            >
                              <UserPlus className="h-3 w-3" />
                              {m.full_name}
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                )}

                {job.status === "snagging" && (
                  <div className="rounded-md border p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Wrench className="h-4 w-4" />
                        Snag list
                      </div>
                      {openSnags > 0 ? (
                        <Badge variant="destructive" className="gap-1">
                          <AlertTriangle className="h-3 w-3" /> {openSnags} open
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="gap-1">
                          <CheckCircle2 className="h-3 w-3" /> All resolved
                        </Badge>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <Input
                        placeholder="Add snag item"
                        value={newSnagByJob[job.id] || ""}
                        onChange={(e) =>
                          setNewSnagByJob((cur) => ({ ...cur, [job.id]: e.target.value }))
                        }
                      />
                      <Button type="button" onClick={() => addSnagItem(job.id)}>Add</Button>
                    </div>

                    {snagItems.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No snag items yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {snagItems.map((item) => (
                          <label
                            key={item.id}
                            className="flex items-center gap-2 rounded-md border p-2 text-sm cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={item.is_resolved}
                              onChange={(e) => toggleSnagResolved(job.id, item, e.target.checked)}
                            />
                            <span className={item.is_resolved ? "line-through text-muted-foreground" : ""}>
                              {item.title}
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {(() => {
                  const entries = timesheetsByJob[job.id] || [];
                  if (entries.length === 0) return null;
                  const total = entries.reduce((sum, t) => sum + Number(t.hours ?? 0), 0);
                  return (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="h-4 w-4 shrink-0" />
                      <span>
                        <span className="font-medium text-foreground">{total}h</span> logged
                      </span>
                    </div>
                  );
                })()}

                <div className="flex flex-wrap gap-2">
                  {canGoBack && job.status !== "cancelled" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => moveToPrevStatus(job)}
                      disabled={isSaving}
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Move back
                    </Button>
                  )}
                  {canProgress && (
                    <Button
                      onClick={() => changeStatus(job, nextStatus!)}
                      disabled={isSaving}
                    >
                      {isSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                      Move to next stage
                    </Button>
                  )}
                  {job.status === "complete" && (
                    job.issued_quote_id && invoicedQuoteIds.has(job.issued_quote_id) ? (
                      <Badge variant="secondary" className="gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Invoice Sent
                      </Badge>
                    ) : (
                      <Button
                        variant="outline"
                        onClick={async () => {
                          try {
                            await buildInvoiceFromJob(job);
                          } catch (error: any) {
                            toast({
                              title: "Invoice generation failed",
                              description: error?.message || "Could not pre-populate invoice from job data.",
                              variant: "destructive",
                            });
                          }
                        }}
                      >
                        Generate Invoice
                      </Button>
                    )
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <InvoiceFormDialog
        open={invoiceDialogOpen}
        onClose={() => {
          setInvoiceDialogOpen(false);
          setInvoiceInitialData(null);
        }}
        initialData={invoiceInitialData}
        onSave={async (data) => { await createInvoice(data); loadJobs(); }}
      />
    </>
  );
}