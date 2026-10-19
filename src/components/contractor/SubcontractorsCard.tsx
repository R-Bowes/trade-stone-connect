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
  usePackageSubcontractorRams,
  useSubcontractUnreadCounts,
  lookupContractorByTsCode,
  fetchSubcontractRams,
  reviewSubcontractRams,
  type PackageSubcontractorRow,
  type SubcontractRamsRow,
} from "@/hooks/useContractorProjectParticipation";
import { SubcontractThread } from "@/components/contractor/SubcontractThread";
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

const RAMS_LABEL: Record<string, string> = {
  submitted: "RAMS submitted",
  returned: "RAMS returned",
  accepted: "RAMS accepted",
};

/**
 * Per-phase sub-contractor coordination on a project the caller owns:
 * who has been invited, who accepted, and a way to invite someone new
 * by TS-C code. No money anywhere on this card.
 */
export function SubcontractorsCard({ projectId, packages }: { projectId: string; packages: ProjectPackage[] }) {
  const { rows, loading, error, refetch, inviteSubcontractor, cancelSubcontract } = usePackageSubcontractors(projectId);
  const { rows: ramsRows, loading: ramsLoading, refetch: refetchRams } = usePackageSubcontractorRams(projectId);
  const { counts: unreadCounts, refetch: refetchUnread } = useSubcontractUnreadCounts();
  const [inviteFor, setInviteFor] = useState<ProjectPackage | null>(null);
  const [cancelTarget, setCancelTarget] = useState<PackageSubcontractorRow | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [viewRamsFor, setViewRamsFor] = useState<PackageSubcontractorRow | null>(null);
  const [messagesFor, setMessagesFor] = useState<PackageSubcontractorRow | null>(null);

  if (loading || ramsLoading) return null;
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
                  {subs.map((s) => {
                    const ramsRow = ramsRows.find((r) => r.subcontract_id === s.subcontract_id);
                    let ramsLabel = ramsRow?.rams_status ? (RAMS_LABEL[ramsRow.rams_status] ?? ramsRow.rams_status) : "RAMS not submitted";
                    if (
                      (ramsRow?.rams_status === "submitted" || ramsRow?.rams_status === "returned")
                      && ramsRow.in_force_version != null
                    ) {
                      ramsLabel += `, version ${ramsRow.in_force_version} still in force`;
                    }
                    return (
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
                          {(s.status === "invited" || s.status === "accepted") && (
                            <p className="text-xs text-muted-foreground">{ramsLabel}</p>
                          )}
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <Button size="sm" variant="outline" onClick={() => setMessagesFor(s)}>
                            Messages
                            {!!unreadCounts[s.subcontract_id] && (
                              <Badge className="ml-2 bg-destructive text-destructive-foreground">{unreadCounts[s.subcontract_id]}</Badge>
                            )}
                          </Button>
                          {ramsRow?.rams_id && (
                            <Button size="sm" variant="outline" onClick={() => setViewRamsFor(s)}>
                              View RAMS
                            </Button>
                          )}
                          {(s.status === "invited" || s.status === "accepted") && (
                            <Button size="sm" variant="ghost" onClick={() => setCancelTarget(s)}>
                              Cancel
                            </Button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </CardContent>

      <InviteSubcontractorDialog pkg={inviteFor} onClose={() => setInviteFor(null)} onInvite={inviteSubcontractor} />

      <ViewRamsDialog
        target={viewRamsFor}
        ramsRow={viewRamsFor ? ramsRows.find((r) => r.subcontract_id === viewRamsFor.subcontract_id) ?? null : null}
        onClose={() => setViewRamsFor(null)}
        onReviewed={async () => { await refetchRams(); setViewRamsFor(null); }}
      />

      <Dialog open={!!messagesFor} onOpenChange={(v) => { if (!v) { setMessagesFor(null); void refetchUnread(); } }}>
        <DialogContent className="flex h-[70vh] max-w-lg flex-col">
          <DialogHeader>
            <DialogTitle>Messages — {messagesFor?.subcontractor_name ?? "Subcontractor"}</DialogTitle>
          </DialogHeader>
          {messagesFor && (
            <SubcontractThread
              subcontractId={messagesFor.subcontract_id}
              status={messagesFor.status}
              otherPartyName={messagesFor.subcontractor_name}
            />
          )}
        </DialogContent>
      </Dialog>

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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

function ViewRamsDialog({
  target,
  ramsRow,
  onClose,
  onReviewed,
}: {
  target: PackageSubcontractorRow | null;
  ramsRow: { rams_id: string | null; rams_status: string | null } | null;
  onClose: () => void;
  onReviewed: () => Promise<void>;
}) {
  const [full, setFull] = useState<SubcontractRamsRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [returnNote, setReturnNote] = useState("");
  const [showReturnNote, setShowReturnNote] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!target || !ramsRow?.rams_id) {
      setFull(null);
      return;
    }
    setLoading(true);
    setLoadError(null);
    setShowReturnNote(false);
    setReturnNote("");
    setActionError(null);
    fetchSubcontractRams(ramsRow.rams_id)
      .then(setFull)
      .catch((err) => setLoadError(messageOf(err)))
      .finally(() => setLoading(false));
  }, [target, ramsRow?.rams_id]);

  const handleAccept = async () => {
    if (!full) return;
    setSubmitting(true);
    setActionError(null);
    try {
      await reviewSubcontractRams(full.id, true, null);
      await onReviewed();
    } catch (err) {
      setActionError(messageOf(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendBack = async () => {
    if (!full || !returnNote.trim()) return;
    setSubmitting(true);
    setActionError(null);
    try {
      await reviewSubcontractRams(full.id, false, returnNote.trim());
      await onReviewed();
    } catch (err) {
      setActionError(messageOf(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={!!target} onOpenChange={(v) => !submitting && !v && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>RAMS — {target?.subcontractor_name ?? "Subcontractor"}</DialogTitle>
        </DialogHeader>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : loadError ? (
          <p className="text-sm text-destructive">{loadError}</p>
        ) : !full ? (
          <p className="text-sm text-muted-foreground">No RAMS to show.</p>
        ) : (
          <div className="space-y-4 text-sm">
            <Badge className={full.status === "accepted" ? "bg-emerald-100 text-emerald-900" : full.status === "returned" ? "bg-red-100 text-red-900" : "bg-amber-100 text-amber-900"}>
              v{full.version} · {full.status}
            </Badge>
            {full.job_description && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Job description</p>
                <p>{full.job_description}</p>
              </div>
            )}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Hazards</p>
              {full.hazards.length === 0 ? <p className="text-muted-foreground">None recorded.</p> : (
                <ul className="list-disc pl-5 space-y-1">
                  {full.hazards.map((h, i) => (
                    <li key={i}>{h.hazard} — {h.control_measures}</li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Method statement</p>
              {full.method_steps.length === 0 ? <p className="text-muted-foreground">None recorded.</p> : (
                <ol className="list-decimal pl-5 space-y-1">
                  {full.method_steps.map((s, i) => (
                    <li key={i}>{s.description}</li>
                  ))}
                </ol>
              )}
            </div>
            {full.ppe_requirements.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">PPE</p>
                <p>{full.ppe_requirements.join(", ")}</p>
              </div>
            )}
            {full.submitted_by_name && (
              <p className="text-xs text-muted-foreground">
                Submitted by {full.submitted_by_name}{full.submitted_at ? ` on ${formatDate(full.submitted_at)}` : ""}
              </p>
            )}
            {actionError && <p className="text-destructive">{actionError}</p>}

            {full.status === "submitted" && (
              <div className="space-y-2 border-t pt-3">
                {showReturnNote ? (
                  <div className="space-y-2">
                    <Label htmlFor="rams-return-note">Note for the subcontractor</Label>
                    <Textarea id="rams-return-note" value={returnNote} onChange={(e) => setReturnNote(e.target.value)} />
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setShowReturnNote(false)} disabled={submitting}>Cancel</Button>
                      <Button size="sm" variant="destructive" onClick={() => void handleSendBack()} disabled={!returnNote.trim() || submitting}>
                        {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Send back
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setShowReturnNote(true)} disabled={submitting}>Send back</Button>
                    <Button size="sm" onClick={() => void handleAccept()} disabled={submitting}>
                      {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Accept
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
