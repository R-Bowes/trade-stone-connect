import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type CoverageKind = "national" | "group" | "site";

export interface CompanyMembership {
  companyId: string | null;
  isOwner: boolean;
  coverageKind: CoverageKind | null;
  coverageGroupId: string | null;
  coverageSiteId: string | null;
}

const EMPTY: CompanyMembership = {
  companyId: null,
  isOwner: false,
  coverageKind: null,
  coverageGroupId: null,
  coverageSiteId: null,
};

/**
 * The caller's company and coverage, resolved the same way as
 * BusinessDashboard.tsx's Phase 2 effect (owner, else active
 * business_members row). Does not handle pending invites — callers that
 * need that flow still go through BusinessDashboard directly.
 *
 * Not yet adopted by BusinessDashboard/BusinessLayout — they keep their
 * own inline resolution for now.
 */
export function useCompanyMembership(profileId: string | null) {
  const [membership, setMembership] = useState<CompanyMembership>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMembership = useCallback(async () => {
    if (!profileId) {
      setMembership(EMPTY);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const { data: ownerCompany, error: ownerError } = await supabase
      .from("companies")
      .select("id")
      .eq("owner_id", profileId)
      .limit(1)
      .maybeSingle();

    if (ownerError) {
      setError(ownerError.message);
      setMembership(EMPTY);
      setLoading(false);
      return;
    }

    if (ownerCompany) {
      setMembership({
        companyId: ownerCompany.id,
        isOwner: true,
        coverageKind: null,
        coverageGroupId: null,
        coverageSiteId: null,
      });
      setLoading(false);
      return;
    }

    const { data: memberRow, error: memberError } = await supabase
      .from("business_members")
      .select("company_id, coverage_kind, coverage_group_id, coverage_site_id")
      .eq("profile_id", profileId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    if (memberError) {
      setError(memberError.message);
      setMembership(EMPTY);
      setLoading(false);
      return;
    }

    if (memberRow) {
      setMembership({
        companyId: memberRow.company_id,
        isOwner: false,
        coverageKind: memberRow.coverage_kind as CoverageKind,
        coverageGroupId: memberRow.coverage_group_id,
        coverageSiteId: memberRow.coverage_site_id,
      });
      setLoading(false);
      return;
    }

    setMembership(EMPTY);
    setLoading(false);
  }, [profileId]);

  useEffect(() => {
    void fetchMembership();
  }, [fetchMembership]);

  return { ...membership, loading, error, refetch: fetchMembership };
}
