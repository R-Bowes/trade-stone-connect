import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface MarketplaceListing {
  id: string;
  seller_id: string;
  title: string;
  description: string;
  price: number;
  category: string;
  condition: string;
  quantity: string;
  location: string;
  images: string[];
  is_active: boolean;
  created_at: string;
}

export const useMarketplaceListings = (category?: string) => {
  return useQuery({
    queryKey: ["marketplace-listings", category],
    queryFn: async () => {
      let query = supabase
        .from("marketplace_listings")
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      if (category && category !== "all") {
        query = query.eq("category", category);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as MarketplaceListing[];
    },
  });
};

export const useMarketplaceListing = (id: string) => {
  return useQuery({
    queryKey: ["marketplace-listing", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketplace_listings")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (error) throw error;
      
      if (!data) return null;
      
      // Fetch seller info separately (only public fields)
      const { data: seller } = await supabase
        .from("public_pro_profiles")
        .select("full_name, company_name")
        .eq("user_id", data.seller_id)
        .maybeSingle();
      
      return { ...data, seller } as MarketplaceListing & { seller: { full_name: string | null; company_name: string | null } | null };
    },
    enabled: !!id,
  });
};
