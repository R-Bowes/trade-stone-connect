import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState, LoadingState } from "@/components/AsyncState";
import { useSubcontractDetail } from "@/hooks/useContractorProjectParticipation";
import { YourSubcontractRamsCard } from "@/components/contractor/YourSubcontractRamsCard";
import { formatDate } from "@/lib/formatDate";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";

const LIST_PATH = "/dashboard/contractor?view=projects";

/**
 * A subcontractor's view of one accepted sub-contract: phase, scope,
 * dates, the site address, the customer's name, the main contractor's
 * signed RAMS (and its PDF), and the project's other phases. No money
 * anywhere on this page — subcontract_detail/subcontract_project_phases
 * never return a value column.
 */
export function ContractorSubcontractPage({ subcontractId }: { subcontractId: string }) {
  const navigate = useNavigate();
  const { detail, phases, loading, error, refetch } = useSubcontractDetail(subcontractId);
  const [openingRams, setOpeningRams] = useState(false);
  const [ramsError, setRamsError] = useState<string | null>(null);

  if (loading) return <LoadingState message="Loading sub-contract..." />;
  if (error) return <ErrorState message={error} onRetry={() => void refetch()} />;

  const backLink = (
    <Button variant="link" className="px-0 text-muted-foreground" onClick={() => navigate(LIST_PATH)}>
      <i className="ti ti-arrow-left mr-1" aria-hidden="true" />
      All projects
    </Button>
  );

  if (!detail) {
    return (
      <div className="space-y-4">
        {backLink}
        <ErrorState message="This sub-contract could not be found. It may have been cancelled, or you may no longer have access to it." />
      </div>
    );
  }

  const address = [
    detail.site_addr_line1, detail.site_addr_line2, detail.site_addr_city,
    detail.site_addr_region, detail.site_addr_postcode, detail.site_addr_country,
  ].filter(Boolean).join(", ");

  const handleOpenRams = async () => {
    if (!detail.rams_id) return;
    setOpeningRams(true);
    setRamsError(null);
    try {
      const { url } = await invokeEdgeFunction<{ url: string }>("generate-rams-pdf", {
        body: { job_rams_id: detail.rams_id },
      });
      window.open(url, "_blank");
    } catch (err) {
      setRamsError(err instanceof Error ? err.message : "Could not open the RAMS PDF.");
    } finally {
      setOpeningRams(false);
    }
  };

  return (
    <div className="space-y-6">
      {backLink}

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-heading text-2xl font-bold">{detail.phase_title}</h2>
          <Badge className={detail.status === "accepted" ? "bg-emerald-100 text-emerald-900" : "bg-muted text-muted-foreground"}>
            {detail.status === "accepted" ? "Accepted" : detail.status}
          </Badge>
        </div>
        <p className="text-muted-foreground">
          {detail.project_title} · {detail.main_contractor_name ?? "Main contractor"}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="font-heading text-lg">Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-muted-foreground">{detail.scope}</p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                <dt className="text-muted-foreground">Trade</dt>
                <dd>{detail.trade ?? "Not set"}</dd>
                <dt className="text-muted-foreground">Dates</dt>
                <dd>
                  {detail.starts_on ? formatDate(detail.starts_on) : "Start not set"} – {detail.ends_on ? formatDate(detail.ends_on) : "end not set"}
                </dd>
                {detail.job_status ? (
                  <>
                    <dt className="text-muted-foreground">Site address</dt>
                    <dd>{address || "Not set"}</dd>
                    <dt className="text-muted-foreground">Customer</dt>
                    <dd>{detail.customer_name ?? "Not set"}</dd>
                    <dt className="text-muted-foreground">Job status</dt>
                    <dd>{detail.job_status}</dd>
                  </>
                ) : (
                  <dd className="col-span-2 text-muted-foreground">No job is attached to this phase at the moment.</dd>
                )}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="font-heading text-lg">Main contractor's RAMS</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {!detail.job_status ? (
                <p className="text-muted-foreground">No job is attached to this phase at the moment.</p>
              ) : detail.rams_id ? (
                <>
                  <p>
                    Signed version {detail.rams_version}
                    {detail.rams_signed_off_at && <> · signed off {formatDate(detail.rams_signed_off_at)}</>}
                  </p>
                  {ramsError && <p className="text-destructive">{ramsError}</p>}
                  <Button variant="outline" size="sm" onClick={() => void handleOpenRams()} disabled={openingRams}>
                    {openingRams && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    <i className="ti ti-file-text mr-2" aria-hidden="true" />
                    Open RAMS PDF
                  </Button>
                </>
              ) : (
                <p className="text-muted-foreground">No RAMS issued yet.</p>
              )}
            </CardContent>
          </Card>

          <YourSubcontractRamsCard subcontractId={subcontractId} mainContractorName={detail.main_contractor_name} />
        </div>

        <div className="min-w-0">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="font-heading text-lg">Other phases</CardTitle>
            </CardHeader>
            <CardContent>
              {phases.length === 0 ? (
                <p className="text-sm text-muted-foreground">No other phases on this project.</p>
              ) : (
                <ul className="divide-y rounded-md border text-sm">
                  {phases.map((p) => (
                    <li key={p.package_id} className="p-3">
                      <p className="font-medium">{p.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {p.subcontractor_names || p.main_contractor_name || "No contractor yet"}
                        {p.trade && ` · ${p.trade}`}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
