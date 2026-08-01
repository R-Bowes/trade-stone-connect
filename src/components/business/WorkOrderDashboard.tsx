import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, Plus, ArrowLeft, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { CONTRACTOR_TRADES } from "@/constants/trades";
import { VerificationBadge } from "@/components/verification/VerificationBadge";
import {
  useWorkOrders, formatWoNumber,
  type WorkOrder, type WorkOrderPriority, type WorkOrderStatus, type AvailableContractor,
} from "@/hooks/useWorkOrders";

const PRIORITY_LABEL: Record<WorkOrderPriority, string> = {
  emergency: "Emergency", urgent: "Urgent", routine: "Routine", planned: "Planned",
};
const PRIORITY_COLOR: Record<WorkOrderPriority, string> = {
  emergency: "bg-red-100 text-red-800 border-red-300",
  urgent: "bg-amber-100 text-amber-800 border-amber-300",
  routine: "bg-blue-100 text-blue-800 border-blue-300",
  planned: "bg-slate-100 text-slate-700 border-slate-300",
};
const STATUS_LABEL: Record<WorkOrderStatus, string> = {
  draft: "Draft", dispatched: "Dispatched", accepted: "Accepted", declined: "Declined",
  reassigned: "Reassigned", cancelled: "Cancelled", completed: "Completed",
};
const STATUS_COLOR: Record<WorkOrderStatus, string> = {
  draft: "bg-slate-100 text-slate-700",
  dispatched: "bg-blue-100 text-blue-800",
  accepted: "bg-green-100 text-green-800",
  declined: "bg-red-100 text-red-800",
  reassigned: "bg-amber-100 text-amber-800",
  cancelled: "bg-slate-200 text-slate-500",
  completed: "bg-green-100 text-green-800",
};

type SiteOption = { id: string; name: string };
type AssetOption = { id: string; name: string };

interface CreateForm {
  site_id: string;
  asset_id: string;
  title: string;
  description: string;
  trade_required: string;
  priority: WorkOrderPriority;
}

const BLANK_CREATE_FORM: CreateForm = {
  site_id: "", asset_id: "", title: "", description: "", trade_required: "", priority: "routine",
};

interface WorkOrderDashboardProps {
  companyId: string;
  profileId: string;
}

