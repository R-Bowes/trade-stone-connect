import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { ORANGE } from "./FieldHeader";

interface OpenTimesheet {
  id: string;
  arrived_at: string; // "HH:MM:SS"
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function toTimeString(d: Date): string {
  return d.toTimeString().slice(0, 8);
}

function elapsedLabel(arrivedAt: string): string {
  const [h, m, s] = arrivedAt.split(":").map(Number);
  const start = new Date();
  start.setHours(h, m, s, 0);
  let diffSeconds = Math.max(0, Math.floor((Date.now() - start.getTime()) / 1000));
  const hh = Math.floor(diffSeconds / 3600);
  diffSeconds -= hh * 3600;
  const mm = Math.floor(diffSeconds / 60);
  const ss = diffSeconds - mm * 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

/**
 * Attendance clock — a general "start/end my day" timesheet row
 * (job_id null), distinct from any per-job time logging. Clock in inserts,
 * clock out updates the same row.
 */
export default function ClockStrip({
  teamMemberId,
  contractorId,
}: {
  teamMemberId: string;
  contractorId: string;
}) {
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<OpenTimesheet | null>(null);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("timesheets")
      .select("id, arrived_at")
      .eq("worker_id", teamMemberId)
      .eq("date", todayStr())
      .is("job_id", null)
      .is("left_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setOpen(data as OpenTimesheet | null);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamMemberId]);

  useEffect(() => {
    if (!open) return;
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [open]);

  const handleClockIn = async () => {
    setBusy(true);
    const { error } = await supabase.from("timesheets").insert({
      contractor_id: contractorId,
      worker_id: teamMemberId,
      date: todayStr(),
      arrived_at: toTimeString(new Date()),
      hours: 0,
      status: "pending",
    });
    setBusy(false);
    if (!error) await load();
  };

  const handleClockOut = async () => {
    if (!open) return;
    setBusy(true);
    const now = new Date();
    const leftAt = toTimeString(now);
    const [ah, am, as] = open.arrived_at.split(":").map(Number);
    const arrived = new Date();
    arrived.setHours(ah, am, as, 0);
    const rawHours = Math.max(0, (now.getTime() - arrived.getTime()) / 3600000);

    // Read break_minutes fresh — it may have been edited elsewhere since
    // clock-in, so don't trust a stale local copy.
    const { data: current } = await supabase
      .from("timesheets")
      .select("break_minutes")
      .eq("id", open.id)
      .maybeSingle();
    const breakMinutes = current?.break_minutes ?? 0;
    const hours = Math.max(0, rawHours - breakMinutes / 60);

    const { error } = await supabase
      .from("timesheets")
      .update({ left_at: leftAt, hours: Number(hours.toFixed(2)) })
      .eq("id", open.id);
    setBusy(false);
    if (!error) await load();
  };

  if (loading) {
    return (
      <div className="px-4 py-3 border-b bg-white flex items-center justify-center">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="px-4 py-3 border-b bg-white flex items-center justify-between">
      {open ? (
        <>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Clocked in</p>
            <p
              className="text-xl font-semibold tabular-nums"
              style={{ fontFamily: "'Roboto Mono', monospace" }}
            >
              {elapsedLabel(open.arrived_at)}
            </p>
          </div>
          <Button
            variant="outline"
            disabled={busy}
            onClick={handleClockOut}
            className="border-2"
            style={{ borderColor: ORANGE, color: ORANGE }}
          >
            {busy ? "…" : "Clock out"}
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">Not clocked in</p>
          <Button disabled={busy} onClick={handleClockIn} style={{ backgroundColor: ORANGE, color: "#fff" }}>
            {busy ? "…" : "Clock in"}
          </Button>
        </>
      )}
    </div>
  );
}
