import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Loader2, CheckCircle2, Inbox } from "lucide-react";
import { ErrorState } from "@/components/AsyncState";
import { EmptyState } from "@/components/shared/EmptyState";
import { formatDate } from "@/lib/formatDate";
import { WORK_ITEM_STAGES, STAGE_LABEL, type WorkItem, type WorkItemStage } from "@/lib/workItems";
import { WorkItemCard } from "@/components/contractor/work/WorkItemCard";

const VISIBLE_CAP = 20;

interface WorkItemsListProps {
  items: WorkItem[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onNavigate: (tab: string) => void;
}

export function WorkItemsList({ items, loading, error, onRetry, onNavigate }: WorkItemsListProps) {
  const [selectedStage, setSelectedStage] = useState<WorkItemStage | "all">("all");
  const [showWaiting, setShowWaiting] = useState(false);
  const [dueTodayOnly, setDueTodayOnly] = useState(false);
  const [showAll, setShowAll] = useState(false);

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (error) {
    return <ErrorState message={error} onRetry={onRetry} />;
  }

  const stagelessItems = items.filter((i) => i.stage === null);
  const stagedItems = items.filter((i): i is WorkItem & { stage: WorkItemStage } => i.stage !== null);

  if (stagelessItems.length === 0 && stagedItems.length === 0) {
    return (
      <EmptyState
        icon={<CheckCircle2 className="h-10 w-10 text-green-500" />}
        message="Nothing needs your attention right now."
      />
    );
  }

  const waitingCount = stagedItems.filter((i) => i.band === "waiting").length;
  // Order preserved throughout — every step below is a filter, never a
  // re-sort. Stage narrows the list, it never reorders it.
  const bandFiltered = showWaiting ? stagedItems : stagedItems.filter((i) => i.band === "needs_you");

  const stageCounts = WORK_ITEM_STAGES.reduce((counts, stage) => {
    counts[stage] = bandFiltered.filter((i) => i.stage === stage).length;
    return counts;
  }, {} as Record<WorkItemStage, number>);

  const stageFiltered = selectedStage === "all" ? bandFiltered : bandFiltered.filter((i) => i.stage === selectedStage);

  const todayStr = formatDate(new Date());
  const visibleAfterFilters = selectedStage === "work" && dueTodayOnly
    ? stageFiltered.filter((i) => i.dueIso && formatDate(i.dueIso) === todayStr)
    : stageFiltered;

  const visible = showAll ? visibleAfterFilters : visibleAfterFilters.slice(0, VISIBLE_CAP);

  return (
    <div className="flex flex-col gap-4">
      {/* Rates awaiting acceptance — stage-less, unaffected by every filter below. */}
      {stagelessItems.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Rates awaiting your acceptance</h3>
          <div className="grid gap-3">
            {stagelessItems.map((item) => (
              <WorkItemCard key={item.key} item={item} showStage={false} onAction={(i) => onNavigate(i.actionTarget.tab)} />
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant={selectedStage === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedStage("all")}
          >
            All ({bandFiltered.length})
          </Button>
          {WORK_ITEM_STAGES.filter((stage) => stageCounts[stage] > 0).map((stage) => (
            <Button
              key={stage}
              variant={selectedStage === stage ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedStage(stage)}
            >
              {STAGE_LABEL[stage]} ({stageCounts[stage]})
            </Button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-sm text-muted-foreground shrink-0">
          <Switch checked={showWaiting} onCheckedChange={setShowWaiting} />
          Show waiting on others ({waitingCount})
        </label>
      </div>

      {selectedStage === "work" && (
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Switch checked={dueTodayOnly} onCheckedChange={setDueTodayOnly} />
          Due today only
        </label>
      )}

      {visibleAfterFilters.length === 0 ? (
        <Card><CardContent className="p-8 text-center flex flex-col items-center gap-2">
          <Inbox className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Nothing matches this filter.</p>
        </CardContent></Card>
      ) : (
        <>
          <div className="grid gap-3">
            {visible.map((item) => (
              <WorkItemCard key={item.key} item={item} showStage={selectedStage === "all"} onAction={(i) => onNavigate(i.actionTarget.tab)} />
            ))}
          </div>
          {!showAll && visibleAfterFilters.length > VISIBLE_CAP && (
            <Button variant="outline" size="sm" className="self-center" onClick={() => setShowAll(true)}>
              Show all {visibleAfterFilters.length}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
