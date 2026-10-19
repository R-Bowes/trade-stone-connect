import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatDate, formatDateTime } from "@/lib/formatDate";
import { formatGBP } from "@/lib/formatGBP";
import { totalCostLines } from "@/lib/costLines";
import { poSpend, isOverApprovedValue, canRecordWorkOrderCosts, recordCostsBlockedReason } from "@/lib/workOrderValue";
import { money, poReference, workOrderStages, type Stage, type WorkOrderContext } from "@/lib/workOrderCopy";
import { useSignedPhotoUrls } from "@/hooks/useSignedPhotoUrls";
import { useWorkOrderPage, type TimelineEntry } from "@/hooks/useWorkOrderPage";
import { useWorkOrders, formatWoNumber, isAwaitingSignOff, type AvailableContractor, type WorkOrder } from "@/hooks/useWorkOrders";
import { useWorkOrderCosts } from "@/hooks/useWorkOrderCosts";
import { WorkOrderCostLines } from "@/components/shared/WorkOrderCostLines";
import { CostReviewActions } from "@/components/business/CostReviewActions";
import { PoIncreasePanel } from "@/components/shared/PoIncreasePanel";
import { RecordCostsDialog, AmendCostDialog } from "@/components/management/RecordCostsDialog";
import {
  PRIORITY_COLOR, PRIORITY_LABEL, WORK_ORDER_PHOTO_BUCKET, deriveWorkOrderStatus, readRateSnapshot,
} from "@/components/shared/WorkOrderCard";
import type { WorkOrderCost } from "@/lib/costLines";

const DECLINE_REASONS = ["Unavailable", "Too far", "Outside expertise", "Capacity full", "Other"];
const JOB_PHOTO_BUCKET = "job-photos";

interface WorkOrderPageProps {
  workOrderId: string;
  viewer: "business" | "contractor";
  onBack: () => void;
}

/**
 * One work order, one page, both sides (step 2a). Same layout for every size
 * of business: each block appears only when there is something for it — the
 * condition is on each block below. Plain words; "Approve" throughout.
 */
export function WorkOrderPage({ workOrderId, viewer, onBack }: WorkOrderPageProps) {
  const { workOrder: wo, context: ctx, timeline, loading, missing, reload } = useWorkOrderPage(workOrderId);
  const { costsByWorkOrder, loadCosts, submitCost, amendCost, approveCost, queryCost, rejectCost } = useWorkOrderCosts();
  const [poNeedsMe, setPoNeedsMe] = useState(false);

  useEffect(() => { void loadCosts([workOrderId]); }, [workOrderId, loadCosts]);

  const refresh = async () => {
    await Promise.all([reload(), loadCosts([workOrderId])]);
  };

  if (loading) {
    return <div className="flex justify-center p-12"><i className="ti ti-loader-2 animate-spin" style={{ fontSize: 24 }} /></div>;
  }
  if (missing || !wo || !ctx) {
    return (
      <div className="p-6 space-y-3">
        <BackLink onBack={onBack} />
        <Card><CardContent className="p-8 text-center text-muted-foreground">This work order isn't available.</CardContent></Card>
      </div>
    );
  }

  const lines = costsByWorkOrder[wo.id] ?? [];
  const vat = ctx.contractor_vat_registered;

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-6xl">
      <BackLink onBack={onBack} />
      <Header wo={wo} ctx={ctx} />
      <StageBar stages={workOrderStages(wo, ctx)} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4 min-w-0">
          {/* Needs-you: a pending PO increase request — only when one exists (the panel hides itself otherwise). */}
          <PoIncreasePanelCard wo={wo} ctx={ctx} viewer={viewer} onChanged={refresh} onNeedsViewer={setPoNeedsMe} />

          {/* Needs-you: everything else waiting for THIS viewer — only when something is. */}
          {viewer === "business"
            ? <BusinessNeedsYou wo={wo} ctx={ctx} lines={lines} onChanged={refresh} />
            : <ContractorNeedsYou wo={wo} ctx={ctx} lines={lines} submitCost={submitCost} amendCost={amendCost} onChanged={refresh} />}

          <Timeline entries={timeline} wo={wo} ctx={ctx} onPosted={refresh} />
        </div>

        <div className="space-y-4">
          <MoneyPanel
            wo={wo}
            ctx={ctx}
            lines={lines}
            viewer={viewer}
            autoExpand={poNeedsMe}
            renderLineActions={(line) =>
              viewer === "business" ? (
                <CostReviewActions line={line} approve={approveCost} query={queryCost} reject={rejectCost} onChanged={() => void refresh()} />
              ) : null
            }
            onChanged={refresh}
          />
          <WhosDoingIt wo={wo} ctx={ctx} viewer={viewer} />
          {/* Agreed rates: the engagement has an agreed rate version. */}
          {ctx.has_agreed_rates && <RatesBlock wo={wo} vat={vat} />}
          {/* Asset: the work order is linked to an asset. */}
          {ctx.asset && <AssetBlock asset={ctx.asset} />}
          {/* Team: business only, and only when the company has more than one active person. */}
          {viewer === "business" && ctx.multi_person && <TeamBlock wo={wo} ctx={ctx} />}
        </div>
      </div>
    </div>
  );
}

