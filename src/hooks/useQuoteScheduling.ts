import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

/**
 * Turn-counting / negotiation-cycle model — no schema change is available,
 * so both are approximated using existing, unconstrained columns already on
 * `schedule_events` rather than new ones:
 *
 * - A "turn" is one submission batch (1-3 slots sent in a single request).
 *   Turns are counted as the number of DISTINCT `created_at` values,
 *   truncated to the minute, among a party's own
 *   `event_type = 'quote_proposal'` rows for the quote. Every slot in one
 *   batch is inserted in the same request, so they land in the same
 *   minute and count as a single turn. Each party is capped at
 *   MAX_TURNS_PER_CYCLE (2).
 *
 * - "Cancel scheduling" must hand both parties fresh turns. There is no
 *   cycle/version column to bump, so cancellation inserts a marker row on
 *   `schedule_events` with `event_type = 'scheduling_cancelled'` (a value
 *   no CHECK constraint restricts) instead of a real proposal. Turn
 *   counting only considers proposal rows created AFTER the most recent
 *   such marker for the quote — anything before it belonged to a prior,
 *   cancelled cycle and no longer counts.
 *   Limitation: this resets turns correctly on an explicit cancellation,
 *   but the DB has no way to distinguish "declined because the other
 *   party countered" (should still count towards the limit) from
 *   "declined because of cancellation" by inspecting `status` alone —
 *   that ambiguity is exactly why the reset is keyed off the marker row
 *   rather than off `status = 'declined'`.
 *
 * - Post-exhaustion single-date proposals must not consume or grant
 *   turns. They're tagged with a distinct `title`
 *   (POST_EXHAUSTION_TITLE) instead of a new column, and are excluded
 *   from both the turn count and the "current cycle" proposal history.
 *   `event_type` is deliberately left as 'quote_proposal' for these rows
 *   so the DB triggers that look up the confirmed slot's start time for
 *   half-day availability blocking (block_date_on_job_confirmed,
 *   release_schedule_block) keep finding them.
 */
