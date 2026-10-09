import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type {
  ContractorSummary, PackageFormValues, ProjectJob, ProjectPackage,
} from "@/hooks/useProjectDetail";
import type { ProjectInvoice } from "@/lib/projectMoney";
import { jobMoney } from "@/lib/projectMoney";
import { jobStatusChip } from "@/lib/jobStatus";
import { formatJobRef } from "@/lib/documentRefs";
import { formatGBP } from "@/lib/formatGBP";
import { formatDate } from "@/lib/formatDate";
import { groupPackagesByTrade } from "@/lib/projectPackages";
import { AddPackageDialog } from "./AddPackageDialog";
import { AttachJobDialog } from "./AttachJobDialog";
import { messageOf } from "./projectErrors";

type Props = {
  packages: ProjectPackage[];
  jobs: Record<string, ProjectJob>;
  invoices: ProjectInvoice[];
  contractors: Record<string, ContractorSummary>;
  addPackage: (values: PackageFormValues) => Promise<void>;
  updatePackage: (packageId: string, values: PackageFormValues) => Promise<void>;
  deletePackage: (pkg: ProjectPackage) => Promise<void>;
  attachJob: (packageId: string, jobId: string) => Promise<void>;
  detachJob: (packageId: string) => Promise<void>;
  loadAttachableJobs: () => Promise<{ jobs: ProjectJob[]; contractors: Record<string, ContractorSummary> }>;
  /** A completed project is read-only: no add, edit, delete, attach or detach. */
  readOnly?: boolean;
  /** 'personal' (default) is unchanged. 'business' hides paid/still-to-pay and shows each package's site. */
  viewer?: "personal" | "business";
  /** Where "Find a contractor" goes. Always required — no hard-coded default. */
  findContractorPath: string;
  /** Business only: site id -> name, for showing each package's site. */
  siteNames?: Record<string, string>;
  /** Business only: the project's own sites, offered in the package site picker. */
  projectSites?: { id: string; name: string }[];
};

