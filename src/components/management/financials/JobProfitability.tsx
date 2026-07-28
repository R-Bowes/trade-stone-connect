import { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { downloadCsv, tradestoneCsvFilename } from "@/lib/csvExport";

type JobProfit = {
  jobId: string;
  jobTitle: string;
  jobNumber: number;
  status: string;
  clientName: string;
  quotedAmount: number;
  invoicedAmount: number;
  paidAmount: number;
  expensesAmount: number;
  mileageAmount: number;
  totalCosts: number;
  profit: number;
  margin: number;
  variance: number;
};

type SortKey = "jobNumber" | "clientName" | "quotedAmount" | "invoicedAmount" | "totalCosts" | "profit" | "margin";
type StatusFilter = "all" | "active" | "complete";

const gbp = (n: number) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function marginColor(margin: number): string {
  if (margin > 20) return "text-green-600";
  if (margin >= 0) return "text-amber-600";
  return "text-red-600";
}

export function JobProfitability() {
  const [jobProfits, setJobProfits] = useState<JobProfit[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("jobNumber");
  const [sortDesc, setSortDesc] = useState(true);

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

    const [
      { data: jobs },
      { data: quotes },
      { data: invoices },
      { data: expenses },
      { data: trips },
    ] = await Promise.all([
      supabase.from("jobs").select("id, title, job_number, status, contract_value, customer_id, issued_quote_id").eq("contractor_id", profileRow.id),
      supabase.from("issued_quotes").select("id, total, client_name").eq("contractor_id", profileRow.id),
      supabase.from("invoices").select("job_id, total, status").eq("contractor_id", profileRow.id).not("job_id", "is", null),
      supabase.from("expenses").select("job_id, amount").eq("contractor_id", profileRow.id).not("job_id", "is", null),
      supabase.from("mileage_trips").select("job_id, claim_amount").eq("contractor_id", profileRow.id).not("job_id", "is", null),
    ]);

    const jobRows = jobs ?? [];
    const quotesById = new Map((quotes ?? []).map((q) => [q.id, q]));

    const invoicesByJob = new Map<string, { total: number; status: string }[]>();
    for (const inv of invoices ?? []) {
      if (!inv.job_id) continue;
      const list = invoicesByJob.get(inv.job_id) ?? [];
      list.push({ total: Number(inv.total), status: inv.status });
      invoicesByJob.set(inv.job_id, list);
    }

    const expensesByJob = new Map<string, number>();
    for (const e of expenses ?? []) {
      if (!e.job_id) continue;
      expensesByJob.set(e.job_id, (expensesByJob.get(e.job_id) ?? 0) + Number(e.amount));
    }

    const mileageByJob = new Map<string, number>();
    for (const t of trips ?? []) {
      if (!t.job_id) continue;
      mileageByJob.set(t.job_id, (mileageByJob.get(t.job_id) ?? 0) + Number(t.claim_amount));
    }

    // Fallback client name via profiles, only for jobs whose quote lookup came up empty
    const customerIdsNeedingLookup = Array.from(
      new Set(
        jobRows
          .filter((j) => !j.issued_quote_id || !quotesById.get(j.issued_quote_id))
          .map((j) => j.customer_id)
          .filter((id): id is string => !!id),
      ),
    );
    let customerNames = new Map<string, string>();
    if (customerIdsNeedingLookup.length > 0) {
      const { data: customerProfiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", customerIdsNeedingLookup);
      customerNames = new Map((customerProfiles ?? []).map((p) => [p.id, p.full_name ?? "—"]));
    }

    const computed: JobProfit[] = jobRows.map((job) => {
      const quote = job.issued_quote_id ? quotesById.get(job.issued_quote_id) : undefined;
      const jobInvoices = invoicesByJob.get(job.id) ?? [];
      const invoicedAmount = jobInvoices.reduce((sum, i) => sum + i.total, 0);
      const paidAmount = jobInvoices.filter((i) => i.status === "paid").reduce((sum, i) => sum + i.total, 0);
      const expensesAmount = expensesByJob.get(job.id) ?? 0;
      const mileageAmount = mileageByJob.get(job.id) ?? 0;
      const totalCosts = expensesAmount + mileageAmount;
      const profit = invoicedAmount - totalCosts;
      const margin = invoicedAmount > 0 ? (profit / invoicedAmount) * 100 : 0;
      const quotedAmount = quote?.total ?? 0;
      const variance = quotedAmount - invoicedAmount;
      const clientName = quote?.client_name ?? (job.customer_id ? customerNames.get(job.customer_id) ?? "—" : "—");

      return {
        jobId: job.id,
        jobTitle: job.title,
        jobNumber: job.job_number,
        status: job.status,
        clientName,
        quotedAmount,
        invoicedAmount,
        paidAmount,
        expensesAmount,
        mileageAmount,
        totalCosts,
        profit,
        margin,
        variance,
      };
    });

    setJobProfits(computed);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filtered = useMemo(() => {
    return jobProfits.filter((j) => {
      if (statusFilter === "active") return j.status !== "complete" && j.status !== "cancelled";
      if (statusFilter === "complete") return j.status === "complete";
      return true;
    });
  }, [jobProfits, statusFilter]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    list.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp = typeof av === "string" ? av.localeCompare(bv as string) : (av as number) - (bv as number);
      return sortDesc ? -cmp : cmp;
    });
    return list;
  }, [filtered, sortKey, sortDesc]);

  const totals = useMemo(() => {
    const quoted = filtered.reduce((s, j) => s + j.quotedAmount, 0);
    const invoiced = filtered.reduce((s, j) => s + j.invoicedAmount, 0);
    const costs = filtered.reduce((s, j) => s + j.totalCosts, 0);
    const profit = filtered.reduce((s, j) => s + j.profit, 0);
    const withInvoiced = filtered.filter((j) => j.invoicedAmount > 0);
    const avgMargin = withInvoiced.length > 0
      ? withInvoiced.reduce((s, j) => s + j.margin, 0) / withInvoiced.length
      : 0;
    return { quoted, invoiced, costs, profit, avgMargin };
  }, [filtered]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDesc((d) => !d);
    } else {
      setSortKey(key);
      setSortDesc(true);
    }
  };

  const handleExport = () => {
    downloadCsv(
      tradestoneCsvFilename("job_profitability"),
      ["Job", "Client", "Quoted", "Invoiced", "Costs", "Profit", "Margin %", "Status"],
      sorted.map((j) => [
        `J-${String(j.jobNumber).padStart(4, "0")} ${j.jobTitle}`,
        j.clientName,
        j.quotedAmount.toFixed(2),
        j.invoicedAmount.toFixed(2),
        j.totalCosts.toFixed(2),
        j.profit.toFixed(2),
        j.margin.toFixed(1),
        j.status,
      ]),
    );
  };

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading job profitability…</div>;
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
        <div>
          <h2 className="font-heading text-2xl font-bold">Job Profitability</h2>
          <p className="text-sm text-muted-foreground">Quoted vs invoiced vs actual costs, per job</p>
        </div>
        <Button variant="outline" onClick={handleExport}>
          <i className="ti ti-download mr-1" /> Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Quoted</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-bold">{gbp(totals.quoted)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Invoiced</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-bold">{gbp(totals.invoiced)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Costs</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-bold text-red-600">{gbp(totals.costs)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Profit</CardTitle></CardHeader>
          <CardContent><div className={`text-xl font-bold ${totals.profit >= 0 ? "text-green-600" : "text-red-600"}`}>{gbp(totals.profit)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Avg. margin</CardTitle></CardHeader>
          <CardContent><div className={`text-xl font-bold ${marginColor(totals.avgMargin)}`}>{totals.avgMargin.toFixed(1)}%</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Jobs</CardTitle>
            <CardDescription>Click a column heading to sort</CardDescription>
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="complete">Complete</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="p-0">
          {sorted.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No jobs found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="cursor-pointer" onClick={() => handleSort("jobNumber")}>Job</TableHead>
                  <TableHead className="cursor-pointer" onClick={() => handleSort("clientName")}>Client</TableHead>
                  <TableHead className="text-right cursor-pointer" onClick={() => handleSort("quotedAmount")}>Quoted</TableHead>
                  <TableHead className="text-right cursor-pointer" onClick={() => handleSort("invoicedAmount")}>Invoiced</TableHead>
                  <TableHead className="text-right cursor-pointer" onClick={() => handleSort("totalCosts")}>Costs</TableHead>
                  <TableHead className="text-right cursor-pointer" onClick={() => handleSort("profit")}>Profit</TableHead>
                  <TableHead className="text-right cursor-pointer" onClick={() => handleSort("margin")}>Margin</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((j) => {
                  const varianceIsSignificant = j.quotedAmount > 0 && Math.abs(j.variance) / j.quotedAmount > 0.1;
                  // variance = quotedAmount - invoicedAmount. Positive means you
                  // invoiced LESS than quoted (over-quoted the job); negative
                  // means you invoiced MORE than quoted (under-quoted it).
                  const isOverQuoted = j.variance > 0;
                  return (
                    <TableRow key={j.jobId}>
                      <TableCell className="font-mono text-sm">J-{String(j.jobNumber).padStart(4, "0")}</TableCell>
                      <TableCell>{j.clientName}</TableCell>
                      <TableCell className="text-right">
                        {gbp(j.quotedAmount)}
                        {varianceIsSignificant && (
                          <span
                            className={`ml-1 text-xs ${isOverQuoted ? "text-amber-600" : "text-red-600"}`}
                            title={isOverQuoted ? "Over-quoted" : "Under-quoted"}
                          >
                            {isOverQuoted ? "↑" : "↓"}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{gbp(j.invoicedAmount)}</TableCell>
                      <TableCell className="text-right text-red-600">{gbp(j.totalCosts)}</TableCell>
                      <TableCell className={`text-right font-medium ${j.profit >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {gbp(j.profit)}
                      </TableCell>
                      <TableCell className={`text-right font-medium ${marginColor(j.margin)}`}>
                        {j.margin.toFixed(1)}%
                      </TableCell>
                      <TableCell><Badge variant="outline">{j.status}</Badge></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
