import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { useContractorTenders, type ContractorTenderRow, type ContractorPipelineState } from "@/hooks/useContractorTenders";

interface Props {
  profileId: string;
  onOpenTender: (tenderId: string) => void;
}

const STATE_LABEL: Record<ContractorPipelineState, string> = {
  invited: "Invited",
  drafting: "Drafting",
  submitted: "Submitted",
  won: "Won",
  not_selected: "Not selected",
  withdrawn: "Withdrawn",
  declined: "Declined",
  invitation_withdrawn: "Invitation withdrawn",
};

const STATE_COLOUR: Record<ContractorPipelineState, string> = {
  invited: "bg-blue-100 text-blue-800",
  drafting: "bg-amber-100 text-amber-800",
  submitted: "bg-purple-100 text-purple-800",
  won: "bg-green-100 text-green-800",
  not_selected: "bg-gray-100 text-gray-500",
  withdrawn: "bg-gray-100 text-gray-500",
  declined: "bg-gray-100 text-gray-500",
  invitation_withdrawn: "bg-gray-100 text-gray-500",
};

// Terminal, dead-end states rendered muted -- same convention as
// BusinessTendersView's MUTED_STATUSES.
const MUTED_STATES: ContractorPipelineState[] = ["not_selected", "withdrawn", "declined", "invitation_withdrawn"];

type MetricKey = "actionNeeded" | "submitted" | "won" | "lost";

// Exhaustive switch (not if/else) so a future pipeline state fails loudly
// via TS rather than silently falling through to a generic label.
function rowActionLabel(t: ContractorTenderRow): string {
  switch (t.pipelineState) {
    case "invited":
      return "Review invitation";
    case "drafting":
      return "Continue application";
    case "submitted":
      return t.application?.status === "reconfirm_requested" ? "Reconfirm needed" : "View application";
    case "won":
      return "View award";
    case "not_selected":
    case "withdrawn":
    case "declined":
    case "invitation_withdrawn":
      return "View";
  }
}

export function ContractorTendersPipeline({ profileId, onOpenTender }: Props) {
  const { tenders, loading, error } = useContractorTenders(profileId);
  const [activeMetric, setActiveMetric] = useState<MetricKey | null>(null);

  const metrics = useMemo(() => {
    const actionNeeded = tenders.filter(
      (t) => t.pipelineState === "invited" || t.pipelineState === "drafting" || t.application?.status === "reconfirm_requested",
    ).length;
    const submitted = tenders.filter((t) => t.pipelineState === "submitted").length;
    const won = tenders.filter((t) => t.pipelineState === "won").length;
    const lost = tenders.filter((t) => t.pipelineState === "not_selected").length;
    return { actionNeeded, submitted, won, lost };
  }, [tenders]);

  const METRIC_CARDS: { key: MetricKey; label: string; value: number; icon: string; colour: string }[] = [
    { key: "actionNeeded", label: "Action needed", value: metrics.actionNeeded, icon: "ti-alert-circle", colour: metrics.actionNeeded > 0 ? "#c2410c" : "#1a2744" },
    { key: "submitted", label: "Submitted", value: metrics.submitted, icon: "ti-send", colour: "#1a2744" },
    { key: "won", label: "Won", value: metrics.won, icon: "ti-circle-check", colour: "#15803d" },
    { key: "lost", label: "Not selected", value: metrics.lost, icon: "ti-circle-x", colour: "#1a2744" },
  ];

  const METRIC_FILTER: Record<MetricKey, (t: ContractorTenderRow) => boolean> = {
    actionNeeded: (t) => t.pipelineState === "invited" || t.pipelineState === "drafting" || t.application?.status === "reconfirm_requested",
    submitted: (t) => t.pipelineState === "submitted",
    won: (t) => t.pipelineState === "won",
    lost: (t) => t.pipelineState === "not_selected",
  };

  const visibleTenders = activeMetric ? tenders.filter(METRIC_FILTER[activeMetric]) : tenders;

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
      <p className="text-sm text-muted-foreground">
        {tenders.length} tender{tenders.length === 1 ? "" : "s"}
      </p>

      {tenders.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <i className="ti ti-gavel text-4xl text-muted-foreground mb-4 block" />
            <h3 className="text-lg font-medium mb-2">No tenders yet</h3>
            <p className="text-muted-foreground">
              Tenders you're invited to bid on, or apply to directly, will appear here.
            </p>
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
                    const muted = MUTED_STATES.includes(t.pipelineState);
                    return (
                      <button
                        key={t.id}
                        onClick={() => onOpenTender(t.id)}
                        className={`w-full flex items-center justify-between gap-4 py-3 px-6 border-b last:border-0 text-left hover:bg-muted/40 transition-colors ${muted ? "opacity-60" : ""}`}
                      >
                        <div className="min-w-0 flex items-center gap-3">
                          <span className="font-mono text-xs text-muted-foreground shrink-0">
                            {t.tender_number}
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-medium truncate">{t.title}</p>
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATE_COLOUR[t.pipelineState]}`}>
                                {STATE_LABEL[t.pipelineState]}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {t.companyName ?? "Unknown business"}
                              {t.response_deadline && (
                                <> · Closes {format(new Date(t.response_deadline), "d MMM yyyy")}</>
                              )}
                            </p>
                          </div>
                        </div>
                        <span
                          className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-md ${
                            muted ? "border border-border text-muted-foreground" : "bg-[#1a2744] text-white"
                          }`}
                        >
                          {rowActionLabel(t)}
                        </span>
                      </button>
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
