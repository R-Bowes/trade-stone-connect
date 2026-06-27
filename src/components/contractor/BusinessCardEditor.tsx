import { useEffect, useRef, useState } from "react";
import jsPDF from "jspdf";
import { supabase } from "@/integrations/supabase/client";

interface BusinessCardEditorProps {
  tsCode?: string;
  fullName?: string;
  trade?: string;
  location?: string;
  logoUrl?: string;
}

interface FetchedProfile {
  tsCode: string;
  fullName: string;
  trade: string;
  location: string;
  logoUrl: string;
}

interface Template {
  id: string;
  name: string;
  bg: string;
  accent: string;
}

const TEMPLATES: Template[] = [
  { id: "navy", name: "Classic navy", bg: "#1a2744", accent: "#f07820" },
  { id: "white", name: "Clean white", bg: "#ffffff", accent: "#f07820" },
  { id: "orange", name: "Bold orange", bg: "#f07820", accent: "#1a2744" },
  { id: "minimal", name: "Minimal", bg: "#f8f9fa", accent: "#1a2744" },
  { id: "slate", name: "Slate", bg: "#334155", accent: "#f07820" },
  { id: "forest", name: "Forest", bg: "#1a3a2a", accent: "#f0a020" },
  { id: "charcoal", name: "Charcoal", bg: "#1c1c1c", accent: "#f07820" },
  { id: "ice", name: "Ice blue", bg: "#e8f4fd", accent: "#1a2744" },
];

const COLOR_SWATCHES = ["#1a2744", "#f07820", "#334155", "#1a3a2a", "#1c1c1c", "#7c3aed"];

