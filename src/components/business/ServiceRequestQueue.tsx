import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, Zap, Check, X } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { VerificationBadge } from "@/components/verification/VerificationBadge";
import {
  useServiceRequests, type ServiceRequest, type ServiceRequestStatus,
} from "@/hooks/useServiceRequests";
import { useWorkOrders, type AvailableContractor, type WorkOrderPriority } from "@/hooks/useWorkOrders";

const PRIORITY_LABEL: Record<WorkOrderPriority, string> = {
  emergency: "Emergency", urgent: "Urgent", routine: "Routine", planned: "Planned",
};
const PRIORITY_COLOR: Record<WorkOrderPriority, string> = {
  emergency: "bg-red-100 text-red-800 border-red-300",
  urgent: "bg-amber-100 text-amber-800 border-amber-300",
  routine: "bg-blue-100 text-blue-800 border-blue-300",
  planned: "bg-slate-100 text-slate-700 border-slate-300",
};
const PRIORITY_ORDER: Record<WorkOrderPriority, number> = { emergency: 0, urgent: 1, routine: 2, planned: 3 };
const STATUS_LABEL: Record<ServiceRequestStatus, string> = {
  open: "Open", triaged: "Triaged", dispatched: "Dispatched", cancelled: "Cancelled", completed: "Completed",
};
const STATUS_COLOR: Record<ServiceRequestStatus, string> = {
  open: "bg-slate-100 text-slate-700",
  triaged: "bg-blue-100 text-blue-800",
  dispatched: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
  completed: "bg-green-100 text-green-800",
};

type SiteOption = { id: string; name: string };
type CategoryOption = { id: string; name: string };

