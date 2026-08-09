import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
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
import { jobTypeLabel, jobHeading } from "@/lib/jobLabels";
import type { Database } from "@/integrations/supabase/types";

type Job = Database["public"]["Tables"]["jobs"]["Row"];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-4 border-b">
      <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">{title}</p>
      {children}
    </div>
  );
}

export default function FieldJobDetail() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const { loading: teamLoading, teamMember, ownProfileId } = useFieldTeamMember();

  const [job, setJob] = useState<Job | null>(null);
  const [customer, setCustomer] = useState<{ full_name: string | null; phone: string | null } | null>(null);
  const [loading, setLoading] = useState(true);

  const loadJob = async () => {
    if (!jobId) return;
    const { data: jobData, error } = await supabase.from("jobs").select("*").eq("id", jobId).maybeSingle();
    if (error || !jobData) return;
    setJob(jobData);

    if (jobData.customer_id) {
      const { data: customerData } = await supabase
        .from("profiles")
        .select("full_name, phone")
        .eq("id", jobData.customer_id)
        .maybeSingle();
      setCustomer(customerData ?? null);
    }
  };

  useEffect(() => {
    if (!jobId) return;
    (async () => {
      setLoading(true);
      await loadJob();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

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

  const mapsUrl = job.location
    ? `https://maps.google.com/?q=${encodeURIComponent(job.location)}`
    : null;
  const telUrl = customer?.phone ? `tel:${customer.phone.replace(/\s+/g, "")}` : null;
  const typeLabel = jobTypeLabel(job.job_type);
  const showStepper = job.status !== "complete" && job.status !== "cancelled";

  return (
    <div className="min-h-screen bg-white flex flex-col" style={{ fontFamily: "Lexend, sans-serif" }}>
      {/* Location, then customer name + job type, then title as a last
          resort — see jobLabels.ts's jobHeading(). Mint-from-quote
          auto-titles ("Quote for X") are meaningless on site. */}
      <FieldHeader title={jobHeading(job, customer?.full_name)} onBack={() => navigate("/field")} />

      <div className="flex-1 w-full max-w-xl mx-auto pb-4">
        <div className="px-4 py-3 border-b flex items-center gap-2">
          <FieldStatusPill status={job.status} />
          {typeLabel && <span className="text-sm text-muted-foreground">{typeLabel}</span>}
        </div>

        {/* Address block — always rendered, with a clear empty state, per
            the brief's explicit requirement rather than omitting it
            entirely when location is null. */}
        <div className="px-4 py-4 border-b space-y-2">
          {job.location ? (
            <p className="text-base flex items-start gap-2">
              <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
              <span>{job.location}</span>
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">No address on file for this job.</p>
          )}
          <div className="flex gap-2">
            <a
              href={mapsUrl ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
              aria-disabled={!mapsUrl}
              onClick={(e) => { if (!mapsUrl) e.preventDefault(); }}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-lg font-medium text-white"
              style={{ backgroundColor: NAVY, minHeight: 48, fontSize: 16, opacity: mapsUrl ? 1 : 0.4 }}
            >
              <MapPin className="h-4 w-4" /> Navigate
            </a>
            <a
              href={telUrl ?? undefined}
              aria-disabled={!telUrl}
              onClick={(e) => { if (!telUrl) e.preventDefault(); }}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-lg font-medium text-white"
              style={{ backgroundColor: ORANGE, minHeight: 48, fontSize: 16, opacity: telUrl ? 1 : 0.4 }}
            >
              <Phone className="h-4 w-4" /> Call
            </a>
          </div>
          {!telUrl && <p className="text-sm text-muted-foreground">No phone on file for the customer.</p>}
        </div>

        {customer?.full_name && (
          <Section title="Customer">
            <p className="text-base">{customer.full_name}</p>
          </Section>
        )}

        {job.description && (
          <Section title="Job description">
            <p className="text-base whitespace-pre-wrap">{job.description}</p>
          </Section>
        )}

        <Section title="Checklist">
          <FieldChecklist jobId={jobId} ownProfileId={ownProfileId} />
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
