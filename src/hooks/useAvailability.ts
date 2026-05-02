import { useState, useEffect, useCallback } from "react";
import { addDays, format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AvailabilitySlot {
  id: string;
  contractor_id: string;
  day_of_week: number; // 0 = Sun … 6 = Sat (matches JS Date.getDay())
  start_time: string;  // "HH:MM"
  end_time: string;    // "HH:MM"
  is_available: boolean;
}

export interface ContractorAvailabilityOverride {
  id: string;
  contractor_id: string;
  date: string;           // "YYYY-MM-DD"
  am_available: boolean;
  pm_available: boolean;
  reason: string | null;
}

export interface DayAvailability {
  amAvailable: boolean;
  pmAvailable: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const UNAVAILABLE: DayAvailability = { amAvailable: false, pmAvailable: false };

/**
 * Derives AM/PM availability from a weekly slot's time window.
 * AM = contractor starts before noon; PM = contractor ends after noon.
 * String comparison is safe here because times are zero-padded "HH:MM".
 */
function slotToDayAvailability(slot: AvailabilitySlot | undefined): DayAvailability {
  if (!slot || !slot.is_available) return UNAVAILABLE;
  return {
    amAvailable: slot.start_time < "12:00",
    pmAvailable: slot.end_time > "12:00",
  };
}

// ─── useAvailability ──────────────────────────────────────────────────────────

/**
 * Read-only hook. Safe to call from customer-facing views and profile pages.
 * Reads availability_slots (weekly pattern) and contractor_availability_overrides
 * (one-off date overrides) for the given contractor.
 */
export function useAvailability(contractorId: string) {
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [overrides, setOverrides] = useState<ContractorAvailabilityOverride[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    if (!contractorId) {
      setSlots([]);
      setOverrides([]);
      return;
    }

    setLoading(true);

    const [{ data: slotsData }, { data: overridesData }] = await Promise.all([
      supabase
        .from("availability_slots")
        .select("id, contractor_id, day_of_week, start_time, end_time, is_available")
        .eq("contractor_id", contractorId)
        .order("day_of_week", { ascending: true }),
      supabase
        .from("contractor_availability_overrides")
        .select("id, contractor_id, date, am_available, pm_available, reason")
        .eq("contractor_id", contractorId)
        .order("date", { ascending: true }),
    ]);

    setSlots(slotsData ?? []);
    setOverrides(overridesData ?? []);
    setLoading(false);
  }, [contractorId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /**
   * Returns AM/PM availability for a specific date.
   * Overrides take priority over the weekly pattern.
   * If neither exists, both flags are false.
   */
  const getSlotForDate = useCallback(
    (date: Date): DayAvailability => {
      const dateStr = format(date, "yyyy-MM-dd");

      const override = overrides.find((o) => o.date === dateStr);
      if (override) {
        return { amAvailable: override.am_available, pmAvailable: override.pm_available };
      }

      const slot = slots.find((s) => s.day_of_week === date.getDay());
      return slotToDayAvailability(slot);
    },
    [overrides, slots],
  );

  /**
   * Scans forward from tomorrow up to 90 days.
   * Returns the first date where at least one half-day is available, or null.
   */
  const getNextAvailable = useCallback((): Date | null => {
    const tomorrow = addDays(new Date(), 1);
    for (let i = 0; i < 90; i++) {
      const candidate = addDays(tomorrow, i);
      const { amAvailable, pmAvailable } = getSlotForDate(candidate);
      if (amAvailable || pmAvailable) return candidate;
    }
    return null;
  }, [getSlotForDate]);

  /**
   * Returns a "YYYY-MM-DD" → DayAvailability map for every date in [startDate, endDate].
   */
  const getAvailabilityForRange = useCallback(
    (startDate: Date, endDate: Date): Record<string, DayAvailability> => {
      const result: Record<string, DayAvailability> = {};
      const endStr = format(endDate, "yyyy-MM-dd");
      let current = startDate;
      while (format(current, "yyyy-MM-dd") <= endStr) {
        result[format(current, "yyyy-MM-dd")] = getSlotForDate(current);
        current = addDays(current, 1);
      }
      return result;
    },
    [getSlotForDate],
  );

  return {
    slots,
    overrides,
    loading,
    getSlotForDate,
    getNextAvailable,
    getAvailabilityForRange,
    refetch: fetchData,
  };
}

// ─── useContractorAvailabilityManager ────────────────────────────────────────

/**
 * Write-enabled hook for the contractor managing their own availability.
 * Extends useAvailability with mutation helpers.
 * RLS enforces ownership server-side; no auth.uid() comparison needed here.
 */
export function useContractorAvailabilityManager(contractorId: string) {
  const base = useAvailability(contractorId);
  const { refetch } = base;

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Replaces the contractor's weekly availability pattern.
   * Uses delete-then-insert to match existing saveAvailability behaviour in useSchedule.ts.
   */
  const saveWeeklyPattern = useCallback(
    async (
      newSlots: { day_of_week: number; start_time: string; end_time: string; is_available: boolean }[],
    ): Promise<void> => {
      if (!contractorId) return;
      setSaving(true);
      setError(null);
      try {
        await supabase.from("availability_slots").delete().eq("contractor_id", contractorId);
        const records = newSlots.map((s) => ({ ...s, contractor_id: contractorId }));
        const { error: insertError } = await supabase.from("availability_slots").insert(records);
        if (insertError) throw insertError;
        await refetch();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to save weekly pattern";
        setError(msg);
        throw e;
      } finally {
        setSaving(false);
      }
    },
    [contractorId, refetch],
  );

  /**
   * Adds a one-off override for a specific date.
   * Existing override for the same date is left in place — callers should
   * call removeOverride first if they intend to replace it.
   */
  const addOverride = useCallback(
    async (date: Date, amAvailable: boolean, pmAvailable: boolean, reason?: string): Promise<void> => {
      if (!contractorId) return;
      setSaving(true);
      setError(null);
      try {
        const { error: insertError } = await supabase
          .from("contractor_availability_overrides")
          .insert({
            contractor_id: contractorId,
            date: format(date, "yyyy-MM-dd"),
            am_available: amAvailable,
            pm_available: pmAvailable,
            reason: reason ?? null,
          });
        if (insertError) throw insertError;
        await refetch();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to add override";
        setError(msg);
        throw e;
      } finally {
        setSaving(false);
      }
    },
    [contractorId, refetch],
  );

  /**
   * Removes a single override by its primary key.
   */
  const removeOverride = useCallback(
    async (overrideId: string): Promise<void> => {
      setSaving(true);
      setError(null);
      try {
        const { error: deleteError } = await supabase
          .from("contractor_availability_overrides")
          .delete()
          .eq("id", overrideId);
        if (deleteError) throw deleteError;
        await refetch();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to remove override";
        setError(msg);
        throw e;
      } finally {
        setSaving(false);
      }
    },
    [refetch],
  );

  return {
    ...base,
    saving,
    error,
    saveWeeklyPattern,
    addOverride,
    removeOverride,
  };
}
