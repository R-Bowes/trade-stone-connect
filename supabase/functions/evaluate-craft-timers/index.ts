// supabase/functions/evaluate-craft-timers/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// Cron-triggered, daily. Resolves craft_timer_windows rows whose 90-day
// no-callback window has elapsed (SCORING.md Section 3.1):
//   - no job_callbacks row with fault_classification = 'original_fault' for
//     that job -> outcome = 'clear'
//   - a job_callbacks row with fault_classification = 'original_fault'
//     exists -> outcome = 'callback_raised'
//   - a callback exists but is still 'pending_assessment' -> leave 'pending',
//     don't evaluate until classification is resolved (re-checked on a
//     later run once the window has already elapsed).
//
// Setting outcome (with evaluated_at) fires the on_craft_timer_outcome_set
// DB trigger, which records the corresponding craft_signals row — this
// function only ever writes outcome/evaluated_at/callback_id, never
// craft_signals directly.
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
    console.error("[evaluate-craft-timers] rejected call with missing/invalid Authorization header");
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

    const nowIso = new Date().toISOString();

    const { data: dueWindows, error: dueError } = await supabase
      .from("craft_timer_windows")
      .select("id, job_id")
      .eq("outcome", "pending")
      .lte("window_end", nowIso);
    if (dueError) throw dueError;

    const windows = dueWindows ?? [];
    if (windows.length === 0) {
      return new Response(JSON.stringify({ evaluated: 0, clear: 0, callback_raised: 0, left_pending: 0 }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const jobIds = windows.map((w) => w.job_id);
    const { data: callbackRows, error: callbackError } = await supabase
      .from("job_callbacks")
      .select("id, original_job_id, fault_classification")
      .in("original_job_id", jobIds);
    if (callbackError) throw callbackError;

    const callbacksByJob = new Map<string, { id: string; fault_classification: string }[]>();
    for (const cb of callbackRows ?? []) {
      const list = callbacksByJob.get(cb.original_job_id) ?? [];
      list.push(cb);
      callbacksByJob.set(cb.original_job_id, list);
    }

    let clearCount = 0;
    let callbackRaisedCount = 0;
    let leftPendingCount = 0;
    const evaluatedAt = new Date().toISOString();

    for (const win of windows) {
      const callbacks = callbacksByJob.get(win.job_id) ?? [];
      const faultCallback = callbacks.find((c) => c.fault_classification === "original_fault");
      const hasPendingAssessment = callbacks.some((c) => c.fault_classification === "pending_assessment");

      if (faultCallback) {
        const { error } = await supabase
          .from("craft_timer_windows")
          .update({ outcome: "callback_raised", callback_id: faultCallback.id, evaluated_at: evaluatedAt })
          .eq("id", win.id);
        if (error) {
          console.error("[evaluate-craft-timers] failed to set callback_raised for window", win.id, error);
          continue;
        }
        callbackRaisedCount++;
      } else if (hasPendingAssessment) {
        // Leave as pending — classification unresolved, don't evaluate yet.
        leftPendingCount++;
      } else {
        const { error } = await supabase
          .from("craft_timer_windows")
          .update({ outcome: "clear", evaluated_at: evaluatedAt })
          .eq("id", win.id);
        if (error) {
          console.error("[evaluate-craft-timers] failed to set clear for window", win.id, error);
          continue;
        }
        clearCount++;
      }
    }

    return new Response(
      JSON.stringify({
        evaluated: windows.length,
        clear: clearCount,
        callback_raised: callbackRaisedCount,
        left_pending: leftPendingCount,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[evaluate-craft-timers] error", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
