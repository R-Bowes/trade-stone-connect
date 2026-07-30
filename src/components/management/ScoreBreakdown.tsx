import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { useContractorScoreBreakdown, type CraftBreakdown, type ServiceBreakdown, type ValueBreakdown } from "@/hooks/useContractorScoreBreakdown";
import { computeTrend, type ScoreConfidence, type ScoreTrend } from "@/lib/scoring";
import { ScoreGauge } from "@/components/scoring/ScoreGauge";

const NAVY = "#1a2744";
const ORANGE = "#f07820";

function TrendBadge({ trend }: { trend: ScoreTrend }) {
  if (trend === "new") {
    return <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">New</span>;
  }
  const config = {
    up: { icon: "ti-trending-up", color: "#16a34a", label: "Improving" },
    down: { icon: "ti-trending-down", color: "#dc2626", label: "Declining" },
    stable: { icon: "ti-minus", color: "#6b7280", label: "Stable" },
  }[trend];
  return (
    <span className="text-xs font-medium px-2 py-0.5 rounded-full flex items-center gap-1" style={{ color: config.color, background: `${config.color}14` }}>
      <i className={`ti ${config.icon}`} style={{ fontSize: 13 }} />
      {config.label}
    </span>
  );
}

function ConfidenceNote({ confidence }: { confidence: ScoreConfidence | null }) {
  if (confidence === "provisional") {
    return <p className="text-xs font-serif text-muted-foreground mt-1">Based on limited data — this score will become more stable as you complete more jobs.</p>;
  }
  if (confidence === "building" || !confidence) {
    return <p className="text-xs font-serif text-muted-foreground mt-1">Complete more jobs to generate your score.</p>;
  }
  return null;
}

function fraction(n: number, d: number): string {
  if (d === 0) return "—";
  return `${n} of ${d} (${Math.round((n / d) * 100)}%)`;
}

function craftGuidance(b: CraftBreakdown): string {
  if (b.completedJobCount === 0) return "Complete more jobs to build your scores. Every completed job adds data.";
  if (b.completedJobCount > 0 && b.photoDocumentedJobs / b.completedJobCount < 0.5) {
    return "Your photo documentation is low — uploading before/during/after photos on each job will strengthen your Craft score.";
  }
  if (b.warrantyTotal > 0 && b.warrantyHonoured / b.warrantyTotal < 0.8) {
    return "Resolving callbacks without an additional charge builds trust and directly strengthens your Craft score.";
  }
  if (b.timerWindowsTotal > 0 && b.timerWindowsClear / b.timerWindowsTotal >= 0.9 && b.photoDocumentedJobs / Math.max(b.completedJobCount, 1) >= 0.5) {
    return "Your scores are strong across the board — keep it up.";
  }
  return "Consistent, well-documented completions with no callbacks are what move this score fastest.";
}

function serviceGuidance(b: ServiceBreakdown): string {
  if (b.reviewCount === 0) return "No reviews yet — your Service score will appear once clients review your work.";
  const avgAll = [b.avgCommunication, b.avgReliability, b.avgPropertyRespect, b.avgExpectationManagement].filter((v): v is number => v !== null);
  const weakest = avgAll.length ? Math.min(...avgAll) : null;
  if (weakest !== null && weakest < 2) {
    return "A few reviews flagged room to improve — clear, timely communication is the single biggest lever on this score.";
  }
  if (b.acceptedJobCount > 0 && b.cancelledJobCount / b.acceptedJobCount > 0.15) {
    return "Your cancellation rate is higher than ideal — cancelling after acceptance is a strong negative signal for this score.";
  }
  return "Your scores are strong across the board — keep it up.";
}

function valueGuidance(b: ValueBreakdown): string {
  if (b.sampleSize === 0) return "Complete more jobs to build your scores. Every completed job adds data.";
  if (b.avgVariancePct !== null && b.avgVariancePct > 15) {
    return "Your quote-to-invoice variance is higher than average — tighter scoping or documenting agreed changes will improve your Value score.";
  }
  if (b.transparencyTotal > 0 && b.transparencyYes / b.transparencyTotal < 0.8) {
    return "Explaining costs clearly before work begins is a quick win for this score.";
  }
  return "Your scores are strong across the board — keep it up.";
}

