import type { AddressValue } from "@/components/shared/AddressInput";

/**
 * Field option lists and small helpers shared between QuoteRequestDialog.tsx
 * (single-contractor, do-not-touch) and CompareQuoteRequestDialog.tsx
 * (multi-recipient). QuoteRequestDialog.tsx keeps its own inline copies —
 * it is not edited to import from here — this module exists so the new
 * dialog doesn't duplicate them a second time, and so QuoteRequestDialog.tsx
 * can adopt it later once it comes off the do-not-touch list.
 */

export const JOB_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "repair", label: "Repair" },
  { value: "service", label: "Service" },
  { value: "installation", label: "Installation" },
  { value: "inspection", label: "Inspection" },
  { value: "emergency_callout", label: "Emergency callout" },
  { value: "other", label: "Other" },
];

export const PRIORITY_OPTIONS: { value: string; label: string }[] = [
  { value: "low", label: "Low — flexible timing" },
  { value: "medium", label: "Medium — within a few weeks" },
  { value: "high", label: "High — within days" },
  { value: "emergency", label: "Emergency — ASAP" },
];

export const TIMELINE_OPTIONS = [
  "Within 1 week",
  "Within 2 weeks",
  "Within 1 month",
  "Within 3 months",
  "Flexible / no rush",
];

export const BUDGET_OPTIONS = [
  "Under £100",
  "£100 – £250",
  "£250 – £500",
  "£500 – £1,000",
  "£1,000 – £2,500",
  "£2,500 – £5,000",
  "£5,000+",
  "Not sure — need a quote",
];

export const MAX_COMPARE_RECIPIENTS = 5;
export const MAX_ENQUIRY_PHOTOS = 5;

/** Country + line 1 + city + region + postcode are all required once a country is picked — line 2 is the only optional field, per AddressInput's own field list. */
export function isAddressComplete(a: AddressValue): boolean {
  return !!(a.addr_country && a.addr_line1?.trim() && a.addr_city?.trim() && a.addr_region?.trim() && a.addr_postcode?.trim());
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// iOS reports HEIC inconsistently — sometimes "image/heic"/"image/heif",
// sometimes a blank type when the file arrives via the Files app rather
// than the native Photos picker. Checking the extension too catches the
// case a browser mis-reports. Matches JobPhotosTab.tsx's isHeic().
export function isHeic(file: File): boolean {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  return type === "image/heic" || type === "image/heif" || name.endsWith(".heic") || name.endsWith(".heif");
}

export async function convertHeicToJpeg(file: File): Promise<File> {
  const heic2any = (await import("heic2any")).default;
  const result = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.85 });
  const blob = Array.isArray(result) ? result[0] : result;
  const stem = file.name.replace(/\.[^./]+$/, "");
  return new File([blob], `${stem}.jpg`, { type: "image/jpeg" });
}
