// SUPERSEDED — merged into PanelManagement.tsx.
//
// This component previously rendered two unrelated things:
//   1. A `compliance_items` table per approved panel contractor. That table is
//      confirmed dead (0 rows, nothing writes to it, document_url never read/written
//      by any code path) — removed per the "remove the compliance_items UI" request.
//      The DB table itself is untouched; only this client-side render is gone.
//   2. An `sla_rules` reference table, unrelated to compliance_items. That section
//      was relocated to the bottom of PanelManagement.tsx (`src/components/business/PanelManagement.tsx`)
//      rather than deleted — see that file's "SLA rules" section.
//
// The "compliance" nav case was removed from BusinessDashboard.tsx's switch and the
// "Compliance" sidebar entry removed from BusinessLayout.tsx, so this component is no
// longer reachable from the UI. Kept in place (not deleted) per instruction; do not
// re-wire it into nav without rebuilding a real feature on top of it.

interface Props {
  companyId: string;
}

export function BusinessComplianceView(_props: Props) {
  return null;
}
