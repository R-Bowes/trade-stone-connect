import { format } from "date-fns";
import { composeAddressString, type CountryCode } from "@/components/shared/AddressInput";
import type { Database } from "@/integrations/supabase/types";

type JobRow = Database["public"]["Tables"]["jobs"]["Row"];

/**
 * The job columns the /field views may read. Team members never see money:
 * contract_value (the only money column on jobs) is deliberately absent,
 * and every field query lists its columns explicitly rather than using `*`
 * — leaving a price out of the UI is not enough, it must not be fetched.
 * The select strings themselves are written out as literals at each call
 * site (PostgREST type inference needs a literal); keep them in step with
 * this type.
 */
export type FieldJob = Pick<
  JobRow,
  | "id"
  | "job_number"
  | "title"
  | "description"
  | "status"
  | "job_type"
  | "start_date"
  | "scheduled_start"
  | "location"
  | "addr_line1"
  | "addr_line2"
  | "addr_city"
  | "addr_region"
  | "addr_postcode"
  | "addr_country"
  | "customer_id"
  | "contractor_id"
  | "site_signed_off_at"
  | "site_signed_off_name"
  | "site_signed_off_by"
>;

/** Local calendar date (not UTC) as yyyy-MM-dd, offset by whole days. */
export function localDateStr(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return format(d, "yyyy-MM-dd");
}

/** A job is still live (work can happen) unless complete or cancelled. */
export function isLiveJob(status: string): boolean {
  return status !== "complete" && status !== "cancelled";
}

/** Dated before today and not finished. */
export function isOverdueJob(job: Pick<FieldJob, "start_date" | "status">): boolean {
  return !!job.start_date && job.start_date < localDateStr(0) && isLiveJob(job.status);
}

/** Structured address first, then the legacy free-text location. Empty string if neither. */
export function fieldJobAddress(job: Pick<FieldJob, "location" | "addr_line1" | "addr_line2" | "addr_city" | "addr_region" | "addr_postcode" | "addr_country">): string {
  const composed = composeAddressString({
    addr_line1: job.addr_line1,
    addr_line2: job.addr_line2,
    addr_city: job.addr_city,
    addr_region: job.addr_region,
    addr_postcode: job.addr_postcode,
    addr_country: (job.addr_country as CountryCode | null) ?? null,
  });
  return composed || job.location?.trim() || "";
}

export function fieldTimeLabel(scheduledStart: string | null): string | null {
  if (!scheduledStart) return null;
  return format(new Date(scheduledStart), "HH:mm");
}

/** "Today, 09:00" / "Mon 6 Oct, 09:00" / "6 Oct 2026" — or null when unscheduled. */
export function fieldWhenLabel(job: Pick<FieldJob, "start_date" | "scheduled_start">, opts?: { long?: boolean }): string | null {
  if (!job.start_date) return null;
  const date = new Date(`${job.start_date}T00:00:00`);
  const time = fieldTimeLabel(job.scheduled_start);
  let dateText: string;
  if (opts?.long) dateText = format(date, "EEEE d MMM yyyy");
  else if (job.start_date === localDateStr(0)) dateText = "Today";
  else if (job.start_date === localDateStr(1)) dateText = "Tomorrow";
  else dateText = format(date, "EEE d MMM");
  return time ? `${dateText}, ${time}` : dateText;
}
