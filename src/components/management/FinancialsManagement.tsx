import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DollarSign, TrendingUp, TrendingDown, Wallet, Plus, Trash2, Edit, Receipt,
  Search, Download, ExternalLink, Loader2
} from "lucide-react";
import { useExpenses, EXPENSE_CATEGORIES, type Expense } from "@/hooks/useExpenses";
import { ExpenseFormDialog } from "@/components/management/financials/ExpenseFormDialog";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Area, AreaChart
} from "recharts";
import { TransactionFeeNotice } from "@/components/TransactionFeeNotice";

const CHART_COLORS = [
  "hsl(221, 83%, 53%)", "hsl(262, 83%, 58%)", "hsl(24, 95%, 53%)",
  "hsl(0, 72%, 51%)", "hsl(239, 84%, 67%)", "hsl(220, 9%, 46%)",
  "hsl(330, 81%, 60%)", "hsl(187, 92%, 41%)", "hsl(48, 96%, 53%)",
  "hsl(160, 84%, 39%)", "hsl(215, 16%, 47%)",
];

export function FinancialsManagement() {
  const {
    expenses, loading, addExpense, updateExpense, deleteExpense,
    uploadReceipt, getSignedReceiptUrl, totalExpenses, expensesByCategory
  } = useExpenses();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [revenue, setRevenue] = useState(0);

  // Fetch revenue from invoices (paid)
  useEffect(() => {
    const fetchRevenue = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("invoices")
        .select("total")
        .eq("contractor_id", user.id)
        .eq("status", "paid");
      if (data) {
        setRevenue(data.reduce((sum, inv) => sum + Number(inv.total), 0));
      }
    };
    fetchRevenue();
  }, []);

  const netProfit = revenue - totalExpenses;
  const profitMargin = revenue > 0 ? ((netProfit / revenue) * 100).toFixed(1) : "0";

  const filteredExpenses = useMemo(() => {
    return expenses.filter(e => {
      const matchesSearch = !search ||
        e.description.toLowerCase().includes(search.toLowerCase()) ||
        (e.vendor?.toLowerCase().includes(search.toLowerCase()));
      const matchesCategory = categoryFilter === "all" || e.category === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [expenses, search, categoryFilter]);

  // Monthly breakdown for P&L
  const monthlyData = useMemo(() => {
    const months: { label: string; revenue: number; expenses: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const monthStart = startOfMonth(subMonths(new Date(), i));
      const monthEnd = endOfMonth(subMonths(new Date(), i));
      const label = format(monthStart, "MMM yyyy");
      const monthExpenses = expenses
        .filter(e => {
          const d = new Date(e.expense_date);
          return d >= monthStart && d <= monthEnd;
        })
        .reduce((sum, e) => sum + Number(e.amount), 0);
      months.push({ label, revenue: 0, expenses: monthExpenses });
    }
    return months;
  }, [expenses]);

  // Category breakdown sorted
  const categoryBreakdown = useMemo(() => {
    return Object.entries(expensesByCategory)
      .sort(([, a], [, b]) => b - a)
      .map(([cat, amount]) => ({
        category: cat,
        amount,
        percentage: totalExpenses > 0 ? ((amount / totalExpenses) * 100).toFixed(1) : "0",
      }));
  }, [expensesByCategory, totalExpenses]);

  const handleSave = async (data: Parameters<typeof addExpense>[0]) => {
    if (editingExpense) {
      await updateExpense(editingExpense.id, data);
    } else {
      await addExpense(data);
    }
  };

  const handleEdit = (expense: Expense) => {
    setEditingExpense(expense);
    setDialogOpen(true);
  };

  const handleViewReceipt = async (receiptUrl: string) => {
    const url = await getSignedReceiptUrl(receiptUrl);
    window.open(url, "_blank");
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      "Materials": "bg-blue-100 text-blue-800",
      "Tools & Equipment": "bg-purple-100 text-purple-800",
      "Vehicle & Fuel": "bg-orange-100 text-orange-800",
      "Insurance": "bg-red-100 text-red-800",
      "Subcontractor Payments": "bg-indigo-100 text-indigo-800",
      "Office & Admin": "bg-gray-100 text-gray-800",
      "Marketing": "bg-pink-100 text-pink-800",
      "Training & Licenses": "bg-cyan-100 text-cyan-800",
      "Utilities": "bg-yellow-100 text-yellow-800",
      "Rent": "bg-emerald-100 text-emerald-800",
      "General": "bg-slate-100 text-slate-800",
    };
    return colors[category] || "bg-muted text-muted-foreground";
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Financial Management</h2>
        <div className="flex gap-2">
          <Button variant="outline"><Download className="h-4 w-4 mr-2" />Export</Button>
          <Button onClick={() => { setEditingExpense(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />Add Expense
          </Button>
        </div>
      </div>

      <TransactionFeeNotice />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">£{revenue.toLocaleString("en-GB", { minimumFractionDigits: 2 })}</div>
            <p className="text-xs text-muted-foreground">From paid invoices</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Expenses</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">£{totalExpenses.toLocaleString("en-GB", { minimumFractionDigits: 2 })}</div>
            <p className="text-xs text-muted-foreground">{expenses.length} transactions</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Profit</CardTitle>
            {netProfit >= 0 ? <TrendingUp className="h-4 w-4 text-green-600" /> : <TrendingDown className="h-4 w-4 text-red-600" />}
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${netProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
              £{Math.abs(netProfit).toLocaleString("en-GB", { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground">{profitMargin}% margin</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Top Category</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{categoryBreakdown[0]?.category || "N/A"}</div>
            <p className="text-xs text-muted-foreground">
              {categoryBreakdown[0] ? `£${categoryBreakdown[0].amount.toLocaleString("en-GB", { minimumFractionDigits: 2 })} (${categoryBreakdown[0].percentage}%)` : "No expenses yet"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="expenses">
        <TabsList>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
          <TabsTrigger value="breakdown">Category Breakdown</TabsTrigger>
          <TabsTrigger value="pnl">Profit & Loss</TabsTrigger>
        </TabsList>

        {/* Expenses List */}
        <TabsContent value="expenses" className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search expenses..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[200px]"><SelectValue placeholder="All Categories" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {EXPENSE_CATEGORIES.map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {filteredExpenses.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Wallet className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No Expenses Found</h3>
                <p className="text-muted-foreground mb-4">Start tracking your expenses to see financial reports.</p>
                <Button onClick={() => { setEditingExpense(null); setDialogOpen(true); }}>
                  <Plus className="h-4 w-4 mr-2" />Add First Expense
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredExpenses.map(expense => (
                      <TableRow key={expense.id}>
                        <TableCell className="whitespace-nowrap">{format(new Date(expense.expense_date), "dd MMM yyyy")}</TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{expense.description}</p>
                            {expense.is_recurring && <Badge variant="outline" className="text-xs mt-1">Recurring</Badge>}
                          </div>
                        </TableCell>
                        <TableCell><Badge className={getCategoryColor(expense.category)}>{expense.category}</Badge></TableCell>
                        <TableCell className="text-muted-foreground">{expense.vendor || "—"}</TableCell>
                        <TableCell className="text-right font-medium">£{Number(expense.amount).toFixed(2)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {expense.receipt_url && (
                              <Button variant="ghost" size="sm" onClick={() => handleViewReceipt(expense.receipt_url!)}>
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                            )}
                            <Button variant="ghost" size="sm" onClick={() => handleEdit(expense)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => deleteExpense(expense.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Category Breakdown */}
        <TabsContent value="breakdown" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Spending Distribution</CardTitle>
                <CardDescription>Visual breakdown by category</CardDescription>
              </CardHeader>
              <CardContent>
                {categoryBreakdown.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No expense data yet.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={categoryBreakdown.map((c, i) => ({ ...c, fill: CHART_COLORS[i % CHART_COLORS.length] }))}
                        dataKey="amount"
                        nameKey="category"
                        cx="50%"
                        cy="50%"
                        outerRadius={110}
                        innerRadius={60}
                        paddingAngle={2}
                        label={({ category, percentage }) => `${percentage}%`}
                      >
                        {categoryBreakdown.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number) => `£${value.toLocaleString("en-GB", { minimumFractionDigits: 2 })}`}
                      />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Spending by Category</CardTitle>
                <CardDescription>Detailed breakdown</CardDescription>
              </CardHeader>
              <CardContent>
                {categoryBreakdown.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No expense data yet.</p>
                ) : (
                  <div className="space-y-4">
                    {categoryBreakdown.map(({ category, amount, percentage }, i) => (
                      <div key={category} className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                            <span className="font-medium">{category}</span>
                          </div>
                          <span>£{amount.toLocaleString("en-GB", { minimumFractionDigits: 2 })} ({percentage}%)</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${percentage}%`, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* P&L Report */}
        <TabsContent value="pnl" className="space-y-4">
          {/* Expense Trend Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Expense Trend</CardTitle>
              <CardDescription>Monthly expenses over the last 6 months</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={monthlyData}>
                  <defs>
                    <linearGradient id="expenseGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(0, 72%, 51%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(0, 72%, 51%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="label" className="text-xs" />
                  <YAxis tickFormatter={(v) => `£${v}`} className="text-xs" />
                  <Tooltip formatter={(value: number) => `£${value.toLocaleString("en-GB", { minimumFractionDigits: 2 })}`} />
                  <Area type="monotone" dataKey="expenses" stroke="hsl(0, 72%, 51%)" fill="url(#expenseGradient)" strokeWidth={2} name="Expenses" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* P&L Table */}
          <Card>
            <CardHeader>
              <CardTitle>Profit & Loss Summary</CardTitle>
              <CardDescription>6-month overview of your financial performance</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead className="text-right">Expenses</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthlyData.map(m => (
                    <TableRow key={m.label}>
                      <TableCell className="font-medium">{m.label}</TableCell>
                      <TableCell className="text-right text-red-600">
                        £{m.expenses.toLocaleString("en-GB", { minimumFractionDigits: 2 })}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-bold border-t-2">
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right text-red-600">
                      £{totalExpenses.toLocaleString("en-GB", { minimumFractionDigits: 2 })}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Income Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span>Paid Invoices</span>
                  <span className="font-medium text-green-600">£{revenue.toLocaleString("en-GB", { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="border-t pt-3 flex justify-between font-bold">
                  <span>Total Revenue</span>
                  <span className="text-green-600">£{revenue.toLocaleString("en-GB", { minimumFractionDigits: 2 })}</span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Bottom Line</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span>Revenue</span>
                  <span className="text-green-600">£{revenue.toLocaleString("en-GB", { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between">
                  <span>Expenses</span>
                  <span className="text-red-600">-£{totalExpenses.toLocaleString("en-GB", { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="border-t pt-3 flex justify-between font-bold text-lg">
                  <span>Net Profit</span>
                  <span className={netProfit >= 0 ? "text-green-600" : "text-red-600"}>
                    {netProfit < 0 ? "-" : ""}£{Math.abs(netProfit).toLocaleString("en-GB", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <ExpenseFormDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditingExpense(null); }}
        onSave={handleSave}
        onUploadReceipt={uploadReceipt}
        expense={editingExpense}
      />
    </div>
  );
}
