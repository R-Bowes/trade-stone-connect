/**
 * Contractor-facing wording for enquiry_recipients.decline_reason_code —
 * always the neutral label, never the raw code. The reason is the
 * homeowner's, shown to someone who just lost work — approved wording,
 * not to be reworded per call site.
 */
export const DECLINE_REASON_LABEL: Record<string, string> = {
  price: "The client felt the price wasn't right for them.",
  timing: "The timing didn't work for the client.",
  went_elsewhere: "The client has gone with another contractor.",
  changed_mind: "The client has decided not to proceed with this job.",
  auto_accepted_another: "The client accepted a different quote for this job.",
};

export function declineReasonLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  return DECLINE_REASON_LABEL[code] ?? null;
}