function ScoreCard({
  title, description, score, confidence, trend, children, guidance,
}: {
  title: string;
  description: string;
  score: number | null;
  confidence: ScoreConfidence | null;
  trend: ScoreTrend;
  children: React.ReactNode;
  guidance: string;
}) {
  const isNumeric = confidence !== "building" && score !== null;
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base font-semibold" style={{ fontWeight: 600 }}>{title}</CardTitle>
            <CardDescription className="font-serif text-xs mt-0.5">{description}</CardDescription>
          </div>
          <TrendBadge trend={trend} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="flex items-baseline justify-between mb-1.5">
            {isNumeric ? (
              <span className="font-mono text-3xl font-bold" style={{ color: confidence === "established" ? ORANGE : NAVY }}>
                {score!.toFixed(1)}<span className="text-base text-muted-foreground">/10</span>
              </span>
            ) : (
              <span className="text-sm font-semibold" style={{ color: NAVY }}>Building</span>
            )}
            {confidence === "provisional" && <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: NAVY }}>Provisional</span>}
          </div>
          <ScoreGauge score={score} confidence={confidence} />
          <ConfidenceNote confidence={confidence} />
        </div>

        <div className="space-y-1.5 text-sm border-t pt-3">
          {children}
        </div>

        <div className="text-xs font-serif rounded-md p-2.5" style={{ background: "#fff4eb", color: "#7c3a0e" }}>
          {guidance}
        </div>
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono font-medium" style={{ color: NAVY }}>{value}</span>
    </div>
  );
}

export function ScoreBreakdown() {
  const { loading, scores, history, craft, service, value } = useContractorScoreBreakdown();

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  const noJobsAtAll = (craft?.completedJobCount ?? 0) === 0 && (service?.acceptedJobCount ?? 0) === 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold" style={{ color: NAVY }}>My Scores</h2>
        <p className="text-sm font-serif text-muted-foreground mt-1">
          TradeStone's three-score system — Craft, Service, and Value are assessed independently, by whoever is actually qualified to judge each dimension.
        </p>
      </div>

      {noJobsAtAll && (
        <Card>
          <CardContent className="p-6 text-center">
            <i className="ti ti-chart-bar" style={{ fontSize: 28, color: "#9ca3af" }} />
            <p className="font-semibold mt-2" style={{ color: NAVY }}>Complete your first job to start building your scores</p>
            <p className="text-sm font-serif text-muted-foreground mt-1">Every dimension below activates as evidence accumulates — nothing is scored on guesswork.</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {craft && (
          <ScoreCard
            title="Craft"
            description="Quality of the work itself — never rated by clients."
            score={scores?.craft_score ?? null}
            confidence={scores?.craft_confidence ?? null}
            trend={computeTrend(scores?.craft_score ?? null, history, "craft")}
            guidance={craftGuidance(craft)}
          >
            <Row label="90-day clear windows" value={fraction(craft.timerWindowsClear, craft.timerWindowsTotal)} />
            {craft.inspectionTotal > 0 && <Row label="Inspections passed first time" value={fraction(craft.inspectionPassed, craft.inspectionTotal)} />}
            <Row label="Callbacks" value={`${craft.callbackCount} on ${craft.completedJobCount} completed job${craft.completedJobCount === 1 ? "" : "s"}`} />
            {craft.warrantyTotal > 0 && <Row label="Warranty honoured (no charge)" value={fraction(craft.warrantyHonoured, craft.warrantyTotal)} />}
            <Row label="Peer endorsements" value={`${craft.endorsementCount} from verified contractors`} />
            <Row label="Photo documentation" value={fraction(craft.photoDocumentedJobs, craft.completedJobCount)} />
          </ScoreCard>
        )}

        {service && (
          <ScoreCard
            title="Service"
            description="Communication, reliability, professionalism — rated by clients."
            score={scores?.service_score ?? null}
            confidence={scores?.service_confidence ?? null}
            trend={computeTrend(scores?.service_score ?? null, history, "service")}
            guidance={serviceGuidance(service)}
          >
            <Row label="Communication" value={service.avgCommunication !== null ? `${service.avgCommunication.toFixed(1)}/3` : "—"} />
            <Row label="Reliability" value={service.avgReliability !== null ? `${service.avgReliability.toFixed(1)}/3` : "—"} />
            <Row label="Respect for property" value={service.avgPropertyRespect !== null ? `${service.avgPropertyRespect.toFixed(1)}/3` : "—"} />
            <Row label="Expectation management" value={service.avgExpectationManagement !== null ? `${service.avgExpectationManagement.toFixed(1)}/3` : "—"} />
            <Row label="Jobs completed" value={fraction(service.completedJobCount, service.acceptedJobCount)} />
            <Row label="Cancellations" value={`${service.cancelledJobCount}`} />
            <Row label="Reviews" value={`Based on ${service.reviewCount} review${service.reviewCount === 1 ? "" : "s"}`} />
          </ScoreCard>
        )}

        {value && (
          <ScoreCard
            title="Value"
            description="Pricing transparency — not whether you're cheap."
            score={scores?.value_score ?? null}
            confidence={scores?.value_confidence ?? null}
            trend={computeTrend(scores?.value_score ?? null, history, "value")}
            guidance={valueGuidance(value)}
          >
            <Row label="Quote-to-invoice variance" value={value.avgVariancePct !== null ? `${value.avgVariancePct.toFixed(1)}% average difference` : "—"} />
            <Row label="Costs communicated clearly" value={fraction(value.transparencyYes, value.transparencyTotal)} />
            <Row label="Jobs with quote + invoice" value={`${value.sampleSize}`} />
          </ScoreCard>
        )}
      </div>
    </div>
  );
}
