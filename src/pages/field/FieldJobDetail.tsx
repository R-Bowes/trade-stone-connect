import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, MapPin, Phone } from "lucide-react";
import { useFieldTeamMember } from "@/hooks/useFieldTeamMember";
import FieldHeader, { ORANGE, NAVY } from "@/components/field/FieldHeader";
import FieldStatusPill from "@/components/field/FieldStatusPill";
import FieldChecklist from "@/components/field/FieldChecklist";
import FieldPhotos from "@/components/field/FieldPhotos";
import type { Database } from "@/integrations/supabase/types";

type Job = Database["public"]["Tables"]["jobs"]["Row"];

export default function FieldJobDetail() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const { loading: teamLoading, ownProfileId } = useFieldTeamMember();

  const [job, setJob] = useState<Job | null>(null);
  const [customer, setCustomer] = useState<{ full_name: string | null; phone: string | null } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!jobId) return;
    (async () => {
      setLoading(true);
      const { data: jobData, error } = await supabase.from("jobs").select("*").eq("id", jobId).maybeSingle();
      if (error || !jobData) {
        setLoading(false);
        return;
      }
      setJob(jobData);

      if (jobData.customer_id) {
        const { data: customerData } = await supabase
          .from("profiles")
          .select("full_name, phone")
          .eq("id", jobData.customer_id)
          .maybeSingle();
        setCustomer(customerData ?? null);
      }
      setLoading(false);
    })();
  }, [jobId]);

  if (teamLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: NAVY }}>
        <Loader2 className="h-6 w-6 animate-spin text-white" />
      </div>
    );
  }

  if (!job || !ownProfileId || !jobId) {
    return (
      <div className="min-h-screen bg-[#f4f5f7]">
        <FieldHeader title="Job not found" onBack={() => navigate("/field")} />
        <p className="p-4 text-sm text-muted-foreground">
          This job couldn't be loaded — it may not be assigned to you.
        </p>
      </div>
    );
  }

  const mapsUrl = job.location
    ? `https://maps.google.com/?q=${encodeURIComponent(job.location)}`
    : null;
  const telUrl = customer?.phone ? `tel:${customer.phone.replace(/\s+/g, "")}` : null;

  return (
    <div className="min-h-screen bg-white pb-8" style={{ fontFamily: "Lexend, sans-serif" }}>
      <FieldHeader title={job.title || job.location || "Job"} onBack={() => navigate("/field")} />

      <div className="px-4 py-3 border-b flex items-center justify-between">
        <FieldStatusPill status={job.status} />
      </div>

      {job.location && (
        <div className="px-4 py-3 border-b space-y-2">
          <p className="text-sm flex items-start gap-2">
            <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
            <span>{job.location}</span>
          </p>
          <div className="flex gap-2">
            {mapsUrl && (
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-1.5 rounded-md py-2 text-sm font-medium text-white"
                style={{ backgroundColor: NAVY }}
              >
                <MapPin className="h-3.5 w-3.5" /> Navigate
              </a>
            )}
            {telUrl ? (
              <a
                href={telUrl}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-md py-2 text-sm font-medium text-white"
                style={{ backgroundColor: ORANGE }}
              >
                <Phone className="h-3.5 w-3.5" /> Call
              </a>
            ) : (
              <span className="flex-1 flex items-center justify-center gap-1.5 rounded-md py-2 text-sm text-muted-foreground border">
                No phone on file
              </span>
            )}
          </div>
        </div>
      )}

      {customer?.full_name && (
        <div className="px-4 py-3 border-b">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
            Customer
          </p>
          <p className="text-sm">{customer.full_name}</p>
        </div>
      )}

      {job.description && (
        <div className="px-4 py-3 border-b">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
            Job description
          </p>
          <p className="text-sm whitespace-pre-wrap">{job.description}</p>
        </div>
      )}

      <div className="px-4 py-3 border-b">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
          Checklist
        </p>
        <FieldChecklist jobId={jobId} ownProfileId={ownProfileId} />
      </div>

      <div className="px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
          Photos
        </p>
        <FieldPhotos jobId={jobId} ownProfileId={ownProfileId} />
      </div>
    </div>
  );
}
