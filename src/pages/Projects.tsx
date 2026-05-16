import { useState } from "react";
import { Button } from "@/components/ui/button";
import Header from "@/components/Header";
import { PostTenderForm } from "@/components/projects/PostTenderForm";
import { FolderOpen, X } from "lucide-react";

const Projects = () => {
  const [showForm, setShowForm] = useState(false);

  return (
    <>
      {/* ── Main page ─────────────────────────────────────────────────────────── */}
      <div style={{ minHeight: "100vh", background: "#0f1b2d" }}>
        <Header />

        {/* Page header */}
        <div
          style={{
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            padding: "24px 32px",
          }}
        >
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
              <h1
                style={{
                  color: "#ffffff",
                  fontSize: 22,
                  fontWeight: 700,
                  margin: 0,
                  lineHeight: 1.2,
                }}
              >
                Projects
              </h1>
              <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 14, margin: "4px 0 0" }}>
                Post tenders and manage your project pipeline
              </p>
            </div>

            <Button
              onClick={() => setShowForm(true)}
              style={{ background: "#f07820", color: "#ffffff", border: "none", fontWeight: 600 }}
            >
              Post a Tender
            </Button>
          </div>
        </div>

        {/* Content area */}
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            padding: "64px 32px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: 400,
          }}
        >
          <div style={{ textAlign: "center" }}>
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
            <p
              style={{
                color: "rgba(255,255,255,0.75)",
                fontSize: 16,
                fontWeight: 600,
                margin: "0 0 6px",
              }}
            >
              No projects yet
            </p>
            <p style={{ color: "rgba(255,255,255,0.40)", fontSize: 14, margin: 0 }}>
              Post a tender to get started
            </p>
          </div>
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
            background: "#0f1b2d",
          }}
        >
          {/* Close button */}
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
              ((e.currentTarget as HTMLButtonElement).style.background =
                "rgba(255,255,255,0.14)")
            }
            onMouseLeave={e =>
              ((e.currentTarget as HTMLButtonElement).style.background =
                "rgba(255,255,255,0.08)")
            }
          >
            <X size={14} />
            Close
          </button>

          <PostTenderForm onSuccess={() => setShowForm(false)} />
        </div>
      )}
    </>
  );
};

export default Projects;
