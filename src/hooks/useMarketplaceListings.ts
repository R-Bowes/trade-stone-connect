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
  seller?: {
    full_name: string | null;
    company_name: string | null;
  };
}

export const useMarketplaceListings = (category?: string) => {
  return useQuery({
    queryKey: ["marketplace-listings", category],
    queryFn: async () => {
      let query = supabase
        .from("marketplace_listings")
        .select(`
          *,
          seller:profiles!seller_id(full_name, company_name)
        `)
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
        .select(`
          *,
          seller:profiles!seller_id(full_name, company_name, email)
        `)
        .eq("id", id)
        .maybeSingle();

      if (error) throw error;
      return data as MarketplaceListing & { seller: { email: string | null } } | null;
    },
    enabled: !!id,
  });
};
