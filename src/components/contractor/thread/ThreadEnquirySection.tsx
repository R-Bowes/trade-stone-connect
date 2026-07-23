import { format } from "date-fns";
import { MapPin, Calendar, Wallet } from "lucide-react";
import { EnquiryPhotoThumbnails } from "@/components/EnquiryPhotoThumbnails";

export interface ThreadEnquiry {
  id: string;
  job_description: string;
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

export function ThreadEnquirySection({ enquiry }: { enquiry: ThreadEnquiry }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Enquiry</h3>
      <p className="text-sm whitespace-pre-wrap">{enquiry.job_description}</p>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{enquiry.location}</span>
        {enquiry.budget_range && (
          <span className="flex items-center gap-1"><Wallet className="h-3.5 w-3.5" />{enquiry.budget_range}</span>
        )}
        {enquiry.preferred_timeline && (
          <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{enquiry.preferred_timeline}</span>
        )}
        {enquiry.preferred_time_of_day && (
          <span className="flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" />Prefers: {TIME_OF_DAY_LABEL[enquiry.preferred_time_of_day] ?? enquiry.preferred_time_of_day}
          </span>
        )}
        {enquiry.preferred_window_start && enquiry.preferred_window_end && (
          <span className="flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" />
            Window: {format(new Date(enquiry.preferred_window_start), "d MMM")} – {format(new Date(enquiry.preferred_window_end), "d MMM")}
          </span>
        )}
      </div>
      {enquiry.photo_urls && enquiry.photo_urls.length > 0 && (
        <div id="thread-photos">
          <EnquiryPhotoThumbnails paths={enquiry.photo_urls} label="Customer photos" />
        </div>
      )}
    </div>
  );
}
