import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, Check, X, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkOrders, type WorkOrder } from "@/hooks/useWorkOrders";
import { WorkOrderCard } from "@/components/shared/WorkOrderCard";
import { WorkOrderCostLines } from "@/components/shared/WorkOrderCostLines";
import { RecordCostsDialog, AmendCostDialog } from "@/components/management/RecordCostsDialog";
import { useWorkOrderCosts } from "@/hooks/useWorkOrderCosts";
import type { WorkOrderCost } from "@/lib/costLines";

const DECLINE_REASONS = ["Unavailable", "Too far", "Outside expertise", "Capacity full", "Other"];

const INBOX_SELECT = "*, company:companies(name, company_code), site:sites(id, name), asset:assets(id, name)" as const;

type InboxWorkOrder = WorkOrder & { company?: { name: string | null; company_code: string | null } | null };

export function WorkOrderInbox() {
  const { respondToWorkOrder } = useWorkOrders();
  const navigate = useNavigate();
  const [pending, setPending] = useState<InboxWorkOrder[]>([]);
  const [active, setActive] = useState<InboxWorkOrder[]>([]);
  const { costsByWorkOrder, loadCosts, submitCost, amendCost } = useWorkOrderCosts();
  const [recordingFor, setRecordingFor] = useState<InboxWorkOrder | null>(null);
  const [amending, setAmending] = useState<WorkOrderCost | null>(null);
  const [loading, setLoading] = useState(true);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [decliningWo, setDecliningWo] = useState<InboxWorkOrder | null>(null);
  const [declineReasonChoice, setDeclineReasonChoice] = useState(DECLINE_REASONS[0]);
  const [declineFreeText, setDeclineFreeText] = useState("");
  const [declining, setDeclining] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const [pendingRes, activeRes] = await Promise.all([
      supabase
        .from("work_orders")
        .select(INBOX_SELECT)
        .eq("dispatched_to", user.id)
        .eq("status", "dispatched")
        .eq("response", "pending")
        .order("dispatched_at", { ascending: true }),
      supabase
        .from("work_orders")
        .select(INBOX_SELECT)
        .eq("dispatched_to", user.id)
        .eq("status", "accepted")
        .order("dispatched_at", { ascending: false }),
    ]);

    if (pendingRes.error || activeRes.error) {
      console.error("Error fetching work order inbox:", pendingRes.error ?? activeRes.error);
      setLoading(false);
      return;
    }
    const activeRows = (activeRes.data ?? []) as unknown as InboxWorkOrder[];
    setPending((pendingRes.data ?? []) as unknown as InboxWorkOrder[]);
    setActive(activeRows);
    await loadCosts(activeRows.map((w) => w.id));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleAccept = async (wo: InboxWorkOrder) => {
    setAcceptingId(wo.id);
    try {
      const jobId = await respondToWorkOrder(wo.id, true);
      setPending((cur) => cur.filter((w) => w.id !== wo.id));
      if (jobId) navigate(`/dashboard/contractor?view=jobs&jobId=${jobId}`);
    } finally {
      setAcceptingId(null);
    }
  };

  const openDecline = (wo: InboxWorkOrder) => {
    setDecliningWo(wo);
    setDeclineReasonChoice(DECLINE_REASONS[0]);
    setDeclineFreeText("");
  };

  const handleDecline = async () => {
    if (!decliningWo) return;
    setDeclining(true);
    try {
      const reason = declineReasonChoice === "Other" && declineFreeText.trim()
        ? declineFreeText.trim()
        : declineReasonChoice;
      await respondToWorkOrder(decliningWo.id, false, reason);
      setPending((cur) => cur.filter((w) => w.id !== decliningWo.id));
      setDecliningWo(null);
    } finally {
      setDeclining(false);
    }
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  if (pending.length === 0 && active.length === 0) {
    return (
      <div className="space-y-3 p-6">
        <h2 className="font-heading text-2xl font-bold">Work Orders</h2>
        <Card><CardContent className="p-8 text-center text-muted-foreground">No work orders right now.</CardContent></Card>
      </div>
    );
  }

  const amendingWo = amending ? active.find((w) => w.id === amending.work_order_id) ?? null : null;

  return (
    <div className="space-y-6 p-6">
      <h2 className="font-heading text-2xl font-bold">Work Orders</h2>

      {pending.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold uppercase text-muted-foreground">Awaiting your response</h3>
          <div className="grid gap-3">
            {pending.map((wo) => (
              <WorkOrderCard
                key={wo.id}
                workOrder={wo}
                site={wo.site ?? null}
                counterparty={wo.company?.name ?? null}
                companyCode={wo.company?.company_code ?? null}
                viewer="contractor"
                actions={
                  <>
                    <Button
                      size="sm"
                      disabled={acceptingId === wo.id}
                      onClick={() => handleAccept(wo)}
                      className="bg-green-600 hover:bg-green-700 text-white"
                    >
                      {acceptingId === wo.id ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
                      Accept
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => openDecline(wo)}>
                      <X className="h-4 w-4 mr-1" />Decline
                    </Button>
                  </>
                }
              />
            ))}
          </div>
        </section>
      )}

      {active.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold uppercase text-muted-foreground">Active work orders</h3>
          <div className="grid gap-3">
            {active.map((wo) => (
              <WorkOrderCard
                key={wo.id}
                workOrder={wo}
                site={wo.site ?? null}
                counterparty={wo.company?.name ?? null}
                companyCode={wo.company?.company_code ?? null}
                viewer="contractor"
                costs={
                  <WorkOrderCostLines
                    lines={costsByWorkOrder[wo.id] ?? []}
                    renderLineActions={(line) =>
                      line.status === "pending" || line.status === "queried" ? (
                        <Button size="sm" variant="outline" onClick={() => setAmending(line)}>
                          {line.status === "queried" ? "Amend and resubmit" : "Amend"}
                        </Button>
                      ) : null
                    }
                  />
                }
                actions={
                  <Button size="sm" onClick={() => setRecordingFor(wo)}>
                    <Plus className="h-4 w-4 mr-1" />Record costs
                  </Button>
                }
              />
            ))}
          </div>
        </section>
      )}

      <RecordCostsDialog
        open={!!recordingFor}
        onOpenChange={(o) => {
          if (!o) {
            const ids = active.map((w) => w.id);
            setRecordingFor(null);
            void loadCosts(ids);
          }
        }}
        workOrderTitle={recordingFor?.title ?? ""}
        rateSnapshot={recordingFor?.rate_snapshot ?? null}
        onSubmit={(input) => (recordingFor ? submitCost(recordingFor.id, input) : Promise.resolve(false))}
      />

      <AmendCostDialog
        line={amending}
        rateSnapshot={amendingWo?.rate_snapshot ?? null}
        onOpenChange={(o) => {
          if (!o) {
            setAmending(null);
            void loadCosts(active.map((w) => w.id));
          }
        }}
        onSubmit={amendCost}
      />

      <Dialog open={!!decliningWo} onOpenChange={(o) => { if (!o) setDecliningWo(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Decline Work Order</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Select value={declineReasonChoice} onValueChange={setDeclineReasonChoice}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DECLINE_REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
            {declineReasonChoice === "Other" && (
              <Textarea placeholder="Reason" rows={2} value={declineFreeText} onChange={(e) => setDeclineFreeText(e.target.value)} />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecliningWo(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDecline} disabled={declining}>
              {declining && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Decline
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
