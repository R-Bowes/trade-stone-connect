import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Contractor {
  id: string;
  user_id: string;
  full_name: string | null;
  company_name: string | null;
  ts_profile_code: string | null;
  email: string | null;
  phone: string | null;
  user_type: string;
}

export const useContractors = (searchTerm?: string, trade?: string, location?: string) => {
  return useQuery({
    queryKey: ["contractors", searchTerm, trade, location],
    queryFn: async () => {
      let query = supabase
        .from("profiles")
        .select("*")
        .eq("user_type", "pro");

      if (searchTerm) {
        query = query.or(`full_name.ilike.%${searchTerm}%,company_name.ilike.%${searchTerm}%,ts_profile_code.ilike.%${searchTerm}%`);
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
        .select("*")
        .eq("ts_profile_code", code)
        .eq("user_type", "pro")
        .maybeSingle();

      if (error) throw error;
      return data as Contractor | null;
    },
    enabled: !!code,
  });
};
