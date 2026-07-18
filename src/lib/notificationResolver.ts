import { supabase } from "@/integrations/supabase/client";
import { Briefcase, StickyNote, FileText, MessageCircle, CalendarClock, Bell, type LucideIcon } from "lucide-react";

/**
 * The one shared reference_type/type -> route + icon resolver. Replaces the
 * three previously-independent copies (NotificationBell's inline handleClick,
 * the Notifications page's own handleClick, and each page's own icon-by-type
 * switch) — all three now call into this module instead of hardcoding routes.
 *
 * View slugs differ by role for the same entity ("issued-quotes" for the
 * contractor, "approvals" for business, "quotes" for the homeowner) so this
 * resolves the viewer's own role first (cached per session) rather than
 * bouncing through the generic /dashboard redirect the way the old bell code
 * did for job/invoice/issued_quote — that redirect trick only worked because
 * those slugs happened to collide across roles for THOSE cases; it silently
 * breaks for anything whose slug diverges (issued_quote/quote did, message did
 * too — the old code hardcoded business only for "message", which was wrong
 * for a contractor or homeowner recipient).
 */

export type ViewerRole = "personal" | "business" | "contractor" | null;

export interface ResolvableNotification {
  type: string;
  reference_type: string | null;
}

let cachedRole: ViewerRole | undefined;

/** Exposed for callers that already know the role and want to skip the lookup. */
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

  switch (notif.reference_type) {
    case "enquiry":
      // Enquiries are contractor-only today — no role ambiguity.
      return "/dashboard/contractor?view=enquiries";

    case "issued_quote":
    case "quote":
      if (role === "contractor") return "/dashboard/contractor?view=issued-quotes";
      if (role === "business") return "/dashboard/business?view=approvals";
      return "/dashboard/homeowner?view=quotes";

    case "job":
      return `${base}?view=jobs`;

    case "invoice":
      return `${base}?view=invoices`;

    case "schedule_event":
      if (role === "contractor") return "/dashboard/contractor?view=schedule&tab=quote-scheduling";
      if (role === "business") return "/dashboard/business?view=approvals";
      return "/dashboard/homeowner?view=quotes";

    case "message":
      return `${base}?view=messages`;

    case "term_engagement":
      return role === "contractor" ? "/dashboard/contractor?view=panel-compliance" : "/dashboard/business?view=tenders";

    default:
      // Rows with no reference_type — fall back on type-specific routing,
      // then the generic role redirect as a last resort.
      if (notif.type === "schedule_proposed" || notif.type === "job_confirmed") {
        return "/dashboard/contractor";
      }
      return "/dashboard";
  }
}