export function WorkOrderDashboard({ companyId, profileId }: WorkOrderDashboardProps) {
  const { workOrders, loading, fetchWorkOrders, createWorkOrder, dispatchWorkOrder, reassignWorkOrder, cancelWorkOrder } = useWorkOrders();

  const [companyCode, setCompanyCode] = useState<string | null>(null);
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [statusFilter, setStatusFilter] = useState<WorkOrderStatus | "all">("all");
  const [siteFilter, setSiteFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<WorkOrderPriority | "all">("all");

  const [createOpen, setCreateOpen] = useState(false);
  const [detailWo, setDetailWo] = useState<WorkOrder | null>(null);

  const reload = () => fetchWorkOrders(companyId, {
    status: statusFilter === "all" ? undefined : statusFilter,
    siteId: siteFilter === "all" ? undefined : siteFilter,
    priority: priorityFilter === "all" ? undefined : priorityFilter,
  });

  useEffect(() => { reload(); }, [companyId, statusFilter, siteFilter, priorityFilter]);

  useEffect(() => {
    supabase.from("companies").select("company_code").eq("id", companyId).maybeSingle()
      .then(({ data }) => setCompanyCode((data as any)?.company_code ?? null));
    supabase.from("sites").select("id, name").eq("company_id", companyId).eq("status", "active").order("name")
      .then(({ data }) => setSites((data ?? []) as SiteOption[]));
  }, [companyId]);

  const summary = useMemo(() => {
    const open = workOrders.filter((w) => w.status === "draft" || w.status === "dispatched").length;
    const awaiting = workOrders.filter((w) => w.status === "dispatched" && w.response === "pending").length;
    const inProgress = workOrders.filter((w) => w.status === "accepted" && w.job_id).length;
    const now = new Date();
    const completedThisMonth = workOrders.filter((w) => {
      if (w.status !== "completed") return false;
      const d = new Date(w.updated_at);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }).length;
    return { open, awaiting, inProgress, completedThisMonth };
  }, [workOrders]);

  const handleCancel = async (id: string) => {
    await cancelWorkOrder(id);
    setDetailWo(null);
    reload();
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex justify-between items-center">
        <h2 className="font-heading text-2xl font-bold">Work Orders</h2>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />Create Work Order
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Open", value: summary.open },
          { label: "Awaiting response", value: summary.awaiting },
          { label: "In progress", value: summary.inProgress },
          { label: "Completed this month", value: summary.completedThisMonth },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <div className="text-2xl font-bold">{s.value}</div>
              <div className="text-xs text-muted-foreground">{s.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as WorkOrderStatus | "all")}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {(Object.keys(STATUS_LABEL) as WorkOrderStatus[]).map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={siteFilter} onValueChange={setSiteFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Site" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sites</SelectItem>
            {sites.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={(v) => setPriorityFilter(v as WorkOrderPriority | "all")}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Priority" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            {(Object.keys(PRIORITY_LABEL) as WorkOrderPriority[]).map((p) => <SelectItem key={p} value={p}>{PRIORITY_LABEL[p]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : workOrders.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">No work orders yet.</CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>WO #</TableHead>
                  <TableHead>Site</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Dispatched To</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workOrders.map((wo) => (
                  <TableRow key={wo.id} className="cursor-pointer" onClick={() => setDetailWo(wo)}>
                    <TableCell className="font-mono text-xs">{formatWoNumber(companyCode, wo.wo_number)}</TableCell>
                    <TableCell>{wo.site?.name ?? "—"}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{wo.title}</TableCell>
                    <TableCell><Badge variant="outline" className={PRIORITY_COLOR[wo.priority]}>{PRIORITY_LABEL[wo.priority]}</Badge></TableCell>
                    <TableCell>{wo.contractor?.full_name ?? "—"}</TableCell>
                    <TableCell><Badge className={STATUS_COLOR[wo.status]}>{STATUS_LABEL[wo.status]}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{format(new Date(wo.created_at), "d MMM yyyy")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <CreateWorkOrderDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        companyId={companyId}
        profileId={profileId}
        sites={sites}
        createWorkOrder={createWorkOrder}
        dispatchWorkOrder={dispatchWorkOrder}
        onDone={() => { setCreateOpen(false); reload(); }}
      />

      {detailWo && (
        <WorkOrderDetailDialog
          wo={detailWo}
          companyCode={companyCode}
          onClose={() => setDetailWo(null)}
          onCancel={handleCancel}
          onReassigned={() => { setDetailWo(null); reload(); }}
          reassignWorkOrder={reassignWorkOrder}
        />
      )}
    </div>
  );
}

// ── Contractor picker card ───────────────────────────────────────────────────

function ContractorDispatchCard({ contractor, engagementId, onDispatch, dispatching }: {
  contractor: AvailableContractor;
  engagementId: string;
  onDispatch: () => void;
  dispatching: boolean;
}) {
  const [tier, setTier] = useState<number>(1);
  const [rates, setRates] = useState<{ callout_standard: number; hourly_rate: number } | null>(null);

  useEffect(() => {
    supabase.from("contractor_verification_public").select("current_tier").eq("contractor_id", contractor.contractor_id).maybeSingle()
      .then(({ data }) => setTier(data?.current_tier ?? 1));
    supabase.rpc("effective_engagement_rates", { p_engagement_id: engagementId })
      .then(({ data }) => setRates(data ? { callout_standard: (data as any).callout_standard, hourly_rate: (data as any).hourly_rate } : null));
  }, [contractor.contractor_id, engagementId]);

  return (
    <Card>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="font-medium text-sm">{contractor.full_name ?? "Contractor"}</div>
            <div className="text-xs font-mono text-muted-foreground">{contractor.ts_profile_code}</div>
          </div>
          {tier >= 2 && <VerificationBadge tier={tier} size="sm" />}
        </div>
        {rates && (
          <div className="text-xs text-muted-foreground">
            Call-out £{rates.callout_standard.toFixed(2)} · £{rates.hourly_rate.toFixed(2)}/hr
          </div>
        )}
        <Button size="sm" onClick={onDispatch} disabled={dispatching} className="w-full">
          {dispatching ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
          Dispatch
        </Button>
      </CardContent>
    </Card>
  );
}

// ── Create Work Order dialog (3-step) ────────────────────────────────────────

function CreateWorkOrderDialog({
  open, onClose, companyId, profileId, sites, createWorkOrder, dispatchWorkOrder, onDone,
}: {
  open: boolean;
  onClose: () => void;
  companyId: string;
  profileId: string;
  sites: SiteOption[];
  createWorkOrder: ReturnType<typeof useWorkOrders>["createWorkOrder"];
  dispatchWorkOrder: ReturnType<typeof useWorkOrders>["dispatchWorkOrder"];
  onDone: () => void;
}) {
  const { fetchAvailableContractors } = useWorkOrders();
  const [step, setStep] = useState<1 | 2>(1);
  const [form, setForm] = useState<CreateForm>(BLANK_CREATE_FORM);
  const [assets, setAssets] = useState<AssetOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [createdWo, setCreatedWo] = useState<{ id: string; site_id: string | null } | null>(null);
  const [candidates, setCandidates] = useState<AvailableContractor[]>([]);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [dispatchingId, setDispatchingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setStep(1);
      setForm(BLANK_CREATE_FORM);
      setCreatedWo(null);
      setCandidates([]);
    }
  }, [open]);

  useEffect(() => {
    if (!form.site_id) { setAssets([]); return; }
    (supabase as any).from("assets").select("id, name").eq("site_id", form.site_id)
      .then(({ data }: { data: AssetOption[] | null }) => setAssets(data ?? []));
  }, [form.site_id]);

  const handleSaveDraft = async () => {
    if (!form.title.trim() || !form.site_id) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", profileId).maybeSingle();
      await createWorkOrder({
        company_id: companyId,
        raised_by: user!.id,
        raised_by_name: profile?.full_name ?? null,
        site_id: form.site_id,
        asset_id: form.asset_id || null,
        title: form.title.trim(),
        description: form.description || null,
        trade_required: form.trade_required || null,
        priority: form.priority,
      });
      onDone();
    } finally {
      setSaving(false);
    }
  };

  const handleContinueToDispatch = async () => {
    if (!form.title.trim() || !form.site_id) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", profileId).maybeSingle();
      const wo = await createWorkOrder({
        company_id: companyId,
        raised_by: user!.id,
        raised_by_name: profile?.full_name ?? null,
        site_id: form.site_id,
        asset_id: form.asset_id || null,
        title: form.title.trim(),
        description: form.description || null,
        trade_required: form.trade_required || null,
        priority: form.priority,
      });
      if (!wo) return;
      setCreatedWo({ id: wo.id, site_id: form.site_id });
      setStep(2);
      setCandidatesLoading(true);
      const found = await fetchAvailableContractors(companyId, form.site_id, form.trade_required || undefined);
      setCandidates(found);
      setCandidatesLoading(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDispatch = async (contractor: AvailableContractor) => {
    if (!createdWo) return;
    setDispatchingId(contractor.contractor_id);
    try {
      await dispatchWorkOrder(createdWo.id, contractor.contractor_id, contractor.engagement_id);
      onDone();
    } finally {
      setDispatchingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{step === 1 ? "Create Work Order" : "Dispatch to a Contractor"}</DialogTitle>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Site</Label>
              <Select value={form.site_id} onValueChange={(v) => setForm((f) => ({ ...f, site_id: v, asset_id: "" }))}>
                <SelectTrigger><SelectValue placeholder="Select a site" /></SelectTrigger>
                <SelectContent>{sites.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {form.site_id && assets.length > 0 && (
              <div className="space-y-1">
                <Label>Asset (optional)</Label>
                <Select value={form.asset_id || "none"} onValueChange={(v) => setForm((f) => ({ ...f, asset_id: v === "none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="No asset" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No asset</SelectItem>
                    {assets.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1">
              <Label>Title</Label>
              <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Textarea rows={3} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Trade required</Label>
              <Select value={form.trade_required || "none"} onValueChange={(v) => setForm((f) => ({ ...f, trade_required: v === "none" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="Any trade" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Any trade</SelectItem>
                  {CONTRACTOR_TRADES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Priority</Label>
              <RadioGroup value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v as WorkOrderPriority }))} className="grid grid-cols-2 gap-2">
                {(Object.keys(PRIORITY_LABEL) as WorkOrderPriority[]).map((p) => (
                  <label key={p} className="flex items-center gap-2 text-sm border rounded-md p-2 cursor-pointer">
                    <RadioGroupItem value={p} />
                    {PRIORITY_LABEL[p]}
                  </label>
                ))}
              </RadioGroup>
            </div>

            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={handleSaveDraft} disabled={saving || !form.title.trim() || !form.site_id}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save as Draft
              </Button>
              <Button onClick={handleContinueToDispatch} disabled={saving || !form.title.trim() || !form.site_id}>
                Continue to Dispatch <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <Button variant="ghost" size="sm" onClick={onDone}>
              <ArrowLeft className="h-4 w-4 mr-1" />Saved as draft — dispatch later
            </Button>
            {candidatesLoading ? (
              <div className="flex justify-center p-6"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : candidates.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No panel contractors cover this site{form.trade_required ? ` for ${form.trade_required}` : ""}. The work order has been saved as a draft — you can assign it later.
              </p>
            ) : (
              <div className="grid gap-2">
                {candidates.map((c) => (
                  <ContractorDispatchCard
                    key={c.contractor_id}
                    contractor={c}
                    engagementId={c.engagement_id}
                    onDispatch={() => handleDispatch(c)}
                    dispatching={dispatchingId === c.contractor_id}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Detail dialog ─────────────────────────────────────────────────────────────

function WorkOrderDetailDialog({ wo, companyCode, onClose, onCancel, onReassigned, reassignWorkOrder }: {
  wo: WorkOrder;
  companyCode: string | null;
  onClose: () => void;
  onCancel: (id: string) => void;
  onReassigned: () => void;
  reassignWorkOrder: ReturnType<typeof useWorkOrders>["reassignWorkOrder"];
}) {
  const { fetchAvailableContractors } = useWorkOrders();
  const [reassignOpen, setReassignOpen] = useState(false);
  const [candidates, setCandidates] = useState<AvailableContractor[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [reassigningId, setReassigningId] = useState<string | null>(null);

  const openReassign = async () => {
    setReassignOpen(true);
    setLoadingCandidates(true);
    const found = await fetchAvailableContractors(wo.company_id, wo.site_id ?? "", wo.trade_required ?? undefined);
    setCandidates(found);
    setLoadingCandidates(false);
  };

  const handleReassign = async (c: AvailableContractor) => {
    setReassigningId(c.contractor_id);
    try {
      await reassignWorkOrder(wo.id, c.contractor_id, c.engagement_id);
      onReassigned();
    } finally {
      setReassigningId(null);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{formatWoNumber(companyCode, wo.wo_number)} — {wo.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="flex gap-2">
            <Badge variant="outline" className={PRIORITY_COLOR[wo.priority]}>{PRIORITY_LABEL[wo.priority]}</Badge>
            <Badge className={STATUS_COLOR[wo.status]}>{STATUS_LABEL[wo.status]}</Badge>
          </div>
          {wo.site?.name && <div><span className="text-muted-foreground">Site:</span> {wo.site.name}</div>}
          {wo.asset?.name && <div><span className="text-muted-foreground">Asset:</span> {wo.asset.name}</div>}
          {wo.description && <p className="text-muted-foreground">{wo.description}</p>}
          {wo.contractor && <div><span className="text-muted-foreground">Dispatched to:</span> {wo.contractor.full_name}</div>}
          <div className="text-xs text-muted-foreground">Created {format(new Date(wo.created_at), "d MMM yyyy 'at' HH:mm")}</div>

          {wo.rate_snapshot && (
            <div className="rounded-md border p-3 text-xs space-y-1">
              <div className="font-medium">Rate snapshot</div>
              {"callout_standard" in wo.rate_snapshot && <div>Call-out: £{Number((wo.rate_snapshot as any).callout_standard).toFixed(2)}</div>}
              {"hourly_rate" in wo.rate_snapshot && <div>Hourly: £{Number((wo.rate_snapshot as any).hourly_rate).toFixed(2)}</div>}
            </div>
          )}

          {wo.status === "declined" && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 space-y-2">
              {wo.decline_reason && <p className="text-red-800">Declined: {wo.decline_reason}</p>}
              <Button size="sm" onClick={openReassign}>Reassign</Button>
            </div>
          )}

          {wo.status === "accepted" && wo.job_id && (
            <div className="rounded-md border border-green-200 bg-green-50 p-3">
              <a href={`/dashboard/business?view=jobs&jobId=${wo.job_id}`} className="text-green-800 underline text-sm">
                View linked job
              </a>
            </div>
          )}

          {wo.status === "dispatched" && (
            <div className="rounded-md border border-blue-200 bg-blue-50 p-3 flex items-center justify-between">
              <span className="text-blue-800 text-sm">Awaiting contractor response</span>
              <Button size="sm" variant="outline" onClick={() => onCancel(wo.id)}>Cancel</Button>
            </div>
          )}

          {reassignOpen && (
            <div className="space-y-2 pt-2 border-t">
              <div className="text-xs font-semibold uppercase text-muted-foreground">Reassign to</div>
              {loadingCandidates ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : candidates.length === 0 ? (
                <p className="text-sm text-muted-foreground">No other panel contractors cover this site.</p>
              ) : (
                candidates.map((c) => (
                  <div key={c.contractor_id} className="flex items-center justify-between rounded-md border p-2">
                    <span>{c.full_name}</span>
                    <Button size="sm" disabled={reassigningId === c.contractor_id} onClick={() => handleReassign(c)}>
                      {reassigningId === c.contractor_id && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
                      Dispatch
                    </Button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
