import { supabase } from "@/integrations/supabase/client";

// lookup_ts_codes_by_email (20261004100000) caps each call at 50 emails.
const BATCH = 50;

/**
 * Email -> TS code for TradeStone accounts, via the contractor-only
 * lookup_ts_codes_by_email RPC. profiles.email is a locked column, so this is
 * the only client path from an email to an account. Exact email match.
 * Returns an empty map on error (logged), matching the old direct query's
 * "no links shown" behaviour.
 */
export async function lookupTsCodesByEmail(emails: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(emails.filter(Boolean))];
  const map: Record<string, string> = {};
  for (let i = 0; i < unique.length; i += BATCH) {
    const { data, error } = await supabase.rpc("lookup_ts_codes_by_email", { p_emails: unique.slice(i, i + BATCH) });
    if (error) {
      console.error("lookup_ts_codes_by_email failed:", error);
      return map;
    }
    for (const row of data ?? []) {
      if (row.email && row.ts_profile_code) map[row.email] = row.ts_profile_code;
    }
  }
  return map;
}
