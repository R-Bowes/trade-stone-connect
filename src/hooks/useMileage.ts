import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";

export type MileageTrip = Database["public"]["Tables"]["mileage_trips"]["Row"];
export type MileageTripInsert = Database["public"]["Tables"]["mileage_trips"]["Insert"];
export type Vehicle = Database["public"]["Tables"]["contractor_vehicles"]["Row"];
export type MileageRate = Database["public"]["Tables"]["hmrc_mileage_rates"]["Row"];

export type ClaimCalculation = {
  amount: number;
  description: string;
};

/**
 * UK tax year runs 6 April to 5 April. Parses the date-only string manually
 * (no `new Date(dateStr)`) to avoid UTC/local timezone shifting the day near
 * midnight.
 */
export function getTaxYear(date: Date): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const startYear = month > 4 || (month === 4 && day >= 6) ? year : year - 1;
  const endYearShort = String((startYear + 1) % 100).padStart(2, "0");
  return `${startYear}-${endYearShort}`;
}

export function getTaxYearFromDateString(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return getTaxYear(new Date(y, m - 1, d));
}

export function useMileage() {
  const [trips, setTrips] = useState<MileageTrip[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [rates, setRates] = useState<MileageRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [contractorId, setContractorId] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchAll = useCallback(async () => {
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

    if (!profileRow) {
      setLoading(false);
      return;
    }
    setContractorId(profileRow.id);

    const [{ data: tripRows }, { data: vehicleRows }, { data: rateRows }] = await Promise.all([
      supabase
        .from("mileage_trips")
        .select("*")
        .eq("contractor_id", profileRow.id)
        .order("trip_date", { ascending: false }),
      supabase
        .from("contractor_vehicles")
        .select("*")
        .eq("contractor_id", profileRow.id)
        .eq("is_active", true)
        .order("created_at", { ascending: true }),
      supabase
        .from("hmrc_mileage_rates")
        .select("*"),
    ]);

    setTrips(tripRows ?? []);
    setVehicles(vehicleRows ?? []);
    setRates(rateRows ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Rates for a vehicle type, currently in effect (no effective_to, or
  // effective_to in the future). Slice 1 only ever seeded one active row
  // per (vehicle_type, threshold_miles), so this is deterministic today.
  const ratesForVehicleType = useCallback(
    (vehicleType: string) => {
      const todayStr = new Date().toISOString().split("T")[0];
      return rates.filter(
        (r) =>
          r.vehicle_type === vehicleType &&
          r.effective_from <= todayStr &&
          (!r.effective_to || r.effective_to >= todayStr),
      );
    },
    [rates],
  );

  // Flat per-mile rate for vehicle types with no threshold (motorcycle,
  // bicycle) — used by the UI to display the rate without needing a miles
  // figure to calculate against.
  const getFlatRate = useCallback(
    (vehicleType: string): number | null => {
      const vehicleRates = ratesForVehicleType(vehicleType);
      const flatRow = vehicleRates.find((r) => r.threshold_miles === null);
      return flatRow?.rate_per_mile ?? null;
    },
    [ratesForVehicleType],
  );

  const calculateClaimAmount = useCallback(
    (vehicleType: string, miles: number, cumulativeMilesInTaxYear: number): ClaimCalculation => {
      const vehicleRates = ratesForVehicleType(vehicleType);
      if (vehicleRates.length === 0 || miles <= 0) {
        return { amount: 0, description: "No rate configured" };
      }

      const thresholdRow = vehicleRates.find((r) => r.threshold_miles !== null);
      const flatRow = vehicleRates.find((r) => r.threshold_miles === null);

      // Flat-rate vehicles (motorcycle, bicycle) — no threshold row at all.
      if (!thresholdRow) {
        const rate = flatRow?.rate_per_mile ?? 0;
        const amount = miles * rate;
        return {
          amount,
          description: `${miles.toLocaleString("en-GB")}mi at ${(rate * 100).toFixed(0)}p/mile`,
        };
      }

      const threshold = thresholdRow.threshold_miles!;
      const highRate = thresholdRow.rate_per_mile;
      const lowRate = flatRow?.rate_per_mile ?? highRate;

      const milesRemainingAtHighRate = Math.max(0, threshold - cumulativeMilesInTaxYear);
      const milesAtHighRate = Math.min(miles, milesRemainingAtHighRate);
      const milesAtLowRate = miles - milesAtHighRate;

      const amount = milesAtHighRate * highRate + milesAtLowRate * lowRate;

      const description =
        milesAtLowRate > 0
          ? milesAtHighRate > 0
            ? `${milesAtHighRate.toLocaleString("en-GB")}mi at ${(highRate * 100).toFixed(0)}p + ${milesAtLowRate.toLocaleString("en-GB")}mi at ${(lowRate * 100).toFixed(0)}p`
            : `${milesAtLowRate.toLocaleString("en-GB")}mi at ${(lowRate * 100).toFixed(0)}p/mile`
          : `${milesAtHighRate.toLocaleString("en-GB")}mi at ${(highRate * 100).toFixed(0)}p/mile`;

      return { amount, description };
    },
    [ratesForVehicleType],
  );

  // Cumulative miles already logged for a vehicle in a tax year, computed
  // client-side from the already-loaded trips list. `excludeTripId` lets
  // updateTrip exclude the trip being edited from its own "before this trip"
  // total.
  const getCumulativeMiles = useCallback(
    (vehicleId: string, taxYear: string, excludeTripId?: string) => {
      return trips
        .filter((t) => t.vehicle_id === vehicleId && t.tax_year === taxYear && t.id !== excludeTripId)
        .reduce((sum, t) => sum + Number(t.miles), 0);
    },
    [trips],
  );

  const lockMileageMethod = async (vehicleId: string, taxYear: string) => {
    const vehicle = vehicles.find((v) => v.id === vehicleId);
    if (!vehicle) return;
    if (vehicle.method_locked_tax_year !== taxYear) {
      await supabase
        .from("contractor_vehicles")
        .update({ method_locked_tax_year: taxYear })
        .eq("id", vehicleId);
    }
  };

  type TripFormInput = {
    vehicle_id: string;
    trip_date: string;
    from_location: string;
    to_location: string;
    miles: number;
    purpose: string | null;
    job_id: string | null;
    project_id: string | null;
  };

  const addTrip = async (input: TripFormInput) => {
    if (!contractorId) return;
    const vehicle = vehicles.find((v) => v.id === input.vehicle_id);
    if (!vehicle) {
      toast({ title: "Error", description: "Vehicle not found", variant: "destructive" });
      return;
    }

    const taxYear = getTaxYearFromDateString(input.trip_date);
    const cumulative = getCumulativeMiles(input.vehicle_id, taxYear);
    const { amount } = calculateClaimAmount(vehicle.vehicle_type, input.miles, cumulative);

    const { error } = await supabase.from("mileage_trips").insert({
      contractor_id: contractorId,
      vehicle_id: input.vehicle_id,
      trip_date: input.trip_date,
      from_location: input.from_location,
      to_location: input.to_location,
      miles: input.miles,
      purpose: input.purpose,
      job_id: input.job_id,
      project_id: input.project_id,
      claim_amount: amount,
      tax_year: taxYear,
    });

    if (error) {
      toast({ title: "Error", description: "Failed to add trip", variant: "destructive" });
      throw error;
    }

    await lockMileageMethod(input.vehicle_id, taxYear);
    toast({ title: "Trip added", description: "Mileage trip has been recorded." });
    await fetchAll();
  };

  const updateTrip = async (id: string, input: TripFormInput) => {
    const vehicle = vehicles.find((v) => v.id === input.vehicle_id);
    if (!vehicle) {
      toast({ title: "Error", description: "Vehicle not found", variant: "destructive" });
      return;
    }

    const taxYear = getTaxYearFromDateString(input.trip_date);
    const cumulative = getCumulativeMiles(input.vehicle_id, taxYear, id);
    const { amount } = calculateClaimAmount(vehicle.vehicle_type, input.miles, cumulative);

    const { error } = await supabase
      .from("mileage_trips")
      .update({
        vehicle_id: input.vehicle_id,
        trip_date: input.trip_date,
        from_location: input.from_location,
        to_location: input.to_location,
        miles: input.miles,
        purpose: input.purpose,
        job_id: input.job_id,
        project_id: input.project_id,
        claim_amount: amount,
        tax_year: taxYear,
      })
      .eq("id", id);

    if (error) {
      toast({ title: "Error", description: "Failed to update trip", variant: "destructive" });
      throw error;
    }

    await lockMileageMethod(input.vehicle_id, taxYear);
    toast({ title: "Trip updated", description: "Mileage trip has been updated." });
    await fetchAll();
  };

  const deleteTrip = async (id: string) => {
    const { error } = await supabase.from("mileage_trips").delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: "Failed to delete trip", variant: "destructive" });
      throw error;
    }
    toast({ title: "Trip deleted", description: "Mileage trip has been removed." });
    await fetchAll();
  };

  const currentTaxYear = useMemo(() => getTaxYear(new Date()), []);

  const totalMileageClaim = useMemo(
    () => trips.reduce((sum, t) => sum + Number(t.claim_amount), 0),
    [trips],
  );

  const tripsThisTaxYear = useMemo(
    () => trips.filter((t) => t.tax_year === currentTaxYear),
    [trips, currentTaxYear],
  );

  const totalMilesThisTaxYear = useMemo(
    () => tripsThisTaxYear.reduce((sum, t) => sum + Number(t.miles), 0),
    [tripsThisTaxYear],
  );

  const totalClaimThisTaxYear = useMemo(
    () => tripsThisTaxYear.reduce((sum, t) => sum + Number(t.claim_amount), 0),
    [tripsThisTaxYear],
  );

  const tripsThisMonth = useMemo(() => {
    const now = new Date();
    return trips.filter((t) => {
      const [y, m] = t.trip_date.split("-").map(Number);
      return y === now.getFullYear() && m === now.getMonth() + 1;
    });
  }, [trips]);

  const tripsByVehicle = useMemo(() => {
    const map = new Map<string, MileageTrip[]>();
    for (const t of trips) {
      const list = map.get(t.vehicle_id) ?? [];
      list.push(t);
      map.set(t.vehicle_id, list);
    }
    return map;
  }, [trips]);

  const tripsByTaxYear = useMemo(() => {
    const map = new Map<string, MileageTrip[]>();
    for (const t of trips) {
      const list = map.get(t.tax_year) ?? [];
      list.push(t);
      map.set(t.tax_year, list);
    }
    return map;
  }, [trips]);

  const cumulativeMilesByVehicle = useMemo(() => {
    const map = new Map<string, number>();
    for (const v of vehicles) {
      map.set(v.id, getCumulativeMiles(v.id, currentTaxYear));
    }
    return map;
  }, [vehicles, currentTaxYear, getCumulativeMiles]);

  return {
    trips,
    vehicles,
    rates,
    loading,
    currentTaxYear,
    calculateClaimAmount,
    getFlatRate,
    getCumulativeMiles,
    getTaxYear,
    getTaxYearFromDateString,
    addTrip,
    updateTrip,
    deleteTrip,
    totalMileageClaim,
    tripsThisTaxYear,
    totalMilesThisTaxYear,
    totalClaimThisTaxYear,
    tripsThisMonth,
    tripsByVehicle,
    tripsByTaxYear,
    cumulativeMilesByVehicle,
    refetch: fetchAll,
  };
}
