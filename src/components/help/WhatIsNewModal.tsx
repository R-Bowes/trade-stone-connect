import { useHelpSystem } from "./HelpSystemProvider";

export default function WhatIsNewModal() {
  const { activeModal, unseenAnnouncements, onAnnouncementsSeen } = useHelpSystem();

  if (activeModal !== "whatsnew") return null;

  const ids = unseenAnnouncements.map((a) => a.id);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 14,
          border: "0.5px solid #e6e9ef",
          width: "100%",
          maxWidth: 480,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
        }}
      >
        {/* Header */}
        <div style={{ padding: "28px 28px 0" }}>
          <h2
            style={{
              fontFamily: "'Lexend', sans-serif",
              fontWeight: 600,
              fontSize: 18,
              color: "#1a2744",
              margin: "0 0 20px",
            }}
          >
            What's new in TradeStone
          </h2>
        </div>

        {/* Announcements list */}
        <div style={{ padding: "0 28px", display: "flex", flexDirection: "column", gap: 16 }}>
          {unseenAnnouncements.map((ann) => (
            <div key={ann.id} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  background: "#fff3e8",
                  border: "1.5px solid #f0c89a",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <i className="ti ti-sparkles" style={{ fontSize: 20, color: "#f07820", lineHeight: 1 }} />
              </div>
              <div style={{ minWidth: 0 }}>
                <p
                  style={{
                    fontFamily: "'Lexend', sans-serif",
                    fontWeight: 500,
                    fontSize: 14,
                    color: "#1a2744",
                    margin: "0 0 4px",
                  }}
                >
                  {ann.title}
                </p>
                {ann.description && (
                  <p
                    style={{
                      fontFamily: "'Source Serif 4', serif",
                      fontSize: 13,
                      color: "#6b7280",
                      margin: 0,
                      lineHeight: 1.6,
                    }}
                  >
                    {ann.description}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "24px 28px",
            display: "flex",
            justifyContent: "flex-end",
            marginTop: 8,
          }}
        >
          <button
            onClick={() => onAnnouncementsSeen(ids)}
            style={{
              background: "#f07820",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "9px 24px",
              fontSize: 13,
              fontFamily: "'Lexend', sans-serif",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