function BackLink({ onBack }: { onBack: () => void }) {
  return (
    <Button variant="ghost" size="sm" className="-ml-2" onClick={onBack}>
      <i className="ti ti-arrow-left mr-1" />All work orders
    </Button>
  );
}

// ── Header ───────────────────────────────────────────────────────────────────

function Header({ wo, ctx }: { wo: WorkOrder; ctx: WorkOrderContext }) {
  const status = deriveWorkOrderStatus(wo);
  return (
    <div className="space-y-2">
      {/* Site breadcrumb: the company has more than one site. */}
      {ctx.multi_site && ctx.site_name && (
        <p className="text-xs text-muted-foreground"><i className="ti ti-map-pin mr-1" />{ctx.site_name}</p>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-heading text-2xl font-bold break-words">{wo.title}</h1>
          <p className="text-sm text-muted-foreground font-mono">{formatWoNumber(ctx.company_code, wo.wo_number)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className={PRIORITY_COLOR[wo.priority]}>{PRIORITY_LABEL[wo.priority]}</Badge>
          <Badge className={status.className}>{status.label}</Badge>
          {/* Response-time chip: an SLA rule applies to this job. */}
          {ctx.sla && <ResponseChip sla={ctx.sla} />}
        </div>
      </div>
      {wo.description && <p className="text-sm">{wo.description}</p>}
    </div>
  );
}

function ResponseChip({ sla }: { sla: NonNullable<WorkOrderContext["sla"]> }) {
  const due = sla.responded_at ? sla.completion_due : sla.response_due ?? sla.attendance_due;
  const label = sla.responded_at ? "Finish by" : "Respond by";
  const tone = sla.status === "breached" ? "bg-red-100 text-red-800" : sla.status === "at_risk" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700";
  if (!due) return null;
  return <Badge className={tone}><i className="ti ti-clock mr-1" />{label} {formatDateTime(due)}</Badge>;
}

// ── Stage bar ────────────────────────────────────────────────────────────────

function StageBar({ stages }: { stages: Stage[] }) {
  return (
    <ol className="flex flex-wrap gap-x-1 gap-y-2 text-xs">
      {stages.map((s, i) => {
        const tone =
          s.state === "done" ? "bg-green-100 text-green-800 border-green-200"
            : s.state === "current" ? "bg-[#1a2744] text-white border-[#1a2744]"
              : s.state === "part" ? "bg-amber-100 text-amber-800 border-amber-200"
                : "bg-background text-muted-foreground border-border";
        return (
          <li key={s.key} className="flex items-center gap-1">
            <span className={`rounded-full border px-3 py-1 ${tone}`} title={s.at ? formatDateTime(s.at) : undefined}>
              {s.state === "done" && <i className="ti ti-check mr-1" />}{s.label}
            </span>
            {i < stages.length - 1 && <i className="ti ti-chevron-right text-muted-foreground" />}
          </li>
        );
      })}
    </ol>
  );
}

// ── Needs you ────────────────────────────────────────────────────────────────

function NeedsYouCard({ children }: { children: ReactNode }) {
  return (
    <Card className="border-[#f07820]">
      <CardContent className="p-4 space-y-3">
        <Badge style={{ backgroundColor: "#f07820", color: "#fff" }}>Needs you</Badge>
        {children}
      </CardContent>
    </Card>
  );
}

/** Same actions without the orange "Needs you" treatment: nothing is waiting on the viewer. */
function ActionsCard({ children }: { children: ReactNode }) {
  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <p className="text-sm font-medium">Actions</p>
        {children}
      </CardContent>
    </Card>
  );
}

function PoIncreasePanelCard({ wo, ctx, viewer, onChanged, onNeedsViewer }: {
  wo: WorkOrder; ctx: WorkOrderContext; viewer: "business" | "contractor"; onChanged: () => void; onNeedsViewer: (n: boolean) => void;
}) {
  // Contractor: their "Ask to spend more" lives in ContractorNeedsYou; the
  // business sees a pending request here, at the top.
  if (viewer !== "business") return null;
  return (
    <PoIncreasePanel
      workOrder={wo}
      companyCode={ctx.company_code}
      viewer="business"
      showPo={ctx.show_po}
      vat={ctx.contractor_vat_registered}
      onChanged={onChanged}
      onNeedsViewer={onNeedsViewer}
    />
  );
}

function BusinessNeedsYou({ wo, ctx, lines, onChanged }: {
  wo: WorkOrder; ctx: WorkOrderContext; lines: WorkOrderCost[]; onChanged: () => Promise<void>;
}) {
  const { approveWorkOrder } = useWorkOrders();
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState<"dispatch" | "reassign" | null>(null);
  const vat = ctx.contractor_vat_registered;

  const awaiting = isAwaitingSignOff(wo);
  const canApprove = awaiting && !!ctx.can_approve_value;
  const readyToSend = wo.status === "draft" && !!wo.po_issued_at && !!ctx.can_act;
  const needsNewContractor = wo.status === "declined" && !!ctx.can_act;
  const pendingLines = lines.filter((l) => l.status === "pending");

  if (!canApprove && !readyToSend && !needsNewContractor && !(ctx.can_act && pendingLines.length > 0)) return null;

  return (
    <NeedsYouCard>
      {canApprove && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm">Approve <span className="font-mono">{money(wo.approved_value, vat)}</span> so it can be sent.</p>
          <Button size="sm" disabled={busy} onClick={async () => {
            setBusy(true);
            try { await approveWorkOrder(wo.id); await onChanged(); } catch { /* toast shown */ } finally { setBusy(false); }
          }}>Approve</Button>
        </div>
      )}
      {(readyToSend || needsNewContractor) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm">
            {needsNewContractor
              ? `${ctx.contractor_name ?? "The contractor"} turned this down${wo.decline_reason ? `: ${wo.decline_reason}` : "."} Send it to someone else.`
              : "Approved. Choose who does it."}
          </p>
          <Button size="sm" onClick={() => setPicking(needsNewContractor ? "reassign" : "dispatch")}>Choose a contractor</Button>
        </div>
      )}
      {ctx.can_act && pendingLines.length > 0 && (
        <p className="text-sm">
          {pendingLines.length === 1 ? "A cost is" : `${pendingLines.length} costs are`} waiting for you — see Money.
        </p>
      )}
      {picking && (
        <ContractorPicker wo={wo} mode={picking} onDone={async () => { setPicking(null); await onChanged(); }} onCancel={() => setPicking(null)} />
      )}
    </NeedsYouCard>
  );
}

