import { Loader2 } from "lucide-react";
import { format } from "date-fns";
import { EnquiryPhotoThumbnails } from "@/components/EnquiryPhotoThumbnails";
import { QuoteBreakdownSummary } from "@/components/recipient/QuoteBreakdownSummary";
import { formatQuoteRef } from "@/lib/documentRefs";
import type { JobOrigin } from "@/lib/fetchJobOrigin";

const TIME_OF_DAY_LABEL: Record<string, string> = {
  am: "Mornings (AM)",
  pm: "Afternoons (PM)",
  any: "Any time",
};

interface JobOriginSectionProps {
  origin: JobOrigin | null;
  loading: boolean;
}

/**
 * Shared render for a job's origin context — mounted by each party's job
 * detail surface (contractor JobManagement, BusinessJobsView, ClientJobsView)
 * inside its own collapsible/tab chrome. Handles all three shapes: quote +
 * enquiry, quote with no enquiry (direct quote), and no quote (call-out).
 */
export function JobOriginSection({ origin, loading }: JobOriginSectionProps) {
  if (loading || !origin) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading origin…
      </div>
    );
  }

  if (!origin.quote && !origin.engagementNumber) {
    return <p className="text-sm text-muted-foreground py-2">No origin details available.</p>;
  }

  return (
    <div className="space-y-4">
      {origin.enquiry && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Original enquiry</p>
          <p className="text-sm font-medium">{origin.enquiry.title ?? "Enquiry"}</p>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{origin.enquiry.job_description}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <i className="ti ti-map-pin" />{origin.enquiry.location}
            </span>
            {origin.enquiry.preferred_time_of_day && (
              <span>{TIME_OF_DAY_LABEL[origin.enquiry.preferred_time_of_day] ?? origin.enquiry.preferred_time_of_day}</span>
            )}
            {origin.enquiry.preferred_window_start && origin.enquiry.preferred_window_end && (
              <span>
                Window: {format(new Date(origin.enquiry.preferred_window_start), "d MMM")} –{" "}
                {format(new Date(origin.enquiry.preferred_window_end), "d MMM")}
              </span>
            )}
            {origin.enquiry.budget_range && <span>Budget: {origin.enquiry.budget_range}</span>}
          </div>
          {origin.enquiry.photo_urls && origin.enquiry.photo_urls.length > 0 && (
            <EnquiryPhotoThumbnails paths={origin.enquiry.photo_urls.slice(0, 4)} label="Customer photos" />
          )}
        </div>
      )}

      {origin.quote && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Accepted quote · {formatQuoteRef(origin.quote.quote_number, { version: origin.quote.version })}
          </p>
          <QuoteBreakdownSummary
            items={origin.quote.items}
            subtotal={origin.quote.subtotal}
            taxRate={origin.quote.tax_rate}
            taxAmount={origin.quote.tax_amount}
            total={origin.quote.total}
            depositRequired={origin.quote.deposit_required}
            depositAmount={origin.quote.deposit_amount}
            validUntil={origin.quote.valid_until}
            notes={origin.quote.notes}
            terms={origin.quote.terms}
          />
        </div>
      )}

      {!origin.quote && origin.engagementNumber && (
        <p className="text-sm text-muted-foreground">
          Call-out under <span className="font-mono">{origin.engagementNumber}</span>
        </p>
      )}
    </div>
  );
}
