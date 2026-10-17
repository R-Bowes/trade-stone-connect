import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Camera, Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatGBP } from "@/lib/formatGBP";
import { formatDate } from "@/lib/formatDate";
import { prepareImageForUpload, isHeic } from "@/lib/imageUpload";
import { useSignedPhotoUrls } from "@/hooks/useSignedPhotoUrls";
import { useWorkOrders, formatPoNumber, type WorkOrder } from "@/hooks/useWorkOrders";
import { useWorkOrderPoRequests, type PoRequest } from "@/hooks/useWorkOrderPoRequests";
import { WORK_ORDER_PHOTO_BUCKET } from "@/components/shared/WorkOrderCard";

const MAX_PHOTOS = 6;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

type PanelWorkOrder = Pick<WorkOrder, "id" | "wo_number" | "status" | "approved_value" | "po_issued_at">;

interface PoIncreasePanelProps {
  workOrder: PanelWorkOrder;
  companyCode: string | null;
  viewer: "business" | "contractor";
  /** After any change — the work order's approved value may have moved. */
  onChanged?: () => void;
  /** Reports whether a request is waiting on this viewer (business: can act on it). */
  onNeedsViewer?: (needs: boolean) => void;
}

const OUTCOME_LABEL: Record<string, { label: string; className: string }> = {
  pending: { label: "Waiting", className: "bg-amber-100 text-amber-800" },
  approved: { label: "Approved", className: "bg-green-100 text-green-800" },
  declined: { label: "Declined", className: "bg-red-100 text-red-800" },
  withdrawn: { label: "Withdrawn", className: "bg-slate-200 text-slate-600" },
};

/**
 * The one variation path on a work order: the contractor asks for more
 * money (amount, reason, optional photos) and someone whose approval limit
 * covers the new PO total approves it, which amends the PO. Loads its own
 * requests; all writes are RPCs.
 */
