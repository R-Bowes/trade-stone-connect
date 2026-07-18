import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { presentState } from "@/lib/statusPresenter";
import { TONE_BADGE_CLASS } from "@/lib/presenterStyles";

interface ActionRow {
  key: string;
  title: string;
  contractorName: string | null;
  contractorCode: string | null;
  sinceIso: string;
  label: string;
  toneClass: string;
}

interface RawQuote {
  id: string;
  title: string | null;
  contractor_id: string;
  status: string;
  recipient_response: string | null;
  deposit_required: boolean | null;
  deposit_paid: boolean | null;
  sent_at: string | null;
  created_at: string;
}

/**
 * B6 — everything currently waiting on this business user, one click from
 * its action: quotes to review, deposits to pay, dates to confirm or
 * counter. Kills the hunt-through-Approvals problem by surfacing it on the
 * dashboard home instead of requiring a visit to the Approvals tab just to
 * discover something needs a response.
 */
export function BusinessNeedsYourAction({ profileId }: { profileId: string }) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<ActionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);

      const { data: quotesData } = await supabase
        .from("issued_quotes")
        .select("id, title, contractor_id, status, recipient_response, deposit_required, deposit_paid, sent_at, created_at")
        .eq("recipient_id", profileId)
        .order("created_at", { ascending: false });

      const quotes = (quotesData as RawQuote[]) ?? [];
      const contractorIds = [...new Set(quotes.map((q) => q.contractor_id).filter(Boolean))];

      const { data: contractorProfiles } = contractorIds.length
        ? await supabase
            .from("public_pro_profiles")
            .select("user_id, full_name, company_name, ts_profile_code")
            .in("user_id", contractorIds)
        : { data: [] as { user_id: string; full_name: string | null; company_name: string | null; ts_profile_code: string | null }[] };

      const contractorMap = new Map((contractorProfiles ?? []).map((p) => [p.user_id, p]));
      const nameFor = (contractorId: string) => {
        const p = contractorMap.get(contractorId);
        return { name: p?.company_name ?? p?.full_name ?? null, code: p?.ts_profile_code ?? null };
      };

      const out: ActionRow[] = [];

      for (const q of quotes) {
        if (q.status === "sent" && !q.recipient_response) {
          const result = presentState({ kind: "quote", status: "sent", viewed: false }, "recipient");
          const { name, code } = nameFor(q.contractor_id);
          out.push({
            key: `quote:${q.id}`,
            title: q.title ?? "Quote",
            contractorName: name,
            contractorCode: code,
            sinceIso: q.sent_at ?? q.created_at,
            label: result.label,
            toneClass: TONE_BADGE_CLASS[result.tone],
          });
        } else if (q.recipient_response === "accepted" && q.deposit_required && !q.deposit_paid) {
          const result = presentState(
            { kind: "quote", status: "accepted", depositRequired: true, depositPaid: false },
            "recipient",
          );
          const { name, code } = nameFor(q.contractor_id);
          out.push({
            key: `deposit:${q.id}`,
            title: q.title ?? "Quote",
            contractorName: name,
            contractorCode: code,
            sinceIso: q.created_at,
            label: result.label,
            toneClass: TONE_BADGE_CLASS[result.tone],
          });
        }
      }

      // Scheduling proposals from the contractor still awaiting this
      // customer's response — the pending-slot case B6 explicitly wants
      // surfaced alongside quotes and deposits.
      const quoteIds = quotes.map((q) => q.id);
      if (quoteIds.length) {
        const { data: events } = await supabase
          .from("schedule_events")
          .select("id, quote_id, created_at")
          .in("quote_id", quoteIds)
          .eq("event_type", "quote_proposal")
          .eq("status", "proposed")
          .eq("is_confirmed", false)
          .neq("proposed_by", profileId);

        const quoteById = new Map(quotes.map((q) => [q.id, q]));
        for (const e of events ?? []) {
          const q = quoteById.get(e.quote_id);
          if (!q) continue;
          const result = presentState({ kind: "scheduling", substate: "pending", proposedByViewer: false }, "recipient");
          const { name, code } = nameFor(q.contractor_id);
          out.push({
            key: `schedule:${e.id}`,
            title: q.title ?? "Quote",
            contractorName: name,
            contractorCode: code,
            sinceIso: e.created_at,
            label: result.label,
            toneClass: TONE_BADGE_CLASS[result.tone],
          });
        }
      }

      out.sort((a, b) => new Date(a.sinceIso).getTime() - new Date(b.sinceIso).getTime());
      if (!cancelled) {
        setRows(out);
        setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [profileId]);

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (rows.length === 0) return null;

  return (
    <Card className="border-amber-200">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Needs your action</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {rows.map((row) => (
          <button
            key={row.key}
            onClick={() => navigate("/dashboard/business?view=approvals")}
            className="w-full flex items-center justify-between gap-4 py-2 border-b last:border-0 text-left hover:bg-muted/40 rounded px-2 -mx-2 transition-colors"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{row.title}</p>
              <p className="text-xs text-muted-foreground truncate">
                {[row.contractorName, row.contractorCode].filter(Boolean).join(" · ")}
                {row.contractorName || row.contractorCode ? " · " : ""}
                {formatDistanceToNow(new Date(row.sinceIso), { addSuffix: true })}
              </p>
            </div>
            <Badge className={`shrink-0 ${row.toneClass}`}>{row.label}</Badge>
          </button>
        ))}
      </CardContent>
    </Card>
  );
}
