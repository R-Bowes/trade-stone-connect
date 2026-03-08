import { useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { X, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import type { TourStep } from "@/hooks/useOnboardingTour";

interface OnboardingTourProps {
  isActive: boolean;
  step: TourStep | undefined;
  currentStep: number;
  totalSteps: number;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
}

interface TooltipPosition {
  top: number;
  left: number;
  arrowSide: "top" | "bottom" | "left" | "right";
}

export function OnboardingTour({
  isActive,
  step,
  currentStep,
  totalSteps,
  onNext,
  onPrev,
  onSkip,
}: OnboardingTourProps) {
  const [position, setPosition] = useState<TooltipPosition | null>(null);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isActive || !step) return;

    const calculate = () => {
      const el = document.querySelector(step.target);
      if (!el) return;

      const rect = el.getBoundingClientRect();
      setTargetRect(rect);

      // Scroll element into view
      el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });

      // Calculate position after a tick to account for scroll
      requestAnimationFrame(() => {
        const updatedRect = el.getBoundingClientRect();
        setTargetRect(updatedRect);

        const tooltipWidth = 340;
        const tooltipHeight = 200;
        const gap = 16;
        const placement = step.placement || "bottom";

        let top = 0;
        let left = 0;
        let arrowSide: "top" | "bottom" | "left" | "right" = "top";

        switch (placement) {
          case "bottom":
            top = updatedRect.bottom + gap;
            left = updatedRect.left + updatedRect.width / 2 - tooltipWidth / 2;
            arrowSide = "top";
            break;
          case "top":
            top = updatedRect.top - tooltipHeight - gap;
            left = updatedRect.left + updatedRect.width / 2 - tooltipWidth / 2;
            arrowSide = "bottom";
            break;
          case "right":
            top = updatedRect.top + updatedRect.height / 2 - tooltipHeight / 2;
            left = updatedRect.right + gap;
            arrowSide = "left";
            break;
          case "left":
            top = updatedRect.top + updatedRect.height / 2 - tooltipHeight / 2;
            left = updatedRect.left - tooltipWidth - gap;
            arrowSide = "right";
            break;
        }

        // Keep within viewport
        left = Math.max(16, Math.min(left, window.innerWidth - tooltipWidth - 16));
        top = Math.max(16, Math.min(top, window.innerHeight - tooltipHeight - 16));

        setPosition({ top, left, arrowSide });
      });
    };

    // Small delay for DOM/tab changes to settle
    const timer = setTimeout(calculate, 300);
    window.addEventListener("resize", calculate);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", calculate);
    };
  }, [isActive, step, currentStep]);

  if (!isActive || !step || !position) return null;

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 z-[9998]" onClick={onSkip}>
        <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <mask id="tour-mask">
              <rect width="100%" height="100%" fill="white" />
              {targetRect && (
                <rect
                  x={targetRect.left - 6}
                  y={targetRect.top - 6}
                  width={targetRect.width + 12}
                  height={targetRect.height + 12}
                  rx="8"
                  fill="black"
                />
              )}
            </mask>
          </defs>
          <rect
            width="100%"
            height="100%"
            fill="rgba(0,0,0,0.6)"
            mask="url(#tour-mask)"
          />
        </svg>
      </div>

      {/* Highlight ring around target */}
      {targetRect && (
        <div
          className="fixed z-[9999] pointer-events-none rounded-lg ring-2 ring-primary ring-offset-2 ring-offset-background transition-all duration-300"
          style={{
            top: targetRect.top - 6,
            left: targetRect.left - 6,
            width: targetRect.width + 12,
            height: targetRect.height + 12,
          }}
        />
      )}

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        className="fixed z-[10000] w-[340px] bg-card border border-border rounded-xl shadow-2xl p-5 animate-in fade-in-0 zoom-in-95 duration-200"
        style={{ top: position.top, left: position.left }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onSkip}
          className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Content */}
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-foreground text-sm">{step.title}</h3>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">{step.description}</p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {currentStep + 1} of {totalSteps}
          </span>
          <div className="flex gap-2">
            {currentStep > 0 && (
              <Button variant="ghost" size="sm" onClick={onPrev}>
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
            )}
            <Button size="sm" onClick={onNext}>
              {currentStep === totalSteps - 1 ? "Finish" : "Next"}
              {currentStep < totalSteps - 1 && <ChevronRight className="h-4 w-4 ml-1" />}
            </Button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-3 flex gap-1">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i <= currentStep ? "bg-primary" : "bg-muted/40"
              }`}
            />
          ))}
        </div>
      </div>
    </>
  );
}
