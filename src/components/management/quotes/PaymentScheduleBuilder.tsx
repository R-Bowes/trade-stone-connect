import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";

export interface BuilderStage {
  key: string;
  stage_number: number;
  title: string;
  percentage: number;
  trigger_type: "on_acceptance" | "milestone" | "date";
  trigger_date?: string;
}

interface PaymentScheduleBuilderProps {
  totalAmount: number;
  onScheduleChange: (stages: BuilderStage[] | null) => void;
}

type Preset = "50-50" | "thirds" | "quarters" | "custom";

function presetStages(preset: Preset): Omit<BuilderStage, "key">[] {
  switch (preset) {
    case "50-50":
      return [
        { stage_number: 1, title: "Deposit", percentage: 50, trigger_type: "on_acceptance" },
        { stage_number: 2, title: "Completion", percentage: 50, trigger_type: "milestone" },
      ];
    case "thirds":
      return [
        { stage_number: 1, title: "Deposit", percentage: 33, trigger_type: "on_acceptance" },
        { stage_number: 2, title: "Mid-point", percentage: 33, trigger_type: "milestone" },
        { stage_number: 3, title: "Completion", percentage: 34, trigger_type: "milestone" },
      ];
    case "quarters":
      return [
        { stage_number: 1, title: "Deposit", percentage: 25, trigger_type: "on_acceptance" },
        { stage_number: 2, title: "First fix complete", percentage: 25, trigger_type: "milestone" },
        { stage_number: 3, title: "Second fix complete", percentage: 25, trigger_type: "milestone" },
        { stage_number: 4, title: "Completion", percentage: 25, trigger_type: "milestone" },
      ];
    case "custom":
      return [
        { stage_number: 1, title: "Deposit", percentage: 50, trigger_type: "on_acceptance" },
        { stage_number: 2, title: "Completion", percentage: 50, trigger_type: "milestone" },
      ];
  }
}

function withKeys(stages: Omit<BuilderStage, "key">[]): BuilderStage[] {
  return stages.map((s) => ({ ...s, key: crypto.randomUUID() }));
}

export function PaymentScheduleBuilder({ totalAmount, onScheduleChange }: PaymentScheduleBuilderProps) {
  const [enabled, setEnabled] = useState(false);
  const [stages, setStages] = useState<BuilderStage[]>(() => withKeys(presetStages("50-50")));

  const emit = useCallback((next: BuilderStage[]) => {
    setStages(next);
    onScheduleChange(enabled ? next : null);
  }, [enabled, onScheduleChange]);

  useEffect(() => {
    onScheduleChange(enabled ? stages : null);
    // Only re-fire on the toggle itself — stage edits call emit() directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  const applyPreset = (preset: Preset) => {
    const next = withKeys(presetStages(preset));
    setStages(next);
    onScheduleChange(enabled ? next : null);
  };

  const updateStage = (key: string, patch: Partial<BuilderStage>) => {
    emit(stages.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  };

  const removeStage = (key: string) => {
    if (stages.length <= 2) return;
    const remaining = stages.filter((s) => s.key !== key).map((s, i) => ({ ...s, stage_number: i + 1 }));
    emit(remaining);
  };

  const addStage = () => {
    const next = [
      ...stages,
      { key: crypto.randomUUID(), stage_number: stages.length + 1, title: "", percentage: 0, trigger_type: "milestone" as const },
    ];
    emit(next);
  };

  const totalPercentage = stages.reduce((sum, s) => sum + (s.percentage || 0), 0);
  const percentageOk = Math.round(totalPercentage) === 100;
  const fmt = (n: number) => n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="space-y-3 rounded-md border p-4">
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="staged-payments-toggle"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-4 w-4"
        />
        <Label htmlFor="staged-payments-toggle" className="cursor-pointer">Split into staged payments</Label>
      </div>

      {enabled && (
        <div className="space-y-4 pl-1">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => applyPreset("50-50")}>50/50</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => applyPreset("thirds")}>Thirds</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => applyPreset("quarters")}>Quarters</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => applyPreset("custom")}>Custom</Button>
          </div>

          <div className="space-y-2">
            {stages.map((stage) => (
              <div key={stage.key} className="grid grid-cols-[24px_1fr_88px_140px_32px] gap-2 items-center">
                <span className="text-xs text-muted-foreground text-center">{stage.stage_number}</span>
                <Input
                  value={stage.title}
                  onChange={(e) => updateStage(stage.key, { title: e.target.value })}
                  placeholder="Stage title"
                />
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={stage.percentage}
                  onChange={(e) => updateStage(stage.key, { percentage: Number(e.target.value) })}
                  className="text-right"
                />
                <Select
                  value={stage.trigger_type}
                  onValueChange={(v) => updateStage(stage.key, { trigger_type: v as BuilderStage["trigger_type"] })}
                >
                  <SelectTrigger className="text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="on_acceptance">On acceptance (deposit)</SelectItem>
                    <SelectItem value="milestone">On milestone</SelectItem>
                    <SelectItem value="date">On date</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => removeStage(stage.key)}
                  disabled={stages.length <= 2}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
                {stage.trigger_type === "date" && (
                  <div className="col-span-5 pl-7">
                    <Input
                      type="date"
                      value={stage.trigger_date ?? ""}
                      onChange={(e) => updateStage(stage.key, { trigger_date: e.target.value })}
                      className="w-48"
                    />
                  </div>
                )}
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addStage}>
              <Plus className="h-4 w-4 mr-2" />Add stage
            </Button>
          </div>

          <div className={`rounded-md border p-3 text-sm ${percentageOk ? "bg-muted/40" : "bg-red-50 border-red-300"}`}>
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
              {stages.map((s, i) => (
                <span key={s.key}>
                  {i > 0 && <span className="text-muted-foreground"> + </span>}
                  Stage {s.stage_number}: £{fmt((totalAmount * (s.percentage || 0)) / 100)}
                </span>
              ))}
              <span className="text-muted-foreground"> = </span>
              <span className={`font-semibold ${percentageOk ? "" : "text-destructive"}`}>
                £{fmt(totalAmount)} ({totalPercentage}%)
              </span>
            </div>
            {!percentageOk && (
              <p className="text-destructive text-xs mt-1">Stages must sum to exactly 100%.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function isScheduleValid(stages: BuilderStage[] | null): boolean {
  if (!stages) return true;
  if (stages.length < 2) return false;
  const total = stages.reduce((sum, s) => sum + (s.percentage || 0), 0);
  return Math.round(total) === 100 && stages.every((s) => s.title.trim().length > 0);
}
