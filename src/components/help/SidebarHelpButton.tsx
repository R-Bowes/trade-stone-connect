import { useHelpSystem } from "./HelpSystemProvider";

interface SidebarHelpButtonProps {
  collapsed: boolean;
}

export default function SidebarHelpButton({ collapsed }: SidebarHelpButtonProps) {
  const { openHelp } = useHelpSystem();

  return (
    <div
      style={{
        borderTop: "1px solid rgba(255,255,255,0.10)",
        flexShrink: 0,
      }}
    >
      <button
        onClick={openHelp}
        title={collapsed ? "How to use TradeStone" : undefined}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          width: "100%",
          padding: collapsed ? "10px 0" : "10px 12px",
          justifyContent: collapsed ? "center" : "flex-start",
          background: "transparent",
          border: "none",
          borderLeft: "3px solid transparent",
          cursor: "pointer",
          color: "rgba(255,255,255,0.55)",
          fontSize: 13,
          fontFamily: "inherit",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textAlign: "left",
          boxSizing: "border-box",
        }}
      >
        <i
          className="ti ti-help-circle"
          style={{ fontSize: 18, flexShrink: 0, lineHeight: 1 }}
        />
        {!collapsed && <span>How to use TradeStone</span>}
      </button>
    </div>
  );
}
