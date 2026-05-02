import { useState, useEffect } from "react";
import { format, parseISO } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Clock, Lock, Loader2, Save, X } from "lucide-react";
import { useContractorAvailabilityManager } from "@/hooks/useAvailability";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const DEFAULT_SLOTS = DAY_NAMES.map((_, i) => ({
  day_of_week: i,
  start_time: "08:00",
  end_time: "17:00",
  is_available: i >= 1 && i <= 5, // Mon-Fri by default
}));

interface AvailabilityManagerProps {
  contractorId: string;
}

export function AvailabilityManager({ contractorId }: AvailabilityManagerProps) {
  const {
    slots: fetchedSlots,
    overrides,
    loading,
    saving,
    saveWeeklyPattern,
    addOverride,
    removeOverride,
  } = useContractorAvailabilityManager(contractorId);

  const [slots, setSlots] = useState(DEFAULT_SLOTS);

  // Override form state — default both halves blocked (contractor is marking unavailability)
  const [overrideDate, setOverrideDate] = useState("");
  const [overrideAm, setOverrideAm] = useState(false);
  const [overridePm, setOverridePm] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");

  useEffect(() => {
    if (fetchedSlots.length > 0) {
      const merged = DEFAULT_SLOTS.map(def => {
        const existing = fetchedSlots.find(a => a.day_of_week === def.day_of_week);
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
  }, [fetchedSlots]);

  const updateSlot = (dayIndex: number, field: string, value: any) => {
    setSlots(prev => prev.map(s => s.day_of_week === dayIndex ? { ...s, [field]: value } : s));
  };

  const handleSaveWeekly = async () => {
    await saveWeeklyPattern(slots);
  };

  const handleAddOverride = async () => {
    if (!overrideDate) return;
    // Use noon local time to avoid date-shifting across timezone boundaries
    await addOverride(
      new Date(overrideDate + "T12:00:00"),
      overrideAm,
      overridePm,
      overrideReason || undefined,
    );
    setOverrideDate("");
    setOverrideAm(false);
    setOverridePm(false);
    setOverrideReason("");
  };

  return (
    <div className="space-y-4">
      {/* ── Weekly pattern ──────────────────────────────────────────── */}
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

          <Button onClick={handleSaveWeekly} disabled={saving} className="w-full mt-4">
            <Save className="h-4 w-4 mr-2" />
            {saving ? "Saving..." : "Save Availability"}
          </Button>
        </CardContent>
      </Card>

      {/* ── Date overrides ──────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Date overrides</CardTitle>
          <CardDescription>Block specific dates regardless of your weekly pattern</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add form */}
          <div className="space-y-3 p-3 border rounded-lg">
            <div className="flex items-center gap-3 flex-wrap">
              <Input
                type="date"
                value={overrideDate}
                onChange={e => setOverrideDate(e.target.value)}
                className="w-44"
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={overrideAm ? "default" : "outline"}
                  onClick={() => setOverrideAm(v => !v)}
                  className={overrideAm ? "bg-green-600 hover:bg-green-700 text-white border-green-600" : ""}
                >
                  {overrideAm ? "AM free" : "AM blocked"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={overridePm ? "default" : "outline"}
                  onClick={() => setOverridePm(v => !v)}
                  className={overridePm ? "bg-green-600 hover:bg-green-700 text-white border-green-600" : ""}
                >
                  {overridePm ? "PM free" : "PM blocked"}
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Input
                placeholder="e.g. Holiday, Appointment"
                value={overrideReason}
                onChange={e => setOverrideReason(e.target.value)}
                className="flex-1"
              />
              <Button
                onClick={handleAddOverride}
                disabled={!overrideDate || saving}
                size="sm"
              >
                Add override
              </Button>
            </div>
          </div>

          {/* Overrides list */}
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : overrides.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-2">No date overrides set</p>
          ) : (
            <div className="space-y-2">
              {overrides.map((override) => (
                <div key={override.id} className="flex items-center gap-3 p-3 border rounded-lg">
                  <span className="text-sm font-medium w-36 shrink-0">
                    {format(parseISO(override.date + "T12:00:00"), "EEE d MMM yyyy")}
                  </span>
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${
                      override.am_available
                        ? "bg-green-100 text-green-700"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {override.am_available ? "AM free" : "AM blocked"}
                  </span>
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${
                      override.pm_available
                        ? "bg-green-100 text-green-700"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {override.pm_available ? "PM free" : "PM blocked"}
                  </span>
                  <div className="flex-1 min-w-0">
                    {override.reason === "Auto-blocked: confirmed job" ? (
                      <span title="Blocked by a confirmed job">
                        <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                      </span>
                    ) : override.reason ? (
                      <span className="text-xs text-muted-foreground truncate block">
                        {override.reason}
                      </span>
                    ) : null}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive shrink-0"
                    onClick={() => removeOverride(override.id)}
                    disabled={saving}
                    aria-label="Remove override"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
