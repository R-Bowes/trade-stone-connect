// supabase/functions/recalculate-scores/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// Cron-triggered, daily at 04:00 UTC (after evaluate-craft-timers at 03:00,
// so timers resolved that morning feed the same day's recalculation).
// Thin wrapper — all the actual work (calculate_trade_averages() then
// calculate_contractor_scores() per contractor) happens in
// recalculate_all_scores(), a single SECURITY DEFINER SQL function, per the
// tendering-scheduled-runner precedent of doing pure-SQL work directly in
// Postgres rather than looping in the edge function.
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  // Internal-only (verify_jwt=false in config.toml — cron-invoked, no
  // end-user JWT expected). Same shared-secret pattern as the other
  // cron-invoked functions in this repo.
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!serviceRoleKey || authHeader !== `Bearer ${serviceRoleKey}`) {
    console.error("[recalculate-scores] rejected call with missing/invalid Authorization header");
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      serviceRoleKey,
      { auth: { persistSession: false } },
    );

    const { error } = await supabase.rpc("recalculate_all_scores");
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[recalculate-scores] error", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
