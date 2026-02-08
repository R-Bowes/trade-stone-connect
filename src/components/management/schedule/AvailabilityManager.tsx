import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Clock, Save } from "lucide-react";
import type { AvailabilitySlot } from "@/hooks/useSchedule";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const DEFAULT_SLOTS = DAY_NAMES.map((_, i) => ({
  day_of_week: i,
  start_time: "08:00",
  end_time: "17:00",
  is_available: i >= 1 && i <= 5, // Mon-Fri by default
}));

interface AvailabilityManagerProps {
  availability: AvailabilitySlot[];
  onSave: (slots: { day_of_week: number; start_time: string; end_time: string; is_available: boolean }[]) => Promise<void>;
}

export function AvailabilityManager({ availability, onSave }: AvailabilityManagerProps) {
  const [slots, setSlots] = useState(DEFAULT_SLOTS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (availability.length > 0) {
      const merged = DEFAULT_SLOTS.map(def => {
        const existing = availability.find(a => a.day_of_week === def.day_of_week);
        if (existing) {
          return {
            day_of_week: existing.day_of_week,
            start_time: existing.start_time.slice(0, 5),
            end_time: existing.end_time.slice(0, 5),
            is_available: existing.is_available,
          };
        }
        return def;
      });
      setSlots(merged);
    }
  }, [availability]);

  const updateSlot = (dayIndex: number, field: string, value: any) => {
    setSlots(prev => prev.map(s => s.day_of_week === dayIndex ? { ...s, [field]: value } : s));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(slots);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Working Hours & Availability
        </CardTitle>
        <CardDescription>Set your regular working hours for each day of the week</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {slots.map((slot) => (
          <div key={slot.day_of_week} className="flex items-center gap-4 p-3 border rounded-lg">
            <div className="w-24">
              <Label className="font-medium">{DAY_NAMES[slot.day_of_week]}</Label>
            </div>
            <Switch
              checked={slot.is_available}
              onCheckedChange={(v) => updateSlot(slot.day_of_week, "is_available", v)}
            />
            {slot.is_available ? (
              <div className="flex items-center gap-2 flex-1">
                <Input
                  type="time"
                  value={slot.start_time}
                  onChange={e => updateSlot(slot.day_of_week, "start_time", e.target.value)}
                  className="w-32"
                />
                <span className="text-muted-foreground">to</span>
                <Input
                  type="time"
                  value={slot.end_time}
                  onChange={e => updateSlot(slot.day_of_week, "end_time", e.target.value)}
                  className="w-32"
                />
              </div>
            ) : (
              <span className="text-muted-foreground text-sm">Unavailable</span>
            )}
          </div>
        ))}

        <Button onClick={handleSave} disabled={saving} className="w-full mt-4">
          <Save className="h-4 w-4 mr-2" />
          {saving ? "Saving..." : "Save Availability"}
        </Button>
      </CardContent>
    </Card>
  );
}
