import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { WorkOrder } from "@/hooks/useWorkOrders";
import { WorkOrderCard } from "@/components/shared/WorkOrderCard";

// The job is embedded through work_orders.job_id (two FKs join these tables,
// so the hint is needed): the badge reads "In progress" only once it's started.
const INBOX_SELECT = "*, company:companies(name, company_code), site:sites(id, name), asset:assets(id, name), job:jobs!work_orders_job_id_fkey(id, status)" as const;

type InboxWorkOrder = WorkOrder & {
  company?: { name: string | null; company_code: string | null } | null;
  job?: { id: string; status: string } | null;
};

/**
 * The contractor's work orders, as a list. Each opens the work order page
 * (?view=work-orders&workOrder=<id>), which holds accept/decline, "Ask to
 * spend more", recording costs and the timeline.
 */
export function WorkOrderInbox() {
  const navigate = useNavigate();
  const [pending, setPending] = useState<InboxWorkOrder[]>([]);
  const [active, setActive] = useState<InboxWorkOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
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
      } else {
        setPending((pendingRes.data ?? []) as unknown as InboxWorkOrder[]);
        setActive((activeRes.data ?? []) as unknown as InboxWorkOrder[]);
      }
      setLoading(false);
    })();
  }, []);

  const open = (id: string) => navigate(`/dashboard/contractor?view=work-orders&workOrder=${id}`);

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  if (pending.length === 0 && active.length === 0) {
    return (
      <div className="space-y-3 p-6">
        <h2 className="font-heading text-2xl font-bold">Work Orders</h2>
        <Card><CardContent className="p-8 text-center text-muted-foreground">No work orders right now.</CardContent></Card>
      </div>
    );
  }

  const section = (heading: string, rows: InboxWorkOrder[]) => (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold uppercase text-muted-foreground">{heading}</h3>
      <div className="grid gap-3">
        {rows.map((wo) => (
          <WorkOrderCard
            key={wo.id}
            workOrder={wo}
            site={wo.site ?? null}
            counterparty={wo.company?.name ?? null}
            companyCode={wo.company?.company_code ?? null}
            viewer="contractor"
            density="compact"
            actions={<Button size="sm" onClick={() => open(wo.id)}>Open</Button>}
          />
        ))}
      </div>
    </section>
  );

  return (
    <div className="space-y-6 p-6">
      <h2 className="font-heading text-2xl font-bold">Work Orders</h2>
      {/* Each section only when it has work orders in it. */}
      {pending.length > 0 && section("Waiting for your answer", pending)}
      {active.length > 0 && section("Accepted", active)}
    </div>
  );
}
