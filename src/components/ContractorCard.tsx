import { useNavigate } from "react-router-dom";
import "./ContractorCard.css";
import { useAvailability } from "@/hooks/useAvailability";

export interface ContractorCardData {
  id: string;
  tsCode: string;
  name: string;
  company: string;
  location: string;
  avatarUrl?: string;
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

function StarRating({ rating }: { rating: number }) {
  return (
    <span style={{ color: "#f07820", fontSize: 11, fontWeight: 700 }}>
      ★ {rating.toFixed(1)}
    </span>
  );
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
                background: isGreat ? "#f07820" : isGood ? "#1a4a2a" : "#2d3f6b",
              }}
            >
              <span style={styles.weekPts}>{job.rating}★</span>
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
  const { nextAvailable } = useAvailability(contractor.id);

  const handleClick = () => {
    navigate(`/contractor/${contractor.tsCode}`);
  };

  const availabilityLabel = nextAvailable
    ? new Date(nextAvailable).toLocaleDateString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
      })
    : null;

  return (
    <div
      style={styles.card}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && handleClick()}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(-3px)";
        (e.currentTarget as HTMLDivElement).style.boxShadow =
          "0 8px 24px rgba(0,0,0,0.35)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
        (e.currentTarget as HTMLDivElement).style.boxShadow =
          "0 2px 8px rgba(0,0,0,0.2)";
      }}
    >
      {/* Header strip */}
      <div style={styles.header}>
        <div>
          {contractor.rating !== null ? (
            <>
              <StarRating rating={contractor.rating} />
              <div style={styles.headerSub}>{contractor.jobsCompleted} jobs</div>
            </>
          ) : (
            <div style={styles.headerSub}>No reviews yet</div>
          )}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={styles.tradeBadge}>
            {getTradeAbbrev(contractor.primaryTrade)}
          </div>
          {contractor.verified && (
            <div style={styles.verifiedRow}>
              <span style={styles.verifiedDot} />
              Verified
            </div>
          )}
        </div>
      </div>

      {/* Avatar */}
      <div style={styles.photoArea}>
        {contractor.avatarUrl ? (
          <img
            src={contractor.avatarUrl}
            alt={contractor.name}
            style={styles.avatarImg}
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
        <div
          style={{
            ...styles.statCell,
            borderLeft: "1px solid #2d3f6b",
            borderRight: "1px solid #2d3f6b",
          }}
        >
          <span style={styles.statVal}>
            {contractor.rating !== null ? contractor.rating.toFixed(1) : "—"}
          </span>
          <span style={styles.statLbl}>Rating</span>
        </div>
        <div style={styles.statCell}>
          <span style={styles.statVal}>
            {contractor.responseTimeHours !== null
              ? `${contractor.responseTimeHours}h`
              : "—"}
          </span>
          <span style={styles.statLbl}>Response</span>
        </div>
      </div>

      {/* Recent jobs / new badge */}
      <RecentJobsStrip recentJobs={contractor.recentJobs} isNew={contractor.isNew} />

      {/* Trades chips */}
      <div style={styles.tradesRow}>
        {contractor.trades.slice(0, 3).map((t) => (
          <span key={t} style={styles.tradeChip}>
            {t}
          </span>
        ))}
        {contractor.trades.length > 3 && (
          <span style={styles.tradeChip}>+{contractor.trades.length - 3}</span>
        )}
      </div>

      {/* Availability — resolved internally via useAvailability */}
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

export function ContractorCardGrid({
  contractors,
}: {
  contractors: ContractorCardData[];
}) {
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
    background: "#1a2744",
    borderRadius: 12,
    overflow: "hidden",
    cursor: "pointer",
    transition: "transform 0.15s ease, box-shadow 0.15s ease",
    boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
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
  headerSub: {
    fontSize: 9,
    color: "rgba(255,255,255,0.8)",
    marginTop: 2,
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
    justifyContent: "flex-end",
    fontSize: 8,
    color: "rgba(255,255,255,0.85)",
    marginTop: 4,
    gap: 3,
  },
  verifiedDot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: "#4ade80",
    display: "inline-block",
  },
  photoArea: {
    background: "#243058",
    height: 80,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImg: {
    width: 60,
    height: 60,
    borderRadius: "50%",
    border: "2px solid #f07820",
    objectFit: "cover",
  },
  avatarInitials: {
    width: 60,
    height: 60,
    borderRadius: "50%",
    background: "#1a2744",
    border: "2px solid #f07820",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 20,
    fontWeight: 700,
    color: "#f07820",
  },
  nameBlock: {
    background: "#243058",
    padding: "6px 10px 6px",
    textAlign: "center",
    borderBottom: "1px solid #2d3f6b",
  },
  nameText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    margin: 0,
  },
  companyText: {
    color: "#f07820",
    fontSize: 10,
    marginTop: 2,
  },
  tsCode: {
    fontSize: 9,
    color: "#8899bb",
    fontFamily: "monospace",
    marginTop: 2,
  },
  statsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    borderTop: "1px solid #2d3f6b",
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
    color: "#fff",
    lineHeight: 1,
  },
  statLbl: {
    fontSize: 8,
    color: "#8899bb",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    marginTop: 2,
  },
  recentWrap: {
    padding: "6px 10px",
    borderTop: "1px solid #2d3f6b",
  },
  recentLabel: {
    fontSize: 8,
    color: "#8899bb",
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
    color: "#fff",
  },
  weekLbl: {
    fontSize: 7,
    color: "rgba(255,255,255,0.5)",
  },
  newBadge: {
    background: "#2d3f6b",
    color: "#f07820",
    fontSize: 9,
    fontWeight: 600,
    borderRadius: 4,
    padding: "4px 8px",
    textAlign: "center",
    letterSpacing: "0.5px",
  },
  tradesRow: {
    padding: "4px 8px",
    display: "flex",
    flexWrap: "wrap",
    gap: 3,
  },
  tradeChip: {
    fontSize: 8,
    background: "#2d3f6b",
    color: "#aabbdd",
    borderRadius: 3,
    padding: "2px 5px",
  },
  availRow: {
    padding: "4px 8px 10px",
  },
  availPillGreen: {
    background: "#0f3a1f",
    color: "#4ade80",
    fontSize: 9,
    borderRadius: 4,
    padding: "4px 8px",
    textAlign: "center",
    fontWeight: 600,
  },
  availPillGrey: {
    background: "#2d3f6b",
    color: "#8899bb",
    fontSize: 9,
    borderRadius: 4,
    padding: "4px 8px",
    textAlign: "center",
  },
};
