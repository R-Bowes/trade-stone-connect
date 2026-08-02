import { useRef, useState, useCallback } from "react";

interface BeforeAfterSliderProps {
  beforeUrl: string;
  afterUrl: string;
  height?: number;
}

// No external library: "after" image fills the container, "before" image
// is absolutely positioned and clipped with clip-path so only the left
// sliderPosition% of it shows. Dragging (mouse or touch) the handle moves
// that clip boundary. Percent-based clip-path means this works at any
// container width without recalculating pixel offsets.
export function BeforeAfterSlider({ beforeUrl, afterUrl, height = 240 }: BeforeAfterSliderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [sliderPosition, setSliderPosition] = useState(50);
  const draggingRef = useRef(false);

  const updateFromClientX = useCallback((clientX: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setSliderPosition(Math.min(100, Math.max(0, pct)));
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    draggingRef.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updateFromClientX(e.clientX);
  }, [updateFromClientX]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    updateFromClientX(e.clientX);
  }, [updateFromClientX]);

  const handlePointerUp = useCallback(() => {
    draggingRef.current = false;
  }, []);

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      style={{
        position: "relative",
        width: "100%",
        height,
        overflow: "hidden",
        borderRadius: 8,
        cursor: "ew-resize",
        userSelect: "none",
        touchAction: "none",
        background: "#e5e7eb",
      }}
    >
      {/* After — fills the container */}
      <img
        src={afterUrl}
        alt="After"
        draggable={false}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }}
      />
      {/* Before — clipped to the left sliderPosition% */}
      <div style={{ position: "absolute", inset: 0, clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }}>
        <img
          src={beforeUrl}
          alt="Before"
          draggable={false}
          style={{ width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }}
        />
      </div>

      {/* Labels */}
      <span style={{ position: "absolute", top: 8, left: 8, background: "rgba(0,0,0,0.55)", color: "white", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", padding: "3px 8px", borderRadius: 4, pointerEvents: "none" }}>
        Before
      </span>
      <span style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,0.55)", color: "white", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", padding: "3px 8px", borderRadius: 4, pointerEvents: "none" }}>
        After
      </span>

      {/* Draggable handle */}
      <div
        style={{
          position: "absolute", top: 0, bottom: 0, left: `${sliderPosition}%`,
          width: 3, background: "white", transform: "translateX(-1.5px)",
          boxShadow: "0 0 4px rgba(0,0,0,0.4)", pointerEvents: "none",
        }}
      >
        <div style={{
          position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
          width: 32, height: 32, borderRadius: "50%", background: "white",
          boxShadow: "0 1px 4px rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <i className="ti ti-arrows-diff" style={{ fontSize: 16, color: "#1a2744" }} />
        </div>
      </div>
    </div>
  );
}
