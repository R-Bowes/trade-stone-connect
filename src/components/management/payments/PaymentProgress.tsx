import { useEffect } from "react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2 } from "lucide-react";
import { usePaymentSchedule, type PaymentStage } from "@/hooks/usePaymentSchedule";
import { useNavigate } from "react-router-dom";

interface PaymentProgressProps {
  jobId: string;
  isContractor: boolean;
}

const STATUS_COLOR: Record<string, string> = {
  paid: "#16a34a",
  invoiced: "#2563eb",
  ready: "#f07820",
  pending: "#9ca3af",
  skipped: "#d1d5db",
};

const STATUS_LABEL: Record<string, string> = {
  paid: "Paid",
  invoiced: "Invoiced",
  ready: "Ready",
  pending: "Pending",
  skipped: "Skipped",
};

export function PaymentProgress({ jobId, isContractor }: PaymentProgressProps) {
  const { schedule, loading, fetchSchedule, markStageReady, createStageInvoice } = usePaymentSchedule();
  const navigate = useNavigate();

  useEffect(() => {
    void fetchSchedule(jobId);
  }, [jobId, fetchSchedule]);

  if (loading && !schedule) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading payment schedule...
      </div>
    );
  }

  if (!schedule) return null;

  const fmt = (n: number) => Number(n).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Payment Progress</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
          {schedule.stages.map((stage) => (
            <div
              key={stage.id}
              style={{
                width: `${stage.percentage ?? (Number(stage.calculated_amount) / Number(schedule.total_contract_value)) * 100}%`,
                backgroundColor: STATUS_COLOR[stage.status] ?? STATUS_COLOR.pending,
              }}
              title={`${stage.title} — ${STATUS_LABEL[stage.status]}`}
            />
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          £{fmt(schedule.stages.filter((s) => s.status === "paid").reduce((sum, s) => sum + Number(s.calculated_amount), 0))}
          {" "}of £{fmt(Number(schedule.total_contract_value))} paid
        </p>

        <div className="space-y-2">
          {schedule.stages.map((stage) => (
            <StageCard
              key={stage.id}
              stage={stage}
              isContractor={isContractor}
              onMarkReady={() => markStageReady(stage.id)}
              onCreateInvoice={() => createStageInvoice(stage.id)}
              onViewInvoice={() => stage.invoice_id && navigate(isContractor ? "/dashboard/contractor?view=invoices" : "/dashboard/homeowner?view=invoices")}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function StageCard({
  stage,
  isContractor,
  onMarkReady,
  onCreateInvoice,
  onViewInvoice,
}: {
  stage: PaymentStage;
  isContractor: boolean;
  onMarkReady: () => void;
  onCreateInvoice: () => void;
  onViewInvoice: () => void;
}) {
  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Stage {stage.stage_number}: {stage.title}</p>
          <p className="text-xs text-muted-foreground">
            £{Number(stage.calculated_amount).toFixed(2)}
            {stage.percentage != null && ` (${stage.percentage}%)`}
          </p>
          {stage.milestone_description && (
            <p className="text-xs text-muted-foreground">{stage.milestone_description}</p>
          )}
        </div>
        <Badge style={{ backgroundColor: STATUS_COLOR[stage.status], color: "#fff" }}>
          {STATUS_LABEL[stage.status]}
        </Badge>
      </div>

      {isContractor ? (
        <div className="flex gap-2">
          {stage.status === "pending" && (
            <Button size="sm" variant="outline" onClick={onMarkReady}>Mark Milestone Reached</Button>
          )}
          {stage.status === "ready" && (
            <Button size="sm" style={{ backgroundColor: "#f07820" }} className="text-white" onClick={onCreateInvoice}>
              Create Invoice
            </Button>
          )}
          {stage.status === "invoiced" && (
            <Button size="sm" variant="link" className="px-0" onClick={onViewInvoice}>View Invoice</Button>
          )}
          {stage.status === "paid" && (
            <span className="flex items-center gap-1.5 text-sm text-green-700">
              <CheckCircle2 className="h-4 w-4" /> Paid
              {stage.marked_ready_at && <span className="text-muted-foreground">· {format(new Date(stage.marked_ready_at), "d MMM yyyy")}</span>}
            </span>
          )}
        </div>
      ) : (
        <div className="text-sm">
          {stage.status === "ready" && (
            <p className="text-amber-700">The contractor has marked this milestone as reached. An invoice will follow.</p>
          )}
          {stage.status === "invoiced" && (
            <Button size="sm" style={{ backgroundColor: "#f07820" }} className="text-white" onClick={onViewInvoice}>
              Invoice received — Pay Now
            </Button>
          )}
          {stage.status === "paid" && (
            <span className="flex items-center gap-1.5 text-green-700">
              <CheckCircle2 className="h-4 w-4" /> Paid
            </span>
          )}
        </div>
      )}
    </div>
  );
}