export function ServiceRequestQueue({ companyId }: { companyId: string }) {
  const { requests, loading, fetchRequests, triageRequest, cancelRequest } = useServiceRequests();
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [siteFilter, setSiteFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState<WorkOrderPriority | "all">("all");
  const [statusFilter, setStatusFilter] = useState<ServiceRequestStatus | "all">("open");
  const [detailRequest, setDetailRequest] = useState<ServiceRequest | null>(null);

  const reload = () => fetchRequests(companyId, {
    siteId: siteFilter === "all" ? undefined : siteFilter,
    categoryId: categoryFilter === "all" ? undefined : categoryFilter,
    priority: priorityFilter === "all" ? undefined : priorityFilter,
    status: statusFilter === "all" ? undefined : statusFilter,
  });

  useEffect(() => { reload(); }, [companyId, siteFilter, categoryFilter, priorityFilter, statusFilter]);

  useEffect(() => {
    supabase.from("sites").select("id, name").eq("company_id", companyId).eq("status", "active").order("name")
      .then(({ data }) => setSites((data ?? []) as SiteOption[]));
    (supabase as any).from("service_request_categories").select("id, name").eq("company_id", companyId).eq("is_active", true).order("sort_order")
      .then(({ data }: { data: CategoryOption[] | null }) => setCategories(data ?? []));
  }, [companyId]);

  const sorted = useMemo(() => {
    return [...requests].sort((a, b) => {
      const p = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      if (p !== 0) return p;
      return a.created_at.localeCompare(b.created_at);
    });
  }, [requests]);

  const handleTriaged = async (id: string) => {
    await triageRequest(id, {});
    setDetailRequest(null);
    reload();
  };

  const handleCancel = async (id: string, reason?: string) => {
    await cancelRequest(id, reason);
    setDetailRequest(null);
    reload();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-heading text-lg font-bold">Service Requests</h3>
      </div>

      <div className="flex flex-wrap gap-2">
        <Select value={siteFilter} onValueChange={setSiteFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Site" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sites</SelectItem>
            {sites.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={(v) => setPriorityFilter(v as WorkOrderPriority | "all")}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Priority" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            {(Object.keys(PRIORITY_LABEL) as WorkOrderPriority[]).map((p) => <SelectItem key={p} value={p}>{PRIORITY_LABEL[p]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as ServiceRequestStatus | "all")}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {(Object.keys(STATUS_LABEL) as ServiceRequestStatus[]).map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : sorted.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">No service requests match these filters.</CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Site</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Requested By</TableHead>
                  <TableHead>Raised</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((r) => (
                  <TableRow
                    key={r.id}
                    className={`cursor-pointer ${r.priority === "emergency" ? "bg-red-50" : ""}`}
                    onClick={() => setDetailRequest(r)}
                  >
                    <TableCell>{r.site?.name ?? "—"}</TableCell>
                    <TableCell className="max-w-[220px] truncate">{r.title}</TableCell>
                    <TableCell>{r.category?.name ?? "—"}</TableCell>
                    <TableCell><Badge variant="outline" className={PRIORITY_COLOR[r.priority]}>{PRIORITY_LABEL[r.priority]}</Badge></TableCell>
                    <TableCell>{r.requested_by_name ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{format(new Date(r.created_at), "d MMM yyyy")}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Badge className={STATUS_COLOR[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                        {r.work_order_id && r.status === "dispatched" && r.triaged_by === null && (
                          <Badge variant="outline" className="text-[10px] gap-1"><Zap className="h-3 w-3" />Auto-dispatched</Badge>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {detailRequest && (
        <RequestTriageDialog
          request={detailRequest}
          companyId={companyId}
          onClose={() => setDetailRequest(null)}
          onTriaged={() => handleTriaged(detailRequest.id)}
          onCancel={(reason) => handleCancel(detailRequest.id, reason)}
          onWorkOrderCreated={() => { setDetailRequest(null); reload(); }}
        />
      )}
    </div>
  );
}

function RequestTriageDialog({ request, companyId, onClose, onTriaged, onCancel, onWorkOrderCreated }: {
  request: ServiceRequest;
  companyId: string;
  onClose: () => void;
  onTriaged: () => void;
  onCancel: (reason?: string) => void;
  onWorkOrderCreated: () => void;
}) {
  const { toast } = useToast();
  const { fetchAvailableContractors, createWorkOrder, dispatchWorkOrder } = useWorkOrders();
  const { linkWorkOrder } = useServiceRequests();
  const [showDispatch, setShowDispatch] = useState(false);
  const [candidates, setCandidates] = useState<AvailableContractor[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [dispatchingId, setDispatchingId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [showCancelInput, setShowCancelInput] = useState(false);

  const openDispatch = async () => {
    setShowDispatch(true);
    setLoadingCandidates(true);
    const found = await fetchAvailableContractors(companyId, request.site_id, request.category?.trade ?? undefined);
    setCandidates(found);
    setLoadingCandidates(false);
  };

  const handleDispatch = async (contractor: AvailableContractor) => {
    setDispatchingId(contractor.contractor_id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const wo = await createWorkOrder({
        company_id: companyId,
        raised_by: user!.id,
        raised_by_name: request.requested_by_name,
        site_id: request.site_id,
        title: request.title,
        description: request.description,
        trade_required: request.category?.trade ?? null,
        priority: request.priority,
        photos: request.photos,
      });
      if (!wo) return;
      await dispatchWorkOrder(wo.id, contractor.contractor_id, contractor.engagement_id);
      await linkWorkOrder(request.id, wo.id);
      toast({ title: "Work order created and dispatched" });
      onWorkOrderCreated();
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to create work order", variant: "destructive" });
    } finally {
      setDispatchingId(null);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{request.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="flex gap-2">
            <Badge variant="outline" className={PRIORITY_COLOR[request.priority]}>{PRIORITY_LABEL[request.priority]}</Badge>
            <Badge className={STATUS_COLOR[request.status]}>{STATUS_LABEL[request.status]}</Badge>
          </div>
          <div><span className="text-muted-foreground">Site:</span> {request.site?.name}</div>
          {request.category?.name && <div><span className="text-muted-foreground">Category:</span> {request.category.name}</div>}
          <div><span className="text-muted-foreground">Requested by:</span> {request.requested_by_name} {request.requested_by_role && `(${request.requested_by_role})`}</div>
          {request.location_in_site && <div><span className="text-muted-foreground">Location:</span> {request.location_in_site}</div>}
          {request.description && <p>{request.description}</p>}
          {request.photos.length > 0 && (
            <div className="grid grid-cols-4 gap-2">
              {request.photos.map((p) => (
                <a key={p} href={supabase.storage.from("documents").getPublicUrl(p).data.publicUrl} target="_blank" rel="noreferrer" className="text-xs underline text-blue-600">Photo</a>
              ))}
            </div>
          )}
          {request.triage_notes && (
            <div className="rounded-md border p-2 text-muted-foreground">{request.triage_notes}</div>
          )}

          {request.work_order_id ? (
            <div className="rounded-md border border-green-200 bg-green-50 p-3 text-green-800">
              Work order created for this request.
            </div>
          ) : request.status === "cancelled" ? null : (
            <div className="space-y-2 pt-2 border-t">
              <div className="flex gap-2 flex-wrap">
                {request.status === "open" && (
                  <Button size="sm" variant="outline" onClick={onTriaged}>
                    <Check className="h-4 w-4 mr-1" />Mark Triaged
                  </Button>
                )}
                <Button size="sm" onClick={openDispatch}>Create Work Order</Button>
                <Button size="sm" variant="destructive" onClick={() => setShowCancelInput((v) => !v)}>
                  <X className="h-4 w-4 mr-1" />Cancel Request
                </Button>
              </div>

              {showCancelInput && (
                <div className="space-y-2">
                  <Textarea placeholder="Reason (optional)" rows={2} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={cancelling}
                    onClick={async () => { setCancelling(true); await onCancel(cancelReason || undefined); setCancelling(false); }}
                  >
                    {cancelling && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Confirm Cancel
                  </Button>
                </div>
              )}

              {showDispatch && (
                <div className="space-y-2 pt-2">
                  <div className="text-xs font-semibold uppercase text-muted-foreground">Dispatch to</div>
                  {loadingCandidates ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : candidates.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No panel contractors cover this site{request.category?.trade ? ` for ${request.category.trade}` : ""}.</p>
                  ) : (
                    candidates.map((c) => (
                      <ContractorRow key={c.contractor_id} contractor={c} onDispatch={() => handleDispatch(c)} dispatching={dispatchingId === c.contractor_id} />
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ContractorRow({ contractor, onDispatch, dispatching }: {
  contractor: AvailableContractor;
  onDispatch: () => void;
  dispatching: boolean;
}) {
  const [tier, setTier] = useState(1);
  useEffect(() => {
    supabase.from("contractor_verification_public").select("current_tier").eq("contractor_id", contractor.contractor_id).maybeSingle()
      .then(({ data }) => setTier(data?.current_tier ?? 1));
  }, [contractor.contractor_id]);

  return (
    <div className="flex items-center justify-between rounded-md border p-2">
      <div className="flex items-center gap-2">
        <span className="text-sm">{contractor.full_name}</span>
        {tier >= 2 && <VerificationBadge tier={tier} size="sm" />}
      </div>
      <Button size="sm" disabled={dispatching} onClick={onDispatch}>
        {dispatching && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
        Dispatch
      </Button>
    </div>
  );
}
