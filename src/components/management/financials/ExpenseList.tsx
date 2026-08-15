import { useState, useMemo, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Search, Plus, Edit, Trash2, ExternalLink, Wallet, Loader2, Repeat, Link2, Check, X } from "lucide-react";
import { format } from "date-fns";
import { useExpenses, type Expense } from "@/hooks/useExpenses";
import { useExpenseCategories } from "@/hooks/useExpenseCategories";
import { ExpenseFormDialog } from "@/components/management/financials/ExpenseFormDialog";
import { downloadCsv, tradestoneCsvFilename } from "@/lib/csvExport";

const INTERVAL_LABEL: Record<string, string> = {
  weekly: "weekly",
  fortnightly: "fortnightly",
  monthly: "monthly",
  quarterly: "quarterly",
  annually: "annually",
};

const CATEGORY_COLOR_FALLBACK: Record<string, string> = {
  "Materials & Stock": "bg-blue-100 text-blue-800",
  "Subcontractor Costs": "bg-indigo-100 text-indigo-800",
  "Vehicle & Travel": "bg-orange-100 text-orange-800",
  "Tools & Equipment": "bg-purple-100 text-purple-800",
  "Insurance": "bg-red-100 text-red-800",
  "Office & Admin": "bg-gray-100 text-gray-800",
  "Marketing & Advertising": "bg-pink-100 text-pink-800",
};

function getCategoryColor(category: string): string {
  return CATEGORY_COLOR_FALLBACK[category] || "bg-muted text-muted-foreground";
}

export function ExpenseList() {
  const {
    expenses, pendingExpenses, loading, addExpense, updateExpense, deleteExpense,
    uploadReceipt, getSignedReceiptUrl, totalExpenses,
    confirmPendingExpense, skipPendingExpense, refetch,
  } = useExpenses();
  const { categories: expenseCategoryTree, getCategoryName } = useExpenseCategories();

  const expenseCategoryName = (expense: Expense): string =>
    expense.category_id ? getCategoryName(expense.category_id) : "Uncategorised";

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [showSkipped, setShowSkipped] = useState(false);
  const [hasSkippedExpenses, setHasSkippedExpenses] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profileRow } = await supabase.from("profiles").select("id").eq("user_id", user.id).maybeSingle();
      if (!profileRow) return;
      const { count } = await supabase
        .from("expenses")
        .select("id", { count: "exact", head: true })
        .eq("contractor_id", profileRow.id)
        .eq("expense_status", "skipped");
      setHasSkippedExpenses((count ?? 0) > 0);
    })();
  }, []);

  const toggleShowSkipped = () => {
    const next = !showSkipped;
    setShowSkipped(next);
    refetch(next ? ["confirmed", "skipped"] : ["confirmed"]);
  };

  const categoryFilterOptions = useMemo(() => {
    const names: string[] = [];
    for (const parent of expenseCategoryTree) {
      names.push(parent.name);
      for (const child of parent.children) {
        names.push(`${parent.name} > ${child.name}`);
      }
    }
    return names;
  }, [expenseCategoryTree]);

  const filteredExpenses = useMemo(() => {
    return expenses.filter((e) => {
      const matchesSearch = !search ||
        e.description.toLowerCase().includes(search.toLowerCase()) ||
        (e.vendor?.toLowerCase().includes(search.toLowerCase()));
      const matchesCategory = categoryFilter === "all" || expenseCategoryName(e) === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [expenses, search, categoryFilter]);

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

  const handleExport = () => {
    downloadCsv(
      tradestoneCsvFilename("expenses"),
      ["Date", "Category", "Description", "Vendor", "Amount", "VAT", "VAT Reclaimable", "Payment Method", "Job", "Notes"],
      filteredExpenses.map((e) => [
        e.expense_date,
        expenseCategoryName(e),
        e.description,
        e.vendor ?? "",
        Number(e.amount).toFixed(2),
        Number(e.vat_amount ?? 0).toFixed(2),
        e.vat_reclaimable ? "Yes" : "No",
        e.payment_method ?? "",
        e.job_id ?? "",
        e.notes ?? "",
      ]),
    );
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="font-heading text-2xl font-bold">Expenses</h2>
          <p className="text-sm text-muted-foreground">
            {expenses.length} transaction{expenses.length === 1 ? "" : "s"} · £{totalExpenses.toLocaleString("en-GB", { minimumFractionDigits: 2 })} total
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExport}>
            <i className="ti ti-download mr-1" /> Export CSV
          </Button>
          <Button onClick={() => { setEditingExpense(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />Add Expense
          </Button>
        </div>
      </div>

      {pendingExpenses.length > 0 && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="p-4 space-y-3">
            <p className="font-medium text-amber-900">
              {pendingExpenses.length} expense{pendingExpenses.length === 1 ? "" : "s"} need{pendingExpenses.length === 1 ? "s" : ""} your confirmation
            </p>
            <div className="space-y-2">
              {pendingExpenses.map((e) => (
                <div key={e.id} className="flex items-center justify-between gap-3 rounded-md bg-white border border-amber-200 px-3 py-2">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{e.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(e.expense_date), "d MMM yyyy")} · £{Number(e.amount).toFixed(2)}
                      {e.parent_description && <> · Recurring from: {e.parent_description}</>}
                    </p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <Button size="sm" variant="outline" onClick={() => confirmPendingExpense(e.id)}>
                      <Check className="h-4 w-4 mr-1" />Confirm
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => skipPendingExpense(e.id)}>
                      <X className="h-4 w-4 mr-1" />Skip
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search expenses..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="All Categories" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categoryFilterOptions.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hasSkippedExpenses && (
          <Button variant="outline" size="sm" onClick={toggleShowSkipped}>
            {showSkipped ? "Hide skipped" : "Show skipped"}
          </Button>
        )}
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
                  <TableHead>Payment method</TableHead>
                  <TableHead className="text-right">VAT</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredExpenses.map((expense) => (
                  <TableRow key={expense.id}>
                    <TableCell className="whitespace-nowrap">{format(new Date(expense.expense_date), "dd MMM yyyy")}</TableCell>
                    <TableCell>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="font-medium">{expense.description}</p>
                          {expense.is_recurring && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Repeat className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                              </TooltipTrigger>
                              <TooltipContent>
                                Recurring {INTERVAL_LABEL[expense.recurrence_interval ?? ""] ?? expense.recurrence_interval}
                                {expense.recurrence_next_due && <> — next: {format(new Date(expense.recurrence_next_due), "d MMM yyyy")}</>}
                              </TooltipContent>
                            </Tooltip>
                          )}
                          {expense.recurrence_parent_id && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Link2 className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                              </TooltipTrigger>
                              <TooltipContent>Auto-created from recurring expense</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                        <div className="flex items-center gap-1 mt-1">
                          {expense.is_recurring && <Badge variant="outline" className="text-xs">Recurring</Badge>}
                          {expense.expense_status === "skipped" && <Badge variant="outline" className="text-xs text-muted-foreground">Skipped</Badge>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={getCategoryColor(expenseCategoryName(expense))}>
                        {expenseCategoryName(expense)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{expense.vendor || "—"}</TableCell>
                    <TableCell className="text-muted-foreground capitalize">
                      {(expense.payment_method || "card").replace("_", " ")}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {expense.vat_amount ? `£${Number(expense.vat_amount).toFixed(2)}` : "—"}
                    </TableCell>
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
