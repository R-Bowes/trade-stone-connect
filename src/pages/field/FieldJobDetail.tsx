import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, MapPin, Phone } from "lucide-react";
import { useFieldTeamMember } from "@/hooks/useFieldTeamMember";
import FieldHeader, { ORANGE, NAVY } from "@/components/field/FieldHeader";
import FieldStatusPill from "@/components/field/FieldStatusPill";
import FieldStatusStepper from "@/components/field/FieldStatusStepper";
import FieldSignatureCapture from "@/components/field/FieldSignatureCapture";
import FieldChecklist from "@/components/field/FieldChecklist";
import FieldPhotos from "@/components/field/FieldPhotos";
import FieldNotes from "@/components/field/FieldNotes";
import { RamsEditor } from "@/components/management/rams/RamsEditor";
import { jobTypeLabel } from "@/lib/jobLabels";
import { formatJobRef } from "@/lib/documentRefs";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { type FieldJob, fieldJobAddress, fieldWhenLabel, isOverdueJob } from "@/lib/fieldJobs";
import { toast } from "sonner";

// Explicit columns — never `*`: contract_value must not reach a team
// member's browser. Keep in step with FieldJob (src/lib/fieldJobs.ts).
const FIELD_JOB_SELECT =
  "id, job_number, title, description, status, job_type, start_date, scheduled_start, location, addr_line1, addr_line2, addr_city, addr_region, addr_postcode, addr_country, customer_id, contractor_id, site_signed_off_at, site_signed_off_name, site_signed_off_by" as const;
const FIELD_RAMS_SELECT = "id, version, status, signed_off_at, signed_off_by_name, hazards" as const;

// Comms invariant exception (NOW.md): the customer's phone is shown to the
// contractor's team only on a confirmed job that is not yet complete.
const PHONE_STATUSES = new Set(["scheduled", "in_progress", "snagging"]);

type RiskLevel = "high" | "medium" | "low";
const RISK_GROUPS: { level: RiskLevel; label: string; color: string }[] = [
  { level: "high", label: "High", color: "#dc2626" },
  { level: "medium", label: "Medium", color: "#b45309" },
  { level: "low", label: "Low", color: "#16a34a" },
];

interface FieldRams {
  id: string;
  version: number;
  status: string;
  signed_off_at: string | null;
  signed_off_by_name: string | null;
  hazards: { hazard: string; risk_level: RiskLevel }[];
}

function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="px-4 py-4 border-b">
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
        {aside}
      </div>
      {children}
    </div>
  );
}

function SummaryRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-3 border-b flex gap-3">
      <p className="w-20 shrink-0 text-sm font-semibold uppercase tracking-wide text-muted-foreground pt-0.5">{label}</p>
      <div className="min-w-0 flex-1 space-y-2">{children}</div>
    </div>
  );
}

const actionButtonClass = "flex items-center justify-center gap-1.5 rounded-lg font-medium text-white w-full";
const actionButtonStyle = (bg: string) => ({ backgroundColor: bg, minHeight: 48, fontSize: 16 });

