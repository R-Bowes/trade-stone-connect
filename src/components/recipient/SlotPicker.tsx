import { useMemo, useState } from "react";
import { addDays, format, startOfToday } from "date-fns";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAvailability } from "@/hooks/useAvailability";

type SlotKey = string; // "yyyy-MM-dd-AM" | "yyyy-MM-dd-PM"

export interface PickedSlot {
  startTime: string;
  endTime: string;
}

interface SlotPickerProps {
  contractorId: string;
  maxSlots: number;
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
export function SlotPicker({ contractorId, maxSlots, onSubmit, helperText, submitLabel }: SlotPickerProps) {
  const { getAvailabilityForRange, loading } = useAvailability(contractorId);
  const [selectedSlots, setSelectedSlots] = useState<Set<SlotKey>>(new Set());
  const [saving, setSaving] = useState(false);

  const today = startOfToday();
  const days = useMemo(
    () => Array.from({ length: 14 }, (_, i) => addDays(today, i + 1)),
    [today.toISOString()],
  );
  const rangeData = getAvailabilityForRange(days[0], days[days.length - 1]);

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
          </p>
          <Button size="sm" disabled={saving} onClick={handleSubmit} className="w-full">
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
