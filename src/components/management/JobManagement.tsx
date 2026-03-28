import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Wrench, AlertTriangle, CheckCircle2 } from "lucide-react";

const STATUS_ORDER = ["scheduled", "in_progress", "snagging", "complete"] as const;
type JobStatus = (typeof STATUS_ORDER)[number] | "cancelled";

type JobCardData = {
  id: string;
  title: string;
  status: JobStatus;
  start_date: string | null;
  client_id: string;
  client_name: string;
};

type SnagItem = {
  id: string;
  job_id: string;
  title: string;
  is_resolved: boolean;
};

const statusLabel: Record<JobStatus, string> = {
  scheduled: "Scheduled",
  in_progress: "In progress",
  snagging: "Snagging",
  complete: "Complete",
  cancelled: "Cancelled",
};

function getAllowedTransitions(currentStatus: JobStatus): JobStatus[] {
  if (currentStatus === "cancelled" || currentStatus === "complete") {
    return [];
  }

  const idx = STATUS_ORDER.indexOf(currentStatus as (typeof STATUS_ORDER)[number]);
  if (idx === -1) return [];

  return [STATUS_ORDER[idx + 1], "cancelled"].filter(Boolean) as JobStatus[];
}

export function JobManagement() {
  const [jobs, setJobs] = useState<JobCardData[]>([]);
  const [snagItemsByJob, setSnagItemsByJob] = useState<Record<string, SnagItem[]>>({});
  const [newSnagByJob, setNewSnagByJob] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingJobId, setSavingJobId] = useState<string | null>(null);
  const { toast } = useToast();

  const loadJobs = async () => {
    setLoading(true);
    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;

    if (!user) {
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("jobs")
      .select(`
        id,
        title,
        status,
        start_date,
        client_id,
        client:profiles!jobs_client_id_fkey(full_name, company_name)
      `)
      .eq("contractor_id", user.id)
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
      client_id: job.client_id,
      client_name: job.client?.company_name || job.client?.full_name || "Unknown client",
    })) as JobCardData[];

    setJobs(mapped);

    const jobIds = mapped.map((job) => job.id);
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
    } else {
      setSnagItemsByJob({});
    }

    setLoading(false);
  };

  useEffect(() => {
    loadJobs();
  }, []);

  const groupedJobs = useMemo(() => {
    const initial: Record<(typeof STATUS_ORDER)[number], JobCardData[]> = {
      scheduled: [],
      in_progress: [],
      snagging: [],
      complete: [],
    };

    jobs.forEach((job) => {
      if (job.status in initial) {
        initial[job.status as (typeof STATUS_ORDER)[number]].push(job);
      }
    });

    return initial;
  }, [jobs]);

  const changeStatus = async (job: JobCardData, nextStatus: JobStatus) => {
    const allowed = getAllowedTransitions(job.status);
    if (!allowed.includes(nextStatus)) {
      toast({
        title: "Invalid transition",
        description: `You can only move ${statusLabel[job.status]} to ${allowed.map((s) => statusLabel[s]).join(" or ")}.`,
        variant: "destructive",
      });
      return;
    }

    if (job.status === "snagging" && nextStatus === "complete") {
      const openCount = (snagItemsByJob[job.id] || []).filter((item) => !item.is_resolved).length;
      if (openCount > 0) {
        toast({
          title: "Cannot complete job",
          description: "Resolve all snag items before moving this job to complete.",
          variant: "destructive",
        });
        return;
      }
    }

    const previousStatus = job.status;
    setSavingJobId(job.id);
    setJobs((current) => current.map((item) => (item.id === job.id ? { ...item, status: nextStatus } : item)));

    const { error } = await supabase.from("jobs").update({ status: nextStatus }).eq("id", job.id);

    if (error) {
      setJobs((current) => current.map((item) => (item.id === job.id ? { ...item, status: previousStatus } : item)));
      toast({
        title: "Status update failed",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Job updated",
        description: `${job.title} moved to ${statusLabel[nextStatus]}.`,
      });
    }

    setSavingJobId(null);
  };

  const addSnagItem = async (jobId: string) => {
    const title = (newSnagByJob[jobId] || "").trim();
    if (!title) return;

    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;
    if (!user) return;

    const { data, error } = await supabase
      .from("job_snag_items")
      .insert({ job_id: jobId, contractor_id: user.id, created_by: user.id, title })
      .select("id, job_id, title, is_resolved")
      .single();

    if (error) {
      toast({ title: "Error", description: "Failed to add snag item", variant: "destructive" });
      return;
    }

    setSnagItemsByJob((current) => ({
      ...current,
      [jobId]: [...(current[jobId] || []), data as SnagItem],
    }));
    setNewSnagByJob((current) => ({ ...current, [jobId]: "" }));
  };

  const toggleSnagResolved = async (jobId: string, item: SnagItem, isResolved: boolean) => {
    const optimistic: SnagItem = { ...item, is_resolved: isResolved };
    setSnagItemsByJob((current) => ({
      ...current,
      [jobId]: (current[jobId] || []).map((row) => (row.id === item.id ? optimistic : row)),
    }));

    const { error } = await supabase
      .from("job_snag_items")
      .update({ is_resolved: isResolved, resolved_at: isResolved ? new Date().toISOString() : null })
      .eq("id", item.id);

    if (error) {
      setSnagItemsByJob((current) => ({
        ...current,
        [jobId]: (current[jobId] || []).map((row) => (row.id === item.id ? item : row)),
      }));
      toast({ title: "Error", description: "Failed to update snag item", variant: "destructive" });
    }
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
        <CardHeader>
          <CardTitle>No jobs yet</CardTitle>
          <CardDescription>Your assigned jobs will appear here and be grouped by status.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      {STATUS_ORDER.map((status) => (
        <section key={status} className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-semibold">{statusLabel[status]}</h3>
            <Badge variant="secondary">{groupedJobs[status].length}</Badge>
          </div>

          {groupedJobs[status].length === 0 ? (
            <Card>
              <CardContent className="py-6 text-sm text-muted-foreground">No jobs in this status.</CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {groupedJobs[status].map((job) => {
                const snagItems = snagItemsByJob[job.id] || [];
                const openSnags = snagItems.filter((item) => !item.is_resolved).length;
                const transitions = getAllowedTransitions(job.status);

                return (
                  <Card key={job.id}>
                    <CardHeader>
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="space-y-1">
                          <CardTitle className="text-lg">{job.title}</CardTitle>
                          <CardDescription>
                            {job.client_name}
                            {job.start_date ? ` • Starts ${format(new Date(job.start_date), "dd MMM yyyy")}` : " • No start date"}
                          </CardDescription>
                          <Badge>{statusLabel[job.status]}</Badge>
                        </div>

                        <div className="w-full md:w-56">
                          <Label className="mb-2 block">Move status</Label>
                          <Select onValueChange={(value) => changeStatus(job, value as JobStatus)} disabled={savingJobId === job.id || transitions.length === 0}>
                            <SelectTrigger>
                              <SelectValue placeholder={transitions.length === 0 ? "No further moves" : "Choose status"} />
                            </SelectTrigger>
                            <SelectContent>
                              {transitions.map((next) => (
                                <SelectItem key={next} value={next}>
                                  {statusLabel[next]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-4">
                      <div className="rounded-md border p-3 space-y-3">
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
                            onChange={(event) => setNewSnagByJob((current) => ({ ...current, [job.id]: event.target.value }))}
                          />
                          <Button type="button" onClick={() => addSnagItem(job.id)}>Add</Button>
                        </div>

                        {snagItems.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No snag items yet.</p>
                        ) : (
                          <div className="space-y-2">
                            {snagItems.map((item) => (
                              <label key={item.id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={item.is_resolved}
                                  onChange={(event) => toggleSnagResolved(job.id, item, event.target.checked)}
                                />
                                <span className={item.is_resolved ? "line-through text-muted-foreground" : ""}>{item.title}</span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
