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
 *
 * Fail-safe rule for every mutation below: the write that changes
 * `schedule_events` state happens FIRST and its result is verified via
 * `.select()` (supabase-js reports no error on an UPDATE that matches
 * zero rows unless you ask for the affected rows back). Anything with a
 * side effect that's hard to undo (releasing an availability block,
 * notifying the other party) only runs after that verification passes.
 * A step that can't be verified as succeeded is treated as failed, and
 * the code errs toward leaving the calendar blocked rather than free.
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

  // The contractor's public-facing name must come from public_pro_profiles
  // (never raw `profiles` — see CLAUDE.md's data-layer rule); the recipient
  // side has no such curated view, so raw `profiles.full_name` is correct
  // there. Using raw `profiles` for a contractor was the bug that leaked
  // the platform name instead of their business name.
  useEffect(() => {
    if (!otherPartyId) {
      setOtherPartyName(null);
      return;
    }
    let cancelled = false;
    const otherPartyIsContractor = otherPartyId === contractorId;
    const query = otherPartyIsContractor
      ? supabase.from("public_pro_profiles").select("full_name, company_name").eq("user_id", otherPartyId).maybeSingle()
      : supabase.from("profiles").select("full_name, company_name").eq("id", otherPartyId).maybeSingle();

    query.then(({ data }) => {
      if (!cancelled) {
        const row = data as { full_name: string | null; company_name: string | null } | null;
        // Guard against the platform's own name leaking through as a contractor's
        // display name — never a legitimate business/personal name value.
        const candidates = [row?.company_name, row?.full_name].filter(
          (n): n is string => !!n && n.trim().toLowerCase() !== "tradestone",
        );
        setOtherPartyName(candidates[0] ?? null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [otherPartyId, contractorId]);

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

      // Only the customer→contractor direction is a silent handoff worth a
      // notification — the contractor already sees their own proposal land
      // in the recipient's UI live; this rider fills the reverse gap so it
      // surfaces in the contractor's Work view without a page refresh.
      if (otherPartyId === contractorId) {
        await notifyOtherParty(
          quoteId,
          "New schedule proposal",
          `${otherPartyName ?? "The client"} proposed ${slots.length} date${slots.length !== 1 ? "s" : ""} for scheduling`,
          "schedule_proposed",
        );
      }

      toast({ title: "Dates proposed", description: "Waiting for the other party to respond." });
      await fetchData();
    },
    [contractorId, fetchData, notifyOtherParty, otherPartyId, otherPartyName, quoteId, toast, userId],
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

      if (otherPartyId === contractorId) {
        await notifyOtherParty(
          quoteId,
          "New schedule proposal",
          `${otherPartyName ?? "The client"} proposed a final date for scheduling`,
          "schedule_proposed",
        );
      }

      toast({ title: "Date proposed", description: "Waiting for the other party to confirm." });
      await fetchData();
    },
    [contractorId, fetchData, notifyOtherParty, otherPartyId, otherPartyName, quoteId, toast, userId],
  );

  /**
   * Declines any live proposal — a post-exhaustion offer (returns both
   * parties to the dead-end panel, grants no turns) or an ordinary proposal
   * still sitting unconfirmed once both parties are already exhausted
   * (turns are already spent either way; declining just clears it so the
   * dead-end panel's own messaging/post-exhaustion path takes over).
   */
  const declineProposal = useCallback(
    async (proposalId: string) => {
      const { data: updated, error } = await supabase
        .from("schedule_events")
        .update({ status: "declined", is_confirmed: false })
        .eq("id", proposalId)
        .eq("status", "proposed")
        .select("id");

      if (error) {
        toast({ title: "Error", description: "Failed to decline the date", variant: "destructive" });
        throw error;
      }
      if (!updated || updated.length === 0) {
        toast({
          title: "Already handled",
          description: "This proposal has already been responded to — refreshing.",
          variant: "destructive",
        });
        await fetchData();
        return;
      }

      toast({ title: "Date declined", description: "Message the other party or propose one more date." });
      await fetchData();
    },
    [fetchData, toast],
  );

  const acceptProposal = useCallback(
    async (proposalId: string) => {
      if (!quoteId) return;

      if (jobExists) {
        toast({
          title: "Job already created",
          description: "Scheduling can no longer be changed here.",
          variant: "destructive",
        });
        await fetchData();
        return;
      }

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

      // Verify the confirm write actually landed before doing anything that
      // depends on it — an UPDATE that matches zero rows (e.g. the proposal
      // was already superseded) reports no error unless we ask for rows back.
      const { data: updated, error } = await supabase
        .from("schedule_events")
        .update({ status: "accepted", is_confirmed: true })
        .eq("id", proposalId)
        .eq("status", "proposed")
        .select("id");

      if (error) {
        toast({ title: "Error", description: "Failed to accept proposal", variant: "destructive" });
        throw error;
      }
      if (!updated || updated.length === 0) {
        toast({
          title: "Could not confirm",
          description: "This date may have just changed — please try again.",
          variant: "destructive",
        });
        await fetchData();
        return;
      }

      // Half-day-aware availability block, matching the DB trigger's logic
      // (block_date_on_job_confirmed): AM if the confirmed slot starts
      // before noon UTC, PM otherwise, tighten-only on conflict (never
      // flips a half that's already blocked back to available).
      const startHourUtc = new Date(proposalData.start_time).getUTCHours();
      const blockAm = startHourUtc < 12;
      const blockPm = !blockAm;

      const { data: existingOverride } = await supabase
        .from("contractor_availability_overrides")
        .select("am_available, pm_available, reason")
        .eq("contractor_id", contractorId)
        .eq("date", confirmedDate)
        .maybeSingle();

      const nextAm = (existingOverride?.am_available ?? true) && !blockAm;
      const nextPm = (existingOverride?.pm_available ?? true) && !blockPm;

      // NOTE: this write's RLS story is unverified against the live DB — the
      // policy on this table predates the recipient-can-confirm flow (A3) and
      // may still be contractor-only, in which case a recipient confirming a
      // contractor's proposal would silently fail to block the calendar even
      // though the schedule_events confirm above succeeded. Surface any
      // failure here rather than staying silent about it; a follow-up
      // migration (mirroring 20260704170000's schedule_events fix) would be
      // needed if that turns out to be the case.
      const { error: overrideError } = await supabase.from("contractor_availability_overrides").upsert(
        {
          contractor_id: contractorId,
          date: confirmedDate,
          am_available: nextAm,
          pm_available: nextPm,
          reason: existingOverride?.reason ?? "Auto-blocked: confirmed job",
        },
        { onConflict: "contractor_id,date" },
      );
      if (overrideError) {
        console.error("Failed to block contractor availability for confirmed date", overrideError);
        toast({
          title: "Date confirmed, but the calendar block failed",
          description: "Let the contractor know so they can block this date manually.",
          variant: "destructive",
        });
      }

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

      // Decline all other proposals for this quote.
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
    [contractorId, fetchData, jobExists, notifyOtherParty, quoteId, toast],
  );

  /** B1/B2: un-confirm the agreed date and release its availability block. Does not reset turns. */
  const requestDifferentDate = useCallback(async () => {
    if (!quoteId || !confirmedProposal) return;

    // Captured before the un-confirm write below — release_schedule_block
    // takes the schedule_events row id directly (migration 20260705140000),
    // since a confirmed-row lookup keyed on the quote would come up empty
    // once the event is already un-confirmed.
    const confirmedEventId = confirmedProposal.id;

    if (jobExists) {
      toast({
        title: "Job already created",
        description: "Scheduling can no longer be changed here.",
        variant: "destructive",
      });
      await fetchData();
      return;
    }

    // Un-confirm FIRST and verify it actually happened — only release the
    // availability block once we know the event is genuinely un-confirmed.
    const { data: updated, error } = await supabase
      .from("schedule_events")
      .update({ status: "declined", is_confirmed: false })
      .eq("id", confirmedEventId)
      .eq("is_confirmed", true)
      .select("id");

    if (error) {
      toast({ title: "Error", description: "Failed to release the confirmed date", variant: "destructive" });
      throw error;
    }
    if (!updated || updated.length === 0) {
      toast({
        title: "Error",
        description: "Could not release the confirmed date — please refresh and try again.",
        variant: "destructive",
      });
      await fetchData();
      return; // Do not release the calendar block on an unverified write.
    }

    const { error: rpcError } = await supabase.rpc("release_schedule_block", { p_event_id: confirmedEventId });
    if (rpcError) console.error("release_schedule_block failed", rpcError);

    await notifyOtherParty(
      confirmedEventId,
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

    // Captured before the bulk un-confirm below — release_schedule_block now
    // takes a schedule_events row id (migration 20260705140000). If nothing
    // was confirmed there's nothing to release; the decline-all still proceeds.
    const confirmedEventId = confirmedProposal?.id ?? null;

    if (jobExists) {
      toast({
        title: "Job already created",
        description: "Scheduling can no longer be changed here.",
        variant: "destructive",
      });
      await fetchData();
      return;
    }

    // Decline every active proposal FIRST and verify at least one row was
    // touched before releasing the block or recording the cancellation.
    const { data: updated, error } = await supabase
      .from("schedule_events")
      .update({ status: "declined", is_confirmed: false })
      .eq("quote_id", quoteId)
      .eq("event_type", PROPOSAL_EVENT_TYPE)
      .neq("status", "declined")
      .select("id");

    if (error) {
      toast({ title: "Error", description: "Failed to cancel scheduling", variant: "destructive" });
      throw error;
    }
    if (!updated || updated.length === 0) {
      toast({
        title: "Nothing to cancel",
        description: "Scheduling already has no active proposals.",
        variant: "destructive",
      });
      await fetchData();
      return;
    }

    if (confirmedEventId) {
      const { error: rpcError } = await supabase.rpc("release_schedule_block", { p_event_id: confirmedEventId });
      if (rpcError) console.error("release_schedule_block failed", rpcError);
    }

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
  }, [confirmedProposal, contractorId, fetchData, jobExists, notifyOtherParty, quoteId, toast, userId]);

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
    declineProposal,
    requestDifferentDate,
    cancelScheduling,
  };
}
