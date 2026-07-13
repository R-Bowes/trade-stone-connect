import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { TenderStatus, TenderType, BidVisibility } from "@/hooks/useTenders";

export type ContractorPipelineState =
  | "invited"
  | "drafting"
  | "submitted"
  | "won"
  | "not_selected"
  | "withdrawn"
  | "declined"
  | "invitation_withdrawn";

export interface ContractorTenderInvitation {
  id: string;
  status: string;
  viewed_at: string | null;
}

export interface ContractorTenderApplication {
  id: string;
  status: string;
}

export interface ContractorTenderRow {
  id: string;
  tender_number: string;
  title: string;
  tender_type: TenderType;
  status: TenderStatus;
  bid_visibility: BidVisibility;
  response_deadline: string | null;
  company_id: string;
  companyName: string | null;
  invitation: ContractorTenderInvitation | null;
  application: ContractorTenderApplication | null;
  pipelineState: ContractorPipelineState;
}

interface UseContractorTendersResult {
  tenders: ContractorTenderRow[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

// Derives the contractor-framed pipeline state from the raw invitation +
// application rows. An application, once it exists, always takes
// precedence over invitation status -- the invitation was just the door in.
function derivePipelineState(
  invitation: ContractorTenderInvitation | null,
  application: ContractorTenderApplication | null,
): ContractorPipelineState {
  if (application) {
    switch (application.status) {
      case "draft":
        return "drafting";
      case "submitted":
      case "shortlisted":
      case "reconfirm_requested":
        return "submitted";
      case "awarded":
        return "won";
      case "unsuccessful":
        return "not_selected";
      case "withdrawn":
        return "withdrawn";
      default:
        return "submitted";
    }
  }
  if (invitation) {
    switch (invitation.status) {
      case "declined":
        return "declined";
      case "withdrawn_by_business":
        return "invitation_withdrawn";
      default:
        return "invited";
    }
  }
  // Reachable only for an open-distribution tender the contractor applied
  // to directly (no invitation row) -- application is always non-null in
  // that path, so this default is a defensive fallback, not a real case.
  return "invited";
}

// The invited/applied list -- NOT "everything RLS lets this contractor see"
// (tenders_contractor_select also permits every open-distribution published
// tender platform-wide, per the locked query-layer trade-matching design).
// This hook intersects with the contractor's own tender_invitations and
// tender_applications rows so the pipeline only ever shows tenders the
// contractor actually has a stake in.
export function useContractorTenders(profileId: string | null): UseContractorTendersResult {
  const [tenders, setTenders] = useState<ContractorTenderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    if (!profileId) {
      setTenders([]);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      const [{ data: invitations, error: invError }, { data: applications, error: appError }] =
        await Promise.all([
          supabase
            .from("tender_invitations")
            .select("id, tender_id, status, viewed_at")
            .eq("contractor_id", profileId),
          supabase
            .from("tender_applications")
            .select("id, tender_id, status")
            .eq("contractor_id", profileId),
        ]);

      if (cancelled) return;

      if (invError || appError) {
        setError((invError ?? appError)!.message);
        setLoading(false);
        return;
      }

      const invitationByTenderId = new Map((invitations ?? []).map((i) => [i.tender_id, i]));
      const applicationByTenderId = new Map((applications ?? []).map((a) => [a.tender_id, a]));

      const tenderIds = Array.from(
        new Set([...invitationByTenderId.keys(), ...applicationByTenderId.keys()]),
      );

      if (tenderIds.length === 0) {
        setTenders([]);
        setLoading(false);
        return;
      }

      const { data: tenderRows, error: tenderError } = await supabase
        .from("tenders")
        .select("id, tender_number, title, tender_type, status, bid_visibility, response_deadline, company_id")
        .in("id", tenderIds);

      if (cancelled) return;

      if (tenderError) {
        setError(tenderError.message);
        setLoading(false);
        return;
      }

      const companyIds = Array.from(new Set((tenderRows ?? []).map((t) => t.company_id)));
      const { data: companyRows } = companyIds.length
        ? await supabase.from("companies").select("id, name").in("id", companyIds)
        : { data: [] };

      if (cancelled) return;

      const companyNameById = new Map((companyRows ?? []).map((c) => [c.id, c.name as string]));

      const rows: ContractorTenderRow[] = (tenderRows ?? []).map((t) => {
        const invitation = invitationByTenderId.get(t.id) ?? null;
        const application = applicationByTenderId.get(t.id) ?? null;
        return {
          ...t,
          companyName: companyNameById.get(t.company_id) ?? null,
          invitation,
          application,
          pipelineState: derivePipelineState(invitation, application),
        };
      });

      // Newest activity first: response deadline soonest for anything still
      // live, otherwise most recently touched. Simpler and good enough for
      // this slice -- just sort by response_deadline ascending, nulls last.
      rows.sort((a, b) => {
        if (!a.response_deadline && !b.response_deadline) return 0;
        if (!a.response_deadline) return 1;
        if (!b.response_deadline) return -1;
        return a.response_deadline.localeCompare(b.response_deadline);
      });

      setTenders(rows);
      setLoading(false);
    };

    load();
    return () => { cancelled = true; };
  }, [profileId, reloadKey]);

  return { tenders, loading, error, reload };
}
