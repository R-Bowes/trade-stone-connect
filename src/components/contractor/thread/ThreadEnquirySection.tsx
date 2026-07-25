import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { EnquiryPhotoThumbnails } from "@/components/EnquiryPhotoThumbnails";

export interface ThreadEnquiry {
  id: string;
  job_description: string;
  job_type: string | null;
  priority: string | null;
  access_notes: string | null;
  location: string;
  budget_range: string | null;
  preferred_timeline: string | null;
  preferred_time_of_day: string | null;
  preferred_window_start: string | null;
  preferred_window_end: string | null;
  photo_urls: string[] | null;
  created_at: string | null;
}

const TIME_OF_DAY_LABEL: Record<string, string> = {
  am: "Mornings (AM)",
  pm: "Afternoons (PM)",
  any: "Any time",
};

const JOB_TYPE_LABELS: Record<string, string> = {
  repair: "Repair",
  service: "Service",
  installation: "Installation",
  inspection: "Inspection",
  emergency_callout: "Emergency callout",
  other: "Other",
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  emergency: "Emergency",
};

const PRIORITY_BADGE: Record<string, string> = {
  low: "bg-blue-50 text-blue-700 border-blue-200",
  medium: "bg-amber-50 text-amber-800 border-amber-200",
  high: "bg-red-50 text-red-700 border-red-200",
  emergency: "bg-red-600 text-white border-red-700",
};

export function ThreadEnquirySection({ enquiry }: { enquiry: ThreadEnquiry }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Enquiry</h3>

      <div className="space-y-2 text-sm">
        <div className="flex items-center gap-2">
          <i className="ti ti-map-pin text-muted-foreground" style={{ fontSize: 16 }} />
          <span>{enquiry.location}</span>
        </div>
        {enquiry.job_type && (
          <div className="flex items-center gap-2">
            <i className="ti ti-tool text-muted-foreground" style={{ fontSize: 16 }} />
            <span>{JOB_TYPE_LABELS[enquiry.job_type] ?? enquiry.job_type}</span>
          </div>
        )}
        {enquiry.priority && (
          <div className="flex items-center gap-2">
            <i className="ti ti-flag text-muted-foreground" style={{ fontSize: 16 }} />
            <Badge variant="outline" className={PRIORITY_BADGE[enquiry.priority] ?? ""}>
              {PRIORITY_LABELS[enquiry.priority] ?? enquiry.priority}
            </Badge>
          </div>
        )}
        {enquiry.preferred_timeline && (
          <div className="flex items-center gap-2">
            <i className="ti ti-clock text-muted-foreground" style={{ fontSize: 16 }} />
            <span>{enquiry.preferred_timeline}</span>
          </div>
        )}
        {enquiry.budget_range && (
          <div className="flex items-center gap-2">
            <i className="ti ti-currency-pound text-muted-foreground" style={{ fontSize: 16 }} />
            <span>{enquiry.budget_range}</span>
          </div>
        )}
        {enquiry.preferred_time_of_day && (
          <div className="flex items-center gap-2">
            <i className="ti ti-clock text-muted-foreground" style={{ fontSize: 16 }} />
            <span>Prefers: {TIME_OF_DAY_LABEL[enquiry.preferred_time_of_day] ?? enquiry.preferred_time_of_day}</span>
          </div>
        )}
        {enquiry.preferred_window_start && enquiry.preferred_window_end && (
          <div className="flex items-center gap-2">
            <i className="ti ti-calendar text-muted-foreground" style={{ fontSize: 16 }} />
            <span>
              Window: {format(new Date(enquiry.preferred_window_start), "d MMM")} – {format(new Date(enquiry.preferred_window_end), "d MMM")}
            </span>
          </div>
        )}
      </div>

      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Description</p>
        <p className="text-sm whitespace-pre-wrap">{enquiry.job_description}</p>
      </div>

      {enquiry.access_notes && (
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Access and site notes</p>
          <p className="text-sm whitespace-pre-wrap">{enquiry.access_notes}</p>
        </div>
      )}

      {enquiry.photo_urls && enquiry.photo_urls.length > 0 && (
        <div id="thread-photos">
          <EnquiryPhotoThumbnails paths={enquiry.photo_urls} label="Customer photos" />
        </div>
      )}
    </div>
  );
}
