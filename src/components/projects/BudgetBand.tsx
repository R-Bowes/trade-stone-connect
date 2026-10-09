import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { PackageMoney, ProjectPackage } from "@/hooks/useProjectDetail";
import { formatGBP } from "@/lib/formatGBP";

type Props = {
  budget: number | null;
  packages: ProjectPackage[];
  money: Record<string, PackageMoney>;
  onEditProject: () => void;
  /** A completed project is read-only: no "Edit project" link. */
  readOnly?: boolean;
  /** 'personal' (default) keeps the three-part band. 'business' adds allowances and splits "left to commit" into "allowed, not yet awarded" and "unallocated". */
  viewer?: "personal" | "business";
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
  allowance: {
    className: "bg-[#1e3a5f]",
    style: {
      backgroundImage: "repeating-linear-gradient(45deg, rgba(255,255,255,0.3) 0 3px, transparent 3px 6px)",
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
 * Budget band, sourced from project_money (via the money map, keyed by
 * package id — see useProjectDetail.ts).
 *
 * Personal: paid, agreed still to pay, left to commit — unchanged.
 * Business: paid, agreed still to pay, allowed-not-yet-awarded (the sum
 * of allowances on unfilled packages), and unallocated (budget minus
 * agreed minus those allowances) — a business project plans unfilled
 * packages with an allowance before a contractor is chosen, which a
 * personal project never does.
 */
export function BudgetBand({ budget, packages, money, onEditProject, readOnly = false, viewer = "personal" }: Props) {
  const filled = packages.filter((p) => !!p.job_id);
  const unfilled = packages.filter((p) => !p.job_id);

  let paid = 0;
  let stillToPay = 0;
  let agreed = 0;
  for (const pkg of filled) {
    const m = money[pkg.id];
    if (!m) continue;
    paid += m.paid;
    stillToPay += m.still_to_pay;
    agreed += m.agreed ?? 0;
  }

  const allowanceNotAwarded = viewer === "business"
    ? unfilled.reduce((sum, p) => sum + (p.allowance ?? 0), 0)
    : 0;

  const committed = agreed + allowanceNotAwarded;
  const hasBudget = budget != null;
  const overBy = hasBudget ? Math.max(0, committed - budget) : 0;
  const unallocated = hasBudget ? Math.max(0, budget - committed) : 0;
  const showLeft = hasBudget && overBy === 0;
  // The bar spans the budget, or the committed total when that is larger or there is no budget.
  const scale = Math.max(hasBudget ? budget : 0, paid + stillToPay + allowanceNotAwarded, committed);

  const segments =
    viewer === "business"
      ? [
          { key: "paid", label: "Paid", amount: paid, ...SEGMENT_STYLE.paid },
          { key: "toPay", label: "Agreed, still to pay", amount: stillToPay, ...SEGMENT_STYLE.toPay },
          { key: "allowance", label: "Allowed, not yet awarded", amount: allowanceNotAwarded, ...SEGMENT_STYLE.allowance },
          ...(showLeft ? [{ key: "left", label: "Unallocated", amount: unallocated, ...SEGMENT_STYLE.left }] : []),
        ]
      : [
          { key: "paid", label: "Paid", amount: paid, ...SEGMENT_STYLE.paid },
          { key: "toPay", label: "Agreed, still to pay", amount: stillToPay, ...SEGMENT_STYLE.toPay },
          ...(showLeft ? [{ key: "left", label: "Left to commit", amount: unallocated, ...SEGMENT_STYLE.left }] : []),
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
          {filled.length > 0 && (
            <> · Agreed so far <span className="font-mono text-foreground">{formatGBP(agreed)}</span></>
          )}
          {viewer === "business" && allowanceNotAwarded > 0 && (
            <> · Allowed, not yet awarded <span className="font-mono text-foreground">{formatGBP(allowanceNotAwarded)}</span></>
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

        <ul className={`grid gap-2 text-sm ${viewer === "business" ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
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

        {!hasBudget && !readOnly && (
          <p className="text-sm text-muted-foreground">
            Set a budget to see what is left.{" "}
            <Button variant="link" className="h-auto p-0" onClick={onEditProject}>Edit project</Button>
          </p>
        )}

        {filled.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nothing is agreed yet. Amounts appear here once you attach a job to a package.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
