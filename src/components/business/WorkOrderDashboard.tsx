import { useEffect, useMemo, useRef, useState } from "react";
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
import { Loader2, Plus, ArrowLeft, ArrowRight, Camera, X } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { CONTRACTOR_TRADES } from "@/constants/trades";
import { VerificationBadge } from "@/components/verification/VerificationBadge";
import { useToast } from "@/hooks/use-toast";
import { prepareImageForUpload, isHeic } from "@/lib/imageUpload";
import { WorkOrderCard, PRIORITY_LABEL, PRIORITY_COLOR, WORK_ORDER_PHOTO_BUCKET } from "@/components/shared/WorkOrderCard";
import {
  useWorkOrders, formatWoNumber,
  type WorkOrder, type WorkOrderPriority, type WorkOrderStatus, type AvailableContractor,
} from "@/hooks/useWorkOrders";

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

const MAX_PHOTOS = 6;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

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
      .then(({ data }) => setCompanyCode(data?.company_code ?? null));
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
      .then(({ data }) => setRates(data ? { callout_standard: data.callout_standard, hourly_rate: data.hourly_rate } : null));
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
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) {
      setStep(1);
      setForm(BLANK_CREATE_FORM);
      setCreatedWo(null);
      setCandidates([]);
      setPhotoFiles([]);
    }
  }, [open]);

  const handlePhotosPicked = (picked: FileList | null) => {
    if (!picked) return;
    const accepted: File[] = [];
    const rejected: string[] = [];
    for (const file of Array.from(picked)) {
      if (!isHeic(file) && !file.type.startsWith("image/")) { rejected.push(`${file.name} (not an image)`); continue; }
      if (file.size > MAX_PHOTO_BYTES) { rejected.push(`${file.name} (over 10 MB)`); continue; }
      accepted.push(file);
    }
    const combined = [...photoFiles, ...accepted];
    if (combined.length > MAX_PHOTOS) rejected.push(`only the first ${MAX_PHOTOS} photos were kept`);
    setPhotoFiles(combined.slice(0, MAX_PHOTOS));
    if (rejected.length > 0) {
      toast({ title: "Some photos were skipped", description: rejected.join(", "), variant: "destructive" });
    }
  };

  // Path shape {uploaderUserId}/{workOrderId}/{file} — the first segment must
  // be the uploader's own auth.uid() for the bucket's upload policy. The work
  // order id is generated client-side so photos can be uploaded before the row
  // exists; any upload failure removes what was already uploaded.
  const uploadPhotos = async (workOrderId: string, userId: string): Promise<string[]> => {
    const paths: string[] = [];
    try {
      for (let i = 0; i < photoFiles.length; i++) {
        const prepared = await prepareImageForUpload(photoFiles[i]);
        const ext = prepared.name.split(".").pop() ?? "jpg";
        const path = `${userId}/${workOrderId}/${Date.now()}-${i}.${ext}`;
        const { error } = await supabase.storage.from(WORK_ORDER_PHOTO_BUCKET).upload(path, prepared);
        if (error) throw error;
        paths.push(path);
      }
      return paths;
    } catch (err) {
      if (paths.length > 0) await supabase.storage.from(WORK_ORDER_PHOTO_BUCKET).remove(paths);
      throw err;
    }
  };

  const createFromForm = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", profileId).maybeSingle();
    const workOrderId = crypto.randomUUID();

    let photos: string[] = [];
    if (photoFiles.length > 0) {
      try {
        photos = await uploadPhotos(workOrderId, user!.id);
      } catch (err) {
        console.error("Work order photo upload failed:", err);
        toast({ title: "Photos didn't upload", description: "Nothing was saved. Check your connection and try again.", variant: "destructive" });
        return null;
      }
    }

    try {
      return await createWorkOrder({
        id: workOrderId,
        company_id: companyId,
        raised_by: user!.id,
        raised_by_name: profile?.full_name ?? null,
        site_id: form.site_id,
        asset_id: form.asset_id || null,
        title: form.title.trim(),
        description: form.description || null,
        trade_required: form.trade_required || null,
        priority: form.priority,
        photos,
      });
    } catch (err) {
      if (photos.length > 0) await supabase.storage.from(WORK_ORDER_PHOTO_BUCKET).remove(photos);
      throw err;
    }
  };

  useEffect(() => {
    if (!form.site_id) { setAssets([]); return; }
    supabase.from("assets").select("id, name").eq("site_id", form.site_id)
      .then(({ data }) => setAssets(data ?? []));
  }, [form.site_id]);

  const handleSaveDraft = async () => {
    if (!form.title.trim() || !form.site_id) return;
    setSaving(true);
    try {
      const wo = await createFromForm();
      if (!wo) return;
      onDone();
    } finally {
      setSaving(false);
    }
  };

  const handleContinueToDispatch = async () => {
    if (!form.title.trim() || !form.site_id) return;
    setSaving(true);
    try {
      const wo = await createFromForm();
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

            <div className="space-y-1">
              <Label>Photos (optional)</Label>
              <div className="flex flex-wrap gap-2">
                {photoFiles.map((file, i) => (
                  <div key={`${file.name}-${i}`} className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs">
                    <span className="max-w-[120px] truncate">{file.name}</span>
                    <button
                      type="button"
                      aria-label={`Remove ${file.name}`}
                      onClick={() => setPhotoFiles((cur) => cur.filter((_, idx) => idx !== i))}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                {photoFiles.length < MAX_PHOTOS && (
                  <Button type="button" variant="outline" size="sm" onClick={() => photoInputRef.current?.click()}>
                    <Camera className="h-4 w-4 mr-1" />Add photos
                  </Button>
                )}
              </div>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*,.heic,.heif"
                multiple
                className="hidden"
                onChange={(e) => { handlePhotosPicked(e.target.files); e.target.value = ""; }}
              />
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

  const canCancel = wo.status === "draft" || wo.status === "dispatched";

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0 border-0 bg-transparent shadow-none">
        <DialogHeader className="sr-only">
          <DialogTitle>{formatWoNumber(companyCode, wo.wo_number)} — {wo.title}</DialogTitle>
        </DialogHeader>
        <WorkOrderCard
          workOrder={wo}
          site={wo.site ?? null}
          counterparty={wo.contractor?.full_name ?? null}
          companyCode={companyCode}
          viewer="business"
          actions={
            <>
              {canCancel && (
                <Button size="sm" variant="outline" onClick={() => onCancel(wo.id)}>Cancel work order</Button>
              )}
              {wo.status === "declined" && <Button size="sm" onClick={openReassign}>Reassign</Button>}
              {wo.status === "accepted" && wo.job_id && (
                <Button size="sm" variant="outline" asChild>
                  <a href={`/dashboard/business?view=jobs&jobId=${wo.job_id}`}>View linked job</a>
                </Button>
              )}
            </>
          }
        />

        {reassignOpen && (
          <Card>
            <CardContent className="p-4 space-y-2">
              <div className="text-xs font-semibold uppercase text-muted-foreground">Reassign to</div>
              {loadingCandidates ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : candidates.length === 0 ? (
                <p className="text-sm text-muted-foreground">No other panel contractors cover this site.</p>
              ) : (
                candidates.map((c) => (
                  <div key={c.contractor_id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                    <span>{c.full_name}</span>
                    <Button size="sm" disabled={reassigningId === c.contractor_id} onClick={() => handleReassign(c)}>
                      {reassigningId === c.contractor_id && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
                      Dispatch
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        )}
      </DialogContent>
    </Dialog>
  );
}
