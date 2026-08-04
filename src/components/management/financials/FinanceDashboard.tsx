import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useFinanceSummary } from "@/hooks/useFinanceSummary";
import { YearEndPackDialog } from "@/components/management/financials/YearEndPackDialog";
import { isOverdue } from "@/lib/invoiceMoney";

const gbp = (n: number) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const MANUAL_METHOD_BADGE: Record<string, string> = {
  "Bank Transfer (BACS)": "BACS",
  "Cash": "Cash",
  "Cheque": "Cheque",
  "Other": "Other",
};

type TxRow = {
  key: string;
  date: string;
  kind: "invoice" | "expense" | "mileage";
  label: string;
  amount: number;
  badge: string;
  tab: string;
};

type Props = {
  onNavigate: (tab: string) => void;
};

export function FinanceDashboard({ onNavigate }: Props) {
  const { vatPosition } = useFinanceSummary();

  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [trips, setTrips] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [yearEndOpen, setYearEndOpen] = useState(false);

  const fetchAll = useCallback(async () => {
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

    const [{ data: invoiceRows }, { data: expenseRows }, { data: tripRows }, { data: paymentRows }] = await Promise.all([
      supabase.from("invoices").select("*").eq("contractor_id", profileRow.id),
      supabase.from("expenses").select("*").eq("contractor_id", profileRow.id),
      supabase.from("mileage_trips").select("*").eq("contractor_id", profileRow.id),
      supabase.from("payments").select("invoice_id, type, notes").eq("payee_id", profileRow.id),
    ]);

    setInvoices(invoiceRows ?? []);
    setExpenses(expenseRows ?? []);
    setTrips(tripRows ?? []);
    setPayments(paymentRows ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const inRange = (dateStr: string | null, start: Date, end: Date) => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    return d >= start && d <= end;
  };

  const cashInThisMonth = useMemo(() => {
    const paidThisMonth = invoices.filter((i) => i.status === "paid" && inRange(i.paid_date, monthStart, monthEnd));
    return { total: paidThisMonth.reduce((s, i) => s + Number(i.total), 0), count: paidThisMonth.length };
  }, [invoices, monthStart, monthEnd]);

  const outstanding = useMemo(() => {
    const unpaid = invoices.filter((i) => ["sent", "viewed"].includes(i.status));
    return { total: unpaid.reduce((s, i) => s + Number(i.total), 0), count: unpaid.length };
  }, [invoices]);

  const costsThisMonth = useMemo(() => {
    const expTotal = expenses.filter((e) => inRange(e.expense_date, monthStart, monthEnd)).reduce((s, e) => s + Number(e.amount), 0);
    const mileageTotal = trips.filter((t) => inRange(t.trip_date, monthStart, monthEnd)).reduce((s, t) => s + Number(t.claim_amount), 0);
    return expTotal + mileageTotal;
  }, [expenses, trips, monthStart, monthEnd]);

  const profitThisMonth = cashInThisMonth.total - costsThisMonth;

  const cashFlowTrend = useMemo(() => {
    const months: { label: string; income: number; outgoings: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const mStart = startOfMonth(subMonths(now, i));
      const mEnd = endOfMonth(subMonths(now, i));
      const income = invoices
        .filter((inv) => inv.status === "paid" && inRange(inv.paid_date, mStart, mEnd))
        .reduce((s, inv) => s + Number(inv.total), 0);
      const outgoings =
        expenses.filter((e) => inRange(e.expense_date, mStart, mEnd)).reduce((s, e) => s + Number(e.amount), 0) +
        trips.filter((t) => inRange(t.trip_date, mStart, mEnd)).reduce((s, t) => s + Number(t.claim_amount), 0);
      months.push({ label: format(mStart, "MMM yyyy"), income, outgoings });
    }
    return months;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoices, expenses, trips]);

  const overdueInvoices = useMemo(() => invoices.filter((i) => isOverdue(i)), [invoices]);
  const dueThisWeek = useMemo(() => {
    const weekOut = new Date();
    weekOut.setDate(weekOut.getDate() + 7);
    return invoices.filter((i) => i.status === "sent" && new Date(i.due_date) >= now && new Date(i.due_date) <= weekOut);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoices]);
  const expensesWithoutReceipts = useMemo(
    () => expenses.filter((e) => !e.receipt_url && Number(e.amount) > 20),
    [expenses],
  );

  const actionItems = useMemo(() => {
    const items: { key: string; text: string; tab: string; tone: "amber" | "red" | "default" }[] = [];
    if (overdueInvoices.length > 0) {
      items.push({
        key: "overdue",
        text: `${overdueInvoices.length} invoice${overdueInvoices.length === 1 ? "" : "s"} overdue (${gbp(overdueInvoices.reduce((s, i) => s + Number(i.total), 0))})`,
        tab: "debtors",
        tone: "red",
      });
    }
    if (dueThisWeek.length > 0) {
      items.push({
        key: "due-soon",
        text: `${dueThisWeek.length} invoice${dueThisWeek.length === 1 ? "" : "s"} due in the next 7 days`,
        tab: "debtors",
        tone: "amber",
      });
    }
    if (vatPosition.vatStatus === "not_registered" && vatPosition.thresholdPercentage > 80) {
      items.push({
        key: "vat-threshold",
        text: `You're at ${vatPosition.thresholdPercentage.toFixed(0)}% of the VAT threshold`,
        tab: "vat",
        tone: vatPosition.thresholdPercentage >= 90 ? "red" : "amber",
      });
    }
    if (expensesWithoutReceipts.length > 0) {
      items.push({
        key: "no-receipts",
        text: `${expensesWithoutReceipts.length} expense${expensesWithoutReceipts.length === 1 ? " has" : "s have"} no receipt attached`,
        tab: "expenses",
        tone: "default",
      });
    }
    return items;
  }, [overdueInvoices, dueThisWeek, vatPosition, expensesWithoutReceipts]);

  const recentTransactions = useMemo<TxRow[]>(() => {
    const paymentByInvoice = new Map(payments.map((p) => [p.invoice_id, p]));

    const invoiceTx: TxRow[] = invoices
      .filter((i) => i.status === "paid" && i.paid_date)
      .map((i) => {
        const payment = paymentByInvoice.get(i.id);
        let badge = "Paid";
        if (payment?.type === "stripe") badge = "Stripe";
        else if (payment?.type === "manual" && payment.notes) {
          const methodPart = String(payment.notes).split(" — Ref:")[0];
          badge = MANUAL_METHOD_BADGE[methodPart] ?? methodPart;
        }
        return {
          key: `inv-${i.id}`, date: i.paid_date, kind: "invoice", label: i.client_name,
          amount: Number(i.total), badge, tab: "debtors",
        };
      });

    const expenseTx: TxRow[] = expenses.map((e) => ({
      key: `exp-${e.id}`, date: e.expense_date, kind: "expense", label: e.category,
      amount: -Number(e.amount), badge: "Expense", tab: "expenses",
    }));

    const mileageTx: TxRow[] = trips.map((t) => ({
      key: `trip-${t.id}`, date: t.trip_date, kind: "mileage", label: `${Number(t.miles).toLocaleString("en-GB")}mi trip`,
      amount: -Number(t.claim_amount), badge: "Mileage", tab: "mileage",
    }));

    return [...invoiceTx, ...expenseTx, ...mileageTx]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 10);
  }, [invoices, expenses, trips, payments]);

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading finance dashboard…</div>;
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
        <div>
          <h2 className="font-heading text-2xl font-bold">Finance</h2>
          <p className="text-sm text-muted-foreground">Your financial snapshot</p>
        </div>
        <Button variant="outline" onClick={() => setYearEndOpen(true)}>
          <i className="ti ti-file-invoice mr-1" /> Generate Year-End Pack
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Cash In This Month</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{gbp(cashInThisMonth.total)}</div>
            <p className="text-xs text-muted-foreground">{cashInThisMonth.count} payment{cashInThisMonth.count === 1 ? "" : "s"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Outstanding</CardTitle></CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${outstanding.total > 0 ? "text-amber-600" : ""}`}>{gbp(outstanding.total)}</div>
            <p className="text-xs text-muted-foreground">{outstanding.count} invoice{outstanding.count === 1 ? "" : "s"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Costs This Month</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{gbp(costsThisMonth)}</div>
            <p className="text-xs text-muted-foreground">Expenses + mileage</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Profit This Month</CardTitle></CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${profitThisMonth >= 0 ? "text-green-600" : "text-red-600"}`}>
              {profitThisMonth < 0 ? "-" : ""}{gbp(Math.abs(profitThisMonth))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Cash Flow Trend</CardTitle>
            <CardDescription>Last 6 months — income vs outgoings</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={cashFlowTrend}>
                <defs>
                  <linearGradient id="dashIncomeGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(221, 83%, 53%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(221, 83%, 53%)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="dashOutGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(24, 95%, 53%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(24, 95%, 53%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="label" className="text-xs" />
                <YAxis tickFormatter={(v) => `£${v}`} className="text-xs" />
                <Tooltip formatter={(value: number) => gbp(value)} />
                <Area type="monotone" dataKey="income" stroke="hsl(221, 83%, 53%)" fill="url(#dashIncomeGradient)" strokeWidth={2} name="Income" />
                <Area type="monotone" dataKey="outgoings" stroke="hsl(24, 95%, 53%)" fill="url(#dashOutGradient)" strokeWidth={2} name="Outgoings" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Action Items</CardTitle>
            <CardDescription>Things that need your attention</CardDescription>
          </CardHeader>
          <CardContent>
            {actionItems.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Nothing needs your attention right now.</p>
            ) : (
              <div className="space-y-2">
                {actionItems.map((item) => (
                  <button
                    key={item.key}
                    onClick={() => onNavigate(item.tab)}
                    className={`w-full text-left flex items-center gap-2 rounded-md border p-3 text-sm hover:bg-muted/50 transition-colors ${
                      item.tone === "red" ? "border-red-200 bg-red-50" : item.tone === "amber" ? "border-amber-200 bg-amber-50" : ""
                    }`}
                  >
                    <i className={`ti ti-alert-circle ${item.tone === "red" ? "text-red-600" : item.tone === "amber" ? "text-amber-600" : "text-muted-foreground"}`} />
                    <span className="flex-1">{item.text}</span>
                    <i className="ti ti-chevron-right text-muted-foreground" />
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Transactions</CardTitle>
          <CardDescription>Last 10 financial events</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {recentTransactions.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No transactions yet.</p>
          ) : (
            <div className="divide-y">
              {recentTransactions.map((tx) => (
                <button
                  key={tx.key}
                  onClick={() => onNavigate(tx.tab)}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm hover:bg-muted/50 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground whitespace-nowrap">{format(new Date(tx.date), "dd MMM yyyy")}</span>
                    <span className="font-medium">{tx.label}</span>
                    <Badge variant="outline">{tx.badge}</Badge>
                  </div>
                  <span className={tx.amount >= 0 ? "text-green-600 font-medium" : "text-muted-foreground"}>
                    {tx.amount >= 0 ? "+" : "-"}{gbp(Math.abs(tx.amount))}
                  </span>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <YearEndPackDialog open={yearEndOpen} onClose={() => setYearEndOpen(false)} />
    </div>
  );
}
