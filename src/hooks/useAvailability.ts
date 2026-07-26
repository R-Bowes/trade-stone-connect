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
const RANGE_DAYS = 90;

// ─── useAvailability ──────────────────────────────────────────────────────────

/**
 * Read-only hook. Safe to call from customer-facing views and profile pages.
 * Reads capacity-based availability via the get_contractor_availability RPC
 * (working patterns minus absences minus assigned jobs, computed server-side)
 * for the given contractor, 90 days out from today.
 */
export function useAvailability(contractorId: string) {
  // Vestigial — no consumer should read these directly anymore. Kept only
  // for backward compatibility with the existing hook return shape. The RPC
  // doesn't read contractor_availability_overrides, so overrides is never
  // populated.
  const [slots] = useState<AvailabilitySlot[]>([]);
  const [overrides] = useState<ContractorAvailabilityOverride[]>([]);
  const [availabilityByDate, setAvailabilityByDate] = useState<
    Map<string, { is_available: boolean; remaining_capacity: number }>
  >(new Map());
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    if (!contractorId) {
      setAvailabilityByDate(new Map());
      return;
    }

    setLoading(true);

    const startStr = format(new Date(), "yyyy-MM-dd");
    const endStr = format(addDays(new Date(), RANGE_DAYS), "yyyy-MM-dd");

    const { data: rpcData } = await supabase.rpc("get_contractor_availability", {
      p_contractor_id: contractorId,
      p_start_date: startStr,
      p_end_date: endStr,
    });

    const map = new Map<string, { is_available: boolean; remaining_capacity: number }>();
    for (const row of rpcData ?? []) {
      map.set(row.available_date, { is_available: row.is_available, remaining_capacity: row.remaining_capacity });
    }

    setAvailabilityByDate(map);
    setLoading(false);
  }, [contractorId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /**
   * Returns availability for a specific date from the capacity map.
   * The capacity model has no AM/PM granularity — both flags mirror the
   * same whole-day is_available value. Unknown dates are unavailable.
   */
  const getSlotForDate = useCallback(
    (date: Date): DayAvailability => {
      const dateStr = format(date, "yyyy-MM-dd");
      const entry = availabilityByDate.get(dateStr);
      if (!entry) return UNAVAILABLE;
      return { amAvailable: entry.is_available, pmAvailable: entry.is_available };
    },
    [availabilityByDate],
  );

  /**
   * Scans forward from tomorrow up to 90 days.
   * Returns the first date where the capacity map shows is_available, or null.
   */
  const getNextAvailable = useCallback((): Date | null => {
    const tomorrow = addDays(new Date(), 1);
    for (let i = 0; i < RANGE_DAYS; i++) {
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