function ContractorPicker({ wo, mode, onDone, onCancel }: {
  wo: WorkOrder; mode: "dispatch" | "reassign"; onDone: () => Promise<void>; onCancel: () => void;
}) {
  const { fetchAvailableContractors, dispatchWorkOrder, reassignWorkOrder } = useWorkOrders();
  const [candidates, setCandidates] = useState<AvailableContractor[] | null>(null);
  const [pickingId, setPickingId] = useState<string | null>(null);

  useEffect(() => {
    void fetchAvailableContractors(wo.company_id, wo.site_id ?? "", wo.trade_required ?? undefined).then(setCandidates);
  }, [wo.company_id, wo.site_id, wo.trade_required, fetchAvailableContractors]);

  const pick = async (c: AvailableContractor) => {
    setPickingId(c.contractor_id);
    try {
      if (mode === "reassign") await reassignWorkOrder(wo.id, c.engagement_id);
      else await dispatchWorkOrder(wo.id, c.engagement_id);
      await onDone();
    } catch { /* toast shown */ } finally { setPickingId(null); }
  };

  return (
    <div className="space-y-2 border-t pt-3">
      {mode === "reassign" && (
        <p className="text-xs text-muted-foreground">Costs the previous contractor left waiting are turned down when it moves.</p>
      )}
      {candidates === null ? (
        <i className="ti ti-loader-2 animate-spin" />
      ) : candidates.length === 0 ? (
        <p className="text-sm text-muted-foreground">No contractors on your panel cover this site{wo.trade_required ? ` for ${wo.trade_required}` : ""}.</p>
      ) : (
        candidates.map((c) => (
          <div key={c.contractor_id} className="flex items-center justify-between rounded-md border p-2 text-sm">
            <span>{c.full_name ?? "Contractor"}</span>
            <Button size="sm" disabled={pickingId !== null} onClick={() => pick(c)}>
              {pickingId === c.contractor_id && <i className="ti ti-loader-2 animate-spin mr-1" />}Send
            </Button>
          </div>
        ))
      )}
      <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
    </div>
  );
}

