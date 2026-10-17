import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { Loader2, Plus, Camera, X } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { CONTRACTOR_TRADES } from "@/constants/trades";
import { VerificationBadge } from "@/components/verification/VerificationBadge";
import { useToast } from "@/hooks/use-toast";
import { prepareImageForUpload, isHeic } from "@/lib/imageUpload";
import { formatGBP } from "@/lib/formatGBP";
import { poSpend } from "@/lib/workOrderValue";
import { WorkOrderCostLines } from "@/components/shared/WorkOrderCostLines";
import { CostReviewActions } from "@/components/business/CostReviewActions";
import { ApprovedValueField, useApprovedValueInput } from "@/components/business/ApprovedValueField";
import { useWorkOrderCosts } from "@/hooks/useWorkOrderCosts";
import {
  WorkOrderCard, PRIORITY_LABEL, PRIORITY_COLOR, WORK_ORDER_PHOTO_BUCKET, deriveWorkOrderStatus,
} from "@/components/shared/WorkOrderCard";
import {
  useWorkOrders, formatWoNumber, formatPoNumber, isAwaitingSignOff,
  type WorkOrder, type WorkOrderPriority, type WorkOrderStatus, type AvailableContractor, type SuggestedValue,
} from "@/hooks/useWorkOrders";

const STATUS_LABEL: Record<WorkOrderStatus, string> = {
  draft: "Draft", dispatched: "Dispatched", accepted: "Accepted", declined: "Declined",
  reassigned: "Reassigned", cancelled: "Cancelled", completed: "Completed",
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
  client_po_ref: string;
}

const BLANK_CREATE_FORM: CreateForm = {
  site_id: "", asset_id: "", title: "", description: "", trade_required: "", priority: "routine", client_po_ref: "",
};

interface WorkOrderDashboardProps {
  companyId: string;
}

