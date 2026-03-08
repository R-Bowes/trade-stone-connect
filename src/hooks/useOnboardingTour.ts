import { useState, useEffect, useCallback } from "react";

export interface TourStep {
  target: string; // CSS selector
  title: string;
  description: string;
  placement?: "top" | "bottom" | "left" | "right";
  action?: () => void; // Optional action to run when step is shown
}

const TOUR_STORAGE_KEY = "tradestone_contractor_tour_completed";

export function useOnboardingTour(steps: TourStep[]) {
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  const hasCompletedTour = useCallback(() => {
    return localStorage.getItem(TOUR_STORAGE_KEY) === "true";
  }, []);

  const startTour = useCallback(() => {
    setCurrentStep(0);
    setIsActive(true);
  }, []);

  const endTour = useCallback((markComplete = true) => {
    setIsActive(false);
    setCurrentStep(0);
    if (markComplete) {
      localStorage.setItem(TOUR_STORAGE_KEY, "true");
    }
  }, []);

  const nextStep = useCallback(() => {
    if (currentStep < steps.length - 1) {
      const next = currentStep + 1;
      setCurrentStep(next);
      steps[next]?.action?.();
    } else {
      endTour(true);
    }
  }, [currentStep, steps, endTour]);

  const prevStep = useCallback(() => {
    if (currentStep > 0) {
      const prev = currentStep - 1;
      setCurrentStep(prev);
      steps[prev]?.action?.();
    }
  }, [currentStep, steps]);

  // Auto-start on first visit
  useEffect(() => {
    if (!hasCompletedTour()) {
      const timer = setTimeout(() => {
        startTour();
        steps[0]?.action?.();
      }, 1500); // Delay to let dashboard load
      return () => clearTimeout(timer);
    }
  }, [hasCompletedTour, startTour, steps]);

  return {
    isActive,
    currentStep,
    totalSteps: steps.length,
    step: steps[currentStep],
    startTour,
    endTour,
    nextStep,
    prevStep,
    hasCompletedTour,
  };
}
