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

    const { data, error } = await supabase
      .from("issued_quotes")
      .select("*")
      .eq("recipient_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching received quotes:", error);
    } else {
      setQuotes((data || []) as unknown as ReceivedQuote[]);
    }
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

    toast({ title: "Response Sent", description: `Quote ${response}.` });
    fetchQuotes();
    return quoteId;
  };

  return { quotes, loading, respondToQuote, refetch: fetchQuotes };
}
