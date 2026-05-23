import { useNavigate } from "react-router-dom";
import "./ContractorCard.css";
import { useAvailability } from "@/hooks/useAvailability";

export interface ContractorCardData {
  id: string;
  tsCode: string;
  name: string;
  company: string;
  location: string;
  avatarUrl?: string | null;
  logoUrl?: string | null;
  primaryTrade: string;
  trades: string[];
  rating: number | null;
  jobsCompleted: number;
  responseTimeHours: number | null;
  verified: boolean;
  recentJobs: Array<{ rating: number; month: string }> | null;
  isNew: boolean;
}

const TRADE_ABBREV: Record<string, string> = {
  Electrical: "ELEC",
  Plumbing: "PLMB",
  Roofing: "ROOF",
  Carpentry: "CARP",
  Painting: "DECO",
  "General Building": "BUILD",
  Plastering: "PLST",
  Tiling: "TILE",
  Landscaping: "LAND",
  Heating: "HVAC",
};

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function getTradeAbbrev(trade: string) {
  return TRADE_ABBREV[trade] ?? trade.slice(0, 4).toUpperCase();
}

function RecentJobsStrip({
  recentJobs,
  isNew,
}: {
  recentJobs: Array<{ rating: number; month: string }> | null;
  isNew: boolean;
}) {
  if (isNew || !recentJobs) {
    return (
      <div style={styles.recentWrap}>
        <div style={styles.newBadge}>✦ New to TradeStone</div>
      </div>
    );
  }

  return (
    <div style={styles.recentWrap}>
      <div style={styles.recentLabel}>Recent jobs</div>
      <div style={styles.weeksRow}>
        {recentJobs.slice(0, 3).map((job, i) => {
          const isGreat = job.rating >= 5;
          const isGood = job.rating >= 4 && job.rating < 5;
          return (
            <div
              key={i}
              style={{
                ...styles.weekCell,
                background: isGreat ? "#f07820" : isGood ? "#e8f5e9" : "#f5f5f5",
                border: isGreat ? "none" : "1px solid #e0e0e0",
              }}
            >
              <span style={{ ...styles.weekPts, color: isGreat ? "#fff" : "#1a2744" }}>
                {job.rating}★
              </span>
              <span style={styles.weekLbl}>{job.month}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ContractorCard({ contractor }: { contractor: ContractorCardData }) {
  const navigate = useNavigate();

  // Fix: call getNextAvailable() as a function, not destructure nextAvailable
  const { getNextAvailable } = useAvailability(contractor.id);
  const nextAvailableDate = getNextAvailable();

  const availabilityLabel = nextAvailableDate
    ? nextAvailableDate.toLocaleDateString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
      })
    : null;

  const handleClick = () => {
    navigate(`/contractor/${contractor.tsCode}`);
  };

  // Logo takes priority over avatar, then falls back to initials
  const displayImage = contractor.logoUrl ?? contractor.avatarUrl ?? null;

  return (
    <div
      style={styles.card}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && handleClick()}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow =
          "0 6px 20px rgba(0,0,0,0.12)";
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow =
          "0 1px 4px rgba(0,0,0,0.08)";
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
      }}
    >
      {/* Orange header strip */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          {contractor.rating !== null ? (
            <>
              <span style={styles.ratingText}>★ {contractor.rating.toFixed(1)}</span>
              <span style={styles.headerSub}>{contractor.jobsCompleted} jobs</span>
            </>
          ) : (
            <span style={styles.headerSub}>No reviews yet</span>
          )}
        </div>
        <div style={styles.headerRight}>
          <div style={styles.tradeBadge}>{getTradeAbbrev(contractor.primaryTrade)}</div>
          {contractor.verified && (
            <div style={styles.verifiedRow}>
              <span style={styles.verifiedDot} />
              <span style={styles.verifiedText}>Verified</span>
            </div>
          )}
        </div>
      </div>

      {/* Logo / avatar area */}
      <div style={styles.photoArea}>
        {displayImage ? (
          <img
            src={displayImage}
            alt={contractor.name}
            style={contractor.logoUrl ? styles.logoImg : styles.avatarImg}
          />
        ) : (
          <div style={styles.avatarInitials}>{getInitials(contractor.name)}</div>
        )}
      </div>

      {/* Name block */}
      <div style={styles.nameBlock}>
        <div style={styles.nameText}>{contractor.name}</div>
        <div style={styles.companyText}>{contractor.company}</div>
        <div style={styles.tsCode}>{contractor.tsCode}</div>
      </div>

      {/* Stats row */}
      <div style={styles.statsRow}>
        <div style={styles.statCell}>
          <span style={styles.statVal}>{contractor.jobsCompleted}</span>
          <span style={styles.statLbl}>Jobs</span>
        </div>
        <div style={{ ...styles.statCell, borderLeft: "1px solid #e8e8e8", borderRight: "1px solid #e8e8e8" }}>
          <span style={styles.statVal}>
            {contractor.rating !== null ? contractor.rating.toFixed(1) : "—"}
          </span>
          <span style={styles.statLbl}>Rating</span>
        </div>
        <div style={styles.statCell}>
          <span style={styles.statVal}>
            {contractor.responseTimeHours !== null ? `${contractor.responseTimeHours}h` : "—"}
          </span>
          <span style={styles.statLbl}>Response</span>
        </div>
      </div>

      {/* Recent jobs / new badge */}
      <RecentJobsStrip recentJobs={contractor.recentJobs} isNew={contractor.isNew} />

      {/* Trades chips */}
      <div style={styles.tradesRow}>
        {contractor.trades.slice(0, 3).map((t) => (
          <span key={t} style={styles.tradeChip}>{t}</span>
        ))}
        {contractor.trades.length > 3 && (
          <span style={styles.tradeChip}>+{contractor.trades.length - 3}</span>
        )}
      </div>

      {/* Availability */}
      <div style={styles.availRow}>
        {availabilityLabel ? (
          <div style={styles.availPillGreen}>Available {availabilityLabel}</div>
        ) : (
          <div style={styles.availPillGrey}>Contact for availability</div>
        )}
      </div>
    </div>
  );
}

export function ContractorCardGrid({ contractors }: { contractors: ContractorCardData[] }) {
  return (
    <div className="contractor-card-grid">
      {contractors.map((c) => (
        <ContractorCard key={c.tsCode} contractor={c} />
      ))}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: "#ffffff",
    borderRadius: 12,
    overflow: "hidden",
    cursor: "pointer",
    transition: "transform 0.15s ease, box-shadow 0.15s ease",
    boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
    border: "1px solid #e8e8e8",
    fontFamily: "'Lexend', sans-serif",
    userSelect: "none",
  },
  header: {
    background: "#f07820",
    padding: "8px 10px 6px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  headerLeft: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  headerRight: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 4,
  },
  ratingText: {
    fontSize: 12,
    fontWeight: 700,
    color: "#fff",
  },
  headerSub: {
    fontSize: 9,
    color: "rgba(255,255,255,0.85)",
  },
  tradeBadge: {
    fontSize: 10,
    fontWeight: 700,
    color: "#f07820",
    background: "#fff",
    borderRadius: 4,
    padding: "2px 6px",
    letterSpacing: "0.5px",
  },
  verifiedRow: {
    display: "flex",
    alignItems: "center",
    gap: 3,
  },
  verifiedDot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: "#4ade80",
    display: "inline-block",
  },
  verifiedText: {
    fontSize: 8,
    color: "rgba(255,255,255,0.9)",
  },
  photoArea: {
    background: "#f5f5f5",
    height: 80,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderBottom: "1px solid #e8e8e8",
  },
  // Logo: rectangular, contained, no circle crop
  logoImg: {
    maxHeight: 56,
    maxWidth: "80%",
    objectFit: "contain",
  },
  // Avatar: circular crop
  avatarImg: {
    width: 56,
    height: 56,
    borderRadius: "50%",
    border: "2px solid #f07820",
    objectFit: "cover",
  },
  avatarInitials: {
    width: 56,
    height: 56,
    borderRadius: "50%",
    background: "#1a2744",
    border: "2px solid #f07820",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 18,
    fontWeight: 700,
    color: "#f07820",
  },
  nameBlock: {
    background: "#fff",
    padding: "8px 10px 6px",
    textAlign: "center",
    borderBottom: "1px solid #e8e8e8",
  },
  nameText: {
    color: "#1a2744",
    fontSize: 12,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  companyText: {
    color: "#f07820",
    fontSize: 10,
    marginTop: 2,
  },
  tsCode: {
    fontSize: 9,
    color: "#999",
    fontFamily: "monospace",
    marginTop: 2,
  },
  statsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    borderBottom: "1px solid #e8e8e8",
    background: "#fafafa",
  },
  statCell: {
    textAlign: "center",
    padding: "7px 4px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  statVal: {
    fontSize: 17,
    fontWeight: 700,
    color: "#1a2744",
    lineHeight: 1,
  },
  statLbl: {
    fontSize: 8,
    color: "#999",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    marginTop: 2,
  },
  recentWrap: {
    padding: "6px 10px",
    borderBottom: "1px solid #e8e8e8",
  },
  recentLabel: {
    fontSize: 8,
    color: "#999",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    marginBottom: 4,
  },
  weeksRow: {
    display: "flex",
    gap: 3,
  },
  weekCell: {
    flex: 1,
    borderRadius: 3,
    padding: "3px 2px",
    textAlign: "center",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  weekPts: {
    fontSize: 9,
    fontWeight: 700,
  },
  weekLbl: {
    fontSize: 7,
    color: "#999",
  },
  newBadge: {
    background: "#fff4ec",
    color: "#f07820",
    fontSize: 9,
    fontWeight: 600,
    borderRadius: 4,
    padding: "4px 8px",
    textAlign: "center",
    letterSpacing: "0.5px",
    border: "1px solid #fde0c8",
  },
  tradesRow: {
    padding: "6px 8px",
    display: "flex",
    flexWrap: "wrap",
    gap: 3,
    borderBottom: "1px solid #e8e8e8",
  },
  tradeChip: {
    fontSize: 8,
    background: "#f0f0f0",
    color: "#1a2744",
    borderRadius: 3,
    padding: "2px 6px",
    border: "1px solid #e0e0e0",
  },
  availRow: {
    padding: "6px 8px 10px",
  },
  availPillGreen: {
    background: "#f0fdf4",
    color: "#166534",
    fontSize: 9,
    borderRadius: 4,
    padding: "4px 8px",
    textAlign: "center",
    fontWeight: 600,
    border: "1px solid #bbf7d0",
  },
  availPillGrey: {
    background: "#f5f5f5",
    color: "#888",
    fontSize: 9,
    borderRadius: 4,
    padding: "4px 8px",
    textAlign: "center",
    border: "1px solid #e0e0e0",
  },
};
