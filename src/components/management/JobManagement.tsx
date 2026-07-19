import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { markRecentAction } from "@/lib/recentActions";
import { useInvoices, type InvoiceItem } from "@/hooks/useInvoices";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  Loader2,
  Wrench,
  AlertTriangle,
  CheckCircle2,
  Clock,
  MapPin,
  ChevronLeft,
  ChevronRight,
  Users,
  UserPlus,
  MessageSquare,
  Download,
  ShieldCheck,
  Camera,
  FileText,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { InvoiceFormDialog, type InvoiceFormInitialData } from "@/components/management/invoices/InvoiceFormDialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import JobPhotosTab from "@/components/JobPhotosTab";
import { SlaStatusPill } from "@/components/SlaStatusPill";
import { generateJobRecordPdf } from "@/lib/generateJobRecordPdf";
import { formatQuoteRef, formatJobRef } from "@/lib/documentRefs";
import { fetchJobOrigin, type JobOrigin } from "@/lib/fetchJobOrigin";
import { JobOriginSection } from "@/components/JobOriginSection";
import { JobStageStrip } from "@/components/JobStageStrip";

const STATUS_ORDER = ["scheduled", "in_progress", "snagging", "complete"] as const;
type JobStatus = (typeof STATUS_ORDER)[number] | "cancelled";