export function PoIncreasePanel({ workOrder, companyCode, viewer, onChanged, onNeedsViewer }: PoIncreasePanelProps) {
  const { requestsByWorkOrder, loadRequests, requestIncrease, approveRequest, declineRequest, withdrawRequest } = useWorkOrderPoRequests();
  const { canAct, canSignOffAmount } = useWorkOrders();
  const [canApprovePending, setCanApprovePending] = useState(false);
  const [canDecline, setCanDecline] = useState(false);
  const [busy, setBusy] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [requestOpen, setRequestOpen] = useState(false);

  useEffect(() => { void loadRequests([workOrder.id]); }, [workOrder.id, loadRequests]);

  const requests = requestsByWorkOrder[workOrder.id] ?? [];
  const pending = requests.find((r) => r.status === "pending") ?? null;
  const latestDecided = requests.find((r) => r.status !== "pending") ?? null;
  const currentValue = workOrder.approved_value != null ? Number(workOrder.approved_value) : null;
  const newTotal = pending && currentValue != null ? Math.round((currentValue + Number(pending.increase_amount)) * 100) / 100 : null;

  useEffect(() => {
    let live = true;
    if (viewer !== "business" || !pending || newTotal == null) {
      setCanApprovePending(false);
      setCanDecline(false);
      onNeedsViewer?.(false);
      return;
    }
    void Promise.all([canSignOffAmount(workOrder.id, newTotal), canAct(workOrder.id)]).then(([sign, act]) => {
      if (!live) return;
      setCanApprovePending(sign);
      setCanDecline(act);
      onNeedsViewer?.(sign);
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer, pending?.id, newTotal, workOrder.id, canAct, canSignOffAmount]);

  const refresh = async () => {
    await loadRequests([workOrder.id]);
    onChanged?.();
  };

  const run = async (action: () => Promise<boolean>) => {
    setBusy(true);
    try {
      if (await action()) {
        setDeclining(false);
        setDeclineReason("");
        await refresh();
      }
    } finally {
      setBusy(false);
    }
  };

  const canRequest =
    viewer === "contractor" && workOrder.status === "accepted" && !!workOrder.po_issued_at && currentValue != null && !pending;

  if (viewer === "business" && !pending && !latestDecided) return null;

  return (
    <div className="space-y-2">
      {pending && viewer === "business" && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 space-y-2 text-sm">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-medium">PO increase requested</p>
              <p className="font-mono text-lg">+{formatGBP(pending.increase_amount)}</p>
            </div>
            <Badge className={canApprovePending ? "bg-[#f07820] text-white" : OUTCOME_LABEL.pending.className}>
              {canApprovePending ? "Needs you" : "Waiting"}
            </Badge>
          </div>
          <p>{pending.reason}</p>
          <RequestPhotos paths={pending.photos} />
          {newTotal != null && currentValue != null && (
            <p className="text-muted-foreground">
              New PO total <span className="font-mono text-foreground">{formatGBP(newTotal)}</span>
              {" "}(now <span className="font-mono">{formatGBP(currentValue)}</span>)
            </p>
          )}
          {!canApprovePending && newTotal != null && (
            <p className="text-muted-foreground">
              Waiting for sign-off from someone with a <span className="font-mono">{formatGBP(newTotal)}</span> limit.
            </p>
          )}
          {declining ? (
            <div className="space-y-2">
              <Textarea rows={2} placeholder="Reason for declining" value={declineReason} onChange={(e) => setDeclineReason(e.target.value)} />
              <div className="flex gap-2">
                <Button size="sm" variant="destructive" disabled={busy || !declineReason.trim()}
                  onClick={() => run(() => declineRequest(pending.id, declineReason.trim()))}>
                  {busy && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}Decline
                </Button>
                <Button size="sm" variant="outline" onClick={() => setDeclining(false)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {canApprovePending && (
                <Button size="sm" disabled={busy} onClick={() => run(() => approveRequest(pending.id))}>
                  {busy && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
                  Approve and amend {formatPoNumber(companyCode, workOrder.wo_number)}
                </Button>
              )}
              {canDecline && (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => setDeclining(true)}>Decline</Button>
              )}
            </div>
          )}
        </div>
      )}

      {pending && viewer === "contractor" && (
        <div className="rounded-md border p-3 space-y-2 text-sm">
          <div className="flex items-start justify-between gap-2">
            <p>
              PO increase requested <span className="font-mono">+{formatGBP(pending.increase_amount)}</span> — waiting for the business.
            </p>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => withdrawRequest(pending.id))}>Withdraw</Button>
          </div>
          <p className="text-muted-foreground">{pending.reason}</p>
        </div>
      )}

      {!pending && latestDecided && (
        <p className={`text-xs text-muted-foreground ${viewer === "business" ? "rounded-md border bg-background px-3 py-2" : ""}`}>
          Last PO increase request (<span className="font-mono">+{formatGBP(latestDecided.increase_amount)}</span>):{" "}
          <Badge className={OUTCOME_LABEL[latestDecided.status]?.className}>{OUTCOME_LABEL[latestDecided.status]?.label ?? latestDecided.status}</Badge>
          {latestDecided.decided_at && ` ${formatDate(latestDecided.decided_at)}`}
          {latestDecided.status === "declined" && latestDecided.decline_reason && ` — ${latestDecided.decline_reason}`}
        </p>
      )}

      {canRequest && (
        <Button size="sm" variant="outline" onClick={() => setRequestOpen(true)}>Request PO increase</Button>
      )}

      {viewer === "contractor" && (
        <RequestIncreaseDialog
          open={requestOpen}
          onClose={() => setRequestOpen(false)}
          workOrder={workOrder}
          companyCode={companyCode}
          onSubmit={async (amount, reason, photos) => {
            const ok = await requestIncrease(workOrder.id, amount, reason, photos);
            if (ok) {
              setRequestOpen(false);
              await refresh();
            }
            return ok;
          }}
        />
      )}
    </div>
  );
}

function RequestPhotos({ paths }: { paths: PoRequest["photos"] }) {
  const list = Array.isArray(paths) ? paths.filter((p): p is string => typeof p === "string") : [];
  const { urls } = useSignedPhotoUrls(WORK_ORDER_PHOTO_BUCKET, list);
  if (list.length === 0) return null;
  return (
    <div className="flex gap-2 overflow-x-auto">
      {list.map((p) => (
        <a key={p} href={urls[p]} target="_blank" rel="noreferrer" className="shrink-0 rounded-md overflow-hidden border bg-muted" style={{ height: 64, width: 64 }}>
          {urls[p] ? <img src={urls[p]} alt="" className="h-full w-full object-cover" /> : null}
        </a>
      ))}
    </div>
  );
}

