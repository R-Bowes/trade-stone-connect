import { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { downloadCsv, tradestoneCsvFilename } from "@/lib/csvExport";

type UnpaidInvoice = {
  id: string;
  invoiceNumber: number;
  clientName: string;
  total: number;
  issuedDate: string;
  dueDate: string;
  status: string;
  ageDays: number;
  bucket: "current" | "thirty" | "sixty" | "ninety";
};

const BUCKET_LABELS: Record<UnpaidInvoice["bucket"], string> = {
  current: "Current (0-30 days)",
  thirty: "30-60 days",
  sixty: "60-90 days",
  ninety: "90+ days",
};

const BUCKET_BADGE_CLASS: Record<UnpaidInvoice["bucket"], string> = {
  current: "bg-green-100 text-green-800",
  thirty: "bg-amber-100 text-amber-800",
  sixty: "bg-orange-100 text-orange-800",
  ninety: "bg-red-100 text-red-800",
};

const BUCKET_CARD_CLASS: Record<UnpaidInvoice["bucket"], string> = {
  current: "text-green-600",
  thirty: "text-amber-600",
  sixty: "text-orange-600",
  ninety: "text-red-600",
};

const gbp = (n: number) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function bucketFor(ageDays: number): UnpaidInvoice["bucket"] {
  if (ageDays <= 30) return "current";
  if (ageDays <= 60) return "thirty";
  if (ageDays <= 90) return "sixty";
  return "ninety";
}

export function AgedDebtors() {
  const [invoices, setInvoices] = useState<UnpaidInvoice[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    const { data: profileRow } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!profileRow) {
      setLoading(false);
      return;
    }

    const { data: rows } = await supabase
      .from("invoices")
      .select("id, invoice_number, client_name, total, issued_date, due_date, status")
      .eq("contractor_id", profileRow.id)
      .in("status", ["sent", "overdue"]);

    const today = new Date();
    const computed: UnpaidInvoice[] = (rows ?? []).map((inv) => {
      const ageDays = Math.floor((today.getTime() - new Date(inv.issued_date).getTime()) / (1000 * 60 * 60 * 24));
      return {
        id: inv.id,
        invoiceNumber: inv.invoice_number,
        clientName: inv.client_name,
        total: Number(inv.total),
        issuedDate: inv.issued_date,
        dueDate: inv.due_date,
        status: inv.status,
        ageDays,
        bucket: bucketFor(ageDays),
      };
    });

    computed.sort((a, b) => b.ageDays - a.ageDays);
    setInvoices(computed);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const summary = useMemo(() => {
    const buckets = { current: 0, thirty: 0, sixty: 0, ninety: 0 };
    for (const inv of invoices) {
      buckets[inv.bucket] += inv.total;
    }
    const total = buckets.current + buckets.thirty + buckets.sixty + buckets.ninety;
    return { ...buckets, total };
  }, [invoices]);

  const handleExport = () => {
    downloadCsv(
      tradestoneCsvFilename("aged_debtors"),
      ["Invoice #", "Client", "Amount", "Issued", "Due", "Age (Days)", "Status"],
      invoices.map((inv) => [
        `INV-${String(inv.invoiceNumber).padStart(4, "0")}`,
        inv.clientName,
        inv.total.toFixed(2),
        inv.issuedDate,
        inv.dueDate,
        inv.ageDays,
        inv.status,
      ]),
    );
  };

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading aged debtors…</div>;
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
        <div>
          <h2 className="font-heading text-2xl font-bold">Aged Debtors</h2>
          <p className="text-sm text-muted-foreground">Outstanding invoices by age — read-only, manage payments from Invoices</p>
        </div>
        <Button variant="outline" onClick={handleExport}>
          <i className="ti ti-download mr-1" /> Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {(["current", "thirty", "sixty", "ninety"] as const).map((bucket) => (
          <Card key={bucket}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{BUCKET_LABELS[bucket]}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${BUCKET_CARD_CLASS[bucket]}`}>{gbp(summary[bucket])}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-4 flex justify-between items-center">
          <span className="text-sm text-muted-foreground">Total outstanding</span>
          <span className="text-xl font-bold">{gbp(summary.total)}</span>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Unpaid invoices</CardTitle>
          <CardDescription>Oldest first</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {invoices.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No unpaid invoices — nice work.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Issued</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Age</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-mono text-sm">INV-{String(inv.invoiceNumber).padStart(4, "0")}</TableCell>
                    <TableCell>{inv.clientName}</TableCell>
                    <TableCell className="text-right font-medium">{gbp(inv.total)}</TableCell>
                    <TableCell className="whitespace-nowrap">{format(new Date(inv.issuedDate), "dd MMM yyyy")}</TableCell>
                    <TableCell className="whitespace-nowrap">{format(new Date(inv.dueDate), "dd MMM yyyy")}</TableCell>
                    <TableCell>
                      <Badge className={BUCKET_BADGE_CLASS[inv.bucket]}>{inv.ageDays}d</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">{inv.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
