import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { useContractorTenders, type ContractorTenderRow, type ContractorPipelineState } from "@/hooks/useContractorTenders";

interface Props {
  profileId: string;
  onOpenTender: (tenderId: string) => void;
}

function assertNever(x: never): never {
  throw new Error(`ContractorTendersPipeline: unhandled value ${JSON.stringify(x)}`);
}

// "submitted" reads differently depending on what the tender itself is
// doing -- still sealed and waiting, vs already closed and being reviewed
// -- so the label is derived per-row, not a flat lookup.
function stateLabel(t: ContractorTenderRow): string {
  switch (t.pipelineState) {
    case "invited":
      return "Invited";
    case "drafting":
      return "Drafting";
    case "submitted":
      if (t.status === "published") {
        return t.response_deadline
          ? `Submitted: sealed until ${format(new Date(t.response_deadline), "d MMM yyyy")}`
          : "Submitted: sealed";
      }
      return "Submitted: under review";
    case "won":
      return "Won";
    case "not_selected":
      return "Not selected";
    case "withdrawn":
      return "Withdrawn";
    case "declined":
      return "Declined";
    case "invitation_withdrawn":
      return "Invitation withdrawn";
    case "closed_not_submitted":
      return "Closed: not submitted";
    case "cancelled":
      return t.cancelled_reason ? `Cancelled: ${t.cancelled_reason}` : "Cancelled";
    default:
      return assertNever(t.pipelineState);
  }
}

const STATE_COLOUR: Record<ContractorPipelineState, string> = {
  invited: "bg-blue-100 text-blue-800",
  drafting: "bg-amber-100 text-amber-800",
  submitted: "bg-purple-100 text-purple-800",
  won: "bg-green-100 text-green-800",
  not_selected: "bg-gray-100 text-gray-500",
  withdrawn: "bg-gray-100 text-gray-500",
  declined: "bg-gray-100 text-gray-500",
  invitation_withdrawn: "bg-gray-100 text-gray-500",
  closed_not_submitted: "bg-gray-100 text-gray-500",
  cancelled: "bg-gray-100 text-gray-500",
};

// Terminal, dead-end states rendered muted -- same convention as
// BusinessTendersView's MUTED_STATUSES.
const MUTED_STATES: ContractorPipelineState[] = [
  "not_selected",
  "withdrawn",
  "declined",
  "invitation_withdrawn",
  "closed_not_submitted",
  "cancelled",
];

type MetricKey = "actionNeeded" | "submitted" | "won" | "lost";

// Action needed = invited or drafting on a published tender before its
// deadline. Nothing else -- in particular, not reconfirm_requested
// (that's a live "submitted" state, not an open door).
function isActionNeeded(t: ContractorTenderRow): boolean {
  if (t.pipelineState !== "invited" && t.pipelineState !== "drafting") return false;
  if (t.status !== "published") return false;
  if (t.response_deadline && new Date(t.response_deadline) <= new Date()) return false;
  return true;
}

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
    case "closed_not_submitted":
    case "cancelled":
      return "View";
    default:
      return assertNever(t.pipelineState);
  }
}

export function ContractorTendersPipeline({ profileId, onOpenTender }: Props) {
  const { tenders, loading, error } = useContractorTenders(profileId);
  const [activeMetric, setActiveMetric] = useState<MetricKey | null>(null);

  const metrics = useMemo(() => {
    const actionNeeded = tenders.filter(isActionNeeded).length;
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
    actionNeeded: isActionNeeded,
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
                                {stateLabel(t)}
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