function RequestIncreaseDialog({ open, onClose, workOrder, companyCode, onSubmit }: {
  open: boolean;
  onClose: () => void;
  workOrder: PanelWorkOrder;
  companyCode: string | null;
  onSubmit: (amount: number, reason: string, photos: string[]) => Promise<boolean>;
}) {
  const { toast } = useToast();
  const [amountText, setAmountText] = useState("");
  const [reason, setReason] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) { setAmountText(""); setReason(""); setFiles([]); }
  }, [open]);

  const amount = Number(amountText);
  const valid = amountText.trim() !== "" && Number.isFinite(amount) && amount > 0 && reason.trim() !== "";
  const current = workOrder.approved_value != null ? Number(workOrder.approved_value) : 0;

  const pick = (picked: FileList | null) => {
    if (!picked) return;
    const ok = Array.from(picked).filter((f) => (isHeic(f) || f.type.startsWith("image/")) && f.size <= MAX_PHOTO_BYTES);
    if (ok.length < picked.length) toast({ title: "Some photos were skipped", description: "Images up to 10 MB only.", variant: "destructive" });
    setFiles((cur) => [...cur, ...ok].slice(0, MAX_PHOTOS));
  };

  // Path {uid}/{workOrderId}/... — the bucket's contractor upload policy
  // allows it while the work order is accepted. Uploaded first; removed again
  // if the request isn't saved.
  const submit = async () => {
    if (!valid) return;
    setSaving(true);
    const paths: string[] = [];
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      for (let i = 0; i < files.length; i++) {
        const prepared = await prepareImageForUpload(files[i]);
        const ext = prepared.name.split(".").pop() ?? "jpg";
        const path = `${user.id}/${workOrder.id}/po-increase-${Date.now()}-${i}.${ext}`;
        const { error } = await supabase.storage.from(WORK_ORDER_PHOTO_BUCKET).upload(path, prepared);
        if (error) throw error;
        paths.push(path);
      }
      const ok = await onSubmit(Math.round(amount * 100) / 100, reason.trim(), paths);
      if (!ok && paths.length) await supabase.storage.from(WORK_ORDER_PHOTO_BUCKET).remove(paths);
    } catch (err) {
      console.error("PO increase photo upload failed:", err);
      if (paths.length) await supabase.storage.from(WORK_ORDER_PHOTO_BUCKET).remove(paths);
      toast({ title: "Photos didn't upload", description: "Nothing was sent. Check your connection and try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Request PO increase</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            {formatPoNumber(companyCode, workOrder.wo_number)} is approved to <span className="font-mono">{formatGBP(current)}</span>.
            The business approves the increase before you go over it.
          </p>
          <div className="space-y-1">
            <Label htmlFor="po-increase-amount">Increase by</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono">£</span>
              <Input id="po-increase-amount" className="pl-7 font-mono" inputMode="decimal" type="number" min="0.01" step="0.01"
                value={amountText} onChange={(e) => setAmountText(e.target.value)} />
            </div>
            {amount > 0 && (
              <p className="text-xs text-muted-foreground">New PO total <span className="font-mono">{formatGBP(current + amount)}</span></p>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="po-increase-reason">Reason</Label>
            <Textarea id="po-increase-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Photos (optional)</Label>
            <div className="flex flex-wrap gap-2">
              {files.map((f, i) => (
                <div key={`${f.name}-${i}`} className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs">
                  <span className="max-w-[120px] truncate">{f.name}</span>
                  <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles((cur) => cur.filter((_, idx) => idx !== i))}>
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {files.length < MAX_PHOTOS && (
                <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
                  <Camera className="h-4 w-4 mr-1" />Add photos
                </Button>
              )}
            </div>
            <input ref={inputRef} type="file" accept="image/*,.heic,.heif" multiple className="hidden"
              onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !valid}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Send request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
