import { useCallback, useRef, useState } from "react";

/**
 * Wraps an async action so a second invocation while the first is still in
 * flight is ignored. The lock is a ref (checked/set synchronously, before any
 * render), not just the `pending` state — a state-only guard leaves a window
 * where a fast double-click can pass the check twice before React re-renders
 * the disabled button.
 */
export function useSubmitGuard() {
  const pendingRef = useRef(false);
  const [pending, setPending] = useState(false);

  const guard = useCallback(
    <Args extends unknown[]>(fn: (...args: Args) => Promise<void> | void) =>
      async (...args: Args) => {
        if (pendingRef.current) return;
        pendingRef.current = true;
        setPending(true);
        try {
          await fn(...args);
        } finally {
          pendingRef.current = false;
          setPending(false);
        }
      },
    [],
  );

  return { pending, guard };
}
