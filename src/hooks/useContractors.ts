import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Contractor {
  user_id: string;
  full_name: string | null;
  company_name: string | null;
  ts_profile_code: string | null;
  user_type: string;
  trade: string | null;
  trades: string[] | null;
  location: string | null;
  working_radius: string | null;
  bio: string | null;
  logo_url: string | null;
  hourly_rate: number | null;
  is_available: boolean | null;
  created_at: string;
  updated_at: string;
}

// Escape SQL ILIKE special characters to prevent pattern injection
const escapeILIKE = (str: string): string => {
  return str.replace(/[%_\\]/g, '\\$&');
};

type RatingFilter = "all" | "4.5" | "4.0";
type AvailabilityFilter = "all" | "available" | "unavailable";
type HourlyRateFilter = "all" | "under-25" | "25-50" | "50-100" | "100-plus";

export const useContractors = (
  searchTerm = "",
  trade?: string,
  location = "",
  minRating: RatingFilter = "all",
  availability: AvailabilityFilter = "all",
  hourlyRate: HourlyRateFilter = "all"
) => {
  const normalizedSearchTerm = searchTerm.trim();
  const normalizedLocation = location.trim();
  const hasActiveFilters =
    normalizedSearchTerm !== "" ||
    Boolean(trade) ||
    normalizedLocation !== "" ||
    minRating !== "all" ||
    availability !== "all" ||
    hourlyRate !== "all";

  return useQuery({
    queryKey: ["contractors", normalizedSearchTerm, trade, normalizedLocation, minRating, availability, hourlyRate],
    queryFn: async () => {
      let query = supabase
        .from("public_pro_profiles")
        .select("user_id, full_name, company_name, ts_profile_code, user_type, trade, trades, location, working_radius, bio, logo_url, hourly_rate, is_available, created_at, updated_at")
        .eq("user_type", "contractor");

      if (normalizedSearchTerm) {
        const sanitizedTerm = escapeILIKE(normalizedSearchTerm.slice(0, 100));
        // Support searching by full TS code (TS-C-4AE203) or just suffix (4AE203)
        query = query.or(`full_name.ilike.%${sanitizedTerm}%,company_name.ilike.%${sanitizedTerm}%,ts_profile_code.ilike.%${sanitizedTerm}%`);
      }

      if (trade) {
        const escapedTrade = trade.replace(/"/g, '\\"');
        // Match contractors where trade field matches OR trades array contains the selected trade
        query = query.or(`trade.eq."${escapedTrade}",trades.cs.${JSON.stringify([trade])}`);
      }

      if (normalizedLocation) {
        const sanitizedLocation = escapeILIKE(normalizedLocation.slice(0, 100));
        query = query.ilike("location", `%${sanitizedLocation}%`);
      }

      if (hourlyRate === "under-25") {
        query = query.lt("hourly_rate", 25);
      } else if (hourlyRate === "25-50") {
        query = query.gte("hourly_rate", 25).lte("hourly_rate", 50);
      } else if (hourlyRate === "50-100") {
        query = query.gte("hourly_rate", 50).lte("hourly_rate", 100);
      } else if (hourlyRate === "100-plus") {
        query = query.gte("hourly_rate", 100);
      }

      const { data, error } = await query;

      if (error) throw error;
      return {
        contractors: data as Contractor[],
        hasActiveFilters,
      };
    },
  });
};

export const useContractorByCode = (code: string) => {
  return useQuery({
    queryKey: ["contractor", code],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("public_pro_profiles")
        .select("user_id, full_name, company_name, ts_profile_code, user_type, trade, trades, location, working_radius, bio, logo_url, hourly_rate, is_available, created_at, updated_at")
        .eq("ts_profile_code", code)
        .eq("user_type", "contractor")
        .maybeSingle();

      if (error) throw error;
      return data as Contractor | null;
    },
    enabled: !!code,
  });
};
