import { Button } from "@/components/ui/button";

interface EngagementJobBillingNoticeProps {
  /** Reference of the linked work order, or null when the job has none. */
  workOrderRef: string | null;
  /** Opens the record-costs dialog for the linked work order. */
  onRecordCosts?: () => void;
}

/**
 * Shown on engagement-origin jobs. Log time writes team timesheets and Tools &
 * materials writes stock; neither reaches the business. Only cost lines
 * recorded against the work order are billed.
 */
export function EngagementJobBillingNotice({ workOrderRef, onRecordCosts }: EngagementJobBillingNoticeProps) {
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 space-y-2">
      <p>
        Time logged here is for team timesheets, and tools and materials are stock. Neither bills the business.
        {workOrderRef
          ? ` Costs for this job are recorded on work order ${workOrderRef}.`
          : " This job has no work order, so its costs can't be recorded yet."}
      </p>
      {workOrderRef && onRecordCosts && (
        <Button size="sm" variant="outline" onClick={onRecordCosts}>Record costs</Button>
      )}
    </div>
  );
}
