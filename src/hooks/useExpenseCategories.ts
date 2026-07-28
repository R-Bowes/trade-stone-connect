import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ExpenseCategory = {
  id: string;
  name: string;
  hmrc_category: string | null;
  parent_id: string | null;
  owner_contractor_id: string | null;
  children: ExpenseCategory[];
};

export function useExpenseCategories() {
  const [flatCategories, setFlatCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCategories = useCallback(async () => {
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

    let query = supabase
      .from("expense_categories")
      .select("id, name, hmrc_category, parent_id, owner_contractor_id")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    query = profileRow
      ? query.or(`owner_contractor_id.is.null,owner_contractor_id.eq.${profileRow.id}`)
      : query.is("owner_contractor_id", null);

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching expense categories:", error);
    } else {
      setFlatCategories((data ?? []).map((c) => ({ ...c, children: [] })));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const categories = useMemo<ExpenseCategory[]>(() => {
    const byId = new Map<string, ExpenseCategory>(
      flatCategories.map((c) => [c.id, { ...c, children: [] }]),
    );
    const roots: ExpenseCategory[] = [];

    for (const cat of byId.values()) {
      if (cat.parent_id && byId.has(cat.parent_id)) {
        byId.get(cat.parent_id)!.children.push(cat);
      } else {
        roots.push(cat);
      }
    }
    return roots;
  }, [flatCategories]);

  const getCategoryName = useCallback(
    (id: string): string => {
      const cat = flatCategories.find((c) => c.id === id);
      if (!cat) return "Uncategorised";
      if (!cat.parent_id) return cat.name;
      const parent = flatCategories.find((c) => c.id === cat.parent_id);
      return parent ? `${parent.name} > ${cat.name}` : cat.name;
    },
    [flatCategories],
  );

  return {
    categories,
    flatCategories,
    getCategoryName,
    loading,
    refetch: fetchCategories,
  };
}
