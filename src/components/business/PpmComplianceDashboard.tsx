import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, ChevronLeft, ChevronRight, Wrench, CalendarClock } from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, differenceInCalendarDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  ASSET_CATEGORY_LABELS, ASSET_CATEGORY_TRADE_MAP,
  type AssetCategory, type ServiceVisitStatus,
} from "@/components/business/maintenance-types";
import { useWorkOrders, type AvailableContractor } from "@/hooks/useWorkOrders";

type VisitRow = {
  id: string;
  schedule_id: string;
  asset_id: string;
  contractor_id: string;
  company_id: string;
  scheduled_window_start: string;
  scheduled_window_end: string;
  completed_at: string | null;
  status: ServiceVisitStatus;
  work_order_id: string | null;
  asset_name?: string;
  asset_category?: AssetCategory;
  site_id?: string;
  site_name?: string;
  contractor_name?: string;
  frequency_label?: string;
};

const RAG_COLOR = (pct: number) => (pct >= 90 ? "text-green-600" : pct >= 70 ? "text-amber-600" : "text-red-600");
const RAG_BG = (pct: number) => (pct >= 90 ? "bg-green-100 text-green-800" : pct >= 70 ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800");

function complianceStats(visits: VisitRow[]) {
  const total = visits.length;
  const completed = visits.filter((v) => v.status === "completed").length;
  const overdue = visits.filter((v) => v.status === "overdue").length;
  const onTime = visits.filter((v) => v.status === "completed" && v.completed_at && v.completed_at <= v.scheduled_window_end).length;
  const pct = total === 0 ? 100 : Math.round((onTime / total) * 100);
  return { total, completed, overdue, pct };
}

export function PpmComplianceDashboard({ companyId, profileId }: { companyId: string; profileId: string }) {
  const [loading, setLoading] = useState(true);
  const [visits, setVisits] = useState<VisitRow[]>([]);
  const [activeSchedulesCount, setActiveSchedulesCount] = useState(0);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [woVisit, setWoVisit] = useState<VisitRow | null>(null);
  const [rescheduleVisit, setRescheduleVisit] = useState<VisitRow | null>(null);

  const load = async () => {
    setLoading(true);
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
    const ninetyDaysOut = new Date();
    ninetyDaysOut.setDate(ninetyDaysOut.getDate() + 90);

    const { data: visitRows } = await (supabase as any)
      .from("service_visits")
      .select("*")
      .eq("company_id", companyId)
      .gte("scheduled_window_end", twelveMonthsAgo.toISOString())
      .lte("scheduled_window_start", ninetyDaysOut.toISOString())
      .order("scheduled_window_end", { ascending: true });

    const rows = (visitRows ?? []) as VisitRow[];

    if (rows.length > 0) {
      const assetIds = [...new Set(rows.map((v) => v.asset_id))];
      const contractorIds = [...new Set(rows.map((v) => v.contractor_id))];
      const scheduleIds = [...new Set(rows.map((v) => v.schedule_id))];

      const [{ data: assetRows }, { data: contractorRows }, { data: scheduleRows }] = await Promise.all([
        (supabase as any).from("assets").select("id, name, category, site_id").in("id", assetIds),
        supabase.from("profiles").select("id, full_name").in("id", contractorIds),
        (supabase as any).from("service_schedules").select("id, frequency").in("id", scheduleIds),
      ]);

      const assetRowsArr = (assetRows ?? []) as any[];
      const siteIds: string[] = [...new Set(assetRowsArr.map((a) => a.site_id as string).filter(Boolean))];
      const { data: siteRows } = siteIds.length
        ? await supabase.from("sites").select("id, name").in("id", siteIds)
        : { data: [] as { id: string; name: string }[] };

      const assetById = new Map((assetRows ?? []).map((a: any) => [a.id, a]));
      const contractorById = new Map((contractorRows ?? []).map((c) => [c.id, c]));
      const siteById = new Map((siteRows ?? []).map((s) => [s.id, s]));
      const scheduleById = new Map((scheduleRows ?? []).map((s: any) => [s.id, s]));

      setVisits(rows.map((v) => {
        const asset = assetById.get(v.asset_id) as any;
        return {
          ...v,
          asset_name: asset?.name,
          asset_category: asset?.category,
          site_id: asset?.site_id,
          site_name: asset ? (siteById.get(asset.site_id) as any)?.name : undefined,
          contractor_name: (contractorById.get(v.contractor_id) as any)?.full_name,
          frequency_label: (scheduleById.get(v.schedule_id) as any)?.frequency,
        };
      }));
    } else {
      setVisits([]);
    }

    const { count } = await (supabase as any)
      .from("service_schedules")
      .select("id, contract:service_contracts!inner(company_id)", { count: "exact", head: true })
      .eq("is_active", true)
      .eq("contract.company_id", companyId);
    setActiveSchedulesCount(count ?? 0);

    setLoading(false);
  };

  useEffect(() => { load(); }, [companyId]);

  const now = new Date();
  const last12Months = useMemo(() => {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 12);
    return visits.filter((v) => v.scheduled_window_end >= cutoff.toISOString() && v.scheduled_window_end <= now.toISOString());
  }, [visits]);

  const overall = complianceStats(last12Months);

  const upcomingThisMonth = useMemo(() => {
    const in30 = new Date();
    in30.setDate(in30.getDate() + 30);
    return visits.filter((v) => (v.status === "scheduled" || v.status === "confirmed") && v.scheduled_window_end <= in30.toISOString());
  }, [visits]);

  const overdueVisits = useMemo(
    () => visits.filter((v) => v.status === "overdue")
      .sort((a, b) => a.scheduled_window_end.localeCompare(b.scheduled_window_end)),
    [visits],
  );

  const completedThisMonth = useMemo(
    () => visits.filter((v) => v.status === "completed" && v.completed_at && isSameMonth(new Date(v.completed_at), now)),
    [visits],
  );

  const bySite = useMemo(() => {
    const map = new Map<string, VisitRow[]>();
    for (const v of last12Months) {
      const key = v.site_id ?? "unknown";
      map.set(key, [...(map.get(key) ?? []), v]);
    }
    return Array.from(map.entries()).map(([siteId, vs]) => ({
      siteId, siteName: vs[0]?.site_name ?? "Unknown site", ...complianceStats(vs),
    }));
  }, [last12Months]);

  const byCategory = useMemo(() => {
    const map = new Map<string, VisitRow[]>();
    for (const v of last12Months) {
      const key = v.asset_category ?? "other";
      map.set(key, [...(map.get(key) ?? []), v]);
    }
    return Array.from(map.entries())
      .map(([cat, vs]) => ({ category: cat as AssetCategory, ...complianceStats(vs) }))
      .sort((a, b) => b.total - a.total);
  }, [last12Months]);

  const visitsByDay = useMemo(() => {
    const map = new Map<string, VisitRow[]>();
    for (const v of visits) {
      const key = v.scheduled_window_end.slice(0, 10);
      map.set(key, [...(map.get(key) ?? []), v]);
    }
    return map;
  }, [visits]);

  const calendarDays = eachDayOfInterval({ start: startOfMonth(calendarMonth), end: endOfMonth(calendarMonth) });

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <h2 className="font-heading text-2xl font-bold">PPM Compliance</h2>

      {/* Overall score */}
      <Card>
        <CardContent className="p-6 flex items-center gap-6">
          <div className={`text-5xl font-bold ${RAG_COLOR(overall.pct)}`}>{overall.pct}%</div>
          <div>
            <div className="font-medium">On-time compliance — last 12 months</div>
            <div className="text-sm text-muted-foreground">{overall.total} visits due, {overall.completed} completed</div>
          </div>
        </CardContent>
      </Card>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card><CardContent className="p-4"><div className="text-2xl font-bold">{upcomingThisMonth.length}</div><div className="text-xs text-muted-foreground">Upcoming this month</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-2xl font-bold text-red-600">{overdueVisits.length}</div><div className="text-xs text-muted-foreground">Overdue</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-2xl font-bold text-green-600">{completedThisMonth.length}</div><div className="text-xs text-muted-foreground">Completed this month</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-2xl font-bold">{activeSchedulesCount}</div><div className="text-xs text-muted-foreground">Active schedules</div></CardContent></Card>
      </div>

      {/* Compliance by site */}
      <Card>
        <CardContent className="p-0">
          <div className="p-4 pb-0"><h3 className="font-heading text-lg font-bold">Compliance by Site</h3></div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Site</TableHead><TableHead>Total</TableHead><TableHead>Completed</TableHead><TableHead>Overdue</TableHead><TableHead>Compliance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bySite.map((s) => (
                <TableRow key={s.siteId}>
                  <TableCell>{s.siteName}</TableCell>
                  <TableCell>{s.total}</TableCell>
                  <TableCell>{s.completed}</TableCell>
                  <TableCell className={s.overdue > 0 ? "text-red-600 font-medium" : ""}>{s.overdue}</TableCell>
                  <TableCell><Badge className={RAG_BG(s.pct)}>{s.pct}%</Badge></TableCell>
                </TableRow>
              ))}
              {bySite.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No PPM history yet.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Compliance by asset category */}
      <Card>
        <CardContent className="p-4 space-y-2">
          <h3 className="font-heading text-lg font-bold">Compliance by Asset Category</h3>
          {byCategory.length === 0 ? (
            <p className="text-sm text-muted-foreground">No PPM history yet.</p>
          ) : (
            <div className="space-y-2">
              {byCategory.map((c) => (
                <div key={c.category} className="flex items-center gap-3">
                  <div className="w-40 text-sm shrink-0 truncate">{ASSET_CATEGORY_LABELS[c.category] ?? c.category}</div>
                  <div className="flex-1 bg-muted rounded-full h-3 overflow-hidden">
                    <div className={`h-3 rounded-full ${c.pct >= 90 ? "bg-green-500" : c.pct >= 70 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${c.pct}%` }} />
                  </div>
                  <div className="w-12 text-sm text-right shrink-0">{c.pct}%</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Overdue priority list */}
      <Card>
        <CardContent className="p-0">
          <div className="p-4 pb-0"><h3 className="font-heading text-lg font-bold">Overdue Visits</h3></div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Asset</TableHead><TableHead>Site</TableHead><TableHead>Contractor</TableHead><TableHead>Due Date</TableHead><TableHead>Days Overdue</TableHead><TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {overdueVisits.map((v) => {
                const days = differenceInCalendarDays(now, new Date(v.scheduled_window_end));
                return (
                  <TableRow key={v.id}>
                    <TableCell>{v.asset_name ?? "—"}</TableCell>
                    <TableCell>{v.site_name ?? "—"}</TableCell>
                    <TableCell>{v.contractor_name ?? "—"}</TableCell>
                    <TableCell>{format(new Date(v.scheduled_window_end), "d MMM yyyy")}</TableCell>
                    <TableCell className="text-red-600 font-medium">{days}d</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {v.work_order_id ? (
                          <Badge variant="outline">WO raised</Badge>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => setWoVisit(v)}>
                            <Wrench className="h-3.5 w-3.5 mr-1" />Create Work Order
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => setRescheduleVisit(v)}>
                          <CalendarClock className="h-3.5 w-3.5 mr-1" />Reschedule
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {overdueVisits.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No overdue visits.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Upcoming calendar */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-heading text-lg font-bold">Upcoming (next 90 days)</h3>
            <div className="flex items-center gap-2">
              <Button size="icon" variant="ghost" onClick={() => setCalendarMonth((m) => addMonths(m, -1))}><ChevronLeft className="h-4 w-4" /></Button>
              <span className="text-sm font-medium w-28 text-center">{format(calendarMonth, "MMMM yyyy")}</span>
              <Button size="icon" variant="ghost" onClick={() => setCalendarMonth((m) => addMonths(m, 1))}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1 text-xs text-center text-muted-foreground">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d}>{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const dayVisits = visitsByDay.get(key) ?? [];
              const hasOverdue = dayVisits.some((v) => v.status === "overdue");
              const hasConfirmed = dayVisits.some((v) => v.status === "confirmed");
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedDay(day)}
                  className={`aspect-square rounded-md border text-xs flex flex-col items-center justify-center gap-0.5 ${isSameDay(day, now) ? "border-[#f07820]" : ""}`}
                >
                  <span>{format(day, "d")}</span>
                  {dayVisits.length > 0 && (
                    <span className={`w-4 h-4 rounded-full text-[9px] flex items-center justify-center text-white ${hasOverdue ? "bg-red-500" : hasConfirmed ? "bg-green-500" : "bg-blue-500"}`}>
                      {dayVisits.length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {selectedDay && (
        <Dialog open onOpenChange={(o) => { if (!o) setSelectedDay(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>{format(selectedDay, "d MMMM yyyy")}</DialogTitle></DialogHeader>
            <div className="space-y-2">
              {(visitsByDay.get(format(selectedDay, "yyyy-MM-dd")) ?? []).map((v) => (
                <div key={v.id} className="rounded-md border p-2 text-sm flex items-center justify-between">
                  <div>
                    <div className="font-medium">{v.asset_name}</div>
                    <div className="text-xs text-muted-foreground">{v.site_name} · {v.contractor_name}</div>
                  </div>
                  <Badge variant="outline">{v.status}</Badge>
                </div>
              ))}
              {(visitsByDay.get(format(selectedDay, "yyyy-MM-dd")) ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">No visits this day.</p>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {woVisit && (
        <CreateWorkOrderFromVisitDialog
          visit={woVisit}
          companyId={companyId}
          profileId={profileId}
          onClose={() => setWoVisit(null)}
          onCreated={() => { setWoVisit(null); load(); }}
        />
      )}

      {rescheduleVisit && (
        <RescheduleDialog
          visit={rescheduleVisit}
          onClose={() => setRescheduleVisit(null)}
          onSaved={() => { setRescheduleVisit(null); load(); }}
        />
      )}
    </div>
  );
}

function CreateWorkOrderFromVisitDialog({ visit, companyId, profileId, onClose, onCreated }: {
  visit: VisitRow;
  companyId: string;
  profileId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const { fetchAvailableContractors, createWorkOrder, dispatchWorkOrder } = useWorkOrders();
  const [candidates, setCandidates] = useState<AvailableContractor[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(true);
  const [dispatchingId, setDispatchingId] = useState<string | null>(null);

  const trade = visit.asset_category ? ASSET_CATEGORY_TRADE_MAP[visit.asset_category] : undefined;
  const title = `PPM: ${visit.asset_name ?? "Asset"} — ${visit.frequency_label ?? ""} service`;
  const description = `Planned preventative maintenance for ${visit.asset_name ?? "asset"}${visit.site_name ? ` at ${visit.site_name}` : ""}. Originally due ${format(new Date(visit.scheduled_window_end), "d MMM yyyy")}.`;

  useEffect(() => {
    (async () => {
      if (!visit.site_id) { setLoadingCandidates(false); return; }
      const found = await fetchAvailableContractors(companyId, visit.site_id, trade);
      setCandidates(found);
      setLoadingCandidates(false);
    })();
  }, [visit.site_id]);

  const handleDispatch = async (contractor: AvailableContractor) => {
    setDispatchingId(contractor.contractor_id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const wo = await createWorkOrder({
        company_id: companyId,
        raised_by: user!.id,
        site_id: visit.site_id ?? null,
        asset_id: visit.asset_id,
        title,
        description,
        trade_required: trade ?? null,
        priority: visit.status === "overdue" ? "urgent" : "planned",
      });
      if (!wo) return;
      await dispatchWorkOrder(wo.id, contractor.contractor_id, contractor.engagement_id);
      await (supabase as any).from("service_visits").update({ work_order_id: wo.id }).eq("id", visit.id);
      toast({ title: "Work order created and dispatched" });
      onCreated();
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to create work order", variant: "destructive" });
    } finally {
      setDispatchingId(null);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Create Work Order</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <div><span className="text-muted-foreground">Title:</span> {title}</div>
          <div className="text-muted-foreground">{description}</div>
          {trade && <div><span className="text-muted-foreground">Trade:</span> {trade}</div>}
          <div className="pt-2 border-t space-y-2">
            <div className="text-xs font-semibold uppercase text-muted-foreground">Dispatch to</div>
            {loadingCandidates ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : candidates.length === 0 ? (
              <p className="text-muted-foreground">No panel contractors cover this site{trade ? ` for ${trade}` : ""}.</p>
            ) : (
              candidates.map((c) => (
                <div key={c.contractor_id} className="flex items-center justify-between rounded-md border p-2">
                  <span>{c.full_name}</span>
                  <Button size="sm" disabled={dispatchingId === c.contractor_id} onClick={() => handleDispatch(c)}>
                    {dispatchingId === c.contractor_id && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
                    Dispatch
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RescheduleDialog({ visit, onClose, onSaved }: {
  visit: VisitRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [start, setStart] = useState(visit.scheduled_window_start.slice(0, 10));
  const [end, setEnd] = useState(visit.scheduled_window_end.slice(0, 10));
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await (supabase as any)
        .from("service_visits")
        .update({ scheduled_window_start: start, scheduled_window_end: end, status: "scheduled" })
        .eq("id", visit.id);
      if (error) throw error;
      toast({ title: "Visit rescheduled" });
      onSaved();
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to reschedule", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Reschedule Visit</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><label className="text-sm">Window start</label><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
          <div className="space-y-1"><label className="text-sm">Window end</label><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
