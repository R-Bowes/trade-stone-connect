import { ContractorServiceVisits } from "@/components/business/ContractorServiceVisits";

// The contractor's PPM visit workflow (upcoming visits, confirm date,
// complete-with-notes, document upload, history) already exists in full at
// ContractorServiceVisits — it queries service_visits by contractor_id
// across every company the contractor works with, which is exactly this
// slice's "Contractor PPM View". Rather than fork a second copy of that
// ~400-line component (confirm/complete/upload/notify-business logic would
// then live in two places and drift), this is a thin re-export under the
// new PPM Visits nav entry. See CLAUDE.md-style note in the PPM slice
// report: this nav item and "Service visits" now point at the same
// underlying view — a genuine duplication worth consolidating later, not
// something to silently paper over here.
export function PpmVisits({ profileId }: { profileId: string }) {
  return <ContractorServiceVisits profileId={profileId} />;
}
