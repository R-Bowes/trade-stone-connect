import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ErrorState } from "@/components/AsyncState";
import {
  usePackageSubcontractors,
  lookupContractorByTsCode,
  type PackageSubcontractorRow,
} from "@/hooks/useContractorProjectParticipation";
import type { ProjectPackage } from "@/hooks/useProjectDetail";
import { formatDate } from "@/lib/formatDate";
import { messageOf } from "@/components/projects/projectErrors";

const STATUS_LABEL: Record<string, string> = {
  invited: "Invited",
  accepted: "Accepted",
  declined: "Declined",
  cancelled: "Cancelled",
};

const STATUS_CHIP: Record<string, string> = {
  invited: "bg-amber-100 text-amber-900",
  accepted: "bg-emerald-100 text-emerald-900",
  declined: "bg-muted text-muted-foreground",
  cancelled: "bg-muted text-muted-foreground",
};

/**
 * Per-phase sub-contractor coordination on a project the caller owns:
 * who has been invited, who accepted, and a way to invite someone new
 * by TS-C code. No money anywhere on this card.
 */
export function SubcontractorsCard({ projectId, packages }: { projectId: string; packages: ProjectPackage[] }) {
  const { rows, loading, error, refetch, inviteSubcontractor, cancelSubcontract } = usePackageSubcontractors(projectId);
  const [inviteFor, setInviteFor] = useState<ProjectPackage | null>(null);
  const [cancelTarget, setCancelTarget] = useState<PackageSubcontractorRow | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  if (loading) return null;
  if (error) return <ErrorState message={error} onRetry={() => void refetch()} />;

  const handleCancel = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    setCancelError(null);
    try {
      await cancelSubcontract(cancelTarget.subcontract_id);
      setCancelTarget(null);
    } catch (err) {
      setCancelError(messageOf(err));
    } finally {
      setCancelling(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="font-heading text-lg">Subcontractors</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {packages.map((pkg) => {
          const subs = rows.filter((r) => r.package_id === pkg.id);
          return (
            <div key={pkg.id} className="space-y-2 border-b pb-4 last:border-b-0 last:pb-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{pkg.title}</p>
                <Button size="sm" variant="outline" disabled={!pkg.job_id} onClick={() => setInviteFor(pkg)}>
                  <i className="ti ti-user-plus mr-2" aria-hidden="true" />
                  Invite subcontractor
                </Button>
              </div>
              {!pkg.job_id && (
                <p className="text-xs text-muted-foreground">Attach a job to this phase first.</p>
              )}
              {subs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No subcontractors on this phase.</p>
              ) : (
                <ul className="divide-y rounded-md border text-sm">
                  {subs.map((s) => (
                    <li key={s.subcontract_id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{s.subcontractor_name ?? "Contractor"}</p>
                          {s.subcontractor_ts_code && <span className="font-mono text-xs text-muted-foreground">{s.subcontractor_ts_code}</span>}
                          <Badge className={STATUS_CHIP[s.status]}>{STATUS_LABEL[s.status] ?? s.status}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{s.scope}</p>
                        {(s.starts_on || s.ends_on) && (
                          <p className="text-xs text-muted-foreground">
                            {s.starts_on ? formatDate(s.starts_on) : "Start not set"} – {s.ends_on ? formatDate(s.ends_on) : "end not set"}
                          </p>
                        )}
                        {s.status === "declined" && s.response_note && (
                          <p className="text-xs text-muted-foreground">Note: {s.response_note}</p>
                        )}
                      </div>
                      {(s.status === "invited" || s.status === "accepted") && (
                        <Button size="sm" variant="ghost" className="shrink-0" onClick={() => setCancelTarget(s)}>
                          Cancel
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </CardContent>

      <InviteSubcontractorDialog pkg={inviteFor} onClose={() => setInviteFor(null)} onInvite={inviteSubcontractor} />

      <AlertDialog open={!!cancelTarget} onOpenChange={(v) => !cancelling && !v && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this sub-contract?</AlertDialogTitle>
            <AlertDialogDescription>
              {cancelTarget?.subcontractor_name ?? "This subcontractor"} will be notified and will lose access to this job's RAMS and detail.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {cancelError && <p className="text-sm text-destructive">{cancelError}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>Back</AlertDialogCancel>
            <AlertDialogAction
              disabled={cancelling}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); void handleCancel(); }}
            >
              {cancelling && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Cancel sub-contract
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function InviteSubcontractorDialog({
  pkg,
  onClose,
  onInvite,
}: {
  pkg: ProjectPackage | null;
  onClose: () => void;
  onInvite: (packageId: string, tsCode: string, scope: string, startsOn: string | null, endsOn: string | null) => Promise<void>;
}) {
  const [code, setCode] = useState("");
  const [lookedUpName, setLookedUpName] = useState<string | null>(null);
  const [scope, setScope] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (pkg) {
      setCode("");
      setLookedUpName(null);
      setScope("");
      setStartsOn(pkg.needed_from ?? "");
      setEndsOn(pkg.needed_to ?? "");
      setError(null);
    }
  }, [pkg]);

  const handleCheck = async () => {
    setChecking(true);
    setError(null);
    setLookedUpName(null);
    try {
      const result = await lookupContractorByTsCode(code);
      if (!result) {
        setError("No active contractor found with that code.");
      } else {
        setLookedUpName(result.name);
      }
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setChecking(false);
    }
  };

  const handleSend = async () => {
    if (!pkg) return;
    setSubmitting(true);
    setError(null);
    try {
      await onInvite(pkg.id, code.trim(), scope.trim(), startsOn || null, endsOn || null);
      onClose();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={!!pkg} onOpenChange={(v) => !submitting && !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite subcontractor{pkg ? ` — ${pkg.title}` : ""}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="sub-ts-code">TS-C code</Label>
            <div className="flex gap-2">
              <Input
                id="sub-ts-code"
                placeholder="TS-C-XXXXXX"
                value={code}
                onChange={(e) => { setCode(e.target.value); setLookedUpName(null); }}
              />
              <Button type="button" variant="outline" onClick={() => void handleCheck()} disabled={checking || !code.trim()}>
                {checking && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Check
              </Button>
            </div>
            {lookedUpName && (
              <p className="text-sm">
                Inviting <span className="font-medium">{lookedUpName}</span> ({code.trim().toUpperCase()}).
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="sub-scope">Scope</Label>
            <Textarea id="sub-scope" value={scope} onChange={(e) => setScope(e.target.value)} placeholder="What this subcontractor is doing" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="sub-starts">Starts</Label>
              <Input id="sub-starts" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sub-ends">Ends</Label>
              <Input id="sub-ends" type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={() => void handleSend()} disabled={!lookedUpName || !scope.trim() || submitting}>
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Send invite
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