export function PackagesSection(props: Props) {
  const { packages, jobs, invoices, contractors, readOnly = false, viewer = "personal", findContractorPath, siteNames = {}, projectSites } = props;
  const navigate = useNavigate();
  const { toast } = useToast();

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<ProjectPackage | null>(null);
  const [attachingTo, setAttachingTo] = useState<ProjectPackage | null>(null);
  const [detaching, setDetaching] = useState<ProjectPackage | null>(null);
  const [deleting, setDeleting] = useState<ProjectPackage | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const filled = packages.filter((p) => !!p.job_id).length;
  const groups = groupPackagesByTrade(packages);

  const requestDelete = (pkg: ProjectPackage) => {
    if (pkg.job_id) {
      toast({ title: "Package not deleted", description: "Detach the job before deleting this package.", variant: "destructive" });
      return;
    }
    setConfirmError(null);
    setDeleting(pkg);
  };

  const runConfirmed = async (action: () => Promise<void>, close: () => void) => {
    setBusy(true);
    setConfirmError(null);
    try {
      await action();
      close();
    } catch (err) {
      setConfirmError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle className="font-heading text-lg">Packages of work</CardTitle>
          <p className="text-sm text-muted-foreground">
            {packages.length === 0 ? "No packages yet" : `${filled} of ${packages.length} have a contractor`}
          </p>
        </div>
        {!readOnly && (
          <Button size="sm" onClick={() => setAdding(true)}>
            <i className="ti ti-plus mr-2" aria-hidden="true" />
            Add a package
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        {packages.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Split the work into packages, one for each contractor, such as the groundworks, the electrics and the
            kitchen fit. Then attach the job for each one.
          </p>
        ) : (
          groups.map((group) => (
            <div key={group.trade} className="space-y-2">
              <h4 className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {group.trade}
              </h4>
              <ul className="divide-y rounded-md border">
                {group.items.map((pkg) => (
                  <PackageRow
                    key={pkg.id}
                    pkg={pkg}
                    job={pkg.job_id ? jobs[pkg.job_id] : undefined}
                    contractor={pkg.job_id && jobs[pkg.job_id] ? contractors[jobs[pkg.job_id].contractor_id] : undefined}
                    invoices={invoices}
                    readOnly={readOnly}
                    viewer={viewer}
                    siteName={pkg.site_id ? siteNames[pkg.site_id] : undefined}
                    onEdit={() => setEditing(pkg)}
                    onDelete={() => requestDelete(pkg)}
                    onDetach={() => { setConfirmError(null); setDetaching(pkg); }}
                    onAttach={() => setAttachingTo(pkg)}
                    onFindContractor={() => navigate(findContractorPath)}
                  />
                ))}
              </ul>
            </div>
          ))
        )}
      </CardContent>

      <AddPackageDialog
        open={adding || !!editing}
        pkg={editing}
        sites={projectSites}
        onClose={() => { setAdding(false); setEditing(null); }}
        onSave={async (values) => {
          if (editing) await props.updatePackage(editing.id, values);
          else await props.addPackage(values);
        }}
      />

      <AttachJobDialog
        open={!!attachingTo}
        pkg={attachingTo}
        onClose={() => setAttachingTo(null)}
        loadAttachableJobs={props.loadAttachableJobs}
        onAttach={async (jobId) => {
          if (!attachingTo) return;
          await props.attachJob(attachingTo.id, jobId);
          toast({ title: "Job attached", description: `Attached to ${attachingTo.title}.` });
        }}
      />

      <AlertDialog open={!!detaching} onOpenChange={(v) => !v && !busy && setDetaching(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Detach this job?</AlertDialogTitle>
            <AlertDialogDescription>
              The job is removed from "{detaching?.title}" and from this project. The job itself, its quote and its
              invoices are not changed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {confirmError && <p className="text-sm text-destructive">{confirmError}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                if (detaching) void runConfirmed(() => props.detachJob(detaching.id), () => setDetaching(null));
              }}
            >
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Detach job
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleting} onOpenChange={(v) => !v && !busy && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this package?</AlertDialogTitle>
            <AlertDialogDescription>"{deleting?.title}" will be removed from the project.</AlertDialogDescription>
          </AlertDialogHeader>
          {confirmError && <p className="text-sm text-destructive">{confirmError}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                if (deleting) void runConfirmed(() => props.deletePackage(deleting), () => setDeleting(null));
              }}
            >
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete package
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function PackageRow({
  pkg, job, contractor, invoices, readOnly, viewer, siteName, onEdit, onDelete, onDetach, onAttach, onFindContractor,
}: {
  pkg: ProjectPackage;
  job: ProjectJob | undefined;
  contractor: ContractorSummary | undefined;
  invoices: ProjectInvoice[];
  readOnly: boolean;
  viewer: "personal" | "business";
  /** Business only — the package's own site, if any. */
  siteName: string | undefined;
  onEdit: () => void;
  onDelete: () => void;
  onDetach: () => void;
  onAttach: () => void;
  onFindContractor: () => void;
}) {
  const manage = readOnly ? null : (
    <div className="flex shrink-0 flex-nowrap gap-1">
      <Button size="sm" variant="ghost" onClick={onEdit} title="Edit package">
        <i className="ti ti-pencil" aria-hidden="true" />
        <span className="sr-only">Edit package</span>
      </Button>
      <Button size="sm" variant="ghost" onClick={onDelete} title="Delete package" className="text-destructive hover:text-destructive">
        <i className="ti ti-trash" aria-hidden="true" />
        <span className="sr-only">Delete package</span>
      </Button>
    </div>
  );

  // ── Unfilled ────────────────────────────────────────────────────────────────
  if (!pkg.job_id) {
    return (
      <li className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="font-medium">{pkg.title}</p>
          <p className="text-sm text-muted-foreground">
            No contractor yet
            {" · "}
            {pkg.needed_from ? `needed from ${formatDate(pkg.needed_from)}` : "no date set"}
            {viewer === "business" && (
              <>
                {" · "}
                {siteName ?? "All project sites"}
                {pkg.allowance != null && <> · allowance {formatGBP(pkg.allowance)}</>}
              </>
            )}
          </p>
        </div>
        {/* Wraps only on narrow screens; from sm up the buttons and the
            edit/delete icons stay on one line. */}
        {!readOnly && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-nowrap">
          <Button size="sm" variant="outline" className="whitespace-nowrap" onClick={onFindContractor}>
            <i className="ti ti-search mr-2" aria-hidden="true" />
            Find a contractor
          </Button>
          <Button size="sm" variant="outline" className="whitespace-nowrap" onClick={onAttach}>
            <i className="ti ti-link mr-2" aria-hidden="true" />
            Attach a job
          </Button>
          {manage}
        </div>
        )}
      </li>
    );
  }

  // ── Filled ──────────────────────────────────────────────────────────────────
  if (!job) {
    // Attached, but the job could not be read (it should always be readable
    // by its customer). Shown plainly rather than guessed at.
    return (
      <li className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="font-medium">{pkg.title}</p>
          <p className="text-sm text-muted-foreground">The attached job's details are not available.</p>
        </div>
        {!readOnly && (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={onDetach}>Detach</Button>
            {manage}
          </div>
        )}
      </li>
    );
  }

  const chip = jobStatusChip(job.status);
  const money = jobMoney(job, invoices);
  const reference = formatJobRef(job.job_number, contractor?.tsCode ? { contractorCode: contractor.tsCode } : undefined);
  const dates = job.start_date || job.end_date
    ? `${job.start_date ? formatDate(job.start_date) : "Start not set"} – ${job.end_date ? formatDate(job.end_date) : "end not set"}`
    : "Dates not set";

  // Business mode shows the agreed amount only — a coverage-scoped member
  // can't read a colleague's recipient-only invoices (see useProjectDetail),
  // so paid/still-to-pay would be wrong rather than just incomplete.
  let moneyLine: string | null;
  if (viewer === "business") {
    moneyLine = null;
  } else if (money.agreed != null && money.agreed > 0 && money.paid >= money.agreed) {
    moneyLine = "Paid in full";
  } else if (money.paid > 0) {
    moneyLine = `${formatGBP(money.paid)} paid, ${formatGBP(money.stillToPay)} to pay`;
  } else {
    moneyLine = "Nothing paid yet";
  }

  return (
    <li className="flex flex-col gap-3 p-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{pkg.title}</p>
          <Badge className={chip.className}>{chip.label}</Badge>
        </div>
        <p className="text-sm">
          {contractor ? contractor.name : "Contractor"}
          {contractor?.tsCode && <span className="font-mono text-muted-foreground"> · {contractor.tsCode}</span>}
        </p>
        <p className="text-sm text-muted-foreground">
          <span className="font-mono">{reference}</span>
          {" · "}
          {dates}
          {viewer === "business" && <> · {siteName ?? "All project sites"}</>}
        </p>
      </div>
      <div className="flex flex-col items-start gap-2 sm:items-end">
        <div className="text-left sm:text-right">
          <p className="font-mono font-semibold">{money.agreed != null ? formatGBP(money.agreed) : "Not agreed"}</p>
          {moneyLine && <p className="text-sm text-muted-foreground">{moneyLine}</p>}
        </div>
        {!readOnly && (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={onDetach}>Detach</Button>
            {manage}
          </div>
        )}
      </div>
    </li>
  );
}
