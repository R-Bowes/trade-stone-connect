import { useEffect, useState } from "react";
import { format } from "date-fns";
import { ExternalLink, FileText, Loader2, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { useJobCertificates, CERTIFICATE_TYPE_LABELS } from "@/hooks/useJobCertificates";

// Read-only summary of documents the contractor has produced for this job —
// RAMS (once tailored/signed, never a draft) and job certificates/warranties.
// Deliberately not tied to job.status: a certificate can be issued mid-job
// (e.g. a gas safety check) and RAMS is normally in place before work
// starts, well before "complete". Renders nothing at all if there is
// nothing to show — no empty state, see CLAUDE.md copy rules on not
// overclaiming (this is "from your contractor", not TradeStone-checked).
//
// No "Verified" badge: job_certificates.verified has no admin review step
// behind it at all (unlike contractor_credentials) — RLS lets a contractor
// set it on their own row directly, and the app's own certificate form
// never exposes a control for it. There's nothing honest to display either
// way, so it's omitted rather than shown or relabelled.

function isExpired(expiryDate: string | null): boolean {
  if (!expiryDate) return false;
  return expiryDate < new Date().toISOString().slice(0, 10);
}

interface JobRamsSummary {
  id: string;
  status: "draft" | "tailored" | "signed" | "superseded";
  tailored_at: string | null;
  signed_off_at: string | null;
}

export function CustomerJobDocuments({ jobId }: { jobId: string }) {
  const { toast } = useToast();
  const { certificates, loading: certsLoading, getSignedDocumentUrl } = useJobCertificates(jobId);

  const [rams, setRams] = useState<JobRamsSummary | null>(null);
  const [ramsLoading, setRamsLoading] = useState(true);
  const [ramsOpening, setRamsOpening] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setRamsLoading(true);
      // job_rams isn't in the generated Supabase types yet (same pattern as
      // useRams.ts) — cast through `any` at the read boundary only.
      const { data, error } = await (supabase as any)
        .from("job_rams")
        .select("id, status, tailored_at, signed_off_at")
        .eq("job_id", jobId)
        .in("status", ["tailored", "signed"])
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        console.error("Error fetching job RAMS for customer view:", error);
        setRams(null);
      } else {
        setRams((data as JobRamsSummary | null) ?? null);
      }
      setRamsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  const handleViewRams = async () => {
    if (!rams) return;
    setRamsOpening(true);
    try {
      const { url } = await invokeEdgeFunction<{ url: string }>("generate-rams-pdf", {
        body: { job_rams_id: rams.id },
      });
      window.open(url, "_blank");
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Could not open document",
        variant: "destructive",
      });
    } finally {
      setRamsOpening(false);
    }
  };

  const handleViewCertificate = async (path: string) => {
    try {
      const url = await getSignedDocumentUrl(path);
      window.open(url, "_blank");
    } catch {
      toast({ title: "Error", description: "Could not open document", variant: "destructive" });
    }
  };

  if (ramsLoading || certsLoading) return null;
  if (!rams && certificates.length === 0) return null;

  const warranties = certificates.filter(
    (c) => c.certificate_type === "manufacturer_warranty" || c.certificate_type === "workmanship_warranty",
  );
  const longestWarrantyExpiry = warranties
    .map((w) => w.expiry_date)
    .filter((d): d is string => !!d)
    .sort()
    .pop();

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Documents from your contractor
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rams && (
          <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">Risk Assessment & Method Statement</p>
              <p className="text-xs text-muted-foreground">
                {rams.status === "signed" && rams.signed_off_at
                  ? `Signed off ${format(new Date(rams.signed_off_at), "d MMM yyyy")}`
                  : rams.tailored_at
                  ? `Prepared ${format(new Date(rams.tailored_at), "d MMM yyyy")}`
                  : null}
              </p>
            </div>
            <Button size="sm" variant="outline" disabled={ramsOpening} onClick={handleViewRams}>
              {ramsOpening ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
              )}
              View
            </Button>
          </div>
        )}

        {warranties.length > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-900">
            <ShieldCheck className="h-4 w-4 flex-shrink-0" />
            This work is covered by {warranties.length} warrant{warranties.length === 1 ? "y" : "ies"}
            {longestWarrantyExpiry && <> — cover until {format(new Date(longestWarrantyExpiry), "d MMM yyyy")}</>}
          </div>
        )}

        {certificates.map((cert) => {
          const expired = isExpired(cert.expiry_date);
          const isWarranty =
            cert.certificate_type === "manufacturer_warranty" || cert.certificate_type === "workmanship_warranty";

          return (
            <div key={cert.id} className="rounded-lg border p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{cert.certificate_name}</p>
                  <Badge variant="outline" className="text-[10px] mt-1">
                    {CERTIFICATE_TYPE_LABELS[cert.certificate_type]}
                  </Badge>
                </div>
                {expired && <Badge variant="destructive">Expired</Badge>}
              </div>

              <div className="text-xs text-muted-foreground space-y-0.5">
                <div>Issued: {format(new Date(cert.issued_date), "d MMM yyyy")}</div>
                {cert.expiry_date && <div>Expires: {format(new Date(cert.expiry_date), "d MMM yyyy")}</div>}
                {cert.certificate_number && <div>No. {cert.certificate_number}</div>}
                {cert.issuer && <div>Issuer: {cert.issuer}</div>}
              </div>

              {isWarranty && (cert.warranty_duration_months || cert.warranty_terms) && (
                <div className="text-xs bg-muted/50 rounded p-2 space-y-0.5">
                  {cert.warranty_duration_months && <div>Duration: {cert.warranty_duration_months} months</div>}
                  {cert.warranty_terms && <div className="text-muted-foreground">{cert.warranty_terms}</div>}
                </div>
              )}

              {cert.document_path && (
                <Button size="sm" variant="outline" onClick={() => handleViewCertificate(cert.document_path!)}>
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                  View Document
                </Button>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