function ContractorNeedsYou({ wo, ctx, lines, submitCost, amendCost, onChanged }: {
  wo: WorkOrder;
  ctx: WorkOrderContext;
  lines: WorkOrderCost[];
  submitCost: ReturnType<typeof useWorkOrderCosts>["submitCost"];
  amendCost: ReturnType<typeof useWorkOrderCosts>["amendCost"];
  onChanged: () => Promise<void>;
}) {
  const { respondToWorkOrder } = useWorkOrders();
  const [busy, setBusy] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineChoice, setDeclineChoice] = useState(DECLINE_REASONS[0]);
  const [declineText, setDeclineText] = useState("");
  const [recording, setRecording] = useState(false);
  const [amending, setAmending] = useState<WorkOrderCost | null>(null);
  const [requestDeclined, setRequestDeclined] = useState(false);

  const awaitingAnswer = wo.status === "dispatched" && wo.response === "pending";
  const accepted = wo.status === "accepted";
  const canRecord = canRecordWorkOrderCosts(wo.status, ctx.job?.status);
  const queried = lines.filter((l) => l.status === "queried");

  if (!awaitingAnswer && !accepted) return null;

  // "Needs you" only when something waits on the contractor: the offer to
  // accept or decline, a queried cost line, or their newest request to spend
  // more was declined. Otherwise the same buttons sit in a plain Actions box.
  const needsYou = awaitingAnswer || (canRecord && queried.length > 0) || (accepted && requestDeclined);
  const Box = needsYou ? NeedsYouCard : ActionsCard;

  return (
    <Box>
      {/* Accept / decline: dispatched to you and not yet answered. */}
      {awaitingAnswer && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm">{ctx.company_name ?? "The business"} wants you to do this.</p>
          <div className="flex gap-2">
            <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" disabled={busy} onClick={async () => {
              setBusy(true);
              try { await respondToWorkOrder(wo.id, true); await onChanged(); } catch { /* toast shown */ } finally { setBusy(false); }
            }}>Accept</Button>
            <Button size="sm" variant="destructive" onClick={() => setDeclineOpen(true)}>Decline</Button>
          </div>
        </div>
      )}

      {/* Once accepted: ask to spend more (any time), record costs (once the job is started). */}
      {accepted && (
        <>
          <PoIncreasePanel
            workOrder={wo}
            companyCode={ctx.company_code}
            viewer="contractor"
            showPo={ctx.show_po}
            vat={ctx.contractor_vat_registered}
            onChanged={onChanged}
            onNeedsViewer={setRequestDeclined}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={!canRecord} onClick={() => setRecording(true)}>
              <i className="ti ti-plus mr-1" />Record costs
            </Button>
            {!canRecord && <p className="text-xs text-muted-foreground">{recordCostsBlockedReason(wo.approved_value)}</p>}
          </div>
          {canRecord && queried.map((line) => (
            <div key={line.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-orange-200 bg-orange-50 p-2 text-sm">
              <span>Queried{line.queried_reason ? `: ${line.queried_reason}` : ""}</span>
              <Button size="sm" variant="outline" onClick={() => setAmending(line)}>Amend and resubmit</Button>
            </div>
          ))}
        </>
      )}

      <RecordCostsDialog
        open={recording}
        onOpenChange={(o) => { if (!o) { setRecording(false); void onChanged(); } }}
        workOrderTitle={wo.title}
        rateSnapshot={wo.rate_snapshot}
        approvedValue={wo.approved_value}
        recordedTotal={totalCostLines(lines).total}
        onSubmit={(input) => submitCost(wo.id, input)}
      />
      <AmendCostDialog
        line={amending}
        rateSnapshot={wo.rate_snapshot}
        onOpenChange={(o) => { if (!o) { setAmending(null); void onChanged(); } }}
        onSubmit={amendCost}
      />

      <Dialog open={declineOpen} onOpenChange={setDeclineOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Decline</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Select value={declineChoice} onValueChange={setDeclineChoice}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{DECLINE_REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
            </Select>
            {declineChoice === "Other" && (
              <Textarea placeholder="Reason" rows={2} value={declineText} onChange={(e) => setDeclineText(e.target.value)} />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeclineOpen(false)}>Cancel</Button>
            <Button variant="destructive" disabled={busy} onClick={async () => {
              setBusy(true);
              try {
                await respondToWorkOrder(wo.id, false, declineChoice === "Other" && declineText.trim() ? declineText.trim() : declineChoice);
                setDeclineOpen(false);
                await onChanged();
              } catch { /* toast shown */ } finally { setBusy(false); }
            }}>Decline</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Box>
  );
}

// ── Timeline and messages ────────────────────────────────────────────────────

function Timeline({ entries, wo, ctx, onPosted }: {
  entries: TimelineEntry[]; wo: WorkOrder; ctx: WorkOrderContext; onPosted: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  // Photos come from two buckets: job photos ({bucket, path}) and the
  // contractor's PO-increase photos (plain paths in the work-order bucket).
  const { jobPaths, woPaths } = useMemo(() => {
    const job: string[] = [];
    const woB: string[] = [];
    for (const e of entries) {
      for (const p of e.photos ?? []) {
        if (typeof p === "string") woB.push(p);
        else if (p && typeof p === "object" && typeof (p as { path?: unknown }).path === "string") job.push((p as { path: string }).path);
      }
    }
    return { jobPaths: job, woPaths: woB };
  }, [entries]);
  const { urls: jobUrls } = useSignedPhotoUrls(JOB_PHOTO_BUCKET, jobPaths);
  const { urls: woUrls } = useSignedPhotoUrls(WORK_ORDER_PHOTO_BUCKET, woPaths);

  const send = async () => {
    if (!text.trim()) return;
    setSending(true);
    try {
      const { error } = await supabase.rpc("post_work_order_message", { p_work_order_id: wo.id, p_content: text.trim() });
      if (error) {
        toast({ title: "Message not sent", description: error.message, variant: "destructive" });
        return;
      }
      setText("");
      await onPosted();
    } finally {
      setSending(false);
    }
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">What's happened</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {/* Message box: always shown, above the newest entry; posting opens once there is a job (the work order is accepted). */}
        <div className="border-b pb-3 space-y-2">
          {ctx.job ? (
            <>
              <Textarea rows={2} placeholder="Write a message" value={text} onChange={(e) => setText(e.target.value)} />
              <div className="flex justify-end">
                <Button size="sm" disabled={sending || !text.trim()} onClick={send}>
                  {sending && <i className="ti ti-loader-2 animate-spin mr-1" />}Send
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Messages open once {ctx.contractor_name ?? "a contractor"} accepts.</p>
          )}
        </div>

        {/* Newest first; the order (and same-instant ties) comes from work_order_timeline. */}
        <ol className="space-y-3">
          {entries.map((e, i) => (
            <li key={`${e.kind}-${e.occurred_at}-${i}`} className="flex gap-3 text-sm">
              <i className={`ti ${TIMELINE_ICON[e.kind] ?? "ti-point"} mt-0.5 text-muted-foreground`} />
              <div className="min-w-0 space-y-1">
                <p>
                  {e.kind === "message"
                    ? <span className="font-medium">{e.actor_name ?? "Someone"}</span>
                    : <><span className="font-medium">{e.title}</span>{e.actor_name && <span className="text-muted-foreground"> · {e.actor_name}</span>}</>}
                </p>
                {e.body && <p className={e.kind === "message" ? "" : "text-muted-foreground"}>{e.body}</p>}
                {(e.photos ?? []).length > 0 && (
                  <div className="flex gap-2 overflow-x-auto">
                    {(e.photos ?? []).map((p, j) => {
                      const path = typeof p === "string" ? p : (p as { path?: string }).path ?? "";
                      const url = typeof p === "string" ? woUrls[path] : jobUrls[path];
                      return (
                        <a key={`${path}-${j}`} href={url} target="_blank" rel="noreferrer" className="shrink-0 rounded-md overflow-hidden border bg-muted" style={{ height: 64, width: 64 }}>
                          {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : null}
                        </a>
                      );
                    })}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">{formatDateTime(e.occurred_at)}</p>
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

const TIMELINE_ICON: Record<string, string> = {
  raised: "ti-file-plus", awaiting_approval: "ti-hourglass", approved: "ti-circle-check", value_amended: "ti-adjustments",
  dispatched: "ti-send", reassigned: "ti-arrows-exchange", accepted: "ti-thumb-up", declined: "ti-thumb-down",
  cancelled: "ti-x", completed: "ti-flag", cost_recorded: "ti-receipt", cost_amended: "ti-pencil",
  cost_approved: "ti-check", cost_queried: "ti-help", cost_rejected: "ti-ban", cost_invoiced: "ti-file-invoice",
  po_increase_requested: "ti-trending-up", po_increase_approved: "ti-circle-check", po_increase_declined: "ti-ban",
  po_increase_withdrawn: "ti-arrow-back-up", job_started: "ti-tool", job_completed: "ti-flag", message: "ti-message", photo: "ti-photo",
};

// ── Money ────────────────────────────────────────────────────────────────────

function MoneyPanel({ wo, ctx, lines, viewer, autoExpand, renderLineActions, onChanged }: {
  wo: WorkOrder;
  ctx: WorkOrderContext;
  lines: WorkOrderCost[];
  viewer: "business" | "contractor";
  autoExpand: boolean;
  renderLineActions: (line: WorkOrderCost) => ReactNode;
  onChanged: () => Promise<void>;
}) {
  const { amendWorkOrderValue, cancelWorkOrder } = useWorkOrders();
  const [editing, setEditing] = useState(false);
  const [valueText, setValueText] = useState("");
  const [busy, setBusy] = useState(false);
  const vat = ctx.contractor_vat_registered;
  const totals = totalCostLines(lines);
  const spend = wo.approved_value != null ? poSpend(wo.approved_value, lines) : null;
  const awaiting = isAwaitingSignOff(wo);
  const overLines = lines.filter((l) => isOverApprovedValue(l, lines, wo.approved_value));
  const linesNeedMe = viewer === "business" && totals.pending > 0 && !!ctx.can_act;
  const canEditValue = viewer === "business" && !!ctx.can_act && ["draft", "dispatched", "accepted", "declined"].includes(wo.status);
  const canCancel = viewer === "business" && !!ctx.can_act && ["draft", "dispatched", "declined"].includes(wo.status);
  const po = poReference(wo, ctx.company_code);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try { await action(); await onChanged(); } catch { /* toast shown */ } finally { setBusy(false); }
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Money</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        {wo.approved_value == null ? (
          <p className="text-muted-foreground">No approved amount yet.</p>
        ) : (
          <div>
            <p className="text-3xl font-semibold font-mono">{money(wo.approved_value, vat)}</p>
            <p className="text-muted-foreground">
              {awaiting
                ? "Waiting for approval"
                : `Approved${ctx.approved_by_is_viewer ? " by you" : ctx.approved_by_name ? ` by ${ctx.approved_by_name}` : ""}`}
            </p>
          </div>
        )}

        {/* PO number + your reference: the company has more than one active person, or has set its own reference. */}
        {ctx.show_po && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground">PO number</p>
              <p className="font-mono">{po ?? "Issued once approved"}</p>
            </div>
            {wo.client_po_ref && (
              <div>
                <p className="text-xs text-muted-foreground">{viewer === "business" ? "Your reference" : "Client reference"}</p>
                <p className="font-mono">{wo.client_po_ref}</p>
              </div>
            )}
          </div>
        )}

        {/* How it's paid: on account only (an engagement). Others are defined in step 2b. */}
        {ctx.on_account && <p className="text-muted-foreground">Billed monthly on account.</p>}

        {/* Costs: there are cost lines. One summary (spent / left against the
            approved amount, or the total where there is none) and the breakdown toggle. */}
        {lines.length > 0 && (
          <WorkOrderCostLines
            lines={lines}
            approvedValue={wo.approved_value}
            viewer={viewer}
            autoExpand={autoExpand || linesNeedMe}
            renderLineActions={renderLineActions}
            summary={
              spend ? (
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-[#1a2744]" style={{ width: `${Math.min(100, (spend.approvedTotal / spend.approvedValue) * 100)}%` }} />
                  </div>
                  <p>
                    <span className="font-mono">{money(spend.approvedTotal, vat)}</span> spent ·{" "}
                    <span className="font-mono">{money(Math.max(0, spend.remaining), vat)}</span> left
                    {totals.pending > 0 && <> · <span className="font-mono">{money(totals.pending, vat)}</span> {linesNeedMe ? "waiting for you" : "waiting for approval"}</>}
                  </p>
                  {overLines.length > 0 && <p className="text-amber-800">Approving {overLines.length === 1 ? "one cost" : `${overLines.length} costs`} would raise the approved amount.</p>}
                </div>
              ) : (
                <p>Costs <span className="font-mono">{money(totals.total, vat)}</span></p>
              )
            }
          />
        )}

        {editing ? (
          <div className="space-y-2 border-t pt-3">
            <Label htmlFor="wo-page-value">Approved amount</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono">£</span>
              <Input id="wo-page-value" className="pl-7 font-mono" inputMode="decimal" type="number" min="0.01" step="0.01"
                value={valueText} onChange={(e) => setValueText(e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">
              {spend && spend.approvedTotal > 0 ? `It can't go below the ${formatGBP(spend.approvedTotal)} already approved. ` : ""}
              It needs someone who can approve the new amount.
            </p>
            <div className="flex gap-2">
              <Button size="sm" disabled={busy || !(Number(valueText) > 0)} onClick={() => run(async () => {
                await amendWorkOrderValue(wo.id, Math.round(Number(valueText) * 100) / 100);
                setEditing(false);
              })}>Save</Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          (canEditValue || canCancel) && (
            <div className="flex flex-wrap gap-2 border-t pt-3">
              {canEditValue && (
                <Button size="sm" variant="outline" onClick={() => {
                  setValueText(wo.approved_value != null ? Number(wo.approved_value).toFixed(2) : "");
                  setEditing(true);
                }}>{wo.approved_value == null ? "Set approved amount" : "Change approved amount"}</Button>
              )}
              {canCancel && (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => cancelWorkOrder(wo.id))}>Cancel work order</Button>
              )}
            </div>
          )
        )}
      </CardContent>
    </Card>
  );
}

// ── Side blocks ──────────────────────────────────────────────────────────────

function WhosDoingIt({ wo, ctx, viewer }: { wo: WorkOrder; ctx: WorkOrderContext; viewer: "business" | "contractor" }) {
  const jobLink = ctx.job
    ? viewer === "business" ? `/dashboard/business?view=jobs&jobId=${ctx.job.id}` : `/dashboard/contractor?view=jobs&jobId=${ctx.job.id}`
    : null;
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{viewer === "business" ? "Who's doing it" : "Who it's for"}</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-sm">
        {viewer === "business" ? (
          wo.dispatched_to ? (
            <div>
              <p className="font-medium">{ctx.contractor_name ?? "The contractor"}</p>
              {ctx.contractor_ts_code && <p className="font-mono text-xs text-muted-foreground">{ctx.contractor_ts_code}</p>}
            </div>
          ) : (
            <p>Not sent to anyone yet</p>
          )
        ) : (
          <p>{ctx.company_name ?? "The business"}{ctx.site_name ? ` · ${ctx.site_name}` : ""}</p>
        )}
        {jobLink && (
          <Button size="sm" variant="outline" asChild><a href={jobLink}>View job</a></Button>
        )}
      </CardContent>
    </Card>
  );
}

function RatesBlock({ wo, vat }: { wo: WorkOrder; vat: boolean }) {
  const rate = readRateSnapshot(wo.rate_snapshot);
  if (!rate) return null;
  const row = (label: string, value: string) => (
    <div className="flex justify-between gap-2"><span className="text-muted-foreground">{label}</span><span className="font-mono">{value}</span></div>
  );
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Agreed rates</CardTitle></CardHeader>
      <CardContent className="space-y-1 text-sm">
        {rate.calloutStandard != null && row("Call-out", money(rate.calloutStandard, vat))}
        {rate.calloutOoh != null && row("Out-of-hours call-out", money(rate.calloutOoh, vat))}
        {rate.hourlyRate != null && row("Per hour", money(rate.hourlyRate, vat))}
        {rate.materialsMarkupPct != null && row("Materials markup", `${rate.materialsMarkupPct}%`)}
        {rate.minimumCharge != null && row("Minimum charge", money(rate.minimumCharge, vat))}
      </CardContent>
    </Card>
  );
}

function AssetBlock({ asset }: { asset: NonNullable<WorkOrderContext["asset"]> }) {
  const cert = asset.certificate;
  const daysToExpiry = cert ? Math.ceil((new Date(cert.expiry_date).getTime() - Date.now()) / 86_400_000) : null;
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{asset.name}</CardTitle></CardHeader>
      <CardContent className="space-y-1 text-sm">
        {(asset.make || asset.model) && <p>{[asset.make, asset.model].filter(Boolean).join(" ")}</p>}
        {asset.location_note && <p className="text-muted-foreground">{asset.location_note}</p>}
        {asset.next_service_due && <p className="text-muted-foreground">Next service due {formatDate(asset.next_service_due)}</p>}
        {/* Certificate expiry prompt: a certificate on this asset has an expiry date within 60 days, or past. */}
        {cert && daysToExpiry != null && daysToExpiry <= 60 && (
          <p className={daysToExpiry < 0 ? "text-red-700" : "text-amber-800"}>
            {cert.name ?? "Certificate"} {daysToExpiry < 0 ? "expired" : "expires"} {formatDate(cert.expiry_date)}.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function TeamBlock({ wo, ctx }: { wo: WorkOrder; ctx: WorkOrderContext }) {
  const raiser = ctx.raised_by_name ?? "Someone";
  const lim = ctx.raiser_limit;
  const canApprove = !lim ? null
    : lim.owner ? "the owner"
      : lim.limit == null ? null
        : `can approve up to ${formatGBP(lim.limit)}`;
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Team</CardTitle></CardHeader>
      <CardContent className="space-y-1 text-sm">
        <p>Raised by {raiser}{canApprove ? `, ${canApprove}` : ""}.</p>
        {wo.po_issued_at && (
          <p className="text-muted-foreground">Approved by {ctx.approved_by_is_viewer ? "you" : ctx.approved_by_name ?? "a team member"}.</p>
        )}
      </CardContent>
    </Card>
  );
}
