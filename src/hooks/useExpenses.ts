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

export type Expense = {
  id: string;
  contractor_id: string;
  category: string;
  description: string;
  amount: number;
  expense_date: string;
  receipt_url: string | null;
  vendor: string | null;
  notes: string | null;
  is_recurring: boolean;
  created_at: string;
  updated_at: string;
};

export type ExpenseInsert = Omit<Expense, "id" | "created_at" | "updated_at">;

export const EXPENSE_CATEGORIES = [
  "Materials",
  "Tools & Equipment",
  "Vehicle & Fuel",
  "Insurance",
  "Subcontractor Payments",
  "Office & Admin",
  "Marketing",
  "Training & Licenses",
  "Utilities",
  "Rent",
  "General",
] as const;

export function useExpenses() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchExpenses = useCallback(async () => {
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
      .order("expense_date", { ascending: false });

    if (error) {
      console.error("Error fetching expenses:", error);
    } else {
      setExpenses((data as Expense[]) || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses]);

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

  const expensesByCategory = expenses.reduce<Record<string, number>>((acc, e) => {
    acc[e.category] = (acc[e.category] || 0) + Number(e.amount);
    return acc;
  }, {});

  return {
    expenses,
    loading,
    addExpense,
    updateExpense,
    deleteExpense,
    uploadReceipt,
    getSignedReceiptUrl,
    totalExpenses,
    expensesByCategory,
    refetch: fetchExpenses,
  };
}
