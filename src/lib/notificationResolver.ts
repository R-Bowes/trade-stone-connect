import { supabase } from "@/integrations/supabase/client";
import { Briefcase, StickyNote, FileText, MessageCircle, CalendarClock, Bell, type LucideIcon } from "lucide-react";

export type ViewerRole = "personal" | "business" | "contractor" | null;

export interface ResolvableNotification {
  type: string;
  reference_type: string | null;
  reference_id: string | null;
}

let cachedRole: ViewerRole | undefined;

export function primeViewerRole(role: ViewerRole) {
  cachedRole = role;
}

async function getViewerRole(): Promise<ViewerRole> {
  if (cachedRole !== undefined) return cachedRole;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    cachedRole = null;
    return null;
  }

  const { data } = await supabase
    .from("profiles")
    .select("user_type")
    .eq("user_id", user.id)
    .maybeSingle();

  cachedRole = (data?.user_type as ViewerRole) ?? null;
  return cachedRole;
}

export function notificationIcon(type: string): LucideIcon {
  switch (type) {
    case "job_status":
    case "job_confirmed":
    case "callout_raised":
      return Briefcase;
    case "job_note":
      return StickyNote;
    case "invoice_response":
      return FileText;
    case "quote_response":
    case "quote_request":
      return FileText;
    case "new_message":
      return MessageCircle;
    case "schedule_accepted":
    case "schedule_reopened":
    case "schedule_proposed":
    case "slots_proposed":
      return CalendarClock;
    default:
      return Bell;
  }
}

export async function resolveNotificationRoute(notif: ResolvableNotification): Promise<string> {
  const role = await getViewerRole();
  const base = role === "contractor" ? "/dashboard/contractor" : role === "business" ? "/dashboard/business" : "/dashboard/homeowner";
  const refId = notif.reference_id;

  switch (notif.reference_type) {
    case "enquiry":
      return "/dashboard/contractor?view=enquiries";

    case "issued_quote":
    case "quote":
      if (role === "contractor") {
        return refId
          ? `/dashboard/contractor?view=issued-quotes&quote=${refId}`
          : "/dashboard/contractor?view=issued-quotes";
      }
      if (role === "business") return "/dashboard/business?view=approvals";
      return "/dashboard/homeowner?view=quotes";

    case "job":
      return refId
        ? `${base}?view=jobs&jobId=${refId}`
        : `${base}?view=jobs`;

    case "invoice":
      return `${base}?view=invoices`;

    case "schedule_event":
      if (role === "contractor") return "/dashboard/contractor?view=schedule&tab=quote-scheduling";
      if (role === "business") return "/dashboard/business?view=approvals";
      return "/dashboard/homeowner?view=quotes";

    case "message":
      return `${base}?view=messages`;

    case "term_engagement":
      return role === "contractor"
        ? `/dashboard/contractor?view=panel-compliance`
        : `/dashboard/business?view=tenders`;

    default:
      if (notif.type === "schedule_proposed" || notif.type === "job_confirmed") {
        return "/dashboard/contractor";
      }
      return "/dashboard";
  }
}