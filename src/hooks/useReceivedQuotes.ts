import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface ReceivedQuote {
  id: string;
  quote_number: string | null;
  title: string;
  description: string | null;
  client_name: string;
  client_email: string;
  contractor_id: string;
  contractor_name: string;
  contractor_ts_code: string | null;
  recipient_id: string | null;
  recipient_response: string | null;
  responded_at: string | null;
  items: any;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  status: string;
  valid_until: string;
  notes: string | null;
  terms: string | null;
  created_at: string;
}

export function useReceivedQuotes() {
  const [quotes, setQuotes] = useState<ReceivedQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchQuotes = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profileRow } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    const { data, error } = await supabase
      .from("issued_quotes")
      .select("*")
      .eq("recipient_id", profileRow?.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching received quotes:", error);
      setLoading(false);
      return;
    }

    const rawQuotes = (data || []) as unknown as ReceivedQuote[];

    const contractorIds = [...new Set(rawQuotes.map((q) => q.contractor_id))];
    let nameMap: Record<string, string> = {};
    let tsCodeMap: Record<string, string> = {};

    if (contractorIds.length > 0) {
      const { data: proProfiles } = await supabase
        .from("public_pro_profiles")
        .select("user_id, full_name, company_name, ts_profile_code")
        .in("user_id", contractorIds);
      for (const p of proProfiles || []) {
        nameMap[p.user_id] = (p as any).company_name || (p as any).full_name || "Contractor";
        if ((p as any).ts_profile_code) tsCodeMap[p.user_id] = (p as any).ts_profile_code;
      }
    }

    setQuotes(
      rawQuotes.map((q) => ({
        ...q,
        contractor_name: nameMap[q.contractor_id] ?? "Contractor",
        contractor_ts_code: tsCodeMap[q.contractor_id] ?? null,
      }))
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchQuotes();
  }, [fetchQuotes]);

  const respondToQuote = async (quoteId: string, response: "accepted" | "rejected" | "stalled") => {
    const { error } = await supabase
      .from("issued_quotes")
      .update({
        recipient_response: response,
        responded_at: new Date().toISOString(),
        status: response === "accepted" ? "accepted" : response === "rejected" ? "rejected" : "sent",
      })
      .eq("id", quoteId);

    if (error) {
      toast({ title: "Error", description: "Failed to respond to quote", variant: "destructive" });
      throw error;
    }

    await fetchQuotes();
    return quoteId;
  };

  return { quotes, loading, respondToQuote, refetch: fetchQuotes };
}
