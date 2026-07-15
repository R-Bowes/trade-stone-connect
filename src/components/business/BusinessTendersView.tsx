import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Plus } from "lucide-react";
import { useTenders, type TenderRow } from "@/hooks/useTenders";
import { STATUS_LABEL, STATUS_COLOUR, TYPE_LABEL, MUTED_STATUSES } from "@/lib/tenderStatus";

interface Props {
  companyId: string;
}

type MetricKey = "open" | "awaitingUnseal" | "drafts" | "awarded";

export function BusinessTendersView({ companyId }: Props) {
  const navigate = useNavigate();
  const { tenders, loading, error } = useTenders(companyId);
  const [activeMetric, setActiveMetric] = useState<MetricKey | null>(null);

  // New tender (no ?tender=) and Continue on a draft (?tender=<id>) both
  // route to the real essentials form. Every other non-draft status now
  // routes to the real read-only detail view (BusinessTenderDetail) instead
  // of the generic stub -- the stub itself is still reachable, but only via
  // the detail view's own "Unseal"/"Review bids" links for closed/unsealed,
  // since those actions (not the read-only summary) are still unbuilt.
  const goNewTender = () => navigate("/dashboard/business?view=tender-form");
  const goContinueDraft = (tenderId: string) =>
    navigate(`/dashboard/business?view=tender-form&tender=${tenderId}`);
  const goDetail = (tenderId: string) =>
    navigate(`/dashboard/business?view=tender-detail&tender=${tenderId}`);

  const metrics = useMemo(() => {
    const drafts = tenders.filter((t) => t.status === "draft").length;
    // "Open" = published + closed + unsealed: everything past draft that
    // hasn't reached a terminal state, per the confirmed grouping. Closed
    // is deliberately counted in BOTH Open and Awaiting unseal — they
    // answer different questions ("what's live" vs "what needs my action
    // right now"), not mutually exclusive buckets.
    const open = tenders.filter((t) => ["published", "closed", "unsealed"].includes(t.status)).length;
    const awaitingUnseal = tenders.filter((t) => t.status === "closed").length;
    const awarded = tenders.filter((t) => t.status === "awarded").length;
    return { drafts, open, awaitingUnseal, awarded };
  }, [tenders]);

  const METRIC_CARDS: { key: MetricKey; label: string; value: number; icon: string; colour: string }[] = [
    { key: "open", label: "Open", value: metrics.open, icon: "ti-clock-play", colour: "#1a2744" },
    { key: "awaitingUnseal", label: "Awaiting unseal", value: metrics.awaitingUnseal, icon: "ti-lock-open", colour: metrics.awaitingUnseal > 0 ? "#c2410c" : "#1a2744" },
    { key: "drafts", label: "Drafts", value: metrics.drafts, icon: "ti-file-pencil", colour: "#1a2744" },
    { key: "awarded", label: "Awarded", value: metrics.awarded, icon: "ti-circle-check", colour: "#15803d" },
  ];

  const METRIC_FILTER: Record<MetricKey, TenderStatus[]> = {
    open: ["published", "closed", "unsealed"],
    awaitingUnseal: ["closed"],
    drafts: ["draft"],
    awarded: ["awarded"],
  };

  const visibleTenders = activeMetric
    ? tenders.filter((t) => METRIC_FILTER[activeMetric].includes(t.status))
    : tenders;

  const rowAction = (t: TenderRow): { label: string; muted: boolean } => {
    switch (t.status) {
      case "draft":
        return { label: "Continue", muted: false };
      case "published":
        if (t.bid_visibility === "open") {
          const n = t.bidCount ?? 0;
          return { label: `${n} response${n === 1 ? "" : "s"} so far`, muted: false };
        }
        return { label: `${t.bidCount ?? 0} of ${t.invitedCount ?? 0}`, muted: true };
      case "closed":
        return { label: `Unseal · ${t.bidCount ?? 0} bid${(t.bidCount ?? 0) === 1 ? "" : "s"}`, muted: false };
      case "unsealed":
        return { label: `Review ${t.bidCount ?? 0} bid${(t.bidCount ?? 0) === 1 ? "" : "s"}`, muted: false };
      case "awarded":
        return { label: t.tender_type === "term" ? "View engagement" : "View job", muted: false };
      case "cancelled":
      case "lapsed":
        return { label: "View", muted: true };
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <p className="text-sm text-red-600">Unable to load tenders: {error}</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {tenders.length} tender{tenders.length === 1 ? "" : "s"}
        </p>
        <Button onClick={goNewTender} className="gap-2">
          <Plus className="h-4 w-4" />
          New tender
        </Button>
      </div>

      {tenders.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <i className="ti ti-gavel text-4xl text-muted-foreground mb-4 block" />
            <h3 className="text-lg font-medium mb-2">No tenders yet</h3>
            <p className="text-muted-foreground mb-6">Post your first tender to start finding contractors.</p>
            <Button onClick={goNewTender} className="gap-2">
              <Plus className="h-4 w-4" />
              Post your first tender
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Metric strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {METRIC_CARDS.map((card) => (
              <button
                key={card.key}
                onClick={() => setActiveMetric((cur) => (cur === card.key ? null : card.key))}
                className="text-left w-full"
              >
                <Card
                  className="hover:shadow-md transition-shadow h-full"
                  style={activeMetric === card.key ? { borderColor: "#f07820", borderWidth: 2 } : undefined}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <i className={`ti ${card.icon}`} style={{ fontSize: 18, color: card.colour }} />
                      <span className="text-xs text-muted-foreground font-medium">{card.label}</span>
                    </div>
                    <div className="text-2xl font-bold font-mono" style={{ color: card.colour }}>
                      {card.value}
                    </div>
                  </CardContent>
                </Card>
              </button>
            ))}
          </div>

          {/* Rows */}
          <Card>
            <CardContent className="p-0">
              {visibleTenders.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No tenders in this state.</p>
              ) : (
                <div>
                  {visibleTenders.map((t) => {
                    const action = rowAction(t);
                    const muted = MUTED_STATUSES.includes(t.status);
                    return (
                      <div
                        key={t.id}
                        className={`flex items-center justify-between gap-4 py-3 px-6 border-b last:border-0 ${muted ? "opacity-60" : ""}`}
                      >
                        <div className="min-w-0 flex items-center gap-3">
                          <span className="font-mono text-xs text-muted-foreground shrink-0">
                            {t.tender_number}
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-medium truncate">{t.title}</p>
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLOUR[t.status]}`}>
                                {STATUS_LABEL[t.status]}
                              </span>
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border border-border text-muted-foreground">
                                {TYPE_LABEL[t.tender_type]}
                              </span>
                            </div>
                            {t.status === "lapsed" && (
                              <p className="text-xs text-muted-foreground mt-0.5">No bids received</p>
                            )}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant={action.muted ? "outline" : "default"}
                          onClick={() => (t.status === "draft" ? goContinueDraft(t.id) : goDetail(t.id))}
                          className="shrink-0"
                        >
                          {action.label}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
