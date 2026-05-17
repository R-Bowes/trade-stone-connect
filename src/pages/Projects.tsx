import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import Header from "@/components/Header";
import { PostTenderForm } from "@/components/projects/PostTenderForm";
import { supabase } from "@/integrations/supabase/client";
import { Calendar, FolderOpen, MapPin, User, X } from "lucide-react";

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
  posted_by: string;
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

// ── Skeleton card ──────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <Card className="p-6 flex flex-col gap-3 animate-pulse">
      <div className="h-5 bg-muted rounded w-2/3" />
      <div className="h-3.5 bg-muted rounded w-1/3" />
      <div className="flex gap-2 mt-1">
        <div className="h-5 bg-muted rounded-full w-20" />
        <div className="h-5 bg-muted rounded-full w-16" />
        <div className="h-5 bg-muted rounded-full w-24" />
      </div>
      <div className="grid grid-cols-2 gap-3 mt-2">
        <div className="h-9 bg-muted rounded" />
        <div className="h-9 bg-muted rounded" />
      </div>
      <div className="h-px bg-border mt-1" />
      <div className="flex items-center justify-between">
        <div className="h-3.5 bg-muted rounded w-1/3" />
        <div className="h-8 bg-muted rounded w-24" />
      </div>
    </Card>
  );
}

// ── Tender card ────────────────────────────────────────────────────────────────

function TenderCard({ tender }: { tender: TenderRow }) {
  const navigate = useNavigate();
  const location = [tender.city, tender.postcode].filter(Boolean).join(", ");
  const budget =
    tender.budget != null && tender.budget_visible_to_contractors
      ? formatGBP(tender.budget)
      : "Budget on request";
  const deadline = tender.proposal_deadline ? formatDate(tender.proposal_deadline) : "—";
  const categories = tender.trade_categories ?? [];

  return (
    <Card className="p-6 flex flex-col hover:shadow-md transition-shadow">
      {/* Title */}
      <h3 className="font-semibold text-lg leading-snug mb-2">{tender.title}</h3>

      {/* Location */}
      {location && (
        <div className="flex items-center gap-1.5 text-muted-foreground text-sm mb-4">
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          <span>{location}</span>
        </div>
      )}

      {/* Trade chips */}
      {categories.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-5">
          {categories.slice(0, 4).map(cat => (
            <span
              key={cat}
              className="bg-primary/10 text-primary border border-primary/20 text-xs px-2.5 py-0.5 rounded-full font-medium"
            >
              {cat}
            </span>
          ))}
          {categories.length > 4 && (
            <span className="bg-muted text-muted-foreground text-xs px-2.5 py-0.5 rounded-full">
              +{categories.length - 4} more
            </span>
          )}
        </div>
      )}

      {/* Budget + deadline */}
      <div className="grid grid-cols-2 gap-4 mb-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
            Budget
          </p>
          <p className="font-semibold text-sm">{budget}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
            Deadline
          </p>
          <div className="flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <p className="text-sm">{deadline}</p>
          </div>
        </div>
      </div>

      {/* Divider + footer */}
      <div className="border-t pt-4 mt-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground min-w-0">
          <User className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{posterName(tender.poster)}</span>
        </div>
        <Button
          size="sm"
          className="bg-orange-500 text-white hover:bg-orange-400 shrink-0"
          onClick={() => navigate(`/projects/${tender.id}`)}
        >
          View Tender
        </Button>
      </div>
    </Card>
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
      <div className="min-h-screen bg-background">
        <Header />

        <main>
          <section className="py-16 px-4">
            <div className="container mx-auto max-w-6xl">

              {/* Page header */}
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-10">
                <div>
                  <h1 className="text-3xl md:text-4xl font-bold mb-2">
                    Projects
                  </h1>
                  <p className="text-muted-foreground">
                    Post tenders and manage your project pipeline
                  </p>
                </div>
                <Button
                  onClick={() => setShowForm(true)}
                  className="bg-orange-500 text-white hover:bg-orange-400 sm:shrink-0"
                >
                  Post a Tender
                </Button>
              </div>

              {/* Loading */}
              {loading && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <SkeletonCard key={i} />
                  ))}
                </div>
              )}

              {/* Results */}
              {!loading && tenders.length > 0 && (
                <>
                  <p className="text-sm text-muted-foreground mb-6">
                    {tenders.length} open tender{tenders.length !== 1 ? "s" : ""}
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {tenders.map(tender => (
                      <TenderCard key={tender.id} tender={tender} />
                    ))}
                  </div>
                </>
              )}

              {/* Empty state */}
              {!loading && tenders.length === 0 && (
                <div className="text-center py-24">
                  <div className="bg-muted/50 rounded-full p-5 w-fit mx-auto mb-5">
                    <FolderOpen className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h3 className="font-semibold text-lg mb-2">No projects yet</h3>
                  <p className="text-muted-foreground">Post a tender to get started</p>
                </div>
              )}

            </div>
          </section>
        </main>
      </div>

      {/* Full-screen form overlay — PostTenderForm has its own dark background */}
      {showForm && (
        <div className="fixed inset-0 z-50 overflow-y-auto" style={{ background: "#0f1b2d" }}>
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
