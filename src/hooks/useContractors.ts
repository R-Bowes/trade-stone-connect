import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Contractor {
  user_id: string;
  full_name: string | null;
  company_name: string | null;
  ts_profile_code: string | null;
  user_type: string;
  created_at: string;
  updated_at: string;
}

// Escape SQL ILIKE special characters to prevent pattern injection
const escapeILIKE = (str: string): string => {
  return str.replace(/[%_\\]/g, '\\$&');
};

export const useContractors = (searchTerm?: string, trade?: string, location?: string) => {
  return useQuery({
    queryKey: ["contractors", searchTerm, trade, location],
    queryFn: async () => {
      let query = supabase
        .from("profiles")
        .select("user_id, full_name, company_name, ts_profile_code, user_type, created_at, updated_at")
        .eq("user_type", "contractor");

      if (searchTerm) {
        // Sanitize and limit search term length
        const sanitizedTerm = escapeILIKE(searchTerm.slice(0, 100));
        query = query.or(`full_name.ilike.%${sanitizedTerm}%,company_name.ilike.%${sanitizedTerm}%,ts_profile_code.ilike.%${sanitizedTerm}%`);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as Contractor[];
    },
  });
};

export const useContractorByCode = (code: string) => {
  return useQuery({
    queryKey: ["contractor", code],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name, company_name, ts_profile_code, user_type, created_at, updated_at")
        .eq("ts_profile_code", code)
        .eq("user_type", "contractor")
        .maybeSingle();

      if (error) throw error;
      return data as Contractor | null;
    },
    enabled: !!code,
  });
};
