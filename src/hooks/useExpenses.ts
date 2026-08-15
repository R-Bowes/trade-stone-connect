import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const RECEIPTS_BUCKET = "receipts";

const normalizeReceiptPath = (receiptReference: string) => {
  if (!receiptReference) return null;

  if (/^https?:\/\//i.test(receiptReference)) {
    const pathMatch = receiptReference.match(/\/receipts\/(.+?)(?:\?|$)/);
    return pathMatch?.[1] ?? null;
  }

  return receiptReference;
};

export type RecurrenceInterval = "weekly" | "fortnightly" | "monthly" | "quarterly" | "annually";
export type ExpenseStatus = "confirmed" | "pending_confirmation" | "skipped";

export type Expense = {
  id: string;
  contractor_id: string;
  category_id: string | null;
  description: string;
  amount: number;
  vat_amount: number | null;
  vat_rate: number | null;
  vat_reclaimable: boolean | null;
  payment_method: string | null;
  job_id: string | null;
  project_id: string | null;
  expense_date: string;
  receipt_url: string | null;
  vendor: string | null;
  notes: string | null;
  is_recurring: boolean;
  recurrence_interval: RecurrenceInterval | null;
  recurrence_next_due: string | null;
  recurrence_end_date: string | null;
  recurrence_parent_id: string | null;
  recurrence_auto_confirm: boolean;
  expense_status: ExpenseStatus;
  created_at: string;
  updated_at: string;
};

export type ExpenseInsert = Omit<Expense, "id" | "created_at" | "updated_at">;

export type PendingExpense = Expense & { parent_description: string | null };

export function useExpenses() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [pendingExpenses, setPendingExpenses] = useState<PendingExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  // By default only 'confirmed' expenses are loaded into the main list —
  // pending-confirmation and skipped rows are surfaced separately (the
  // pending banner and the "Show skipped" toggle in ExpenseList).
  const fetchExpenses = useCallback(async (statuses: ExpenseStatus[] = ["confirmed"]) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profileRow } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    const { data, error } = await supabase
      .from("expenses")
      .select("*")
      .eq("contractor_id", profileRow?.id)
      .in("expense_status", statuses)
      .order("expense_date", { ascending: false });

    if (error) {
      console.error("Error fetching expenses:", error);
    } else {
      setExpenses((data as Expense[]) || []);
    }
    setLoading(false);
  }, []);

  const getPendingExpenses = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profileRow } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    const { data, error } = await supabase
      .from("expenses")
      .select("*")
      .eq("contractor_id", profileRow?.id)
      .eq("expense_status", "pending_confirmation")
      .order("expense_date", { ascending: false });

    if (error) {
      console.error("Error fetching pending expenses:", error);
      return;
    }

    const rows = (data as Expense[]) || [];
    const parentIds = Array.from(new Set(rows.map((r) => r.recurrence_parent_id).filter((id): id is string => !!id)));
    let parentDescById = new Map<string, string>();
    if (parentIds.length > 0) {
      const { data: parents } = await supabase
        .from("expenses")
        .select("id, description")
        .in("id", parentIds);
      parentDescById = new Map((parents ?? []).map((p) => [p.id, p.description]));
    }

    setPendingExpenses(
      rows.map((r) => ({
        ...r,
        parent_description: r.recurrence_parent_id ? parentDescById.get(r.recurrence_parent_id) ?? null : null,
      })),
    );
  }, []);

  useEffect(() => {
    fetchExpenses();
    getPendingExpenses();
  }, [fetchExpenses, getPendingExpenses]);

  const confirmPendingExpense = async (id: string) => {
    const { error } = await supabase.from("expenses").update({ expense_status: "confirmed" }).eq("id", id);
    if (error) {
      toast({ title: "Error", description: "Failed to confirm expense", variant: "destructive" });
      throw error;
    }
    toast({ title: "Expense confirmed" });
    await Promise.all([fetchExpenses(), getPendingExpenses()]);
  };

  const skipPendingExpense = async (id: string) => {
    const { error } = await supabase.from("expenses").update({ expense_status: "skipped" }).eq("id", id);
    if (error) {
      toast({ title: "Error", description: "Failed to skip expense", variant: "destructive" });
      throw error;
    }
    toast({ title: "Expense skipped" });
    await Promise.all([fetchExpenses(), getPendingExpenses()]);
  };

  const addExpense = async (expense: Omit<ExpenseInsert, "contractor_id">) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profileRow } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    const { error } = await supabase.from("expenses").insert({
      ...expense,
      contractor_id: profileRow?.id,
    });

    if (error) {
      toast({ title: "Error", description: "Failed to add expense", variant: "destructive" });
      throw error;
    }

    toast({ title: "Expense Added", description: "Expense has been recorded." });
    fetchExpenses();
  };

  const updateExpense = async (id: string, updates: Partial<ExpenseInsert>) => {
    const { error } = await supabase.from("expenses").update(updates).eq("id", id);

    if (error) {
      toast({ title: "Error", description: "Failed to update expense", variant: "destructive" });
      throw error;
    }

    toast({ title: "Expense Updated", description: "Expense has been updated." });
    fetchExpenses();
  };

  const deleteExpense = async (id: string) => {
    const { error } = await supabase.from("expenses").delete().eq("id", id);

    if (error) {
      toast({ title: "Error", description: "Failed to delete expense", variant: "destructive" });
      throw error;
    }

    toast({ title: "Expense Deleted", description: "Expense has been removed." });
    fetchExpenses();
  };

  const uploadReceipt = async (file: File): Promise<string> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const fileExt = file.name.split(".").pop();
    const filePath = `${user.id}/${Date.now()}.${fileExt}`;

    const { error } = await supabase.storage.from(RECEIPTS_BUCKET).upload(filePath, file);
    if (error) throw error;

    return filePath;
  };

  const getSignedReceiptUrl = async (receiptReference: string): Promise<string> => {
    const receiptPath = normalizeReceiptPath(receiptReference);
    if (!receiptPath) return receiptReference;

    const { data, error } = await supabase.storage
      .from(RECEIPTS_BUCKET)
      .createSignedUrl(receiptPath, 3600);

    if (error) {
      console.error("Error creating signed receipt URL:", error);
      return receiptReference;
    }

    return data.signedUrl;
  };

  // Compute totals
  const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount), 0);

  return {
    expenses,
    pendingExpenses,
    loading,
    addExpense,
    updateExpense,
    deleteExpense,
    uploadReceipt,
    getSignedReceiptUrl,
    confirmPendingExpense,
    skipPendingExpense,
    getPendingExpenses,
    totalExpenses,
    refetch: fetchExpenses,
  };
}