function getLuminance(hex: string): number {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16) / 255;
  const g = parseInt(c.substring(2, 4), 16) / 255;
  const b = parseInt(c.substring(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function getTextColor(bg: string): string {
  return getLuminance(bg) < 0.4 ? "#ffffff" : "#1a2744";
}

function getSubColor(bg: string): string {
  return getLuminance(bg) < 0.4 ? "rgba(255,255,255,0.6)" : "#6b7280";
}

function withAlpha(hex: string, alpha: number): string {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getInitials(name: string): string {
  if (!name) return "?";
  return name.split(" ").filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function drawQRPattern(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
  const finderSize = size * 0.22;
  const pad = size * 0.06;
  const positions: [number, number][] = [
    [x + pad, y + pad],
    [x + size - pad - finderSize, y + pad],
    [x + pad, y + size - pad - finderSize],
  ];

  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.fillStyle = color;
  for (const [fx, fy] of positions) {
    ctx.strokeRect(fx, fy, finderSize, finderSize);
    const innerSize = finderSize * 0.4;
    const innerOffset = (finderSize - innerSize) / 2;
    ctx.fillRect(fx + innerOffset, fy + innerOffset, innerSize, innerSize);
  }

  const gridSize = 4;
  const dotSize = 4;
  const gridSpan = size * 0.4;
  const gridStartX = x + (size - gridSpan) / 2;
  const gridStartY = y + (size - gridSpan) / 2;
  const step = gridSpan / gridSize;
  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridSize; j++) {
      if ((i + j) % 2 === 0) {
        ctx.fillRect(gridStartX + i * step, gridStartY + j * step, dotSize, dotSize);
      }
    }
  }
}

function drawInitialsAvatar(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, accent: string, fullName: string) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = accent;
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "600 22px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(getInitials(fullName), cx, cy);
  ctx.textBaseline = "alphabetic";
}

async function drawFront(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  bg: string,
  accent: string,
  textColor: string,
  subColor: string,
  fullName: string,
  trade: string,
  location: string,
  tagline: string,
  tsCode: string,
  logoDataUrl: string | null
) {
  ctx.clearRect(0, 0, W, H);

  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(0, 0, W, H, 14);
  ctx.fill();

  ctx.fillStyle = withAlpha(accent, 0.15);
  ctx.fillRect(W - 140, 0, 140, H);

  ctx.fillStyle = accent;
  ctx.fillRect(0, H - 6, W, 6);

  const cx = 76, cy = 76, r = 36;
  if (logoDataUrl) {
    try {
      const img = await loadImage(logoDataUrl);
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
      ctx.restore();
    } catch {
      drawInitialsAvatar(ctx, cx, cy, r, accent, fullName);
    }
  } else {
    drawInitialsAvatar(ctx, cx, cy, r, accent, fullName);
  }

  ctx.textAlign = "left";
  ctx.fillStyle = textColor;
  ctx.font = "700 32px sans-serif";
  ctx.fillText(fullName || "Your name", 40, 165);

  ctx.fillStyle = accent;
  ctx.font = "500 20px sans-serif";
  ctx.fillText(trade || "Trade", 40, 195);

  ctx.fillStyle = subColor;
  ctx.font = "400 18px sans-serif";
  ctx.fillText(location || "", 40, 220);

  if (tagline) {
    ctx.fillStyle = subColor;
    ctx.font = "italic 400 17px sans-serif";
    ctx.fillText(tagline.slice(0, 48), 40, 248);
  }

  ctx.fillStyle = subColor;
  ctx.font = "400 16px monospace";
  ctx.fillText(tsCode, 40, H - 20);

  const qrSize = 88;
  const qrX = W - 112, qrY = H - 132;
  ctx.fillStyle = withAlpha(accent, 0.12);
  ctx.beginPath();
  ctx.roundRect(qrX, qrY, qrSize, qrSize, 8);
  ctx.fill();
  drawQRPattern(ctx, qrX, qrY, qrSize, accent);

  ctx.textAlign = "center";
  ctx.font = "400 12px sans-serif";
  ctx.fillStyle = subColor;
  ctx.fillText("Scan to visit profile", qrX + qrSize / 2, qrY + qrSize + 14);

  ctx.textAlign = "right";
  ctx.font = "400 11px sans-serif";
  const prevAlpha = ctx.globalAlpha;
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = subColor;
  ctx.fillText("Powered by TradeStone", W - 16, H - 10);
  ctx.globalAlpha = prevAlpha;
}

function drawBack(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  bg: string,
  accent: string,
  textColor: string,
  subColor: string,
  tsCode: string
) {
  ctx.clearRect(0, 0, W, H);

  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.roundRect(0, 0, W, H, 14);
  ctx.fill();

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, 10);
  ctx.fillRect(0, H - 10, W, 10);

  ctx.textAlign = "left";
  ctx.font = "700 40px sans-serif";
  ctx.fillStyle = bg;
  ctx.fillText("TRADE", 56, H / 2 + 14);
  const tradeWidth = ctx.measureText("TRADE").width;
  ctx.fillStyle = accent;
  ctx.fillText("STONE", 56 + tradeWidth, H / 2 + 14);

  ctx.fillStyle = "#6b7280";
  ctx.font = "400 18px sans-serif";
  ctx.fillText("Verified contractor platform", 56, H / 2 + 38);
  ctx.fillText("for homeowners and businesses", 56, H / 2 + 58);

  ctx.fillStyle = "#9ca3af";
  ctx.font = "400 15px monospace";
  ctx.fillText(`tradesltd.co.uk/c/${tsCode}`, 56, H / 2 + 82);

  const qrSize = 124;
  const qrX = W - 180, qrY = H / 2 - 70;
  ctx.fillStyle = "#f3f4f6";
  ctx.beginPath();
  ctx.roundRect(qrX, qrY, qrSize, qrSize, 10);
  ctx.fill();
  drawQRPattern(ctx, qrX, qrY, qrSize, bg);

  ctx.textAlign = "center";
  ctx.fillStyle = "#9ca3af";
  ctx.font = "400 14px sans-serif";
  ctx.fillText("Scan to verify", qrX + qrSize / 2, qrY + qrSize + 18);

  ctx.textAlign = "right";
  ctx.fillStyle = "#d1d5db";
  ctx.font = "400 11px sans-serif";
  ctx.fillText("Powered by TradeStone", W - 16, H - 14);

  // textColor is unused by this face — kept for signature symmetry with drawFront
  void textColor;
}

function triggerDownload(href: string, filename: string) {
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

const labelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  color: "#6b7280",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};

const lockNoteStyle: React.CSSProperties = {
  fontSize: 10,
  color: "#9ca3af",
  marginTop: 2,
};

const fieldLabelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  color: "#374151",
};

const inputStyle: React.CSSProperties = {
  fontSize: 12,
  padding: "6px 8px",
  borderRadius: 6,
  border: "0.5px solid #e6e9ef",
  width: "100%",
  boxSizing: "border-box",
};

