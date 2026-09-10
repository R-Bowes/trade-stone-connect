import { useState } from "react";

export interface VerificationBadgeProps {
  tier: number;
  size?: "sm" | "md" | "lg";
}

// Tiers 3 and 4 are deliberately absent — no contractor holds either tier,
// and neither claim (insurance verification, background checks) has a
// working write path in the product yet. They remain in the data model
// (contractor_verification.current_tier, recalculate_contractor_tier) for
// when real checks are built; only the public display was removed. See
// CLAUDE.md's verification-tiers entry for the full record.
const TIER_STYLES: Record<number, { label: string; bg: string; border: string; color: string; filled: boolean; icon: string }> = {
  1: { label: "Registered", bg: "transparent", border: "#c9c9c9", color: "#888", filled: false, icon: "" },
  2: { label: "Stripe Verified", bg: "#2563eb", border: "#2563eb", color: "#fff", filled: true, icon: "✓" },
};

const TIER_TOOLTIPS: Record<number, string> = {
  1: "This contractor has registered on TradeStone",
  2: "Identity checks completed with Stripe during payment setup",
};

const SIZES: Record<NonNullable<VerificationBadgeProps["size"]>, { fontSize: number; padding: string; iconSize: number; gap: number }> = {
  sm: { fontSize: 9, padding: "2px 7px", iconSize: 9, gap: 3 },
  md: { fontSize: 11, padding: "3px 10px", iconSize: 11, gap: 4 },
  lg: { fontSize: 13, padding: "5px 14px", iconSize: 13, gap: 6 },
};

export function VerificationBadge({ tier, size = "sm" }: VerificationBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const style = TIER_STYLES[tier];
  const tooltip = TIER_TOOLTIPS[tier];
  const dims = SIZES[size];

  if (!style) return null;

  return (
    <span
      style={{ position: "relative", display: "inline-flex" }}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: dims.gap,
          fontSize: dims.fontSize,
          fontWeight: 600,
          padding: dims.padding,
          borderRadius: 20,
          background: style.filled ? style.bg : style.bg,
          border: `1px solid ${style.border}`,
          color: style.color,
          fontFamily: "'Lexend', sans-serif",
          whiteSpace: "nowrap",
          cursor: "default",
        }}
      >
        {style.icon && <span style={{ fontSize: dims.iconSize, lineHeight: 1 }}>{style.icon}</span>}
        {style.label}
      </span>
      {showTooltip && tooltip && (
        <span
          role="tooltip"
          style={{
            position: "absolute",
            bottom: "calc(100% + 6px)",
            left: "50%",
            transform: "translateX(-50%)",
            background: "#1a2744",
            color: "#fff",
            fontSize: 11,
            lineHeight: 1.4,
            padding: "6px 10px",
            borderRadius: 6,
            width: 200,
            textAlign: "center",
            zIndex: 20,
            boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
            fontFamily: "'Lexend', sans-serif",
            fontWeight: 400,
          }}
        >
          {tooltip}
        </span>
      )}
    </span>
  );
}
