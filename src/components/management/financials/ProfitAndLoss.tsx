import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AreaChart, Area, Line, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { useFinanceSummary, type Period } from "@/hooks/useFinanceSummary";

const CHART_COLORS = [
  "hsl(221, 83%, 53%)", "hsl(262, 83%, 58%)", "hsl(24, 95%, 53%)",
  "hsl(0, 72%, 51%)", "hsl(239, 84%, 67%)", "hsl(220, 9%, 46%)",
  "hsl(330, 81%, 60%)", "hsl(187, 92%, 41%)", "hsl(48, 96%, 53%)",
  "hsl(160, 84%, 39%)", "hsl(215, 16%, 47%)",
];

const PERIOD_LABELS: Record<Period, string> = {
  currentTaxYear: "This tax year",
  previousTaxYear: "Last tax year",
  currentQuarter: "This quarter",
  custom: "Custom range",
};

const gbp = (n: number) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function ProfitAndLoss() {
  const { pnl, period, setPeriod, customRange, setCustomRange, loading } = useFinanceSummary();

  const pieData = useMemo(() => {
    const data = pnl.expensesByCategory.filter((c) => c.amount > 0).map((c) => ({ name: c.category, value: c.amount }));
    if (pnl.totalMileage > 0) data.push({ name: "Mileage Claims", value: pnl.totalMileage });
    return data;
  }, [pnl.expensesByCategory, pnl.totalMileage]);

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading P&amp;L…</div>;
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
        <div>
          <h2 className="font-heading text-2xl font-bold">Profit &amp; Loss</h2>
          <p className="text-sm text-muted-foreground">Income, costs and margin for the selected period</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
                <SelectItem key={p} value={p}>{PERIOD_LABELS[p]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {period === "custom" && (
        <div className="flex items-end gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">From</Label>
            <Input
              type="date"
              value={customRange?.start ?? ""}
              onChange={(e) => setCustomRange({ start: e.target.value, end: customRange?.end ?? e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">To</Label>
            <Input
              type="date"
              value={customRange?.end ?? ""}
              onChange={(e) => setCustomRange({ start: customRange?.start ?? e.target.value, end: e.target.value })}
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{gbp(pnl.totalIncome)}</div>
            <p className="text-xs text-muted-foreground">{pnl.invoiceCount} paid invoice{pnl.invoiceCount === 1 ? "" : "s"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Costs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{gbp(pnl.totalCosts)}</div>
            <p className="text-xs text-muted-foreground">
              {gbp(pnl.totalExpenses)} expenses + {gbp(pnl.totalMileage)} mileage
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Profit</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${pnl.grossProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
              {pnl.grossProfit < 0 ? "-" : ""}{gbp(Math.abs(pnl.grossProfit))}
            </div>
            <p className="text-xs text-muted-foreground">Gross profit</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Margin</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${pnl.profitMargin >= 0 ? "text-green-600" : "text-red-600"}`}>
              {pnl.profitMargin.toFixed(1)}%
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-2">
              <div
                className={`h-full rounded-full ${pnl.profitMargin >= 0 ? "bg-green-600" : "bg-red-600"}`}
                style={{ width: `${Math.min(100, Math.max(0, Math.abs(pnl.profitMargin)))}%` }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Monthly P&amp;L</CardTitle>
            <CardDescription>Income, expenses and profit by month</CardDescription>
          </CardHeader>
          <CardContent>
            {pnl.monthlyBreakdown.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No data for this period.</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={pnl.monthlyBreakdown}>
                  <defs>
                    <linearGradient id="incomeGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(221, 83%, 53%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(221, 83%, 53%)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(24, 95%, 53%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(24, 95%, 53%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" className="text-xs" />
                  <YAxis tickFormatter={(v) => `£${v}`} className="text-xs" />
                  <Tooltip formatter={(value: number) => gbp(value)} />
                  <Area type="monotone" dataKey="income" stroke="hsl(221, 83%, 53%)" fill="url(#incomeGradient)" strokeWidth={2} name="Income" />
                  <Area
                    type="monotone"
                    dataKey={(d: { expenses: number; mileage: number }) => d.expenses + d.mileage}
                    stroke="hsl(24, 95%, 53%)"
                    fill="url(#costGradient)"
                    strokeWidth={2}
                    name="Expenses"
                  />
                  <Line type="monotone" dataKey="profit" stroke="hsl(160, 84%, 39%)" strokeWidth={2} dot={false} name="Profit" />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Costs by category</CardTitle>
            <CardDescription>HMRC parent categories, including mileage claims</CardDescription>
          </CardHeader>
          <CardContent>
            {pieData.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No costs logged for this period.</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={110}
                    innerRadius={60}
                    paddingAngle={2}
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => gbp(value)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>P&amp;L statement</CardTitle>
          <CardDescription>Formal summary — suitable to share with your accountant</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="font-serif max-w-xl mx-auto text-[15px]">
            <div className="font-semibold uppercase tracking-wide text-sm mb-2">Income</div>
            <div className="flex justify-between py-1">
              <span>Invoiced income (paid)</span>
              <span>{gbp(pnl.totalIncome)}</span>
            </div>
            <div className="flex justify-between py-1 border-t font-semibold">
              <span>Total Income</span>
              <span>{gbp(pnl.totalIncome)}</span>
            </div>

            <div className="font-semibold uppercase tracking-wide text-sm mt-6 mb-2">Cost of Sales</div>
            {pnl.expensesByCategory.filter((c) => c.amount > 0).map((c) => (
              <div key={c.category} className="flex justify-between py-1">
                <span>{c.category}</span>
                <span>{gbp(c.amount)}</span>
              </div>
            ))}
            {pnl.totalMileage > 0 && (
              <div className="flex justify-between py-1">
                <span>Mileage Claims</span>
                <span>{gbp(pnl.totalMileage)}</span>
              </div>
            )}
            <div className="flex justify-between py-1 border-t font-semibold">
              <span>Total Costs</span>
              <span>{gbp(pnl.totalCosts)}</span>
            </div>

            <div className="font-semibold uppercase tracking-wide text-sm mt-6 mb-2">Profit</div>
            <div className={`flex justify-between py-1 font-semibold ${pnl.grossProfit >= 0 ? "" : "text-red-600"}`}>
              <span>Gross Profit</span>
              <span>{pnl.grossProfit < 0 ? "-" : ""}{gbp(Math.abs(pnl.grossProfit))}</span>
            </div>
            <div className="flex justify-between py-1 text-muted-foreground">
              <span>Profit Margin</span>
              <span>{pnl.profitMargin.toFixed(1)}%</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
