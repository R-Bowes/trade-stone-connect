import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";

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
  postcode: string | null;
  coverage_type: string | null;
  service_area_center_lat: number | null;
  service_area_center_lng: number | null;
  service_area_radius_miles: number | null;
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
  "id, user_id, full_name, company_name, ts_profile_code, user_type, trades, location, working_radius, postcode, coverage_type, service_area_center_lat, service_area_center_lng, service_area_radius_miles, bio, avatar_url, logo_url, hourly_rate, years_experience, is_available, is_verified, rating, review_count, completed_jobs, is_active, created_at, updated_at" as const;

// Escape SQL ILIKE special characters to prevent pattern injection
const escapeILIKE = (str: string): string => {
  return str.replace(/[%_\\]/g, '\\$&');
};

// Full UK postcode shape only (not a bare outcode, not a place name) --
// matches exactly what geocode-postcode's postcodes.io call expects
// (its /postcodes/{postcode} lookup endpoint, not /outcodes/). A search
// term that doesn't match this never attempts a geocode call at all and
// goes straight to the ILIKE path -- postcodes.io cannot resolve a place
// name, so there is no point spending a round trip finding that out.
const UK_POSTCODE_REGEX = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;

const MILES_PER_DEGREE_LAT = 69;

// Bounding-box prefilter margin, in miles, applied before the exact
// haversine calculation. No DB constraint caps service_area_radius_miles
// (Step-0 audit) -- 100 is the largest figure any picker in this build
// offers (ProfileManagement's radius Select). A contractor who set a
// larger radius via the Canvas Editor's free-number input could fall
// outside this box and be missed by a search that would otherwise have
// matched them. Documented limitation, not silently assumed correct for
// every possible stored value.
const BOUNDING_BOX_MARGIN_MILES = 100;

// Below this distance a contractor's base is treated as being "in" the
// searched area outright (rank 1), rather than merely reachable via their
// stated radius (rank 2). The spec's ranking language ("Base is within the
// searched area" vs "Searched point is within their radius") doesn't give
// an exact threshold -- 5 miles is this implementation's read of "they're
// basically there", not a specified number.
const HOME_AREA_MILES = 5;

function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const earthRadiusMiles = 3958.8;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return earthRadiusMiles * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// 1 = contractor's own base is essentially at the searched point; 2 = the
// searched point is within their stated radius; 3 = coverage_type =
// 'national' (always matches, ranked below any real radius match); 4 = the
// ILIKE text-fallback tier (no usable postcode/coordinates yet).
type LocationRank = 1 | 2 | 3 | 4;

