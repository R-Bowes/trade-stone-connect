import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Contractor {
  id: string;
  user_id: string;
  full_name: string | null;
  company_name: string | null;
  ts_profile_code: string | null;
  user_type: string;
  trades: string[] | null;
  location: string | null;
  working_radius: string | null;
  bio: string | null;
  avatar_url: string | null;
  logo_url: string | null;
  hourly_rate: number | null;
  years_experience: number | null;
  is_available: boolean | null;
  is_verified: boolean | null;
  rating: number | null;
  review_count: number | null;
  completed_jobs: number | null;
  is_active: boolean | null;
  created_at: string;
  updated_at: string;
}

const CONTRACTOR_SELECT = `
  id, user_id, full_name, company_name, ts_profile_code, user_type,
  trades, location, working_radius, bio, avatar_url, logo_url,
  hourly_rate, years_experience, is_available, is_verified,
  rating, review_count, completed_jobs, is_active,
  created_at, updated_at
`.trim();

// Escape SQL ILIKE special characters to prevent pattern injection
const escapeILIKE = (str: string): string => {
  return str.replace(/[%_\\]/g, '\\$&');
};

export const useContractors = (searchTerm = "", trade?: string, location?: string | null) => {
  const normalizedSearchTerm = searchTerm.trim();
  const normalizedLocation = String(location ?? "").trim();

  return useQuery({
    queryKey: ["contractors", normalizedSearchTerm, trade, normalizedLocation],
    queryFn: async () => {
      let query = supabase
        .from("public_pro_profiles")
        .select(CONTRACTOR_SELECT)
        .eq("user_type", "contractor");

      if (normalizedLocation.length > 0) {
        const sanitizedLocation = escapeILIKE(normalizedLocation.slice(0, 100));
        query = query.ilike("location", `%${sanitizedLocation}%`);
      }

      if (normalizedSearchTerm) {
        const sanitizedTerm = escapeILIKE(normalizedSearchTerm.slice(0, 100));
        query = query.or(
          `full_name.ilike.%${sanitizedTerm}%,company_name.ilike.%${sanitizedTerm}%,ts_profile_code.ilike.%${sanitizedTerm}%`
        );
      }

      if (trade) {
        const escaped = trade.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        query = query.or(`trades.cs.{"${escaped}"}`);
      }

      const { data, error } = await query;
      if (error) throw error;

      return { contractors: data as Contractor[] };
    },
  });
};

export const useContractorByCode = (code: string) => {
  return useQuery({
    queryKey: ["contractor", code],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("public_pro_profiles")
        .select(CONTRACTOR_SELECT)
        .eq("ts_profile_code", code)
        .eq("user_type", "contractor")
        .maybeSingle();

      if (error) throw error;
      return data as Contractor | null;
    },
    enabled: !!code,
  });
};