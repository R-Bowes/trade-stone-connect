import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { ContractorSummary, PackageMoney, ProjectJob, ProjectPackage, ProjectSnag } from "@/hooks/useProjectDetail";
import { orderPackages } from "@/lib/projectPackages";
import { isSnagOpen } from "@/lib/projectSignOff";
import { formatGBP } from "@/lib/formatGBP";
import { formatDate } from "@/lib/formatDate";

type Props = {
  packages: ProjectPackage[];
  jobs: Record<string, ProjectJob>;
  money: Record<string, PackageMoney>;
  contractors: Record<string, ContractorSummary>;
  snags: ProjectSnag[];
  /** True when sign-off is unlocked and the project is not yet completed. */
  readyToSignOff: boolean;
};

/** How far ahead of a package's needed-from date the homeowner should choose a contractor. */
const CHOOSE_BY_DAYS = 14;

function chooseBy(neededFrom: string): { date: Date; overdue: boolean } {
  const [y, m, d] = neededFrom.slice(0, 10).split("-").map(Number);
  const date = new Date(y, m - 1, d - CHOOSE_BY_DAYS);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return { date, overdue: date < today };
}

/**
 * What the homeowner should act on, in order: invoices to pay, packages
 * still without a contractor, open snags, and sign-off once it is ready.
 * Read-only: every action links to the screen that does it.
 */
export function NeedsYouCard({ packages, jobs, money, contractors, snags, readyToSignOff }: Props) {
  const navigate = useNavigate();
  const ordered = orderPackages(packages);

  const toPay = ordered
    .filter((pkg) => !!pkg.job_id && jobs[pkg.job_id!])
    .map((pkg) => ({
      job: jobs[pkg.job_id!],
      amount: money[pkg.id]?.due_now ?? 0,
    }))
    .filter((item) => item.amount > 0);

  const unfilled = ordered.filter((pkg) => !pkg.job_id);
  const openSnags = snags.filter(isSnagOpen).length;
  const nothing = toPay.length === 0 && unfilled.length === 0 && openSnags === 0 && !readyToSignOff;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="font-heading text-lg">Needs you</CardTitle>
      </CardHeader>
      <CardContent>
        {nothing ? (
          <p className="text-sm text-muted-foreground">Nothing needs you right now.</p>
        ) : (
          <ul className="space-y-3 text-sm">
            {toPay.map(({ job, amount }) => (
              <li key={`pay-${job.id}`} className="flex items-start justify-between gap-3">
                <span>
                  <i className="ti ti-receipt mr-1 text-[#f07820]" aria-hidden="true" />
                  Pay <span className="font-mono font-semibold">{formatGBP(amount)}</span> to{" "}
                  {contractors[job.contractor_id]?.name ?? "your contractor"}
                </span>
                <Button size="sm" variant="link" className="h-auto shrink-0 p-0" onClick={() => navigate("/dashboard/homeowner?view=invoices")}>
                  Invoices
                </Button>
              </li>
            ))}

            {unfilled.map((pkg) => {
              const due = pkg.needed_from ? chooseBy(pkg.needed_from) : null;
              return (
                <li key={`fill-${pkg.id}`} className="flex items-start justify-between gap-3">
                  <span>
                    <i className="ti ti-user-search mr-1 text-[#1e3a5f]" aria-hidden="true" />
                    Find a contractor for {pkg.title}
                    <span className="block text-xs text-muted-foreground">
                      {due ? (
                        due.overdue ? (
                          <span className="font-semibold text-red-700">Overdue: choose by {formatDate(due.date)}</span>
                        ) : (
                          <>Choose by {formatDate(due.date)}</>
                        )
                      ) : (
                        "No date set"
                      )}
                    </span>
                  </span>
                  <Button size="sm" variant="link" className="h-auto shrink-0 p-0" onClick={() => navigate("/dashboard/homeowner?view=hire")}>
                    Find
                  </Button>
                </li>
              );
            })}

            {openSnags > 0 && (
              <li>
                <i className="ti ti-alert-circle mr-1 text-amber-600" aria-hidden="true" />
                {openSnags === 1 ? "1 open snag" : `${openSnags} open snags`}
              </li>
            )}

            {readyToSignOff && (
              <li className="font-medium text-green-700">
                <i className="ti ti-circle-check mr-1" aria-hidden="true" />
                Ready to sign off
              </li>
            )}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
