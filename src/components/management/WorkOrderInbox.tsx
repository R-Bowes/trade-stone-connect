import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkOrders, formatWoNumber, type WorkOrder, type WorkOrderPriority } from "@/hooks/useWorkOrders";

const PRIORITY_LABEL: Record<WorkOrderPriority, string> = {
  emergency: "Emergency", urgent: "Urgent", routine: "Routine", planned: "Planned",
};
const PRIORITY_COLOR: Record<WorkOrderPriority, string> = {
  emergency: "bg-red-100 text-red-800 border-red-300",
  urgent: "bg-amber-100 text-amber-800 border-amber-300",
  routine: "bg-blue-100 text-blue-800 border-blue-300",
  planned: "bg-slate-100 text-slate-700 border-slate-300",
};

const DECLINE_REASONS = ["Unavailable", "Too far", "Outside expertise", "Capacity full", "Other"];

type InboxWorkOrder = WorkOrder & { company?: { name: string | null; company_code: string | null } | null };

export function WorkOrderInbox() {
  const { respondToWorkOrder } = useWorkOrders();
  const navigate = useNavigate();
  const [pending, setPending] = useState<InboxWorkOrder[]>([]);
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

    const { data, error } = await (supabase as any)
      .from("work_orders")
      .select("*, company:companies(name, company_code), site:sites(id, name)")
      .eq("dispatched_to", user.id)
      .eq("status", "dispatched")
      .eq("response", "pending")
      .order("dispatched_at", { ascending: true });

    if (error) {
      console.error("Error fetching work order inbox:", error);
      setLoading(false);
      return;
    }
    setPending((data ?? []) as InboxWorkOrder[]);
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

  if (pending.length === 0) {
    return (
      <div className="space-y-3 p-6">
        <h2 className="font-heading text-2xl font-bold">Work Orders</h2>
        <Card><CardContent className="p-8 text-center text-muted-foreground">No pending work orders right now.</CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-6">
      <h2 className="font-heading text-2xl font-bold">Work Orders</h2>
      <div className="grid gap-3">
        {pending.map((wo) => (
          <Card key={wo.id} className="border-amber-300 bg-amber-50/40">
            <CardContent className="p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs font-mono text-muted-foreground">{formatWoNumber(wo.company?.company_code, wo.wo_number)}</div>
                  <div className="font-semibold">{wo.title}</div>
                  <div className="text-sm text-muted-foreground">
                    {wo.company?.name} · {wo.site?.name}
                  </div>
                </div>
                <Badge variant="outline" className={PRIORITY_COLOR[wo.priority]}>{PRIORITY_LABEL[wo.priority]}</Badge>
              </div>
              {wo.description && <p className="text-sm">{wo.description}</p>}
              {wo.rate_snapshot && (
                <div className="text-xs text-muted-foreground rounded bg-muted/50 p-2">
                  {"callout_standard" in wo.rate_snapshot && <>Call-out: £{Number((wo.rate_snapshot as any).callout_standard).toFixed(2)} · </>}
                  {"hourly_rate" in wo.rate_snapshot && <>Hourly: £{Number((wo.rate_snapshot as any).hourly_rate).toFixed(2)}</>}
                </div>
              )}
              <div className="flex gap-2 pt-1">
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
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

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