export default function FieldJobDetail() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const ramsView = searchParams.get("view") === "rams";
  const { loading: teamLoading, teamMember, ownProfileId, employerTsCode } = useFieldTeamMember();

  const [job, setJob] = useState<FieldJob | null>(null);
  const [customer, setCustomer] = useState<{ full_name: string | null; phone: string | null } | null>(null);
  const [rams, setRams] = useState<FieldRams | null>(null);
  const [ramsBusy, setRamsBusy] = useState<"read" | "revise" | null>(null);
  const [checklistCount, setChecklistCount] = useState<{ done: number; total: number } | null>(null);
  const [loading, setLoading] = useState(true);

  const loadJob = async () => {
    if (!jobId) return;
    const { data: jobData, error } = await supabase.from("jobs").select(FIELD_JOB_SELECT).eq("id", jobId).maybeSingle();
    if (error || !jobData) return;
    setJob(jobData);

    if (jobData.customer_id) {
      // Phone fetched only while the job is live — not for complete or
      // cancelled jobs (see PHONE_STATUSES).
      if (PHONE_STATUSES.has(jobData.status)) {
        const { data } = await supabase.from("profiles").select("full_name, phone").eq("id", jobData.customer_id).maybeSingle();
        setCustomer(data ? { full_name: data.full_name, phone: data.phone } : null);
      } else {
        const { data } = await supabase.from("profiles").select("full_name").eq("id", jobData.customer_id).maybeSingle();
        setCustomer(data ? { full_name: data.full_name, phone: null } : null);
      }
    }
  };

  const loadRams = useCallback(async () => {
    if (!jobId) return;
    const { data, error } = await supabase
      .from("job_rams")
      .select(FIELD_RAMS_SELECT)
      .eq("job_id", jobId)
      .neq("status", "superseded")
      .maybeSingle();
    if (error) {
      console.error("[FieldJobDetail] RAMS load failed", error);
      setRams(null);
      return;
    }
    setRams(data ? { ...data, hazards: (data.hazards as unknown as FieldRams["hazards"]) ?? [] } : null);
  }, [jobId]);

  useEffect(() => {
    if (!jobId) return;
    (async () => {
      setLoading(true);
      await Promise.all([loadJob(), loadRams()]);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  // Coming back from the RAMS editor view: refresh the summary card.
  useEffect(() => {
    if (!ramsView) void loadRams();
  }, [ramsView, loadRams]);

  const handleChecklistCount = useCallback((done: number, total: number) => setChecklistCount({ done, total }), []);

  const openRamsEditor = () => setSearchParams({ view: "rams" });

  const handleReadRams = async () => {
    if (!rams) return;
    setRamsBusy("read");
    try {
      const { url } = await invokeEdgeFunction<{ url: string }>("generate-rams-pdf", { body: { job_rams_id: rams.id } });
      window.open(url, "_blank");
    } catch (err) {
      toast.error("Couldn't open the RAMS", { description: err instanceof Error ? err.message : "Please try again." });
    } finally {
      setRamsBusy(null);
    }
  };

  const handleReviseRams = async () => {
    if (!rams) return;
    setRamsBusy("revise");
    try {
      const { error } = await supabase.rpc("revise_job_rams", { p_job_rams_id: rams.id });
      if (error) throw error;
      openRamsEditor();
    } catch (err) {
      toast.error("Couldn't start a revision", { description: err instanceof Error ? err.message : "Please try again." });
    } finally {
      setRamsBusy(null);
    }
  };

  if (teamLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: NAVY }}>
        <Loader2 className="h-6 w-6 animate-spin text-white" />
      </div>
    );
  }

  if (!job || !ownProfileId || !jobId || !teamMember) {
    return (
      <div className="min-h-screen bg-white">
        <FieldHeader title="Job not found" onBack={() => navigate("/field")} />
        <p className="p-4 text-base text-muted-foreground">
          This job couldn't be loaded — it may not be assigned to you.
        </p>
      </div>
    );
  }

  const jobRef = formatJobRef(job.job_number, employerTsCode ? { contractorCode: employerTsCode } : undefined);

  // RAMS editor in its own view (not inline): the existing dashboard editor,
  // with the header's back arrow returning to the job page.
  if (ramsView) {
    return (
      <div className="min-h-screen bg-white flex flex-col">
        <FieldHeader eyebrow={jobRef} title="RAMS" onBack={() => setSearchParams({})} />
        <div className="flex-1 w-full max-w-xl mx-auto p-4">
          <RamsEditor jobId={jobId} />
        </div>
      </div>
    );
  }

  const address = fieldJobAddress(job);
  const mapsUrl = address ? `https://maps.google.com/?q=${encodeURIComponent(address)}` : null;
  const showPhone = PHONE_STATUSES.has(job.status);
  const telUrl = showPhone && customer?.phone ? `tel:${customer.phone.replace(/\s+/g, "")}` : null;
  const typeLabel = jobTypeLabel(job.job_type);
  const showStepper = job.status !== "complete" && job.status !== "cancelled";
  const when = fieldWhenLabel(job, { long: true });
  const overdue = isOverdueJob(job);

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <FieldHeader eyebrow={jobRef} title={job.title} onBack={() => navigate("/field")} />

      <div className="flex-1 w-full max-w-xl mx-auto pb-4">
        <div className="px-4 py-3 border-b flex flex-wrap items-center gap-2">
          <FieldStatusPill status={job.status} />
          {overdue && (
            <span
              className="inline-block px-2.5 py-1 rounded font-semibold uppercase tracking-wide"
              style={{ backgroundColor: "#fef2f2", color: "#dc2626", fontSize: 14 }}
            >
              Overdue
            </span>
          )}
          {typeLabel && <span className="text-sm text-muted-foreground">{typeLabel}</span>}
        </div>

        {/* ── Summary ─────────────────────────────────────────────────── */}
        <SummaryRow label="When">
          <p className="text-base">{when ?? "Not scheduled yet"}</p>
        </SummaryRow>

        <SummaryRow label="Where">
          {address ? (
            <>
              <p className="text-base flex items-start gap-2">
                <MapPin className="h-4 w-4 mt-1 shrink-0 text-muted-foreground" />
                <span>{address}</span>
              </p>
              <a
                href={mapsUrl ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                className={actionButtonClass}
                style={actionButtonStyle(NAVY)}
              >
                <MapPin className="h-4 w-4" /> Navigate
              </a>
            </>
          ) : (
            <p className="text-base" style={{ color: "#b45309" }}>No address yet, ask the office</p>
          )}
        </SummaryRow>

        <SummaryRow label="Customer">
          <p className="text-base">{customer?.full_name ?? "—"}</p>
          {showPhone && (telUrl ? (
            <a href={telUrl} className={actionButtonClass} style={actionButtonStyle(ORANGE)}>
              <Phone className="h-4 w-4" /> Call
            </a>
          ) : (
            <p className="text-sm text-muted-foreground">No phone on file</p>
          ))}
        </SummaryRow>

        <SummaryRow label="Work">
          {job.description
            ? <p className="text-base whitespace-pre-wrap">{job.description}</p>
            : <p className="text-sm text-muted-foreground">No description on this job.</p>}
        </SummaryRow>

        {/* ── Before you start ───────────────────────────────────────── */}
        <div className="px-4 pt-5 pb-1">
          <p className="text-base font-semibold" style={{ color: NAVY }}>Before you start</p>
        </div>

        <Section title="RAMS">
          {!rams ? (
            <div className="space-y-3">
              <p className="text-base text-muted-foreground">No RAMS for this job</p>
              <button type="button" onClick={openRamsEditor} className={actionButtonClass} style={actionButtonStyle(ORANGE)}>
                Create RAMS
              </button>
            </div>
          ) : rams.status === "signed" ? (
            <div className="space-y-3">
              <div>
                <p className="text-base font-semibold" style={{ color: "#166534" }}>
                  <i className="ti ti-check mr-1" />RAMS v{rams.version} signed
                </p>
                <p className="text-sm text-muted-foreground">
                  Signed off {rams.signed_off_at ? format(new Date(rams.signed_off_at), "d MMM yyyy") : "—"}
                  {rams.signed_off_by_name ? ` by ${rams.signed_off_by_name}` : ""}
                </p>
              </div>
              {rams.hazards.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hazards recorded.</p>
              ) : (
                <div className="space-y-2">
                  {RISK_GROUPS.map(({ level, label, color }) => {
                    const items = rams.hazards.filter((h) => h.risk_level === level);
                    if (items.length === 0) return null;
                    return (
                      <div key={level}>
                        <p className="text-sm font-semibold uppercase tracking-wide" style={{ color }}>
                          {label} risk ({items.length})
                        </p>
                        <ul className="list-disc pl-5 text-base">
                          {items.map((h, i) => <li key={i}>{h.hazard}</li>)}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleReadRams}
                  disabled={ramsBusy !== null}
                  className={actionButtonClass}
                  style={actionButtonStyle(NAVY)}
                >
                  {ramsBusy === "read" && <Loader2 className="h-4 w-4 animate-spin" />}
                  Read RAMS
                </button>
                <button
                  type="button"
                  onClick={handleReviseRams}
                  disabled={ramsBusy !== null}
                  className="flex items-center justify-center gap-1.5 rounded-lg font-medium w-full border"
                  style={{ minHeight: 48, fontSize: 16, color: NAVY, borderColor: "#d1d5db" }}
                >
                  {ramsBusy === "revise" && <Loader2 className="h-4 w-4 animate-spin" />}
                  Revise
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-base">
                RAMS v{rams.version}: <span className="font-semibold" style={{ color: "#b45309" }}>
                  {rams.status === "tailored" ? "tailored, not signed" : "draft, not signed"}
                </span>
              </p>
              <button type="button" onClick={openRamsEditor} className={actionButtonClass} style={actionButtonStyle(ORANGE)}>
                Continue RAMS
              </button>
            </div>
          )}
        </Section>

        {/* Future: Site check card (point-of-work risk assessment with
            sign-on) goes here, between RAMS and Checklist. Deliberately
            renders nothing yet — RAMS workstream item 4. */}

        <Section
          title="Checklist"
          aside={checklistCount && checklistCount.total > 0 ? (
            <span className="text-sm font-medium" style={{ color: NAVY }}>
              {checklistCount.done} of {checklistCount.total}
            </span>
          ) : undefined}
        >
          <FieldChecklist jobId={jobId} ownProfileId={ownProfileId} onCountChange={handleChecklistCount} />
        </Section>

        <Section title="Photos">
          <FieldPhotos jobId={jobId} ownProfileId={ownProfileId} />
        </Section>

        {/* Completion sequence, Part 5: mark finished (stepper below, or
            already done if status is complete) -> capture signature ->
            closing note. Signature only ever available once complete. */}
        {job.status === "complete" && (
          <Section title="Sign-off">
            {job.site_signed_off_at ? (
              <div className="rounded-lg border p-3" style={{ borderColor: "#86efac", backgroundColor: "#f0fdf4" }}>
                <p className="text-base font-medium" style={{ color: "#166534" }}>
                  Signed off by {job.site_signed_off_name}
                </p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {new Date(job.site_signed_off_at).toLocaleString("en-GB", {
                    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
                  })}
                </p>
              </div>
            ) : (
              <FieldSignatureCapture
                jobId={jobId}
                ownProfileId={ownProfileId}
                defaultName={customer?.full_name ?? ""}
                onCaptured={(at, name) =>
                  setJob((cur) => (cur ? { ...cur, site_signed_off_at: at, site_signed_off_name: name, site_signed_off_by: ownProfileId } : cur))
                }
              />
            )}
          </Section>
        )}

        <Section title="Notes">
          <FieldNotes jobId={jobId} contractorId={teamMember.contractor_id} ownProfileId={ownProfileId} />
        </Section>
      </div>

      {showStepper && (
        <div style={{ backgroundColor: "#ffffff", borderTop: "1px solid #e5e7eb" }} className="sticky bottom-0 z-20">
          <div className="max-w-xl mx-auto px-4 py-3">
            <FieldStatusStepper
              jobId={jobId}
              status={job.status}
              onChanged={(newStatus) => setJob((cur) => (cur ? { ...cur, status: newStatus } : cur))}
            />
          </div>
        </div>
      )}
    </div>
  );
}
