import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type TenderStatus = "draft" | "published" | "closed" | "unsealed" | "awarded" | "cancelled" | "lapsed";
export type TenderType = "works" | "term";
export type BidVisibility = "sealed" | "open";

export interface TenderRow {
  id: string;
  tender_number: string;
  title: string;
  tender_type: TenderType;
  status: TenderStatus;
  bid_visibility: BidVisibility;
  distribution: "invite" | "open";
  response_deadline: string | null;
  created_at: string;
  // Bid count, sourced from the sanctioned tender_application_received_count()
  // RPC — never a raw row count. Sealed applications are genuinely invisible
  // pre-unseal (TENDERING-SCHEMA.md chunk 4's "N of M received" rule); the RPC
  // is the only path that returns a correct number for a sealed tender.
  // null = not applicable to this status (draft/awarded/cancelled/lapsed) or
  // not yet loaded.
  bidCount: number | null;
  // Invited count, only populated for published+sealed rows (the "N of M"
  // case). tender_invitations is not sealed — a plain count is fine.
  invitedCount: number | null;
}

interface UseTendersResult {
  tenders: TenderRow[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

// Only these statuses ever need a bid count fetched — draft/awarded/
// cancelled/lapsed rows don't show one.
const COUNT_NEEDED_STATUSES: TenderStatus[] = ["published", "closed", "unsealed"];

export function useTenders(companyId: string | null): UseTendersResult {
  const [tenders, setTenders] = useState<TenderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    if (!companyId) {
      setTenders([]);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from("tenders")
        .select("id, tender_number, title, tender_type, status, bid_visibility, distribution, response_deadline, created_at")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });

      if (cancelled) return;

      if (fetchError) {
        setError(fetchError.message);
        setLoading(false);
        return;
      }

      const rows = (data ?? []) as Omit<TenderRow, "bidCount" | "invitedCount">[];

      const needCount = rows.filter((t) => COUNT_NEEDED_STATUSES.includes(t.status));
      const countEntries = await Promise.all(
        needCount.map(async (t) => {
          const { data: count } = await supabase.rpc("tender_application_received_count", {
            p_tender_id: t.id,
          });
          return [t.id, (count as number | null) ?? null] as const;
        }),
      );
      const countMap = new Map(countEntries);

      const sealedPublishedIds = rows
        .filter((t) => t.status === "published" && t.bid_visibility === "sealed")
        .map((t) => t.id);

      let invitedMap = new Map<string, number>();
      if (sealedPublishedIds.length) {
        const { data: invites } = await supabase
          .from("tender_invitations")
          .select("tender_id")
          .in("tender_id", sealedPublishedIds);
        invitedMap = (invites ?? []).reduce((map, row) => {
          map.set(row.tender_id, (map.get(row.tender_id) ?? 0) + 1);
          return map;
        }, new Map<string, number>());
      }

      if (cancelled) return;

      setTenders(
        rows.map((t) => ({
          ...t,
          bidCount: countMap.get(t.id) ?? null,
          invitedCount: invitedMap.get(t.id) ?? null,
        })),
      );
      setLoading(false);
    };

    load();
    return () => { cancelled = true; };
  }, [companyId, reloadKey]);

  return { tenders, loading, error, reload };
}