const MAX_TURNS_PER_CYCLE = 2;
export const POST_EXHAUSTION_TITLE = "Quote schedule proposal (agreed date)";
const CANCELLED_MARKER_EVENT_TYPE = "scheduling_cancelled";
const PROPOSAL_EVENT_TYPE = "quote_proposal";

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
  event_type: string;
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
  const [rawEvents, setRawEvents] = useState<QuoteScheduleProposal[]>([]);
  const [availability, setAvailability] = useState<ContractorAvailabilitySlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [recipientId, setRecipientId] = useState<string | null>(null);
  const [jobExists, setJobExists] = useState(false);
  const [otherPartyName, setOtherPartyName] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchData = useCallback(async () => {
    if (!quoteId || !contractorId) {
      setRawEvents([]);
      setAvailability([]);
      return;
    }

    setLoading(true);
    const { data: authData } = await supabase.auth.getUser();
    const currentUser = authData.user;
    setUserId(currentUser?.id ?? null);

    const [
      { data: eventsData, error: eventsError },
      { data: availabilityData, error: availabilityError },
      { data: quoteData },
      { data: jobData },
    ] = await Promise.all([
      supabase
        .from("schedule_events")
        .select(
          "id, quote_id, contractor_id, title, description, start_time, end_time, status, is_confirmed, proposed_by, created_at, event_type",
        )
        .eq("quote_id", quoteId)
        .order("start_time", { ascending: true }),
      supabase
        .from("availability_slots")
        .select("id, contractor_id, day_of_week, start_time, end_time, is_available")
        .eq("contractor_id", contractorId)
        .order("day_of_week", { ascending: true }),
      supabase.from("issued_quotes").select("recipient_id").eq("id", quoteId).maybeSingle(),
      supabase
        .from("jobs")
        .select("id")
        .eq("issued_quote_id", quoteId)
        .neq("status", "cancelled")
        .maybeSingle(),
    ]);

    if (eventsError) {
      console.error("Failed to fetch quote schedule proposals", eventsError);
      toast({ title: "Error", description: "Could not load schedule proposals", variant: "destructive" });
    } else {
      setRawEvents((eventsData as QuoteScheduleProposal[]) ?? []);
    }

    if (availabilityError) {
      console.error("Failed to fetch availability", availabilityError);
      setAvailability([]);
    } else {
      setAvailability((availabilityData as ContractorAvailabilitySlot[]) ?? []);
    }

    setRecipientId(quoteData?.recipient_id ?? null);
    setJobExists(!!jobData);
    setLoading(false);
  }, [contractorId, quoteId, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Only real proposals — excludes cancellation marker rows.
  const proposals = useMemo(
    () => rawEvents.filter((e) => e.event_type === PROPOSAL_EVENT_TYPE),
    [rawEvents],
  );

  const lastCancelledAt = useMemo(() => {
    const markers = rawEvents.filter((e) => e.event_type === CANCELLED_MARKER_EVENT_TYPE);
    if (!markers.length) return null;
    return markers.reduce((max, m) => (m.created_at > max ? m.created_at : max), markers[0].created_at);
  }, [rawEvents]);

  // Proposals that count toward the current cycle's turn limit — excludes
  // post-exhaustion offers and anything from a cycle a cancellation ended.
  const currentCycleProposals = useMemo(
    () =>
      proposals.filter(
        (p) => p.title !== POST_EXHAUSTION_TITLE && (!lastCancelledAt || p.created_at > lastCancelledAt),
      ),
    [proposals, lastCancelledAt],
  );

  const turnsUsedFor = useCallback(
    (profileId: string | null) => {
      if (!profileId) return 0;
      const minutes = new Set(
        currentCycleProposals
          .filter((p) => p.proposed_by === profileId)
          .map((p) => Math.floor(new Date(p.created_at).getTime() / 60000)),
      );
      return minutes.size;
    },
    [currentCycleProposals],
  );

  const otherPartyId = useMemo(() => {
    if (!userId || !contractorId || !recipientId) return null;
    return userId === contractorId ? recipientId : contractorId;
  }, [userId, contractorId, recipientId]);

  useEffect(() => {
    if (!otherPartyId) {
      setOtherPartyName(null);
      return;
    }
    let cancelled = false;
    supabase
      .from("profiles")
      .select("full_name, company_name")
      .eq("id", otherPartyId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) {
          const row = data as { full_name: string | null; company_name: string | null } | null;
          setOtherPartyName(row?.company_name || row?.full_name || null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [otherPartyId]);

  const myTurnsUsed = turnsUsedFor(userId);
  const otherTurnsUsed = turnsUsedFor(otherPartyId);
  const myTurnsRemaining = Math.max(0, MAX_TURNS_PER_CYCLE - myTurnsUsed);
  const bothExhausted = myTurnsUsed >= MAX_TURNS_PER_CYCLE && otherTurnsUsed >= MAX_TURNS_PER_CYCLE;

  const confirmedProposal = useMemo(
    () => proposals.find((p) => p.is_confirmed || p.status === "accepted") ?? null,
    [proposals],
  );
  const hasConfirmedProposal = !!confirmedProposal;

  const pendingFromOther = useMemo(
    () =>
      proposals.filter(
        (p) =>
          p.status === "proposed" &&
          !p.is_confirmed &&
          p.proposed_by !== userId &&
          p.title !== POST_EXHAUSTION_TITLE,
      ),
    [proposals, userId],
  );

  const pendingFromMe = useMemo(
    () =>
      proposals.filter(
        (p) =>
          p.status === "proposed" &&
          !p.is_confirmed &&
          p.proposed_by === userId &&
          p.title !== POST_EXHAUSTION_TITLE,
      ),
    [proposals, userId],
  );

  const postExhaustionProposal = useMemo(
    () => proposals.find((p) => p.title === POST_EXHAUSTION_TITLE && p.status === "proposed" && !p.is_confirmed) ?? null,
    [proposals],
  );

  const notifyOtherParty = useCallback(
    async (referenceId: string, title: string, message: string, type: string) => {
      if (!otherPartyId) return;
      try {
        await supabase.from("notifications").insert({
          user_id: otherPartyId,
          title,
          message,
          type,
          reference_type: "schedule_event",
          reference_id: referenceId,
          is_read: false,
        });
      } catch (e) {
        console.error(e);
      }
    },
    [otherPartyId],
  );

  /** Used for both the initial proposal and any counter-proposal. */
  const submitProposals = useCallback(
    async (slots: { startTime: string; endTime: string }[]) => {
      if (!quoteId || !contractorId || !userId || slots.length === 0) return;

      // Supersede whatever the other party currently has pending.
      await supabase
        .from("schedule_events")
        .update({ status: "declined", is_confirmed: false })
        .eq("quote_id", quoteId)
        .eq("event_type", PROPOSAL_EVENT_TYPE)
        .eq("status", "proposed")
        .neq("title", POST_EXHAUSTION_TITLE)
        .neq("proposed_by", userId);

      for (const slot of slots) {
        const { error } = await supabase.from("schedule_events").insert({
          contractor_id: contractorId,
          quote_id: quoteId,
          title: "Quote schedule proposal",
          description: null,
          event_type: PROPOSAL_EVENT_TYPE,
          start_time: slot.startTime,
          end_time: slot.endTime,
          status: "proposed",
          proposed_by: userId,
          is_confirmed: false,
          all_day: false,
        });
        if (error) {
          toast({ title: "Error", description: "Failed to propose date", variant: "destructive" });
          throw error;
        }
      }

      toast({ title: "Dates proposed", description: "Waiting for the other party to respond." });
      await fetchData();
    },
    [contractorId, fetchData, quoteId, toast, userId],
  );

  /** Single-slot, post-exhaustion "agreed date" offer — confirmable, not counterable. */
  const submitPostExhaustionProposal = useCallback(
    async (slot: { startTime: string; endTime: string }) => {
      if (!quoteId || !contractorId || !userId) return;

      await supabase
        .from("schedule_events")
        .update({ status: "declined", is_confirmed: false })
        .eq("quote_id", quoteId)
        .eq("event_type", PROPOSAL_EVENT_TYPE)
        .eq("title", POST_EXHAUSTION_TITLE)
        .eq("status", "proposed");

      const { error } = await supabase.from("schedule_events").insert({
        contractor_id: contractorId,
        quote_id: quoteId,
        title: POST_EXHAUSTION_TITLE,
        description: null,
        event_type: PROPOSAL_EVENT_TYPE,
        start_time: slot.startTime,
        end_time: slot.endTime,
        status: "proposed",
        proposed_by: userId,
        is_confirmed: false,
        all_day: false,
      });
      if (error) {
        toast({ title: "Error", description: "Failed to propose a date", variant: "destructive" });
        throw error;
      }

      toast({ title: "Date proposed", description: "Waiting for the other party to confirm." });
      await fetchData();
    },
    [contractorId, fetchData, quoteId, toast, userId],
  );

  const acceptProposal = useCallback(
    async (proposalId: string) => {
      if (!quoteId) return;

      const { data: proposalData, error: proposalFetchError } = await supabase
        .from("schedule_events")
        .select("start_time")
        .eq("id", proposalId)
        .single();

      if (proposalFetchError || !proposalData) {
        toast({ title: "Error", description: "Failed to load proposal details", variant: "destructive" });
        return;
      }

      const confirmedDate = proposalData.start_time.slice(0, 10); // "YYYY-MM-DD"

      const { error } = await supabase
        .from("schedule_events")
        .update({ status: "accepted", is_confirmed: true })
        .eq("id", proposalId);

      if (error) {
        toast({ title: "Error", description: "Failed to accept proposal", variant: "destructive" });
        throw error;
      }

      // Block the confirmed date immediately in contractor_availability_overrides.
      // Don't wait for the job to exist — the customer hasn't clicked "Confirm Job" yet.
      await supabase
        .from("contractor_availability_overrides")
        .upsert(
          {
            contractor_id: contractorId,
            date: confirmedDate,
            am_available: false,
            pm_available: false,
            reason: "Auto-blocked: confirmed job",
          },
          { onConflict: "contractor_id,date" },
        );

      // Also update start_date on the job if it already exists
      const { data: jobRow } = await supabase
        .from("jobs")
        .select("id")
        .eq("issued_quote_id", quoteId)
        .maybeSingle();

      if (jobRow?.id) {
        await supabase.from("jobs").update({ start_date: confirmedDate }).eq("id", jobRow.id);
      }

      // Notify whichever party did NOT confirm — confirming is symmetric.
      await notifyOtherParty(
        proposalId,
        "Schedule date accepted",
        "The other party has accepted a proposed date",
        "schedule_accepted",
      );

      // Decline all other proposals for this quote (not the post-exhaustion lane; there
      // shouldn't be one live at confirm time, but keep the scope explicit).
      await supabase
        .from("schedule_events")
        .update({ status: "declined", is_confirmed: false })
        .eq("quote_id", quoteId)
        .eq("event_type", PROPOSAL_EVENT_TYPE)
        .neq("id", proposalId)
        .eq("status", "proposed");

      toast({
        title: "Date agreed",
        description: "Schedule confirmed — proceed to confirm the job below.",
      });
      await fetchData();
    },
    [contractorId, fetchData, notifyOtherParty, quoteId, toast],
  );

  /** B1/B2: un-confirm the agreed date and release its availability block. Does not reset turns. */
  const requestDifferentDate = useCallback(async () => {
    if (!quoteId || !confirmedProposal) return;

    if (jobExists) {
      toast({
        title: "Job already created",
        description: "Scheduling can no longer be changed here.",
        variant: "destructive",
      });
      await fetchData();
      return;
    }

    const { error } = await supabase
      .from("schedule_events")
      .update({ status: "declined", is_confirmed: false })
      .eq("id", confirmedProposal.id);
    if (error) {
      toast({ title: "Error", description: "Failed to release the confirmed date", variant: "destructive" });
      throw error;
    }

    const { error: rpcError } = await supabase.rpc("release_schedule_block", { p_quote_id: quoteId });
    if (rpcError) console.error("release_schedule_block failed", rpcError);

    await notifyOtherParty(
      confirmedProposal.id,
      "Schedule reopened",
      "The other party asked to pick a different date",
      "schedule_reopened",
    );

    toast({ title: "Date released", description: "Choose a new date to continue scheduling." });
    await fetchData();
  }, [confirmedProposal, fetchData, jobExists, notifyOtherParty, quoteId, toast]);

  /** B1: full restart — declines every proposal and marks a fresh cycle boundary. */
  const cancelScheduling = useCallback(async () => {
    if (!quoteId || !contractorId || !userId) return;

    if (jobExists) {
      toast({
        title: "Job already created",
        description: "Scheduling can no longer be changed here.",
        variant: "destructive",
      });
      await fetchData();
      return;
    }

    const { error } = await supabase
      .from("schedule_events")
      .update({ status: "declined", is_confirmed: false })
      .eq("quote_id", quoteId)
      .eq("event_type", PROPOSAL_EVENT_TYPE);
    if (error) {
      toast({ title: "Error", description: "Failed to cancel scheduling", variant: "destructive" });
      throw error;
    }

    const { error: rpcError } = await supabase.rpc("release_schedule_block", { p_quote_id: quoteId });
    if (rpcError) console.error("release_schedule_block failed", rpcError);

    // Marker row so turn-counting resets for the next cycle (see comment block above).
    const { error: markerError } = await supabase.from("schedule_events").insert({
      contractor_id: contractorId,
      quote_id: quoteId,
      title: "Scheduling cancelled",
      description: null,
      event_type: CANCELLED_MARKER_EVENT_TYPE,
      start_time: new Date().toISOString(),
      end_time: new Date().toISOString(),
      status: "cancelled",
      proposed_by: userId,
      is_confirmed: false,
      all_day: false,
    });
    if (markerError) console.error("Failed to record scheduling cancellation marker", markerError);

    await notifyOtherParty(
      quoteId,
      "Schedule reopened",
      "The other party cancelled scheduling — the quote is still accepted, and you can restart any time",
      "schedule_reopened",
    );

    toast({ title: "Scheduling cancelled", description: "You can start again whenever you're ready." });
    await fetchData();
  }, [contractorId, fetchData, jobExists, notifyOtherParty, quoteId, toast, userId]);

  return {
    proposals,
    availability,
    loading,
    userId,
    otherPartyId,
    otherPartyName,
    jobExists,
    hasConfirmedProposal,
    confirmedProposal,
    pendingFromOther,
    pendingFromMe,
    postExhaustionProposal,
    myTurnsUsed,
    otherTurnsUsed,
    myTurnsRemaining,
    maxTurnsPerCycle: MAX_TURNS_PER_CYCLE,
    bothExhausted,
    refetch: fetchData,
    submitProposals,
    submitPostExhaustionProposal,
    acceptProposal,
    requestDifferentDate,
    cancelScheduling,
  };
}
