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
  verification_tier: number;
}

const CONTRACTOR_SELECT =
  "id, user_id, full_name, company_name, ts_profile_code, user_type, trades, location, working_radius, bio, avatar_url, logo_url, hourly_rate, years_experience, is_available, is_verified, rating, review_count, completed_jobs, is_active, created_at, updated_at" as const;

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
      // Belt and braces — the view (public_pro_profiles) already restricts to
      // published contractors for anyone but the row's own owner; this
      // client-side filter is defence in depth, not the access gate itself.
      let query = supabase
        .from("public_pro_profiles")
        .select(CONTRACTOR_SELECT)
        .eq("user_type", "contractor")
        .eq("profile_is_published", true);

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

      const contractors = (data ?? []) as Contractor[];

      if (contractors.length > 0) {
        const { data: tierRows } = await supabase
          .from("contractor_verification_public")
          .select("contractor_id, current_tier")
          .in("contractor_id", contractors.map((c) => c.id));

        const tierById = new Map((tierRows ?? []).map((r) => [r.contractor_id, r.current_tier]));
        for (const c of contractors) {
          c.verification_tier = tierById.get(c.id) ?? 1;
        }
      }

      // SCORING.md Phase 4 Step 4: composite_score ranks contractors that
      // have one, but is never attached to/returned on the Contractor
      // objects — it must never be displayed, only used to order results
      // here. There was no existing ordering to preserve (no .order() on
      // this query before this change) — contractors with a composite sort
      // first (descending), contractors with a NULL composite (building
      // confidence — no completed jobs yet) keep their original relative
      // order and are appended after, never buried or hidden.
      //
      // Verification tier is a secondary, soft boost: it only breaks ties
      // when the composite comparison is otherwise equal (both null, or an
      // exact tie) — it never overrides the primary relevance ordering, and
      // Tier 1 contractors are never filtered out, just sorted after
      // higher-tier ones in a tie.
      if (contractors.length > 0) {
        const { data: scoreRows } = await supabase
          .from("contractor_scores")
          .select("contractor_id, composite_score")
          .in("contractor_id", contractors.map((c) => c.id));

        const compositeById = new Map((scoreRows ?? []).map((r) => [r.contractor_id, r.composite_score]));
        contractors.sort((a, b) => {
          const scoreA = compositeById.get(a.id) ?? null;
          const scoreB = compositeById.get(b.id) ?? null;
          if (scoreA === null && scoreB === null) {
            return b.verification_tier - a.verification_tier;
          }
          if (scoreA === null) return 1;
          if (scoreB === null) return -1;
          if (scoreA === scoreB) return b.verification_tier - a.verification_tier;
          return scoreB - scoreA;
        });
      }

      return { contractors };
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
        .eq("profile_is_published", true)
        .maybeSingle();

      if (error) throw error;
      return data as Contractor | null;
    },
    enabled: !!code,
  });
};