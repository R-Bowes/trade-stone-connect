import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface QuoteScheduleProposal {
  id: string;
  quote_id: string;
  contractor_id: string;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string;
  status: string;
  is_confirmed: boolean | null;
  proposed_by: string | null;
  created_at: string;
}

export interface ContractorAvailabilitySlot {
  id: string;
  contractor_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_available: boolean;
}

export function useQuoteScheduling(quoteId: string | null, contractorId: string | null) {
  const [proposals, setProposals] = useState<QuoteScheduleProposal[]>([]);
  const [availability, setAvailability] = useState<ContractorAvailabilitySlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchData = useCallback(async () => {
    if (!quoteId || !contractorId) {
      setProposals([]);
      setAvailability([]);
      return;
    }

    setLoading(true);
    const { data: authData } = await supabase.auth.getUser();
    const currentUser = authData.user;
    setUserId(currentUser?.id ?? null);

    const [{ data: proposalData, error: proposalError }, { data: availabilityData, error: availabilityError }] = await Promise.all([
      supabase
        .from("schedule_events")
        .select("id, quote_id, contractor_id, title, description, start_time, end_time, status, is_confirmed, proposed_by, created_at")
        .eq("quote_id", quoteId)
        .order("start_time", { ascending: true }),
      supabase
        .from("availability_slots")
        .select("id, contractor_id, day_of_week, start_time, end_time, is_available")
        .eq("contractor_id", contractorId)
        .order("day_of_week", { ascending: true }),
    ]);

    if (proposalError) {
      console.error("Failed to fetch quote schedule proposals", proposalError);
      toast({ title: "Error", description: "Could not load schedule proposals", variant: "destructive" });
    } else {
      setProposals((proposalData as QuoteScheduleProposal[]) ?? []);
    }

    if (availabilityError) {
      console.error("Failed to fetch availability", availabilityError);
      setAvailability([]);
    } else {
      setAvailability((availabilityData as ContractorAvailabilitySlot[]) ?? []);
    }

    setLoading(false);
  }, [contractorId, quoteId, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const proposeDate = useCallback(async (payload: { startTime: string; endTime: string; note?: string | null }) => {
    if (!quoteId || !contractorId || !userId) return;

    const { error } = await supabase.from("schedule_events").insert({
      contractor_id: contractorId,
      quote_id: quoteId,
      title: "Quote schedule proposal",
      description: payload.note || null,
      event_type: "quote_proposal",
      start_time: payload.startTime,
      end_time: payload.endTime,
      status: "proposed",
      proposed_by: userId,
      is_confirmed: false,
      all_day: false,
    });

    if (error) {
      toast({ title: "Error", description: "Failed to propose date", variant: "destructive" });
      throw error;
    }

    toast({ title: "Date proposed", description: "Your proposed date has been shared." });
    await fetchData();
  }, [contractorId, fetchData, quoteId, toast, userId]);

  const acceptProposal = useCallback(async (proposalId: string) => {
  if (!quoteId) return;

  // Mark this proposal as accepted
  const { error } = await supabase
    .from("schedule_events")
    .update({ status: "accepted", is_confirmed: true })
    .eq("id", proposalId);

  if (error) {
    toast({ title: "Error", description: "Failed to accept proposal", variant: "destructive" });
    throw error;
  }

  // Decline all other proposals for this quote
  await supabase
    .from("schedule_events")
    .update({ status: "declined", is_confirmed: false })
    .eq("quote_id", quoteId)
    .neq("id", proposalId)
    .eq("status", "proposed");

  // Fetch the accepted proposal and quote details to create a job
  const [{ data: proposal }, { data: quote }] = await Promise.all([
    supabase.from("schedule_events").select("*").eq("id", proposalId).maybeSingle(),
    supabase.from("issued_quotes").select("*").eq("id", quoteId).maybeSingle(),
  ]);

  if (proposal && quote) {
    const { data: { user } } = await supabase.auth.getUser();
    const { data: profileRow } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user?.id ?? "")
      .maybeSingle();

    await supabase.from("jobs").insert({
      contractor_id: quote.contractor_id,
      client_id: profileRow?.id ?? user?.id,
      issued_quote_id: quote.id,
      title: quote.title,
      description: quote.description || null,
      contract_value: quote.total || 0,
      status: "scheduled",
      start_date: proposal.start_time,
      end_date: proposal.end_time,
    });

    // Update quote status to converted
    await supabase
      .from("issued_quotes")
      .update({ status: "accepted" })
      .eq("id", quoteId);

    // Update enquiry status to converted if linked
    if (quote.enquiry_id) {
      await supabase
        .from("enquiries")
        .update({ status: "converted" })
        .eq("id", quote.enquiry_id);
    }
  }

  toast({ title: "Schedule confirmed", description: "The selected date was accepted." });
  await fetchData();
}, [fetchData, quoteId, toast]);

  const hasConfirmedProposal = useMemo(
    () => proposals.some((proposal) => proposal.is_confirmed || proposal.status === "accepted"),
    [proposals],
  );

  return {
    proposals,
    availability,
    loading,
    userId,
    hasConfirmedProposal,
    refetch: fetchData,
    proposeDate,
    acceptProposal,
  };
}