export function WorkOrderDashboard({ companyId }: WorkOrderDashboardProps) {
  const { workOrders, loading, fetchWorkOrders, fetchWorkOrder } = useWorkOrders();

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

  // After any action on the open work order: refresh the list and the dialog
  // from the server, since approval, the PO and the value are all server-set.
  const handleDetailChanged = async (id: string) => {
    reload();
    const fresh = await fetchWorkOrder(id);
    setDetailWo(fresh);
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
        <>
          {/* Below md: card list — a 7-column table has no room to reflow at phone width. */}
          <div className="grid gap-3 md:hidden">
            {workOrders.map((wo) => (
              <WorkOrderCard
                key={wo.id}
                workOrder={wo}
                site={wo.site ?? null}
                counterparty={wo.contractor?.full_name ?? null}
                companyCode={companyCode}
                viewer="business"
                density="compact"
                actions={<Button size="sm" variant="outline" onClick={() => setDetailWo(wo)}>View</Button>}
              />
            ))}
          </div>

          <Card className="hidden md:block">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>WO #</TableHead>
                    <TableHead>Site</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Approved value</TableHead>
                    <TableHead>Dispatched To</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {workOrders.map((wo) => {
                    const status = deriveWorkOrderStatus(wo);
                    return (
                      <TableRow key={wo.id} className="cursor-pointer" onClick={() => setDetailWo(wo)}>
                        <TableCell className="font-mono text-xs">{formatWoNumber(companyCode, wo.wo_number)}</TableCell>
                        <TableCell>{wo.site?.name ?? "—"}</TableCell>
                        <TableCell className="max-w-[200px] truncate">{wo.title}</TableCell>
                        <TableCell><Badge variant="outline" className={PRIORITY_COLOR[wo.priority]}>{PRIORITY_LABEL[wo.priority]}</Badge></TableCell>
                        <TableCell className="font-mono text-xs">{wo.approved_value != null ? formatGBP(wo.approved_value) : "—"}</TableCell>
                        <TableCell>{wo.contractor?.full_name ?? "—"}</TableCell>
                        <TableCell><Badge className={status.className}>{status.label}</Badge></TableCell>
                        <TableCell className="text-xs text-muted-foreground">{format(new Date(wo.created_at), "d MMM yyyy")}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      <CreateWorkOrderDialog
        open={createOpen}
        onClose={() => { setCreateOpen(false); reload(); }}
        companyId={companyId}
        companyCode={companyCode}
        sites={sites}
      />

      {detailWo && (
        <WorkOrderDetailDialog
          wo={detailWo}
          companyCode={companyCode}
          onClose={() => setDetailWo(null)}
          onChanged={() => handleDetailChanged(detailWo.id)}
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

// ── Create Work Order dialog ─────────────────────────────────────────────────
// Step 1 raises the work order with its approved value. The server approves it
// at once (PO issued) when the raiser can sign off for the site or the value is
// under the approval threshold; otherwise it waits for sign-off. Step 2 shows
// which, and offers dispatch only when the PO is issued.

function CreateWorkOrderDialog({
  open, onClose, companyId, companyCode, sites,
}: {
  open: boolean;
  onClose: () => void;
  companyId: string;
  companyCode: string | null;
  sites: SiteOption[];
}) {
  const { fetchAvailableContractors, fetchSuggestedValue, createWorkOrder, dispatchWorkOrder } = useWorkOrders();
  const [step, setStep] = useState<1 | 2>(1);
  const [form, setForm] = useState<CreateForm>(BLANK_CREATE_FORM);
  const [assets, setAssets] = useState<AssetOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [createdWo, setCreatedWo] = useState<WorkOrder | null>(null);
  const [candidates, setCandidates] = useState<AvailableContractor[]>([]);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<SuggestedValue | null>(null);
  const [dispatchingId, setDispatchingId] = useState<string | null>(null);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const lookupRef = useRef(0);
  const valueInput = useApprovedValueInput(suggestion);
  const resetValue = valueInput.reset;
  const { toast } = useToast();

  useEffect(() => {
    if (!open) {
      setStep(1);
      setForm(BLANK_CREATE_FORM);
      setCreatedWo(null);
      setCandidates([]);
      setSuggestion(null);
      setPhotoFiles([]);
      resetValue();
    }
  }, [open, resetValue]);

  // Candidates and the suggested value follow site, trade and priority. Only
  // the latest lookup is applied, so a slow earlier one can't overwrite it.
  useEffect(() => {
    if (!open || step !== 1) return;
    if (!form.site_id) { setCandidates([]); setSuggestion(null); return; }
    const ticket = ++lookupRef.current;
    setCandidatesLoading(true);
    (async () => {
      const found = await fetchAvailableContractors(companyId, form.site_id, form.trade_required || undefined);
      const suggested = await fetchSuggestedValue(found, form.priority);
      if (ticket !== lookupRef.current) return;
      setCandidates(found);
      setSuggestion(suggested);
      setCandidatesLoading(false);
    })();
  }, [open, step, companyId, form.site_id, form.trade_required, form.priority, fetchAvailableContractors, fetchSuggestedValue]);

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

  const canRaise = !!form.title.trim() && !!form.site_id && valueInput.value != null;

  const handleRaise = async () => {
    if (!canRaise || valueInput.value == null) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const workOrderId = crypto.randomUUID();

      let photos: string[] = [];
      if (photoFiles.length > 0) {
        try {
          photos = await uploadPhotos(workOrderId, user!.id);
        } catch (err) {
          console.error("Work order photo upload failed:", err);
          toast({ title: "Photos didn't upload", description: "Nothing was saved. Check your connection and try again.", variant: "destructive" });
          return;
        }
      }

      let wo: WorkOrder | null;
      try {
        wo = await createWorkOrder({
          id: workOrderId,
          company_id: companyId,
          site_id: form.site_id,
          asset_id: form.asset_id || null,
          title: form.title.trim(),
          description: form.description || null,
          trade_required: form.trade_required || null,
          priority: form.priority,
          photos,
          approved_value: valueInput.value,
          client_po_ref: form.client_po_ref.trim() || null,
        });
      } catch {
        if (photos.length > 0) await supabase.storage.from(WORK_ORDER_PHOTO_BUCKET).remove(photos);
        return;
      }
      if (!wo) return;
      setCreatedWo(wo);
      setStep(2);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!form.site_id) { setAssets([]); return; }
    supabase.from("assets").select("id, name").eq("site_id", form.site_id)
      .then(({ data }) => setAssets(data ?? []));
  }, [form.site_id]);

  const handleDispatch = async (contractor: AvailableContractor) => {
    if (!createdWo) return;
    setDispatchingId(contractor.contractor_id);
    try {
      await dispatchWorkOrder(createdWo.id, contractor.engagement_id);
      onClose();
    } catch {
      // dispatchWorkOrder has already shown the server's reason.
    } finally {
      setDispatchingId(null);
    }
  };

  const approved = !!createdWo?.po_issued_at;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{step === 1 ? "Create Work Order" : createdWo ? formatWoNumber(companyCode, createdWo.wo_number) : "Work order"}</DialogTitle>
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

            <ApprovedValueField
              id="create-wo-approved-value"
              text={valueInput.text}
              onChange={valueInput.setText}
              suggestion={suggestion}
              loadingSuggestion={candidatesLoading}
              ready={!!form.site_id}
            />

            <div className="space-y-1">
              <Label htmlFor="create-wo-client-po">Your PO reference (optional)</Label>
              <Input
                id="create-wo-client-po"
                className="font-mono"
                value={form.client_po_ref}
                onChange={(e) => setForm((f) => ({ ...f, client_po_ref: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">Your own finance reference, shown next to the TradeStone PO number.</p>
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

            <DialogFooter>
              <Button onClick={handleRaise} disabled={saving || !canRaise}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Raise work order
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 2 && createdWo && (
          <div className="space-y-3">
            {approved ? (
              <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                Approved — <span className="font-mono">{formatPoNumber(companyCode, createdWo.wo_number)}</span> issued
                for <span className="font-mono">{formatGBP(createdWo.approved_value)}</span>.
              </div>
            ) : (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                Waiting for sign-off. The owner or a manager covering this site needs to approve
                {" "}<span className="font-mono">{formatGBP(createdWo.approved_value)}</span> before this work order can be dispatched.
              </div>
            )}

            {approved && (
              <>
                <div className="text-xs font-semibold uppercase text-muted-foreground">Dispatch to</div>
                {candidates.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No panel contractors cover this site{form.trade_required ? ` for ${form.trade_required}` : ""}. You can dispatch it later from the work order.
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
              </>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={onClose}>{approved ? "Dispatch later" : "Close"}</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Detail dialog ─────────────────────────────────────────────────────────────

function WorkOrderDetailDialog({ wo, companyCode, onClose, onChanged }: {
  wo: WorkOrder;
  companyCode: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const {
    fetchAvailableContractors, approveWorkOrder, dispatchWorkOrder, reassignWorkOrder,
    cancelWorkOrder, amendWorkOrderValue, canSignOff,
  } = useWorkOrders();
  const [pickMode, setPickMode] = useState<"dispatch" | "reassign" | null>(null);
  const [candidates, setCandidates] = useState<AvailableContractor[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [pickingId, setPickingId] = useState<string | null>(null);
  const [canSign, setCanSign] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editingValue, setEditingValue] = useState(false);
  const [valueText, setValueText] = useState("");
  const { costsByWorkOrder, loadCosts, approveCost, queryCost, rejectCost } = useWorkOrderCosts();

  useEffect(() => { void loadCosts([wo.id]); }, [wo.id, loadCosts]);
  useEffect(() => {
    let live = true;
    canSignOff(wo.id).then((ok) => { if (live) setCanSign(ok); });
    return () => { live = false; };
  }, [wo.id, canSignOff]);

  const lines = costsByWorkOrder[wo.id] ?? [];
  const spend = wo.approved_value != null ? poSpend(wo.approved_value, lines) : null;
  const awaiting = isAwaitingSignOff(wo);
  const readyToDispatch = wo.status === "draft" && !!wo.po_issued_at;
  const canCancel = canSign && (wo.status === "draft" || wo.status === "dispatched" || wo.status === "declined");
  // An issued PO can only be changed by someone with sign-off; before the PO
  // is issued, any member covering the site may set the value (server-checked).
  const canEditValue = ["draft", "dispatched", "accepted", "declined"].includes(wo.status)
    && (!wo.po_issued_at || canSign);

  const run = useCallback(async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
      onChanged();
    } catch {
      // The hook has already shown the server's reason.
    } finally {
      setBusy(false);
    }
  }, [onChanged]);

  const openPicker = async (mode: "dispatch" | "reassign") => {
    setPickMode(mode);
    setLoadingCandidates(true);
    const found = await fetchAvailableContractors(wo.company_id, wo.site_id ?? "", wo.trade_required ?? undefined);
    setCandidates(found);
    setLoadingCandidates(false);
  };

  const handlePick = async (c: AvailableContractor) => {
    setPickingId(c.contractor_id);
    try {
      if (pickMode === "reassign") await reassignWorkOrder(wo.id, c.engagement_id);
      else await dispatchWorkOrder(wo.id, c.engagement_id);
      setPickMode(null);
      onChanged();
    } catch {
      // Shown by the hook.
    } finally {
      setPickingId(null);
    }
  };

  const startEditValue = () => {
    setValueText(wo.approved_value != null ? Number(wo.approved_value).toFixed(2) : "");
    setEditingValue(true);
  };

  const saveValue = () => {
    const n = Math.round(Number(valueText) * 100) / 100;
    if (!Number.isFinite(n) || n <= 0) return;
    void run(async () => {
      await amendWorkOrderValue(wo.id, n);
      setEditingValue(false);
    });
  };

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
          costs={
            <>
              {spend && lines.length > 0 && (
                <div className="border-t pt-3 text-sm">
                  <span className="text-muted-foreground">Approved so far </span>
                  <span className="font-mono">{formatGBP(spend.approvedTotal)}</span>
                  <span className="text-muted-foreground"> of </span>
                  <span className="font-mono">{formatGBP(spend.approvedValue)}</span>
                  <span className="text-muted-foreground"> · </span>
                  <span className="font-mono">{formatGBP(spend.remaining)}</span>
                  <span className="text-muted-foreground"> left on the PO</span>
                </div>
              )}
              <WorkOrderCostLines
                lines={lines}
                approvedValue={wo.approved_value}
                viewer="business"
                renderLineActions={(line) => (
                  <CostReviewActions
                    line={line}
                    approve={approveCost}
                    query={queryCost}
                    reject={rejectCost}
                    // Approving an over-limit line amends the PO, so the work
                    // order is re-read along with the lines.
                    onChanged={() => { void loadCosts([wo.id]); onChanged(); }}
                  />
                )}
              />
            </>
          }
          actions={
            <>
              {awaiting && canSign && (
                <Button size="sm" disabled={busy} onClick={() => run(() => approveWorkOrder(wo.id))}>
                  {busy && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
                  Approve and issue PO
                </Button>
              )}
              {readyToDispatch && canSign && (
                <Button size="sm" onClick={() => openPicker("dispatch")}>Dispatch</Button>
              )}
              {wo.status === "declined" && canSign && (
                <Button size="sm" onClick={() => openPicker("reassign")}>Reassign</Button>
              )}
              {canEditValue && !editingValue && (
                <Button size="sm" variant="outline" onClick={startEditValue}>
                  {wo.approved_value == null ? "Set approved value" : "Change approved value"}
                </Button>
              )}
              {canCancel && (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => cancelWorkOrder(wo.id))}>
                  Cancel work order
                </Button>
              )}
              {wo.status === "accepted" && wo.job_id && (
                <Button size="sm" variant="outline" asChild>
                  <a href={`/dashboard/business?view=jobs&jobId=${wo.job_id}`}>View linked job</a>
                </Button>
              )}
            </>
          }
        />

        {awaiting && !canSign && (
          <Card>
            <CardContent className="p-4 text-sm text-muted-foreground">
              Waiting for sign-off from the owner or a manager covering this site.
            </CardContent>
          </Card>
        )}

        {editingValue && (
          <Card>
            <CardContent className="p-4 space-y-2">
              <Label htmlFor="wo-approved-value-edit">Approved value</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-mono">£</span>
                <Input
                  id="wo-approved-value-edit"
                  className="pl-7 font-mono"
                  inputMode="decimal"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={valueText}
                  onChange={(e) => setValueText(e.target.value)}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {spend && spend.approvedTotal > 0
                  ? `It can't go below the ${formatGBP(spend.approvedTotal)} already approved. `
                  : ""}
                {wo.po_issued_at
                  ? "This amends the issued PO."
                  : "If you can sign off this value, the PO is issued when you save."}
              </p>
              <div className="flex gap-2">
                <Button size="sm" disabled={busy || !(Number(valueText) > 0)} onClick={saveValue}>
                  {busy && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
                  Save
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditingValue(false)}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {pickMode && (
          <Card>
            <CardContent className="p-4 space-y-2">
              <div className="text-xs font-semibold uppercase text-muted-foreground">
                {pickMode === "reassign" ? "Reassign to" : "Dispatch to"}
              </div>
              {pickMode === "reassign" && (
                <p className="text-xs text-muted-foreground">
                  Any cost lines the previous contractor left pending or queried are rejected when the work order moves.
                </p>
              )}
              {loadingCandidates ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : candidates.length === 0 ? (
                <p className="text-sm text-muted-foreground">No panel contractors cover this site.</p>
              ) : (
                candidates.map((c) => (
                  <div key={c.contractor_id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                    <span>{c.full_name}</span>
                    <Button size="sm" disabled={pickingId === c.contractor_id} onClick={() => handlePick(c)}>
                      {pickingId === c.contractor_id && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
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
