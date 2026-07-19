import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { markRecentAction } from "@/lib/recentActions";

export interface ReceivedQuote {
  id: string;
  quote_number: number | null;
  version: number | null;
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
  deposit_required: boolean | null;
  deposit_amount: number | null;
  deposit_paid: boolean | null;
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
  sent_at: string | null;
}

export function useReceivedQuotes() {
  const [quotes, setQuotes] = useState<ReceivedQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchQuotes = useCallback(async () => {
    try {
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
        toast({ title: "Error", description: "Failed to load quotes", variant: "destructive" });
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
        // Guard against the platform's own name leaking through as a contractor's
        // display name — never a legitimate business/personal name value.
        const candidates = [(p as any).company_name, (p as any).full_name].filter(
          (n): n is string => !!n && n.trim().toLowerCase() !== "tradestone",
        );
        nameMap[p.user_id] = candidates[0] || "Contractor";
        if ((p as any).ts_profile_code) tsCodeMap[p.user_id] = (p as any).ts_profile_code;
      }
    }

    const enriched = rawQuotes.map((q) => ({
      ...q,
      contractor_name: nameMap[q.contractor_id] ?? "Contractor",
      contractor_ts_code: tsCodeMap[q.contractor_id] ?? null,
    }));

    // Exclude unsent drafts — recipients only see quotes that have been sent
    const sentQuotes = enriched.filter(q => q.sent_at != null);
    // Keep only the latest version per quote_number; superseded versions are hidden
    const latestMap = new Map<string, typeof enriched[0]>();
    for (const q of sentQuotes) {
      const key = q.quote_number != null ? String(q.quote_number) : q.id;
      const cur = latestMap.get(key);
      if (!cur || (q.version ?? 1) > (cur.version ?? 1)) latestMap.set(key, q);
    }
      setQuotes(
        Array.from(latestMap.values()).sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )
      );
    } finally {
      setLoading(false);
    }
  }, [toast]);

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

    // notify_quote_response also inserts a "You have accepted/rejected/
    // stalled..." confirmation for the recipient (us) — suppress its toast,
    // we already show our own below.
    markRecentAction(quoteId);

    await fetchQuotes();
    return quoteId;
  };

  return { quotes, loading, respondToQuote, refetch: fetchQuotes };
}
