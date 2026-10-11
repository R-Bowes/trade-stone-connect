import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ErrorState } from "@/components/AsyncState";
import { useSubcontractRams } from "@/hooks/useContractorProjectParticipation";
import { useRams, type Hazard, type MethodStep } from "@/hooks/useRams";
import { HazardsSection, MethodStepsSection, PpeSection } from "@/components/management/rams/RamsEditor";
import { formatDate } from "@/lib/formatDate";
import { messageOf } from "@/components/projects/projectErrors";

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted",
  accepted: "Accepted",
  returned: "Returned",
  superseded: "Superseded",
};

/**
 * The subcontractor's own RAMS for one accepted sub-contract.
 * Status only -- never written to job_rams, no PDF in this step.
 */
export function YourSubcontractRamsCard({
  subcontractId,
  mainContractorName,
}: {
  subcontractId: string;
  mainContractorName: string | null;
}) {
  const { current, earlier, loading, error, refetch, start, save, submit, revise } = useSubcontractRams(subcontractId);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [revising, setRevising] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);

  if (loading) return null;
  if (error) return <ErrorState message={error} onRetry={() => void refetch()} />;

  const handleStart = async (templateId: string | null) => {
    setStarting(true);
    setStartError(null);
    try {
      await start(templateId);
    } catch (err) {
      setStartError(messageOf(err));
    } finally {
      setStarting(false);
    }
  };

  const handleRevise = async () => {
    setRevising(true);
    try {
      await revise();
    } finally {
      setRevising(false);
    }
  };

  // An accepted version stays in force until its replacement is itself
  // accepted, so a draft/submitted/returned `current` can coexist with
  // an earlier row that is still 'accepted' -- surfaced here so the
  // subcontractor knows which version the main contractor is working to.
  const inForce = current && current.status !== "accepted" ? earlier.find((v) => v.status === "accepted") : undefined;
  const inForceNote = inForce && (
    <p className="text-xs text-muted-foreground">
      Version {inForce.version}, accepted {inForce.reviewed_at ? formatDate(inForce.reviewed_at) : ""}, stays in force until this one is accepted.
    </p>
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="font-heading text-lg">Your RAMS</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {!current ? (
          <StartRamsPanel starting={starting} error={startError} onStart={handleStart} />
        ) : current.status === "draft" ? (
          <>
            {inForceNote}
            <DraftRamsPanel
              current={current}
              save={save}
              onSubmitRequested={() => setSubmitOpen(true)}
            />
          </>
        ) : current.status === "submitted" ? (
          <div className="space-y-1">
            <Badge className="bg-amber-100 text-amber-900">Submitted</Badge>
            <p className="text-muted-foreground">
              Submitted {current.submitted_at ? formatDate(current.submitted_at) : ""}, awaiting review.
            </p>
            {inForceNote}
          </div>
        ) : current.status === "returned" ? (
          <div className="space-y-2">
            <Badge className="bg-red-100 text-red-900">Returned</Badge>
            {current.review_note && <p className="text-muted-foreground">Note: {current.review_note}</p>}
            {inForceNote}
            <Button size="sm" variant="outline" onClick={() => void handleRevise()} disabled={revising}>
              {revising && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Revise
            </Button>
          </div>
        ) : current.status === "accepted" ? (
          <div className="space-y-2">
            <Badge className="bg-emerald-100 text-emerald-900">Accepted</Badge>
            <p className="text-muted-foreground">
              Accepted {current.reviewed_at ? formatDate(current.reviewed_at) : ""}.
            </p>
            <Button size="sm" variant="outline" onClick={() => void handleRevise()} disabled={revising}>
              {revising && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Revise
            </Button>
          </div>
        ) : null}

        {earlier.length > 0 && (
          <div className="space-y-1 border-t pt-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Earlier versions</p>
            <ul className="space-y-1">
              {earlier.map((v) => (
                <li key={v.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline" className="font-mono">v{v.version}</Badge>
                  {STATUS_LABEL[v.status] ?? v.status}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>

      {current && current.status === "draft" && (
        <SubmitRamsDialog
          open={submitOpen}
          onClose={() => setSubmitOpen(false)}
          mainContractorName={mainContractorName}
          onSubmit={submit}
        />
      )}
    </Card>
  );
}

function StartRamsPanel({
  starting, error, onStart,
}: {
  starting: boolean;
  error: string | null;
  onStart: (templateId: string | null) => Promise<void>;
}) {
  const { templates } = useRams();
  const platformTemplates = templates.filter((t) => t.owner_contractor_id === null);
  const myTemplates = templates.filter((t) => t.owner_contractor_id !== null);

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground">You haven't started a RAMS for this work yet.</p>
      <Button size="sm" onClick={() => void onStart(null)} disabled={starting}>
        {starting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        Start RAMS from scratch
      </Button>
      {(platformTemplates.length > 0 || myTemplates.length > 0) && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Or start from a template</p>
          <div className="flex flex-wrap gap-2">
            {[...platformTemplates, ...myTemplates].map((t) => (
              <Button key={t.id} size="sm" variant="outline" onClick={() => void onStart(t.id)} disabled={starting}>
                {t.name}
              </Button>
            ))}
          </div>
        </div>
      )}
      {error && <p className="text-destructive">{error}</p>}
    </div>
  );
}

function DraftRamsPanel({
  current, save, onSubmitRequested,
}: {
  current: { job_description: string | null; hazards: Hazard[]; method_steps: MethodStep[]; ppe_requirements: string[]; emergency_procedures: string | null; additional_notes: string | null };
  save: (fields: {
    jobDescription: string | null; hazards: Hazard[]; methodSteps: MethodStep[];
    ppeRequirements: string[]; emergencyProcedures: string | null; additionalNotes: string | null;
  }) => Promise<void>;
  onSubmitRequested: () => void;
}) {
  const [jobDescription, setJobDescription] = useState(current.job_description ?? "");
  const [hazards, setHazards] = useState<Hazard[]>(current.hazards);
  const [methodSteps, setMethodSteps] = useState<MethodStep[]>(current.method_steps);
  const [ppe, setPpe] = useState<string[]>(current.ppe_requirements);
  const [emergencyProcedures, setEmergencyProcedures] = useState(current.emergency_procedures ?? "");
  const [additionalNotes, setAdditionalNotes] = useState(current.additional_notes ?? "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Re-seed local state if the underlying row identity changes (e.g.
  // after a revise creates a fresh draft) -- not on every keystroke.
  useEffect(() => {
    setJobDescription(current.job_description ?? "");
    setHazards(current.hazards);
    setMethodSteps(current.method_steps);
    setPpe(current.ppe_requirements);
    setEmergencyProcedures(current.emergency_procedures ?? "");
    setAdditionalNotes(current.additional_notes ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await save({
        jobDescription: jobDescription || null,
        hazards,
        methodSteps,
        ppeRequirements: ppe,
        emergencyProcedures: emergencyProcedures || null,
        additionalNotes: additionalNotes || null,
      });
    } catch (err) {
      setSaveError(messageOf(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label>Job description</Label>
        <Textarea rows={2} value={jobDescription} onChange={(e) => setJobDescription(e.target.value)} />
      </div>
      <HazardsSection hazards={hazards} onChange={setHazards} />
      <MethodStepsSection steps={methodSteps} onChange={setMethodSteps} />
      <PpeSection ppe={ppe} onChange={setPpe} />
      <div className="space-y-1">
        <Label>Emergency procedures</Label>
        <Textarea rows={2} value={emergencyProcedures} onChange={(e) => setEmergencyProcedures(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label>Additional notes</Label>
        <Textarea rows={2} value={additionalNotes} onChange={(e) => setAdditionalNotes(e.target.value)} />
      </div>
      {saveError && <p className="text-destructive">{saveError}</p>}
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" onClick={() => void handleSave()} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Save
        </Button>
        <Button size="sm" onClick={onSubmitRequested} disabled={saving}>
          Submit
        </Button>
      </div>
    </div>
  );
}

function SubmitRamsDialog({
  open, onClose, mainContractorName, onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  mainContractorName: string | null;
  onSubmit: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(name.trim());
      onClose();
      setName("");
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !submitting && !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Submit to {mainContractorName ?? "the main contractor"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="sub-rams-signer">Your name</Label>
          <Input id="sub-rams-signer" value={name} onChange={(e) => setName(e.target.value)} />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={() => void handleSubmit()} disabled={!name.trim() || submitting}>
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
