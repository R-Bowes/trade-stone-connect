import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import QRCode from "qrcode";
import { supabase } from "@/integrations/supabase/client";

interface ProfileData {
  tsCode: string;
  fullName: string;
  trade: string;
  location: string;
  logoUrl: string;
}

const QR_OPTIONS = {
  width: 220,
  margin: 2,
  color: { dark: "#1a2744", light: "#ffffff" },
};

const ShareProfileView = () => {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedHTML, setCopiedHTML] = useState(false);
  const [copiedPlain, setCopiedPlain] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const loadProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      const { data } = await supabase
        .from("profiles")
        .select("ts_profile_code, full_name, trades, location, logo_url")
        .eq("user_id", user.id)
        .single();
      if (data) {
        setProfile({
          tsCode: data.ts_profile_code ?? "",
          fullName: data.full_name ?? "",
          trade: data.trades && data.trades.length > 0 ? data.trades[0] : "Contractor",
          location: data.location ?? "",
          logoUrl: data.logo_url ?? "",
        });
      }
      setLoading(false);
    };
    loadProfile();
  }, []);

  const tsCode = profile?.tsCode ?? "";
  const profileUrl = `https://www.tradesltd.co.uk/c/${tsCode}`;

  useEffect(() => {
    if (!tsCode || !canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, profileUrl, QR_OPTIONS);
  }, [tsCode, profileUrl]);

  const triggerDownload = (href: string, filename: string) => {
    const link = document.createElement("a");
    link.href = href;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadPNG = async () => {
    if (!tsCode) return;
    const canvas = document.createElement("canvas");
    canvas.width = 600;
    canvas.height = 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#1a2744";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const qrCanvas = document.createElement("canvas");
    await QRCode.toCanvas(qrCanvas, profileUrl, {
      width: 500,
      margin: 2,
      color: { dark: "#1a2744", light: "#ffffff" },
    });
    const qrX = (canvas.width - 500) / 2;
    ctx.drawImage(qrCanvas, qrX, 60);

    ctx.textAlign = "center";
    ctx.fillStyle = "#f07820";
    ctx.font = "600 28px monospace";
    ctx.fillText(tsCode, canvas.width / 2, 620);

    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = "13px monospace";
    ctx.fillText(profileUrl, canvas.width / 2, 645);

    ctx.font = "18px sans-serif";
    const tradeWidth = ctx.measureText("TRADE").width;
    const stoneWidth = ctx.measureText("STONE").width;
    const totalWidth = tradeWidth + stoneWidth;
    const startX = canvas.width / 2 - totalWidth / 2;
    ctx.textAlign = "left";
    ctx.fillStyle = "#ffffff";
    ctx.fillText("TRADE", startX, 690);
    ctx.fillStyle = "#f07820";
    ctx.fillText("STONE", startX + tradeWidth, 690);

    triggerDownload(canvas.toDataURL("image/png"), `tradestone-qr-${tsCode}.png`);
  };

  const handleDownloadSVG = () => {
    if (!tsCode) return;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 460" width="400" height="460">
  <rect x="0" y="0" width="400" height="460" rx="12" fill="#1a2744" />
  <rect x="50" y="30" width="300" height="300" rx="8" fill="#ffffff" />
  <text x="200" y="190" fill="#1a2744" font-size="11" font-family="monospace" text-anchor="middle">Scan with camera app</text>
  <text x="200" y="370" fill="#f07820" font-size="18" font-weight="600" font-family="monospace" text-anchor="middle">${tsCode}</text>
  <text x="200" y="395" fill="rgba(255,255,255,0.5)" font-size="11" font-family="monospace" text-anchor="middle">${profileUrl}</text>
  <text x="168" y="430" fill="#ffffff" font-size="15" font-family="sans-serif" text-anchor="middle">TRADE</text>
  <text x="232" y="430" fill="#f07820" font-size="15" font-family="sans-serif" text-anchor="middle">STONE</text>
</svg>`;
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    triggerDownload(url, `tradestone-profile-${tsCode}.svg`);
    URL.revokeObjectURL(url);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(profileUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleDownloadVanStickerSVG = () => {
    if (!tsCode) return;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200" width="400" height="200">
  <rect x="0" y="0" width="400" height="200" rx="8" fill="#1a2744" />
  <rect x="16" y="16" width="168" height="168" rx="8" fill="#f07820" />
  <text x="100" y="90" fill="#ffffff" font-size="22" font-weight="600" font-family="sans-serif" text-anchor="middle">TRADE</text>
  <text x="100" y="116" fill="#ffffff" font-size="22" font-weight="600" font-family="sans-serif" text-anchor="middle">STONE</text>
  <text x="210" y="60" fill="#ffffff" font-size="13" font-family="sans-serif">Verified contractor</text>
  <text x="210" y="95" fill="#f07820" font-size="20" font-weight="600" font-family="monospace">${tsCode}</text>
  <text x="210" y="120" fill="#ffffff" opacity="0.5" font-size="11" font-family="sans-serif">tradesltd.co.uk</text>
  <rect x="210" y="130" width="40" height="40" rx="4" fill="#ffffff" opacity="0.15" />
</svg>`;
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    triggerDownload(url, `tradestone-van-sticker-${tsCode}.svg`);
    URL.revokeObjectURL(url);
  };

  const handleCopyEmailHTML = () => {
    const name = profile?.fullName || "[CONTRACTOR NAME]";
    const trade = profile?.trade || "[TRADE TYPE]";
    const html = `<table cellpadding="0" cellspacing="0" border="0" style="font-family: Arial, sans-serif;">
  <tr>
    <td style="padding-right: 16px; border-right: 2px solid #f07820; vertical-align: middle;">
      <p style="margin: 0; font-size: 16px; font-weight: 600; color: #1a2744;">${name}</p>
      <p style="margin: 4px 0 0; font-size: 12px; color: #666;">${trade}</p>
    </td>
    <td style="padding-left: 16px; vertical-align: middle;">
      <p style="margin: 0; font-size: 11px; color: #999; font-family: monospace; letter-spacing: 0.05em;">${tsCode}</p>
      <a href="https://www.tradesltd.co.uk/c/${tsCode}" style="font-size: 11px; color: #f07820; text-decoration: none;">Verify on TradeStone</a>
    </td>
  </tr>
</table>`;
    navigator.clipboard.writeText(html);
    setCopiedHTML(true);
    setTimeout(() => setCopiedHTML(false), 2000);
  };

  const handleCopyEmailPlainText = () => {
    const name = profile?.fullName || "[Name]";
    const trade = profile?.trade || "[Trade]";
    const text = `${name} | ${trade} | ${tsCode}\nVerify: https://www.tradesltd.co.uk/c/${tsCode}`;
    navigator.clipboard.writeText(text);
    setCopiedPlain(true);
    setTimeout(() => setCopiedPlain(false), 2000);
  };

  if (loading) {
    return <div style={{ padding: 24, color: "#6b7280" }}>Loading...</div>;
  }

  const outlineButtonStyle: React.CSSProperties = {
    background: "transparent",
    border: "1px solid rgba(255,255,255,0.4)",
    color: "rgba(255,255,255,0.8)",
    borderRadius: 6,
    padding: "8px 14px",
    fontSize: 13,
    cursor: "pointer",
    transition: "color 0.15s, border-color 0.15s",
  };

  const cardTitleStyle: React.CSSProperties = {
    fontSize: 14,
    fontWeight: 500,
    color: "#1a2744",
  };

  const cardDescriptionStyle: React.CSSProperties = {
    fontSize: 13,
    color: "#6b7280",
    lineHeight: 1.6,
  };

  const cardStyle: React.CSSProperties = {
    background: "white",
    border: "0.5px solid #e6e9ef",
    borderRadius: 12,
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  };

  const pillBadgeStyle: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 600,
    color: "#92400e",
    background: "#fef3c7",
    borderRadius: 999,
    padding: "2px 8px",
    textTransform: "uppercase",
    letterSpacing: "0.03em",
  };

  const primaryButtonStyle: React.CSSProperties = {
    background: "#1a2744",
    color: "white",
    border: "none",
    borderRadius: 6,
    padding: "7px 12px",
    fontSize: 12,
    cursor: "pointer",
  };

  const secondaryButtonStyle: React.CSSProperties = {
    background: "transparent",
    color: "#1a2744",
    border: "1px solid #1a2744",
    borderRadius: 6,
    padding: "7px 12px",
    fontSize: 12,
    cursor: "pointer",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, padding: 24 }}>
      {/* Section 1 — QR hero card */}
      <div
        style={{
          background: "#1a2744",
          borderRadius: 12,
          padding: 24,
          display: "flex",
          alignItems: "center",
          gap: 24,
        }}
      >
        <div
          style={{
            background: "white",
            padding: 12,
            borderRadius: 8,
            flexShrink: 0,
          }}
        >
          <canvas ref={canvasRef} width={220} height={220} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Your TS code</span>
          <span
            style={{
              fontFamily: "'Roboto Mono', monospace",
              color: "#f07820",
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: "0.08em",
            }}
          >
            {tsCode}
          </span>
          <span
            style={{
              fontFamily: "'Roboto Mono', monospace",
              color: "rgba(255,255,255,0.5)",
              fontSize: 12,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: 320,
            }}
          >
            {profileUrl}
          </span>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button
              style={outlineButtonStyle}
              onClick={handleDownloadPNG}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#ffffff")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.8)")}
            >
              Download PNG
            </button>
            <button
              style={outlineButtonStyle}
              onClick={handleDownloadSVG}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#ffffff")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.8)")}
            >
              Download SVG
            </button>
            <button
              style={outlineButtonStyle}
              onClick={handleCopyLink}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#ffffff")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.8)")}
            >
              {copiedLink ? "Copied" : "Copy link"}
            </button>
          </div>
        </div>
      </div>

      {/* Section 2 — Asset cards grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
        }}
      >
        {/* Card 1 — Business card template */}
        <div style={cardStyle}>
          <i className="ti ti-id-badge-2" style={{ fontSize: 24, color: "#1a2744" }} />
          <span style={cardTitleStyle}>Business card template</span>
          <p style={cardDescriptionStyle}>
            Design a branded business card with your TS code and QR code. Choose from 8 templates and download as PNG or PDF.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              style={primaryButtonStyle}
              onClick={() => navigate("/dashboard/contractor?view=business-card-editor")}
            >
              Create business card
            </button>
          </div>
        </div>

        {/* Card 2 — Van sticker */}
        <div style={cardStyle}>
          <i className="ti ti-car" style={{ fontSize: 24, color: "#1a2744" }} />
          <span style={cardTitleStyle}>Van sticker artwork</span>
          <p style={cardDescriptionStyle}>
            Rear window decal artwork in navy and orange. Supplied as a print-ready SVG — take to any sign printer.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={primaryButtonStyle} onClick={handleDownloadVanStickerSVG}>
              Download SVG
            </button>
          </div>
        </div>

        {/* Card 3 — Site board insert */}
        <div style={cardStyle}>
          <i className="ti ti-tools" style={{ fontSize: 24, color: "#1a2744" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={cardTitleStyle}>Site board insert</span>
            <span style={pillBadgeStyle}>Coming soon</span>
          </div>
          <p style={cardDescriptionStyle}>
            A3/A2 printable panel for scaffold boards and site hoardings. Shows your TS code, QR, trade, and insurance status.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={primaryButtonStyle} onClick={() => console.log("Coming soon")}>
              Download PDF
            </button>
          </div>
        </div>

        {/* Card 4 — Email signature */}
        <div style={cardStyle}>
          <i className="ti ti-mail" style={{ fontSize: 24, color: "#1a2744" }} />
          <span style={cardTitleStyle}>Email signature</span>
          <p style={cardDescriptionStyle}>
            Drop this snippet into your Gmail or Outlook signature. Includes your TS code and a verify link.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={primaryButtonStyle} onClick={handleCopyEmailHTML}>
              {copiedHTML ? "Copied!" : "Copy HTML"}
            </button>
            <button style={secondaryButtonStyle} onClick={handleCopyEmailPlainText}>
              {copiedPlain ? "Copied!" : "Copy plain text"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShareProfileView;
