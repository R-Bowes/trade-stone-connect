import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import Header from "@/components/Header";
import { PostTenderForm } from "@/components/projects/PostTenderForm";
import { supabase } from "@/integrations/supabase/client";
import { FolderOpen, X, MapPin, Calendar, User } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

type TenderRow = {
  id: string;
  title: string;
  city: string | null;
  postcode: string | null;
  trade_categories: string[] | null;
  budget: number | null;
  budget_visible_to_contractors: boolean | null;
  proposal_deadline: string | null;
  created_at: string;
  poster: { full_name: string | null; company_name: string | null } | null;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatGBP(n: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function posterName(poster: TenderRow["poster"]) {
  if (!poster) return "TradeStone member";
  return poster.company_name || poster.full_name || "TradeStone member";
}

// ── Design tokens (shared with the rest of the navy dashboard) ─────────────────

const C = {
  bg: "#0f1b2d",
  card: "#1a2942",
  border: "rgba(255,255,255,0.08)",
  muted: "rgba(255,255,255,0.50)",
  white: "#ffffff",
  accent: "#f07820",
} as const;

// ── Skeleton card ──────────────────────────────────────────────────────────────

function SkeletonCard() {
  const line = (w: string, h = 12, mb = 0) => (
    <div
      style={{
        width: w,
        height: h,
        borderRadius: 4,
        background: "rgba(255,255,255,0.07)",
        marginBottom: mb,
      }}
    />
  );

  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: 24,
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      {line("65%", 18, 4)}
      {line("45%")}
      <div style={{ display: "flex", gap: 6 }}>
        {["30%", "25%", "35%"].map((w, i) => (
          <div
            key={i}
            style={{
              width: w,
              height: 22,
              borderRadius: 20,
              background: "rgba(255,255,255,0.07)",
            }}
          />
        ))}
      </div>
      <div style={{ marginTop: 4, display: "flex", justifyContent: "space-between" }}>
        {line("35%")}
        {line("30%")}
      </div>
      <div
        style={{
          marginTop: 8,
          height: 36,
          borderRadius: 6,
          background: "rgba(255,255,255,0.07)",
        }}
      />
    </div>
  );
}

// ── Tender card ────────────────────────────────────────────────────────────────

function TenderCard({ tender }: { tender: TenderRow }) {
  const location = [tender.city, tender.postcode].filter(Boolean).join(", ");
  const budget =
    tender.budget != null && tender.budget_visible_to_contractors
      ? formatGBP(tender.budget)
      : "Budget on request";
  const deadline = tender.proposal_deadline ? formatDate(tender.proposal_deadline) : "—";
  const categories = tender.trade_categories ?? [];

  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: 24,
        display: "flex",
        flexDirection: "column",
        gap: 0,
      }}
    >
      {/* Title */}
      <p
        style={{
          color: C.white,
          fontSize: 15,
          fontWeight: 700,
          margin: "0 0 8px",
          lineHeight: 1.3,
        }}
      >
        {tender.title}
      </p>

      {/* Location */}
      {location && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            marginBottom: 14,
          }}
        >
          <MapPin size={12} style={{ color: C.muted, flexShrink: 0 }} />
          <span style={{ color: C.muted, fontSize: 13 }}>{location}</span>
        </div>
      )}

      {/* Trade chips */}
      {categories.length > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            marginBottom: 16,
          }}
        >
          {categories.slice(0, 4).map(cat => (
            <span
              key={cat}
              style={{
                background: "rgba(240,120,32,0.12)",
                border: "1px solid rgba(240,120,32,0.25)",
                color: "#f09050",
                borderRadius: 20,
                padding: "2px 10px",
                fontSize: 11,
                fontWeight: 500,
                whiteSpace: "nowrap",
              }}
            >
              {cat}
            </span>
          ))}
          {categories.length > 4 && (
            <span
              style={{
                background: "rgba(255,255,255,0.06)",
                border: `1px solid ${C.border}`,
                color: C.muted,
                borderRadius: 20,
                padding: "2px 10px",
                fontSize: 11,
              }}
            >
              +{categories.length - 4} more
            </span>
          )}
        </div>
      )}

      {/* Budget + deadline row */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div>
          <p style={{ color: C.muted, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 3px" }}>
            Budget
          </p>
          <p style={{ color: C.white, fontSize: 14, fontWeight: 600, margin: 0 }}>{budget}</p>
        </div>
        <div style={{ textAlign: "right" }}>
          <p style={{ color: C.muted, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 3px" }}>
            Deadline
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}>
            <Calendar size={12} style={{ color: C.muted }} />
            <p style={{ color: C.white, fontSize: 13, margin: 0 }}>{deadline}</p>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div style={{ borderTop: `1px solid ${C.border}`, margin: "0 0 14px" }} />

      {/* Posted by + button row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          <User size={12} style={{ color: C.muted, flexShrink: 0 }} />
          <span
            style={{
              color: C.muted,
              fontSize: 12,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {posterName(tender.poster)}
          </span>
        </div>

        <Button
          size="sm"
          style={{
            background: C.accent,
            color: C.white,
            border: "none",
            fontWeight: 600,
            fontSize: 13,
            flexShrink: 0,
          }}
        >
          View Tender
        </Button>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

const Projects = () => {
  const [showForm, setShowForm] = useState(false);
  const [tenders, setTenders] = useState<TenderRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTenders();
  }, []);

  async function fetchTenders() {
    setLoading(true);

    const { data, error } = await supabase
      .from("projects")
      .select(
        `id, title, city, postcode, trade_categories,
         budget, budget_visible_to_contractors,
         proposal_deadline, created_at, posted_by,
         poster:profiles!posted_by(full_name, company_name)`,
      )
      .eq("tender_status", "open")
      .eq("visibility", "open")
      .order("created_at", { ascending: false });

    if (!error && data) {
      setTenders(data as unknown as TenderRow[]);
    }

    setLoading(false);
  }

  function handleTenderPosted() {
    setShowForm(false);
    fetchTenders();
  }

  return (
    <>
      {/* ── Main page ─────────────────────────────────────────────────────────── */}
      <div style={{ minHeight: "100vh", background: C.bg }}>
        <Header />

        {/* Page header */}
        <div style={{ borderBottom: `1px solid ${C.border}`, padding: "24px 32px" }}>
          <div
            style={{
              maxWidth: 1200,
              margin: "0 auto",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
            }}
          >
            <div>
              <h1 style={{ color: C.white, fontSize: 22, fontWeight: 700, margin: 0, lineHeight: 1.2 }}>
                Projects
              </h1>
              <p style={{ color: C.muted, fontSize: 14, margin: "4px 0 0" }}>
                Post tenders and manage your project pipeline
              </p>
            </div>

            <Button
              onClick={() => setShowForm(true)}
              style={{ background: C.accent, color: C.white, border: "none", fontWeight: 600 }}
            >
              Post a Tender
            </Button>
          </div>
        </div>

        {/* Content area */}
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 32px 64px" }}>

          {/* ── Loading: skeleton grid ── */}
          {loading && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          )}

          {/* ── Results: tender grid ── */}
          {!loading && tenders.length > 0 && (
            <>
              <p style={{ color: C.muted, fontSize: 13, margin: "0 0 20px" }}>
                {tenders.length} open tender{tenders.length !== 1 ? "s" : ""}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {tenders.map(tender => (
                  <TenderCard key={tender.id} tender={tender} />
                ))}
              </div>
            </>
          )}

          {/* ── Empty state ── */}
          {!loading && tenders.length === 0 && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                minHeight: 400,
              }}
            >
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: "50%",
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.10)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 20px",
                }}
              >
                <FolderOpen size={28} style={{ color: "rgba(255,255,255,0.3)" }} />
              </div>
              <p style={{ color: "rgba(255,255,255,0.75)", fontSize: 16, fontWeight: 600, margin: "0 0 6px" }}>
                No projects yet
              </p>
              <p style={{ color: "rgba(255,255,255,0.40)", fontSize: 14, margin: 0 }}>
                Post a tender to get started
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Full-screen form overlay ───────────────────────────────────────────── */}
      {showForm && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            overflowY: "auto",
            background: C.bg,
          }}
        >
          <button
            onClick={() => setShowForm(false)}
            style={{
              position: "fixed",
              top: 16,
              right: 20,
              zIndex: 51,
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 8,
              padding: "6px 10px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              color: "rgba(255,255,255,0.7)",
              fontSize: 13,
              transition: "background 0.15s",
            }}
            onMouseEnter={e =>
              ((e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.14)")
            }
            onMouseLeave={e =>
              ((e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.08)")
            }
          >
            <X size={14} />
            Close
          </button>

          <PostTenderForm onSuccess={handleTenderPosted} />
        </div>
      )}
    </>
  );
};

export default Projects;
