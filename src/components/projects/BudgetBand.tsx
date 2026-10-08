import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { ProjectJob, ProjectPackage } from "@/hooks/useProjectDetail";
import { jobMoney, type ProjectInvoice } from "@/lib/projectMoney";
import { formatGBP } from "@/lib/formatGBP";

type Props = {
  budget: number | null;
  packages: ProjectPackage[];
  jobs: Record<string, ProjectJob>;
  invoices: ProjectInvoice[];
  onEditProject: () => void;
};

// Each segment has its own fill AND pattern, and is always named in the
// legend with its figure, so nothing relies on colour alone.
const SEGMENT_STYLE = {
  paid: { className: "bg-green-600", style: {} as React.CSSProperties },
  toPay: {
    className: "bg-[#f07820]",
    style: {
      backgroundImage: "repeating-linear-gradient(45deg, rgba(255,255,255,0.35) 0 4px, transparent 4px 8px)",
    } as React.CSSProperties,
  },
  left: { className: "bg-background border border-dashed border-muted-foreground/60", style: {} as React.CSSProperties },
};

/** Width as a percentage of the bar, with a sliver kept visible for any non-zero amount. */
function widthPct(amount: number, scale: number): string {
  if (amount <= 0 || scale <= 0) return "0%";
  return `max(${((amount / scale) * 100).toFixed(4)}%, 4px)`;
}

/**
 * Budget band: paid, agreed still to pay, and left to commit, from the jobs
 * attached to the project's packages. Read-only.
 */
export function BudgetBand({ budget, packages, jobs, invoices, onEditProject }: Props) {
  const attached = packages
    .map((p) => (p.job_id ? jobs[p.job_id] : undefined))
    .filter((j): j is ProjectJob => !!j);

  let paid = 0;
  let stillToPay = 0;
  let agreed = 0;
  for (const job of attached) {
    const money = jobMoney(job, invoices);
    paid += money.paid;
    stillToPay += money.stillToPay;
    agreed += money.agreed ?? 0;
  }

  const hasBudget = budget != null;
  const overBy = hasBudget ? Math.max(0, agreed - budget) : 0;
  const leftToCommit = hasBudget ? Math.max(0, budget - agreed) : 0;
  const showLeft = hasBudget && overBy === 0;
  // The bar spans the budget, or the agreed total when that is larger or
  // there is no budget.
  const scale = Math.max(hasBudget ? budget : 0, paid + stillToPay, agreed);

  const segments = [
    { key: "paid", label: "Paid", amount: paid, ...SEGMENT_STYLE.paid },
    { key: "toPay", label: "Agreed, still to pay", amount: stillToPay, ...SEGMENT_STYLE.toPay },
    ...(showLeft ? [{ key: "left", label: "Left to commit", amount: leftToCommit, ...SEGMENT_STYLE.left }] : []),
  ];

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="font-heading text-lg">Budget</CardTitle>
        <p className="text-sm text-muted-foreground">
          {hasBudget ? (
            <>Budget <span className="font-mono text-foreground">{formatGBP(budget)}</span></>
          ) : (
            "No budget set"
          )}
          {attached.length > 0 && (
            <> · Agreed so far <span className="font-mono text-foreground">{formatGBP(agreed)}</span></>
          )}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {scale > 0 ? (
          <div
            className="flex h-6 w-full overflow-hidden rounded-md bg-muted"
            role="img"
            aria-label={segments.map((s) => `${s.label} ${formatGBP(s.amount)}`).join(", ")}
          >
            {segments.map((s) => (
              <div
                key={s.key}
                className={`h-full ${s.className}`}
                style={{ ...s.style, width: widthPct(s.amount, scale) }}
                title={`${s.label}: ${formatGBP(s.amount)}`}
              />
            ))}
          </div>
        ) : (
          <div className="h-6 w-full rounded-md border border-dashed" aria-hidden="true" />
        )}

        <ul className="grid gap-2 sm:grid-cols-3 text-sm">
          {segments.map((s) => (
            <li key={s.key} className="flex items-center gap-2">
              <span className={`inline-block h-3 w-5 shrink-0 rounded-sm ${s.className}`} style={s.style} aria-hidden="true" />
              <span className="text-muted-foreground">{s.label}</span>
              <span className="ml-auto font-mono sm:ml-0">{formatGBP(s.amount)}</span>
            </li>
          ))}
        </ul>

        {overBy > 0 && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
            <i className="ti ti-alert-triangle mr-1" aria-hidden="true" />
            Over budget by <span className="font-mono">{formatGBP(overBy)}</span>
          </p>
        )}

        {!hasBudget && (
          <p className="text-sm text-muted-foreground">
            Set a budget to see what is left.{" "}
            <Button variant="link" className="h-auto p-0" onClick={onEditProject}>Edit project</Button>
          </p>
        )}

        {attached.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nothing is agreed yet. Amounts appear here once you attach a job to a package.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