export const useContractors = (searchTerm = "", trade?: string, location?: string | null) => {
  const normalizedSearchTerm = searchTerm.trim();
  const normalizedLocation = String(location ?? "").trim();

  return useQuery({
    queryKey: ["contractors", normalizedSearchTerm, trade, normalizedLocation],
    queryFn: async () => {
      // Belt and braces — the view (public_pro_profiles) already restricts to
      // published contractors for anyone but the row's own owner; this
      // client-side filter is defence in depth, not the access gate itself.
      // Trade and name/company/code search stay identical to before this
      // change, on every branch below — only the location filter changes.
      const baseQuery = () => {
        let q = supabase
          .from("public_pro_profiles")
          .select(CONTRACTOR_SELECT)
          .eq("user_type", "contractor")
          .eq("profile_is_published", true);

        if (normalizedSearchTerm) {
          const sanitizedTerm = escapeILIKE(normalizedSearchTerm.slice(0, 100));
          q = q.or(
            `full_name.ilike.%${sanitizedTerm}%,company_name.ilike.%${sanitizedTerm}%,ts_profile_code.ilike.%${sanitizedTerm}%`
          );
        }

        if (trade) {
          const escaped = trade.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
          q = q.or(`trades.cs.{"${escaped}"}`);
        }

        return q;
      };

      const ranks = new Map<string, LocationRank>();
      let contractors: Contractor[] = [];

      // Only attempt a geocode when the term is shaped like a full UK
      // postcode. A geocode failure (invalid postcode, postcodes.io
      // briefly down) is caught and falls back to the ILIKE path exactly
      // like a place name would — a location search must never throw.
      let searchPoint: { latitude: number; longitude: number } | null = null;
      if (normalizedLocation.length > 0 && UK_POSTCODE_REGEX.test(normalizedLocation)) {
        try {
          searchPoint = await invokeEdgeFunction<{ latitude: number; longitude: number }>(
            "geocode-postcode",
            { body: { postcode: normalizedLocation } },
          );
        } catch {
          searchPoint = null;
        }
      }

      if (searchPoint) {
        const { latitude, longitude } = searchPoint;
        const latDelta = BOUNDING_BOX_MARGIN_MILES / MILES_PER_DEGREE_LAT;
        const lngDelta =
          BOUNDING_BOX_MARGIN_MILES /
          (MILES_PER_DEGREE_LAT * Math.max(Math.cos((latitude * Math.PI) / 180), 0.1));

        // 1. Radius-tier contractors with coordinates: bounding-box
        // prefiltered on (service_area_center_lat, service_area_center_lng)
        // so the index from the Commit 1 migration is actually usable,
        // then exact haversine distance computed client-side against each
        // contractor's OWN service_area_radius_miles.
        const { data: nearbyRows, error: nearbyError } = await baseQuery()
          .eq("coverage_type", "radius")
          .not("service_area_center_lat", "is", null)
          .not("service_area_center_lng", "is", null)
          .gte("service_area_center_lat", latitude - latDelta)
          .lte("service_area_center_lat", latitude + latDelta)
          .gte("service_area_center_lng", longitude - lngDelta)
          .lte("service_area_center_lng", longitude + lngDelta);
        if (nearbyError) throw nearbyError;

        for (const c of (nearbyRows ?? []) as Contractor[]) {
          if (c.service_area_center_lat == null || c.service_area_center_lng == null) continue;
          const distance = haversineMiles(latitude, longitude, c.service_area_center_lat, c.service_area_center_lng);
          const radius = c.service_area_radius_miles ?? 0;
          if (distance <= radius) {
            ranks.set(c.id, distance <= HOME_AREA_MILES ? 1 : 2);
            contractors.push(c);
          }
        }

        // 2. 'national' contractors always match — no geometry involved,
        // ranked below any real radius match.
        const { data: nationalRows, error: nationalError } = await baseQuery().eq("coverage_type", "national");
        if (nationalError) throw nationalError;
        for (const c of (nationalRows ?? []) as Contractor[]) {
          if (!ranks.has(c.id)) {
            ranks.set(c.id, 3);
            contractors.push(c);
          }
        }

        // 3. Anyone still without usable coordinates (NULL postcode or NULL
        // lat/lng) falls back to the original ILIKE substring match on
        // location — they must not disappear just because they haven't
        // geocoded yet.
        const sanitizedLocation = escapeILIKE(normalizedLocation.slice(0, 100));
        const { data: fallbackRows, error: fallbackError } = await baseQuery()
          .eq("coverage_type", "radius")
          .or("service_area_center_lat.is.null,service_area_center_lng.is.null,postcode.is.null")
          .ilike("location", `%${sanitizedLocation}%`);
        if (fallbackError) throw fallbackError;
        for (const c of (fallbackRows ?? []) as Contractor[]) {
          if (!ranks.has(c.id)) {
            ranks.set(c.id, 4);
            contractors.push(c);
          }
        }
      } else {
        // No resolvable postcode — either a place name, an empty search,
        // or a well-formed-but-unrecognised postcode. Identical ILIKE
        // substring behaviour to before this change, for every contractor
        // regardless of coverage_type or coordinates.
        let q = baseQuery();
        if (normalizedLocation.length > 0) {
          const sanitizedLocation = escapeILIKE(normalizedLocation.slice(0, 100));
          q = q.ilike("location", `%${sanitizedLocation}%`);
        }
        const { data, error } = await q;
        if (error) throw error;
        contractors = (data ?? []) as Contractor[];
      }

      // The branches above are constructed to be mutually exclusive per
      // contractor, but a belt-and-braces dedupe costs nothing.
      const seen = new Set<string>();
      contractors = contractors.filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));

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
      // here. Verification tier is a secondary, soft boost: it only breaks
      // ties when the composite comparison is otherwise equal.
      //
      // Location rank (set above) is now the PRIMARY sort key, but only on
      // the branch where a search point actually resolved — every
      // contractor on that branch has an entry in `ranks`. On the
      // no-location-search / ILIKE-only branch, `ranks` is empty for
      // everyone, so this comparison is always a tie and falls straight
      // through to the composite-score ordering, unchanged from before
      // this commit.
      if (contractors.length > 0) {
        const { data: scoreRows } = await supabase
          .from("contractor_scores")
          .select("contractor_id, composite_score")
          .in("contractor_id", contractors.map((c) => c.id));

        const compositeById = new Map((scoreRows ?? []).map((r) => [r.contractor_id, r.composite_score]));
        contractors.sort((a, b) => {
          const rankA = ranks.get(a.id);
          const rankB = ranks.get(b.id);
          if (rankA !== undefined || rankB !== undefined) {
            const ra = rankA ?? 5;
            const rb = rankB ?? 5;
            if (ra !== rb) return ra - rb;
          }

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
