import { useCallback, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SuggestedValue } from "@/hooks/useWorkOrders";

/**
 * Approved value input state. Follows the suggestion until the user types,
 * then leaves their figure alone.
 */
export function useApprovedValueInput(suggestion: SuggestedValue | null) {
  const [text, setText] = useState("");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!touched) setText(suggestion ? suggestion.value.toFixed(2) : "");
  }, [suggestion, touched]);

  const parsed = Number(text);
  const value = text.trim() !== "" && Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) / 100 : null;

  const reset = useCallback(() => {
    setTouched(false);
    setText("");
  }, []);

  return {
    text,
    value,
    setText: (next: string) => {
      setTouched(true);
      setText(next);
    },
    reset,
  };
}

interface ApprovedValueFieldProps {
  id: string;
  text: string;
  onChange: (text: string) => void;
  suggestion: SuggestedValue | null;
  loadingSuggestion: boolean;
  /** Hide the "no agreed rates" hint until there is something to suggest for (e.g. no site picked yet). */
  ready: boolean;
}

export function ApprovedValueField({ id, text, onChange, suggestion, loadingSuggestion, ready }: ApprovedValueFieldProps) {
  const hint = !ready
    ? null
    : loadingSuggestion
      ? "Working out a suggested value from the agreed rates."
      : suggestion
        ? suggestion.basis.length === 1
          ? `Suggested from ${suggestion.basis[0].contractorName}'s agreed rates: call-out plus 2 hours' labour.`
          : `Suggested from the highest of ${suggestion.basis.length} contractors' agreed rates: call-out plus 2 hours' labour.`
        : "No agreed rates cover this site. Enter the most this work may cost.";

  return (
    <div className="space-y-1">
      <Label htmlFor={id}>Approved value</Label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-mono">£</span>
        <Input
          id={id}
          className="pl-7 font-mono"
          inputMode="decimal"
          type="number"
          min="0.01"
          step="0.01"
          value={text}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        The most this work can cost without further sign-off.{hint ? ` ${hint}` : ""}
      </p>
    </div>
  );
}
