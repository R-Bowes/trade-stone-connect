import { useMemo, useState } from "react";
import { addDays, format, startOfToday } from "date-fns";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAvailability } from "@/hooks/useAvailability";

const WINDOW_DAYS = 42; // 6 weeks
const PAGE_DAYS = 14; // 2-week page, matching the original single-page window

type SlotKey = string; // "yyyy-MM-dd-AM" | "yyyy-MM-dd-PM"

export interface PickedSlot {
  startTime: string;
  endTime: string;
}

interface SlotPickerProps {
  contractorId: string;
  maxSlots: number;
  minSlots?: number;
  onSubmit: (slots: PickedSlot[]) => Promise<void> | void;
  helperText?: string;
  submitLabel?: (count: number) => string;
}

function keyToSlot(key: SlotKey): PickedSlot {
  const dateStr = key.slice(0, 10);
  const startHour = key.endsWith("AM") ? "09:00" : "13:00";
  const endHour = key.endsWith("AM") ? "12:00" : "17:00";
  return {
    startTime: new Date(`${dateStr}T${startHour}`).toISOString(),
    endTime: new Date(`${dateStr}T${endHour}`).toISOString(),
  };
}

/**
 * 14-day AM/PM availability grid shared by every slot-submission surface:
 * the customer's initial proposal, either party's counter-proposal, and
 * the post-exhaustion single-date picker (maxSlots=1).
 */
export function SlotPicker({ contractorId, maxSlots, minSlots = 1, onSubmit, helperText, submitLabel }: SlotPickerProps) {
  const { getAvailabilityForRange, loading } = useAvailability(contractorId);
  const [selectedSlots, setSelectedSlots] = useState<Set<SlotKey>>(new Set());
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(0);
  const pageCount = WINDOW_DAYS / PAGE_DAYS;

  const today = startOfToday();
  const allDays = useMemo(
    () => Array.from({ length: WINDOW_DAYS }, (_, i) => addDays(today, i + 1)),
    [today.toISOString()],
  );
  const days = allDays.slice(page * PAGE_DAYS, (page + 1) * PAGE_DAYS);
  const rangeData = getAvailabilityForRange(allDays[0], allDays[allDays.length - 1]);

  const toggleSlot = (key: SlotKey) => {
    setSelectedSlots((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        if (next.size >= maxSlots) return prev;
        next.add(key);
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    if (selectedSlots.size === 0) return;
    setSaving(true);
    try {
      await onSubmit(Array.from(selectedSlots).map(keyToSlot));
      setSelectedSlots(new Set());
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading availability...
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {helperText && <p className="text-sm text-muted-foreground">{helperText}</p>}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          {format(days[0], "d MMM")} – {format(days[days.length - 1], "d MMM")}
        </span>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="text-xs text-muted-foreground tabular-nums">
            Week {page * 2 + 1}–{page * 2 + 2} of {pageCount * 2}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            disabled={page >= pageCount - 1}
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div className="space-y-1">
        {days.map((day) => {
          const dateStr = format(day, "yyyy-MM-dd");
          const dayData = rangeData[dateStr] ?? { amAvailable: false, pmAvailable: false };
          const amKey = `${dateStr}-AM`;
          const pmKey = `${dateStr}-PM`;
          const dayLabel = format(day, "EEE d MMM");
          const isWeekend = day.getDay() === 0 || day.getDay() === 6;

          if (!dayData.amAvailable && !dayData.pmAvailable) {
            return (
              <div key={dateStr} className="flex items-center gap-3 py-1.5 border-b border-border/40 last:border-0">
                <span className="text-xs text-muted-foreground w-24 shrink-0">{dayLabel}</span>
                <span className="text-xs text-muted-foreground italic">
                  {isWeekend ? "Weekend" : "Unavailable"}
                </span>
              </div>
            );
          }

          return (
            <div key={dateStr} className="flex items-center gap-3 py-1.5 border-b border-border/40 last:border-0">
              <span className="text-xs text-muted-foreground w-24 shrink-0">{dayLabel}</span>
              <div className="flex gap-2">
                {dayData.amAvailable && (
                  <button
                    type="button"
                    onClick={() => toggleSlot(amKey)}
                    className={`text-xs px-3 py-1 rounded-full border font-medium transition-colors ${
                      selectedSlots.has(amKey)
                        ? "bg-[#f07820] text-white border-[#f07820]"
                        : "bg-green-50 text-green-800 border-green-200 hover:border-[#f07820] hover:text-[#f07820]"
                    }`}
                  >
                    AM
                  </button>
                )}
                {dayData.pmAvailable && (
                  <button
                    type="button"
                    onClick={() => toggleSlot(pmKey)}
                    className={`text-xs px-3 py-1 rounded-full border font-medium transition-colors ${
                      selectedSlots.has(pmKey)
                        ? "bg-[#f07820] text-white border-[#f07820]"
                        : "bg-green-50 text-green-800 border-green-200 hover:border-[#f07820] hover:text-[#f07820]"
                    }`}
                  >
                    PM
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {selectedSlots.size > 0 && (
        <div className="pt-2 space-y-2">
          <p className="text-xs text-muted-foreground">
            {selectedSlots.size} of {maxSlots} slot{maxSlots !== 1 ? "s" : ""} selected
            {selectedSlots.size < minSlots && ` — select at least ${minSlots}`}
          </p>
          <Button size="sm" disabled={saving || selectedSlots.size < minSlots} onClick={handleSubmit} className="w-full">
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {submitLabel
              ? submitLabel(selectedSlots.size)
              : `Send ${selectedSlots.size} preference${selectedSlots.size !== 1 ? "s" : ""}`}
          </Button>
        </div>
      )}
    </div>
  );
}