const disabledInputStyle: React.CSSProperties = {
  ...inputStyle,
  background: "#f8f9fa",
  color: "#6b7280",
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

const outlineButtonStyle: React.CSSProperties = {
  background: "transparent",
  color: "#1a2744",
  border: "1px solid #1a2744",
  borderRadius: 6,
  padding: "7px 12px",
  fontSize: 12,
  cursor: "pointer",
};

const BusinessCardEditor = ({
  tsCode: tsCodeProp = "",
  fullName: fullNameProp = "",
  trade: tradeProp = "",
  location: locationProp = "",
  logoUrl: logoUrlProp = "",
}: BusinessCardEditorProps) => {
  const [activeTemplate, setActiveTemplate] = useState("navy");
  const [primaryColor, setPrimaryColor] = useState("#1a2744");
  const [tagline, setTagline] = useState("");
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [fetchedProfile, setFetchedProfile] = useState<FetchedProfile | null>(null);

  const frontCanvasRef = useRef<HTMLCanvasElement>(null);
  const backCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Self-fetch the contractor's profile when no props are passed in
  // (e.g. when rendered standalone from the business-card-editor dashboard tab).
  useEffect(() => {
    if (tsCodeProp) return;
    let cancelled = false;
    const loadProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("ts_profile_code, full_name, trades, location, logo_url")
        .eq("user_id", user.id)
        .single();
      if (data && !cancelled) {
        setFetchedProfile({
          tsCode: data.ts_profile_code ?? "",
          fullName: data.full_name ?? "",
          trade: data.trades && data.trades.length > 0 ? data.trades[0] : "Contractor",
          location: data.location ?? "",
          logoUrl: data.logo_url ?? "",
        });
      }
    };
    loadProfile();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tsCode = tsCodeProp || fetchedProfile?.tsCode || "";
  const fullName = fullNameProp || fetchedProfile?.fullName || "";
  const trade = tradeProp || fetchedProfile?.trade || "";
  const location = locationProp || fetchedProfile?.location || "";
  const logoUrl = logoUrlProp || fetchedProfile?.logoUrl || "";

  useEffect(() => {
    if (!logoUrl) return;
    let cancelled = false;
    const loadLogo = async () => {
      try {
        const res = await fetch(logoUrl);
        const blob = await res.blob();
        const reader = new FileReader();
        reader.onload = () => {
          if (!cancelled) setLogoDataUrl(reader.result as string);
        };
        reader.readAsDataURL(blob);
      } catch {
        // leave logoDataUrl null
      }
    };
    loadLogo();
    return () => {
      cancelled = true;
    };
  }, [logoUrl]);

  const tpl = TEMPLATES.find((t) => t.id === activeTemplate)!;
  const bg = primaryColor;
  const accent = tpl.accent;
  const textColor = getTextColor(bg);
  const subColor = getSubColor(bg);

  useEffect(() => {
    const frontCanvas = frontCanvasRef.current;
    const backCanvas = backCanvasRef.current;
    if (!frontCanvas || !backCanvas) return;
    const frontCtx = frontCanvas.getContext("2d");
    const backCtx = backCanvas.getContext("2d");
    if (!frontCtx || !backCtx) return;

    const W = frontCanvas.width;
    const H = frontCanvas.height;

    drawFront(frontCtx, W, H, bg, accent, textColor, subColor, fullName, trade, location, tagline, tsCode, logoDataUrl);
    drawBack(backCtx, W, H, bg, accent, textColor, subColor, tsCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTemplate, primaryColor, tagline, logoDataUrl, tsCode, fullName, trade, location]);

  const handleTemplateClick = (id: string) => {
    const next = TEMPLATES.find((t) => t.id === id);
    if (!next) return;
    setActiveTemplate(id);
    setPrimaryColor(next.bg);
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setLogoDataUrl(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleReset = () => {
    setActiveTemplate("navy");
    setPrimaryColor("#1a2744");
    setTagline("");
  };

  const handleDownloadPNG = () => {
    if (!frontCanvasRef.current || !backCanvasRef.current) return;
    triggerDownload(frontCanvasRef.current.toDataURL("image/png"), `tradestone-card-front-${tsCode}.png`);
    setTimeout(() => {
      if (backCanvasRef.current) {
        triggerDownload(backCanvasRef.current.toDataURL("image/png"), `tradestone-card-back-${tsCode}.png`);
      }
    }, 300);
  };

  const handleDownloadPDF = () => {
    if (!frontCanvasRef.current || !backCanvasRef.current) return;
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: [85, 55] });
    const frontDataUrl = frontCanvasRef.current.toDataURL("image/png");
    doc.addImage(frontDataUrl, "PNG", 0, 0, 85, 55);
    doc.addPage([85, 55], "landscape");
    const backDataUrl = backCanvasRef.current.toDataURL("image/png");
    doc.addImage(backDataUrl, "PNG", 0, 0, 85, 55);
    doc.save(`tradestone-business-card-${tsCode}.pdf`);
  };

  return (
    <div style={{ border: "0.5px solid #e6e9ef", borderRadius: 12, overflow: "hidden", display: "flex", background: "#f8f9fa" }}>
      {/* Left panel */}
      <div
        style={{
          width: 200,
          flexShrink: 0,
          borderRight: "0.5px solid #e6e9ef",
          padding: 16,
          background: "#ffffff",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          maxHeight: 600,
          overflowY: "auto",
        }}
      >
        {/* Section A — Template picker */}
        <div>
          <div style={labelStyle}>Template</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 6 }}>
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                onClick={() => handleTemplateClick(t.id)}
                style={{
                  border: activeTemplate === t.id ? "2px solid #1a2744" : "1px solid #e6e9ef",
                  borderRadius: 6,
                  padding: 0,
                  cursor: "pointer",
                  background: "none",
                  overflow: "hidden",
                  fontFamily: "inherit",
                }}
              >
                <div style={{ height: 60, background: t.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4 }}>
                  <div style={{ width: 14, height: 14, borderRadius: "50%", background: t.accent }} />
                  <div style={{ width: 28, height: 3, background: getTextColor(t.bg) }} />
                  <div style={{ width: 20, height: 3, background: t.accent }} />
                </div>
                <div style={{ fontSize: 10, padding: "4px 0", color: "#374151" }}>{t.name}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Section B — Primary colour */}
        <div>
          <div style={labelStyle}>Primary colour</div>
          <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
            {COLOR_SWATCHES.map((c) => (
              <button
                key={c}
                onClick={() => setPrimaryColor(c)}
                aria-label={c}
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  background: c,
                  border: primaryColor === c ? "2px solid #9ca3af" : "1px solid #e6e9ef",
                  cursor: "pointer",
                  padding: 0,
                }}
              />
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
            <input
              type="color"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              style={{ width: 28, height: 28, padding: 0, border: "none", cursor: "pointer" }}
            />
            <span style={{ fontSize: 11, fontFamily: "'Roboto Mono', monospace", color: "#6b7280" }}>{primaryColor}</span>
          </div>
        </div>

        {/* Section C — Logo */}
        <div>
          <div style={labelStyle}>Logo</div>
          <div style={{ marginTop: 6 }}>
            {logoDataUrl ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <img src={logoDataUrl} alt="Logo" style={{ width: 48, height: 48, borderRadius: "50%", objectFit: "cover" }} />
                <button
                  onClick={() => setLogoDataUrl(null)}
                  style={{ background: "none", border: "none", color: "#6b7280", fontSize: 11, cursor: "pointer", textDecoration: "underline", padding: 0 }}
                >
                  Remove
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{
                  width: "100%",
                  border: "1px dashed #d1d5db",
                  borderRadius: 6,
                  padding: "10px 8px",
                  fontSize: 12,
                  color: "#6b7280",
                  background: "none",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Upload logo
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleLogoUpload}
              style={{ display: "none" }}
            />
            <div style={lockNoteStyle}>Falls back to initials if not uploaded</div>
          </div>
        </div>

        {/* Section D — Card details */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={labelStyle}>Card details</div>
          <div>
            <div style={fieldLabelStyle}>Name</div>
            <input disabled value={fullName} style={disabledInputStyle} />
            <div style={lockNoteStyle}>From your profile</div>
          </div>
          <div>
            <div style={fieldLabelStyle}>Trade</div>
            <input disabled value={trade} style={disabledInputStyle} />
            <div style={lockNoteStyle}>From your profile</div>
          </div>
          <div>
            <div style={fieldLabelStyle}>Location</div>
            <input disabled value={location} style={disabledInputStyle} />
            <div style={lockNoteStyle}>From your profile</div>
          </div>
          <div>
            <div style={fieldLabelStyle}>Tagline</div>
            <input
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="Gas Safe registered · Free quotes"
              maxLength={48}
              style={inputStyle}
            />
          </div>
          <div>
            <div style={fieldLabelStyle}>TS code</div>
            <input
              disabled
              value={tsCode}
              style={{ ...disabledInputStyle, fontFamily: "'Roboto Mono', monospace", color: "#f07820" }}
            />
            <div style={lockNoteStyle}>From your profile</div>
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div
        style={{
          flex: 1,
          padding: 24,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
          background: "#ffffff",
        }}
      >
        <div style={{ ...labelStyle, alignSelf: "flex-start" }}>Front</div>
        <canvas
          ref={frontCanvasRef}
          width={600}
          height={336}
          style={{ width: 300, height: 168, borderRadius: 7, display: "block" }}
        />

        <div style={{ ...labelStyle, alignSelf: "flex-start", marginTop: 8 }}>Back</div>
        <canvas
          ref={backCanvasRef}
          width={600}
          height={336}
          style={{ width: 300, height: 168, borderRadius: 7, display: "block" }}
        />

        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button style={primaryButtonStyle} onClick={handleDownloadPNG}>Download PNG</button>
          <button style={primaryButtonStyle} onClick={handleDownloadPDF}>Download PDF</button>
          <button style={outlineButtonStyle} onClick={handleReset}>Reset</button>
        </div>
      </div>
    </div>
  );
};

export default BusinessCardEditor;