const statusLabel: Record<JobStatus, string> = {
  scheduled: "Scheduled",
  in_progress: "In progress",
  snagging: "Snagging",
  complete: "Complete",
  cancelled: "Cancelled",
};

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
  quote_number: number | null;
  quote_version: number | null;
  issued_quote_id: string | null;
  engagement_id: string | null;
  sla_status: string | null;
  sla_completion_due: string | null;
  contract_value: number;
  job_number: number | null;
  priority: string | null;
  signed_off_by: string | null;
  signed_off_at: string | null;
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
  const [invoiceStatusByQuoteId, setInvoiceStatusByQuoteId] = useState<Record<string, string>>({});
  const [contractorProfileId, setContractorProfileId] = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [showPhotos, setShowPhotos] = useState(false);
  const [originOpen, setOriginOpen] = useState(false);
  const [originByJob, setOriginByJob] = useState<Record<string, JobOrigin>>({});
  const [originLoadingId, setOriginLoadingId] = useState<string | null>(null);
  const { toast } = useToast();
  const { createInvoice } = useInvoices();
  const navigate = useNavigate();

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
    setContractorProfileId(profileRow.id);

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
        engagement_id,
        sla_status,
        sla_completion_due,
        contract_value,
        job_number,
        priority,
        signed_off_by,
        signed_off_at,
        client:profiles!jobs_customer_id_fkey(full_name, company_name, ts_profile_code),
        quote:issued_quotes!jobs_issued_quote_id_fkey(quote_number, version, completion_time)
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
      quote_version: job.quote?.version ?? null,
      issued_quote_id: job.issued_quote_id ?? null,
      engagement_id: job.engagement_id ?? null,
      sla_status: job.sla_status ?? null,
      sla_completion_due: job.sla_completion_due ?? null,
      contract_value: job.contract_value ?? 0,
      job_number: job.job_number ?? null,
      priority: job.priority ?? null,
      signed_off_by: job.signed_off_by ?? null,
      signed_off_at: job.signed_off_at ?? null,
    })) as JobCardData[];

    setJobs(mapped);

    const jobIds = mapped.map((j) => j.id);

    if (jobIds.length > 0) {
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
        .select("quote_id, status")
        .in("quote_id", quoteIds);
      const statusMap: Record<string, string> = {};
      for (const inv of existingInvoices || []) {
        if ((inv as any).quote_id) statusMap[(inv as any).quote_id] = (inv as any).status;
      }
      setInvoiceStatusByQuoteId(statusMap);
    } else {
      setInvoiceStatusByQuoteId({});
    }

    setLoading(false);
  };

  useEffect(() => { loadJobs(); }, []);

  useEffect(() => {
    if (!selectedJobId) return;
    setOriginOpen(false);
    if (originByJob[selectedJobId]) return;
    const job = jobs.find((j) => j.id === selectedJobId);
    if (!job || (!job.issued_quote_id && !job.engagement_id)) return;

    setOriginLoadingId(selectedJobId);
    fetchJobOrigin({ issuedQuoteId: job.issued_quote_id, engagementId: job.engagement_id }).then((result) => {
      setOriginByJob((cur) => ({ ...cur, [selectedJobId]: result }));
      setOriginLoadingId((cur) => (cur === selectedJobId ? null : cur));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedJobId]);

  const activeJobs = useMemo(
    () => jobs
      .filter((j) => (["scheduled", "in_progress", "snagging"] as JobStatus[]).includes(j.status))
      .sort((a, b) => {
        const aIdx = STATUS_ORDER.indexOf(a.status as (typeof STATUS_ORDER)[number]);
        const bIdx = STATUS_ORDER.indexOf(b.status as (typeof STATUS_ORDER)[number]);
        if (aIdx !== bIdx) return aIdx - bIdx;
        if (a.start_date && b.start_date) return a.start_date.localeCompare(b.start_date);
        if (a.start_date) return -1;
        if (b.start_date) return 1;
        return a.id.localeCompare(b.id);
      }),
    [jobs],
  );

  const completedJobs = useMemo(
    () => {
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      const cutoff = ninetyDaysAgo.toISOString().slice(0, 10);
      return jobs
        .filter((j) => {
          if (j.status !== "complete") return false;
          const dateStr = j.actual_end ?? j.start_date ?? "";
          return dateStr >= cutoff;
        })
        .sort((a, b) => {
          const aDate = a.actual_end ?? a.start_date ?? "";
          const bDate = b.actual_end ?? b.start_date ?? "";
          if (aDate && bDate) return bDate.localeCompare(aDate);
          if (bDate) return 1;
          if (aDate) return -1;
          return b.id.localeCompare(a.id);
        });
    },
    [jobs],
  );

  const cancelledJobs = useMemo(
    () => jobs
      .filter((j) => j.status === "cancelled")
      .sort((a, b) => {
        const aDate = a.actual_end ?? a.start_date ?? "";
        const bDate = b.actual_end ?? b.start_date ?? "";
        if (aDate && bDate) return bDate.localeCompare(aDate);
        if (bDate) return 1;
        if (aDate) return -1;
        return b.id.localeCompare(a.id);
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
      // notify_job_status_change notifies both customer_id and contractor_id
      // unconditionally — suppress our own toast for it, we show this one.
      markRecentAction(job.id);
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
      markRecentAction(job.id);
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
      .select("id, client_name, client_email, client_phone, client_address, items, deposit_required, deposit_amount, deposit_paid, quote_number, version")
      .eq("id", fullJob.issued_quote_id)
      .maybeSingle();

    const quoteItemsRaw = Array.isArray(quote?.items) ? quote.items : [];
    const quoteItems: InvoiceItem[] = quoteItemsRaw.map((item: any) => ({
      description: item.description ?? "Quote item",
      quantity: Number(item.quantity ?? 1),
      unit_price: Number(item.unit_price ?? 0),
      total: Number(item.total ?? Number(item.quantity ?? 1) * Number(item.unit_price ?? 0)),
    }));

    // A paid deposit was already collected at quote acceptance — without
    // this, the generated invoice double-bills the client for it. Encoded
    // as a regular (negative) line item so it flows through the existing
    // subtotal/total math and every renderer that iterates `items` (PDF,
    // client-facing invoice view) automatically shows it — no separate
    // display-layer change needed.
    const depositAmount = Number(quote?.deposit_amount ?? 0);
    const depositPaid = !!quote?.deposit_paid;
    const depositRequired = !!quote?.deposit_required;
    const depositItems: InvoiceItem[] =
      depositPaid && depositAmount > 0
        ? [{
            description: `Less deposit paid — ${quote?.quote_number != null ? formatQuoteRef(quote.quote_number, { version: quote.version ?? undefined }) : "quote"}`,
            quantity: 1,
            unit_price: -depositAmount,
            total: -depositAmount,
          }]
        : [];

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
      items: [...quoteItems, ...expenseItems, ...labourItems, ...depositItems],
      defaultDueDate: dueDate.toISOString().slice(0, 10),
      defaultTaxRate: contractorProfile?.vat_registered ? 20 : 0,
      contractorId: fullJob.contractor_id,
      clientId: fullJob.customer_id,
      quoteId: fullJob.issued_quote_id,
      depositRequired,
      depositPaid,
      depositAmount: depositPaid ? depositAmount : null,
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

  const renderJobRow = (job: JobCardData) => (
    <button
      key={job.id}
      type="button"
      className={cn(
        "w-full text-left flex items-center gap-3 px-4 py-3 bg-background hover:bg-muted/50 transition-colors",
        job.status === "cancelled" && "opacity-60",
      )}
      onClick={() => setSelectedJobId(job.id)}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{job.title}</span>
          {job.quote_number != null && (
            <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              {formatQuoteRef(job.quote_number)}
            </span>
          )}
          {job.sla_status && (
            <SlaStatusPill status={job.sla_status} completionDue={job.sla_completion_due} />
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="text-xs text-muted-foreground">{job.client_name}</span>
          {job.client_ts_code && (
            <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{job.client_ts_code}</span>
          )}
          <Badge
            variant={job.status === "cancelled" ? "destructive" : job.status === "complete" ? "secondary" : "outline"}
            className="text-[10px] px-1.5 py-0"
            style={
              job.status === "in_progress"
                ? { backgroundColor: "#f07820", color: "#fff", borderColor: "#f07820" }
                : job.status === "snagging"
                ? { backgroundColor: "#f59e0b", color: "#fff", borderColor: "#f59e0b" }
                : job.status === "scheduled"
                ? { backgroundColor: "#1e3a5f", color: "#fff", borderColor: "#1e3a5f" }
                : undefined
            }
          >
            {statusLabel[job.status]}
          </Badge>
        </div>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </button>
  );

  const selectedJob = jobs.find((j) => j.id === selectedJobId) ?? null;
  const dialogSnagItems = selectedJob ? snagItemsByJob[selectedJob.id] || [] : [];
  const dialogOpenSnags = dialogSnagItems.filter((i) => !i.is_resolved).length;
  const dialogAssignments = selectedJob ? assignmentsByJob[selectedJob.id] || [] : [];
  const dialogAssignedIds = new Set(dialogAssignments.map((a) => a.team_member_id).filter(Boolean));
  const dialogStatusIdx = selectedJob
    ? STATUS_ORDER.indexOf(selectedJob.status as (typeof STATUS_ORDER)[number])
    : -1;
  const dialogNextStatus =
    dialogStatusIdx >= 0 && dialogStatusIdx < STATUS_ORDER.length - 1
      ? STATUS_ORDER[dialogStatusIdx + 1]
      : null;
  const dialogPrevStatus = dialogStatusIdx > 0 ? STATUS_ORDER[dialogStatusIdx - 1] : null;
  const dialogIsSaving = selectedJob ? savingJobId === selectedJob.id : false;
  const dialogIsAssigning = selectedJob ? assigningJobId === selectedJob.id : false;

  return (
    <>
      <div className="space-y-6">
        <section>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Active</div>
          {activeJobs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-3">No active jobs.</p>
          ) : (
            <div className="divide-y rounded-lg border overflow-hidden">
              {activeJobs.map((job) => renderJobRow(job))}
            </div>
          )}
        </section>

        {completedJobs.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Completed · last 90 days</span>
              <span className="text-xs text-muted-foreground">({completedJobs.length})</span>
            </div>
            <div className="divide-y rounded-lg border overflow-hidden">
              {completedJobs.map((job) => renderJobRow(job))}
            </div>
          </section>
        )}

        {cancelledJobs.length > 0 && (
          <section>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Cancelled</div>
            <div className="divide-y rounded-lg border overflow-hidden">
              {cancelledJobs.map((job) => renderJobRow(job))}
            </div>
          </section>
        )}
      </div>

      <Dialog open={!!selectedJobId} onOpenChange={(open) => { if (!open) { setSelectedJobId(null); setShowPhotos(false); } }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedJob && (
            <>
              <DialogHeader>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 space-y-1">
                    <p className="text-xs font-mono text-muted-foreground">
                      {selectedJob.job_number != null ? formatJobRef(selectedJob.job_number) : selectedJob.id.slice(0, 8)}
                      {selectedJob.quote_number != null
                        ? ` · from quote ${formatQuoteRef(selectedJob.quote_number, { version: selectedJob.quote_version ?? undefined })}`
                        : selectedJob.priority
                        ? ` · SLA ${selectedJob.priority}`
                        : ""}
                    </p>
                    <DialogTitle className="leading-tight">{selectedJob.title}</DialogTitle>
                    <div className="flex items-center gap-2 flex-wrap text-sm text-muted-foreground">
                      <span>{selectedJob.client_name}</span>
                      {selectedJob.client_ts_code && (
                        <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{selectedJob.client_ts_code}</span>
                      )}
                      {selectedJob.location && (
                        <span className="flex items-center gap-1 text-xs">
                          <MapPin className="h-3 w-3" />{selectedJob.location}
                        </span>
                      )}
                    </div>
                  </div>
                  <Badge
                    className="shrink-0 mt-0.5"
                    variant={selectedJob.status === "cancelled" ? "destructive" : "secondary"}
                    style={
                      selectedJob.status === "in_progress"
                        ? { backgroundColor: "#f07820", color: "#fff", borderColor: "#f07820" }
                        : selectedJob.status === "snagging"
                        ? { backgroundColor: "#f59e0b", color: "#fff", borderColor: "#f59e0b" }
                        : selectedJob.status === "complete"
                        ? { backgroundColor: "#16a34a", color: "#fff", borderColor: "#16a34a" }
                        : selectedJob.status === "scheduled"
                        ? { backgroundColor: "#1e3a5f", color: "#fff", borderColor: "#1e3a5f" }
                        : undefined
                    }
                  >
                    {statusLabel[selectedJob.status]}
                  </Badge>
                </div>
              </DialogHeader>

              <div className="space-y-5">
                <JobStageStrip status={selectedJob.status} signedOff={!!selectedJob.signed_off_by} />

                {/* Key facts grid: 3 cols × 2 rows */}
                {(() => {
                  const entries = timesheetsByJob[selectedJob.id] || [];
                  const totalHours = entries.reduce((sum, t) => sum + Number(t.hours ?? 0), 0);
                  return (
                    <div className="rounded-lg bg-muted/40 p-3 grid grid-cols-3 gap-3 text-sm">
                      <div>
                        <div className="text-xs text-muted-foreground">Scheduled for</div>
                        <div className="font-medium">
                          {selectedJob.start_date ? format(new Date(selectedJob.start_date), "d MMM yyyy") : "—"}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Started</div>
                        <div className="font-medium">
                          {selectedJob.actual_start ? format(new Date(selectedJob.actual_start), "d MMM yyyy") : "—"}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Completed</div>
                        <div className="font-medium">
                          {selectedJob.actual_end ? format(new Date(selectedJob.actual_end), "d MMM yyyy") : "—"}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Value</div>
                        <div className="font-medium font-mono">£{selectedJob.contract_value.toFixed(2)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Hours logged</div>
                        <div className="font-medium">{totalHours === 0 ? "0h" : formatHours(totalHours)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Origin</div>
                        {selectedJob.quote_number != null || selectedJob.engagement_id ? (
                          <button
                            type="button"
                            className="font-medium font-mono inline-flex items-center gap-1 hover:underline"
                            onClick={() => setOriginOpen((v) => !v)}
                          >
                            {selectedJob.quote_number != null
                              ? formatQuoteRef(selectedJob.quote_number, { version: selectedJob.quote_version ?? undefined })
                              : originByJob[selectedJob.id]?.engagementNumber ?? "Call-out"}
                            {originOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                          </button>
                        ) : (
                          <div className="font-medium font-mono">
                            {selectedJob.priority ? `SLA ${selectedJob.priority}` : "—"}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {originOpen && (selectedJob.quote_number != null || selectedJob.engagement_id) && (
                  <div className="rounded-md border p-4">
                    <JobOriginSection
                      origin={originByJob[selectedJob.id] ?? null}
                      loading={originLoadingId === selectedJob.id}
                    />
                  </div>
                )}

                {/* Workers */}
                {selectedJob.status !== "cancelled" && (
                  <div className="rounded-md border p-3 space-y-2">
                    {dialogAssignments.length === 0 ? (
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 text-muted-foreground">
                          <Users className="h-4 w-4" />
                          No workers assigned
                        </span>
                        {teamMembers.length === 0 && (
                          <span className="text-xs text-muted-foreground">Add workers in Team Management</span>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-1.5 items-center">
                        <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        {dialogAssignments.map((a) => {
                          const member = teamMembers.find((m) => m.id === a.team_member_id);
                          if (!member) return null;
                          return (
                            <Badge key={a.id} variant="secondary" className="gap-1 pr-1">
                              {member.full_name}
                              <button
                                type="button"
                                className="ml-1 hover:text-destructive transition-colors"
                                onClick={() => toggleAssignment(selectedJob.id, member.id)}
                                disabled={dialogIsAssigning}
                              >×</button>
                            </Badge>
                          );
                        })}
                      </div>
                    )}
                    {teamMembers.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {teamMembers
                          .filter((m) => !dialogAssignedIds.has(m.id))
                          .map((m) => (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => toggleAssignment(selectedJob.id, m.id)}
                              disabled={dialogIsAssigning}
                              className="text-xs px-2 py-0.5 rounded border border-dashed border-muted-foreground/40 text-muted-foreground hover:border-[#f07820] hover:text-[#f07820] transition-colors flex items-center gap-1"
                            >
                              <UserPlus className="h-3 w-3" />{m.full_name}
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                )}

                {(selectedJob.status === "in_progress" || selectedJob.status === "snagging" || selectedJob.status === "complete") && (
                  <JobTimer
                    actualStart={selectedJob.actual_start}
                    actualEnd={selectedJob.actual_end}
                    estimatedCompletion={selectedJob.estimated_completion}
                    status={selectedJob.status}
                  />
                )}

                {selectedJob.status === "snagging" && (
                  <div className="rounded-md border p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Wrench className="h-4 w-4" />
                        Snag list
                      </div>
                      {dialogOpenSnags > 0 ? (
                        <Badge variant="destructive" className="gap-1">
                          <AlertTriangle className="h-3 w-3" /> {dialogOpenSnags} open
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
                        value={newSnagByJob[selectedJob.id] || ""}
                        onChange={(e) =>
                          setNewSnagByJob((cur) => ({ ...cur, [selectedJob.id]: e.target.value }))
                        }
                      />
                      <Button type="button" onClick={() => addSnagItem(selectedJob.id)}>Add</Button>
                    </div>
                    {dialogSnagItems.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No snag items yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {dialogSnagItems.map((item) => (
                          <label
                            key={item.id}
                            className="flex items-center gap-2 rounded-md border p-2 text-sm cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={item.is_resolved}
                              onChange={(e) => toggleSnagResolved(selectedJob.id, item, e.target.checked)}
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

                {/* Footer */}
                <div className="border-t pt-4 mt-4 flex items-center justify-between gap-2 flex-wrap">
                  {/* Left: quiet utility actions */}
                  <div className="flex gap-1">
                    {selectedJob.status !== "cancelled" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground"
                        onClick={() => navigate("/dashboard/contractor?view=messages")}
                      >
                        <MessageSquare className="h-4 w-4 mr-1" />
                        Message client
                      </Button>
                    )}
                    {contractorProfileId && selectedJob.status !== "cancelled" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground"
                        onClick={() => setShowPhotos((v) => !v)}
                      >
                        <Camera className="h-4 w-4 mr-1" />
                        {showPhotos ? "Hide photos" : "Photos"}
                      </Button>
                    )}
                  </div>
                  {/* Right: status actions */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {(selectedJob.status === "snagging" || selectedJob.status === "complete") && !selectedJob.signed_off_by && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        Awaiting sign-off
                      </span>
                    )}
                    {dialogPrevStatus && selectedJob.status !== "cancelled" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => moveToPrevStatus(selectedJob)}
                        disabled={dialogIsSaving}
                      >
                        <ChevronLeft className="h-4 w-4 mr-1" />
                        Move back
                      </Button>
                    )}
                    {dialogNextStatus && selectedJob.status !== "cancelled" && (
                      <Button
                        onClick={() => changeStatus(selectedJob, dialogNextStatus)}
                        disabled={dialogIsSaving}
                        style={{ backgroundColor: "#f07820", color: "#fff" }}
                      >
                        {dialogIsSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                        {dialogNextStatus === "in_progress"
                          ? "Start work"
                          : dialogNextStatus === "snagging"
                          ? "Final checks"
                          : "Mark complete"}
                      </Button>
                    )}
                    {selectedJob.status === "complete" && (() => {
                      const invoiceStatus = selectedJob.issued_quote_id
                        ? invoiceStatusByQuoteId[selectedJob.issued_quote_id]
                        : undefined;

                      if (invoiceStatus === "draft") {
                        return (
                          <Badge variant="outline" className="gap-1">
                            <FileText className="h-3 w-3" /> Invoice Drafted
                          </Badge>
                        );
                      }

                      if (invoiceStatus) {
                        return (
                          <Badge variant="secondary" className="gap-1">
                            <CheckCircle2 className="h-3 w-3" /> Invoice Sent
                          </Badge>
                        );
                      }

                      return (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            try {
                              await buildInvoiceFromJob(selectedJob);
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
                      );
                    })()}
                    {selectedJob.status === "complete" && (
                      <span title={!selectedJob.signed_off_by ? "Awaiting customer sign-off" : undefined}>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!selectedJob.signed_off_by}
                          onClick={async () => {
                            try {
                              const { data: contractorProfile } = await supabase
                                .from("profiles")
                                .select("full_name, company_name, ts_profile_code, logo_url")
                                .eq("id", contractorProfileId!)
                                .maybeSingle();

                              const { data: clientProfile } = await supabase
                                .from("profiles")
                                .select("full_name, ts_profile_code")
                                .eq("id", selectedJob.customer_id)
                                .maybeSingle();

                              let invoiceData = null;
                              if (selectedJob.issued_quote_id) {
                                const { data } = await supabase
                                  .from("invoices")
                                  .select("invoice_number, status, total, due_date, paid_date")
                                  .eq("quote_id", selectedJob.issued_quote_id)
                                  .maybeSingle();
                                invoiceData = data;
                              }

                              const entries = timesheetsByJob[selectedJob.id] || [];
                              const totalHoursLogged = entries.reduce((sum, t) => sum + Number(t.hours ?? 0), 0);

                              const teamMembersList = dialogAssignments
                                .map((a) => teamMembers.find((m) => m.id === a.team_member_id))
                                .filter(Boolean)
                                .map((m) => ({ full_name: m!.full_name }));

                              await generateJobRecordPdf({
                                job: {
                                  id: selectedJob.id,
                                  title: selectedJob.title,
                                  status: selectedJob.status,
                                  quote_number: selectedJob.quote_number,
                                  location: selectedJob.location,
                                  start_date: selectedJob.start_date,
                                  actual_end: selectedJob.actual_end,
                                  contract_value: selectedJob.contract_value,
                                  signed_off_at: selectedJob.signed_off_at,
                                },
                                contractor: {
                                  full_name: contractorProfile?.full_name ?? null,
                                  company_name: (contractorProfile as any)?.company_name ?? null,
                                  ts_profile_code: contractorProfile?.ts_profile_code ?? null,
                                  logo_url: (contractorProfile as any)?.logo_url ?? null,
                                },
                                client: {
                                  full_name: clientProfile?.full_name ?? selectedJob.client_name,
                                  ts_profile_code: clientProfile?.ts_profile_code ?? selectedJob.client_ts_code,
                                  location: selectedJob.location,
                                },
                                teamMembers: teamMembersList,
                                totalHoursLogged,
                                invoice: invoiceData ? {
                                  invoice_number: Number((invoiceData as any).invoice_number ?? 0),
                                  status: (invoiceData as any).status ?? "sent",
                                  total: Number((invoiceData as any).total ?? 0),
                                  due_date: (invoiceData as any).due_date ?? "",
                                  paid_date: (invoiceData as any).paid_date ?? null,
                                } : null,
                              });
                            } catch (err: any) {
                              toast({
                                title: "PDF generation failed",
                                description: err?.message || "Please try again.",
                                variant: "destructive",
                              });
                            }
                          }}
                        >
                          <Download className="h-4 w-4 mr-1.5" />
                          Job record
                        </Button>
                      </span>
                    )}
                  </div>
                </div>

                {/* Expandable photos */}
                {showPhotos && contractorProfileId && selectedJob.status !== "cancelled" && (
                  <div className="rounded-md border p-4">
                    <JobPhotosTab
                      jobId={selectedJob.id}
                      contractorProfileId={contractorProfileId}
                      isContractor={true}
                    />
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

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
