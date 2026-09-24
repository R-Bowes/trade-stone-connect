import { Button } from "@/components/ui/button";

interface DashboardSectionHeaderProps {
  title: string;
  /** Total matching rows — may exceed how many are actually rendered (capped at 5). */
  totalCount: number;
  shownCount: number;
  onViewAll: () => void;
}

/** Header for a capped dashboard section: title plus "View all N" when there's more than what's shown. */
export function DashboardSectionHeader({ title, totalCount, shownCount, onViewAll }: DashboardSectionHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{title}</h3>
      {totalCount > shownCount && (
        <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={onViewAll}>
          View all {totalCount}
        </Button>
      )}
    </div>
  );
}
