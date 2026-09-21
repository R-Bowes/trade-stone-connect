import { useCallback, useEffect, useState } from "react";
import { addMonths, format, parseISO, subDays } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/formatDate";
import { formatGBP } from "@/lib/formatGBP";
import { formatInvoiceRef } from "@/lib/documentRefs";
import { PayInvoiceButton } from "@/components/recipient/PayInvoiceButton";

type StatementRow = Database["public"]["Views"]["work_order_cost_period_statement"]["Row"];

interface ApprovedLine {
  contractor_id: string;
  line_total: number;
  created_at: string;
}

interface InvoiceRow {
  id: string;
  invoice_number: number;
  contractor_id: string;
  period_start: string | null;
  period_end: string | null;
  total: number;
  status: string;
  due_date: string;
}

interface ContractorInfo {
  id: string;
  full_name: string | null;
  ts_profile_code: string | null;
}

const isoDay = (d: Date) => format(d, "yyyy-MM-dd");

function Figure({ label, value, count }: { label: string; value: number; count: number }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-xl font-semibold">{formatGBP(value)}</p>
      <p className="text-xs text-muted-foreground">{count} {count === 1 ? "line" : "lines"}</p>
    </div>
  );
}

export function BusinessBillingView({ companyId }: { companyId: string }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [statements, setStatements] = useState<StatementRow[]>([]);
  const [approvedLines, setApprovedLines] = useState<ApprovedLine[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [contractors, setContractors] = useState<Record<string, ContractorInfo>>({});
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [statementRes, linesRes, invoiceRes] = await Promise.all([
      supabase.from("work_order_cost_period_statement").select("*").eq("company_id", companyId),
      supabase
        .from("work_order_costs")
        .select("contractor_id, line_total, created_at")
        .eq("company_id", companyId)
        .eq("status", "approved")
        .is("invoice_id", null),
      supabase
        .from("invoices")
        .select("id, invoice_number, contractor_id, period_start, period_end, total, status, due_date")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false }),
    ]);

    const firstError = statementRes.error ?? linesRes.error ?? invoiceRes.error;
    if (firstError) {
      console.error("Error loading billing:", firstError);
      toast({ title: "Error", description: "Failed to load billing", variant: "destructive" });
      setLoading(false);
      return;
    }

    const statementRows = statementRes.data ?? [];
    const invoiceRows = (invoiceRes.data ?? []) as InvoiceRow[];
    setStatements(statementRows);
    setApprovedLines((linesRes.data ?? []) as ApprovedLine[]);
    setInvoices(invoiceRows);

    const contractorIds = [...new Set([
      ...statementRows.map((r) => r.contractor_id),
      ...invoiceRows.map((r) => r.contractor_id),
    ].filter((id): id is string => !!id))];

    if (contractorIds.length > 0) {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, ts_profile_code")
        .in("id", contractorIds);
      if (error) {
        console.error("Error loading contractor names:", error);
      } else {
        const map: Record<string, ContractorInfo> = {};
        for (const p of data ?? []) map[p.id] = p;
        setContractors(map);
      }
    }
    setLoading(false);
  }, [companyId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleGenerate = async (contractorId: string, periodStart: string, periodEnd: string) => {
    setGeneratingFor(contractorId);
    try {
      const { error } = await supabase.rpc("generate_b2b_invoice", {
        p_company_id: companyId,
        p_contractor_id: contractorId,
        p_period_start: periodStart,
        p_period_end: periodEnd,
      });
      if (error) {
        toast({ title: "Could not generate invoice", description: error.message, variant: "destructive" });
        return;
      }
      toast({
        title: "Invoice generated",
        description: "It is in the list below. Pay it from there — nothing is emailed.",
      });
      await load();
    } finally {
      setGeneratingFor(null);
    }
  };

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h2 className="font-heading text-2xl font-bold">Billing</h2>
        <p className="text-muted-foreground text-sm">
          Costs recorded by your contractors, by billing period. Approved lines are invoiced once the period closes.
        </p>
      </div>

      {statements.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            No live engagements to bill against yet.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {statements.map((row) => {
            if (!row.contractor_id || !row.period_start || !row.period_end || !row.engagement_id) return null;

            // The current period is by definition still open. The invoice the
            // business can act on covers the PREVIOUS period, which closed the
            // day this one started; everything approved and not yet invoiced
            // up to then (including lines that rolled forward) goes in it.
            const currentStart = parseISO(row.period_start);
            const prevStart = isoDay(addMonths(currentStart, -1));
            const prevEnd = isoDay(subDays(currentStart, 1));
            const ready = approvedLines.filter(
              (l) => l.contractor_id === row.contractor_id && l.created_at.slice(0, 10) <= prevEnd,
            );
            const readyTotal = ready.reduce((sum, l) => sum + Number(l.line_total), 0);
            const contractor = contractors[row.contractor_id];

            return (
              <Card key={row.engagement_id}>
                <CardHeader>
                  <CardTitle className="text-base">{contractor?.full_name ?? "Contractor"}</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Current period {formatDate(row.period_start)} – {formatDate(row.period_end)}
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <Figure label="Approved and due" value={Number(row.approved_due ?? 0)} count={Number(row.approved_count ?? 0)} />
                    <Figure label="Awaiting approval" value={Number(row.awaiting_approval ?? 0)} count={Number(row.pending_count ?? 0)} />
                    <Figure label="Queried" value={Number(row.queried ?? 0)} count={Number(row.queried_count ?? 0)} />
                  </div>

                  {ready.length > 0 && (
                    <div className="rounded-md border border-green-200 bg-green-50 p-3 flex items-center justify-between gap-3 flex-wrap">
                      <div className="text-sm text-green-900">
                        <p className="font-medium">
                          {formatGBP(readyTotal)} approved and ready to invoice
                        </p>
                        <p className="text-xs">
                          Period {formatDate(prevStart)} – {formatDate(prevEnd)} has closed.
                        </p>
                      </div>
                      <Button
                        size="sm"
                        disabled={generatingFor === row.contractor_id}
                        onClick={() => handleGenerate(row.contractor_id!, prevStart, prevEnd)}
                      >
                        {generatingFor === row.contractor_id && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                        Generate invoice
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase text-muted-foreground">Invoices</h3>
        {invoices.length === 0 ? (
          <Card><CardContent className="p-6 text-sm text-muted-foreground">No invoices generated yet.</CardContent></Card>
        ) : (
          <div className="grid gap-3">
            {invoices.map((inv) => {
              const contractor = contractors[inv.contractor_id];
              return (
                <Card key={inv.id}>
                  <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
                    <div className="space-y-1">
                      <p className="font-mono text-sm">
                        {formatInvoiceRef(inv.invoice_number, { contractorCode: contractor?.ts_profile_code ?? undefined })}
                      </p>
                      <p className="text-sm">{contractor?.full_name ?? "Contractor"}</p>
                      <p className="text-xs text-muted-foreground">
                        {inv.period_start && inv.period_end
                          ? `${formatDate(inv.period_start)} – ${formatDate(inv.period_end)} · `
                          : ""}
                        due {formatDate(inv.due_date)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="font-semibold">{formatGBP(inv.total)}</p>
                        <Badge className={inv.status === "paid" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}>
                          {inv.status === "paid" ? "Paid" : "Payment due"}
                        </Badge>
                      </div>
                      {inv.status !== "void" && <PayInvoiceButton invoiceId={inv.id} status={inv.status} />}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
