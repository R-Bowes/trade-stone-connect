import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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

    const { data, error } = await supabase
      .from("expenses")
      .select("*")
      .eq("contractor_id", user.id)
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

    const { error } = await supabase.from("expenses").insert({
      ...expense,
      contractor_id: user.id,
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

    const { error } = await supabase.storage.from("receipts").upload(filePath, file);
    if (error) throw error;

    const { data: urlData } = supabase.storage.from("receipts").getPublicUrl(filePath);
    return urlData.publicUrl;
  };

  const getSignedReceiptUrl = async (receiptUrl: string): Promise<string> => {
    // Extract path from the full URL
    const pathMatch = receiptUrl.match(/receipts\/(.+)$/);
    if (!pathMatch) return receiptUrl;

    const { data, error } = await supabase.storage
      .from("receipts")
      .createSignedUrl(pathMatch[1], 3600);

    if (error) return receiptUrl;
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
