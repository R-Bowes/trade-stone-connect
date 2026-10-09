import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2 } from "lucide-react";
import type { ProjectSignOff } from "@/hooks/useProjectDetail";
import { formatDate } from "@/lib/formatDate";
import { formatGBP } from "@/lib/formatGBP";
import { messageOf } from "./projectErrors";

type Props = {
  projectStatus: string;
  signOffs: ProjectSignOff[];
  /** From signOffBlockers(); empty when sign-off can go ahead. */
  blockers: string[];
  /** Total still to pay across the project's filled packages. Signing off does not settle it. */
  stillToPay: number;
  onSignOff: () => Promise<void>;
};

/** Sign-off: unlocked only when nothing blocks it; sign_off_project re-checks and records it. */
export function SignOffCard({ projectStatus, signOffs, blockers, stillToPay, onSignOff }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (projectStatus === "completed") {
    const finalSignOff = signOffs.find((s) => s.stage === "final") ?? signOffs[0];
    return (
      <Card className="border-green-200 bg-green-50">
        <CardHeader className="pb-2">
          <CardTitle className="font-heading text-lg text-green-800">Sign-off</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-green-800">
          <i className="ti ti-circle-check mr-1" aria-hidden="true" />
          {finalSignOff ? `Signed off on ${formatDate(finalSignOff.signed_at)}` : "Signed off"}
        </CardContent>
      </Card>
    );
  }

  const unlocked = blockers.length === 0;

  const handleConfirm = async () => {
    setSigning(true);
    setError(null);
    try {
      await onSignOff();
      setConfirming(false);
    } catch (err) {
      // The database's own reason, e.g. a job that has just changed status.
      setError(messageOf(err));
    } finally {
      setSigning(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="font-heading text-lg">Sign-off</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          Signing off confirms that all the work on this project is finished to your satisfaction. The project is then
          closed and can no longer be changed.
        </p>

        {unlocked ? (
          <p className="font-medium text-green-700">Everything is complete and no snags are open.</p>
        ) : (
          <div>
            <p className="font-medium">Still to do before you can sign off:</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
              {blockers.map((b) => <li key={b}>{b}</li>)}
            </ul>
          </div>
        )}

        {error && !confirming && <p className="text-destructive">{error}</p>}

        <Button className="w-full" disabled={!unlocked} onClick={() => { setError(null); setConfirming(true); }}>
          Sign off project
        </Button>
      </CardContent>

      <AlertDialog open={confirming} onOpenChange={(v) => !signing && setConfirming(v)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign off this project?</AlertDialogTitle>
            <AlertDialogDescription>
              You are confirming that all the work is finished. The project will be marked completed and can no longer
              be changed.
              {stillToPay > 0 && (
                <span className="mt-2 block font-medium text-foreground">
                  <span className="font-mono">{formatGBP(stillToPay)}</span> is still to pay on this project. Signing
                  off does not settle it.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={signing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={signing}
              onClick={(e) => {
                e.preventDefault();
                void handleConfirm();
              }}
            >
              {signing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Sign off
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
