import { useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { format } from "date-fns";
import { useMileage, type MileageTrip } from "@/hooks/useMileage";
import { supabase } from "@/integrations/supabase/client";
import { downloadCsv, tradestoneCsvFilename } from "@/lib/csvExport";

const VEHICLE_TYPE_LABELS: Record<string, string> = {
  car: "Car",
  van: "Van",
  motorcycle: "Motorcycle",
  bicycle: "Bicycle",
};

type JobOption = { id: string; title: string; project_id: string | null };
type ProjectOption = { id: string; title: string };

type TripFormState = {
  vehicle_id: string;
  trip_date: string;
  from_location: string;
  to_location: string;
  miles: string;
  purpose: string;
  job_id: string;
  project_id: string;
};

const emptyForm = (): TripFormState => ({
  vehicle_id: "",
  trip_date: new Date().toISOString().split("T")[0],
  from_location: "",
  to_location: "",
  miles: "",
  purpose: "",
  job_id: "",
  project_id: "",
});

export function MileageTracking() {
  const {
    trips,
    vehicles,
    loading,
    currentTaxYear,
    calculateClaimAmount,
    getFlatRate,
    getCumulativeMiles,
    getTaxYearFromDateString,
    addTrip,
    updateTrip,
    deleteTrip,
    totalMilesThisTaxYear,
    totalClaimThisTaxYear,
    tripsThisMonth,
    cumulativeMilesByVehicle,
  } = useMileage();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTrip, setEditingTrip] = useState<MileageTrip | null>(null);
  const [form, setForm] = useState<TripFormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MileageTrip | null>(null);

  const [vehicleFilter, setVehicleFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);

  useEffect(() => {
    if (!dialogOpen) return;
    const loadContext = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profileRow } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!profileRow) return;

      const [{ data: jobRows }, { data: projectRows }] = await Promise.all([
        supabase
          .from("jobs")
          .select("id, title, project_id")
          .eq("contractor_id", profileRow.id)
          .not("status", "in", "(complete,cancelled)"),
        supabase
          .from("projects")
          .select("id, title")
          .eq("lead_contractor_id", profileRow.id),
      ]);

      setJobs(jobRows ?? []);
      setProjects(projectRows ?? []);
    };
    loadContext();
  }, [dialogOpen]);

  useEffect(() => {
    if (dialogOpen) {
      if (editingTrip) {
        setForm({
          vehicle_id: editingTrip.vehicle_id,
          trip_date: editingTrip.trip_date,
          from_location: editingTrip.from_location,
          to_location: editingTrip.to_location,
          miles: String(editingTrip.miles),
          purpose: editingTrip.purpose ?? "",
          job_id: editingTrip.job_id ?? "",
          project_id: editingTrip.project_id ?? "",
        });
      } else {
        setForm(emptyForm());
      }
    }
  }, [dialogOpen, editingTrip]);

  const filteredTrips = useMemo(() => {
    return trips.filter((t) => {
      const matchesVehicle = vehicleFilter === "all" || t.vehicle_id === vehicleFilter;
      const matchesFrom = !dateFrom || t.trip_date >= dateFrom;
      const matchesTo = !dateTo || t.trip_date <= dateTo;
      return matchesVehicle && matchesFrom && matchesTo;
    });
  }, [trips, vehicleFilter, dateFrom, dateTo]);

  const vehicleName = (id: string) => vehicles.find((v) => v.id === id)?.name ?? "—";
  const jobTitle = (id: string | null) => (id ? jobs.find((j) => j.id === id)?.title ?? "—" : "—");

  const handleExport = () => {
    downloadCsv(
      tradestoneCsvFilename("mileage"),
      ["Date", "From", "To", "Miles", "Vehicle", "Purpose", "Job", "Claim Amount"],
      filteredTrips.map((trip) => [
        trip.trip_date,
        trip.from_location,
        trip.to_location,
        Number(trip.miles).toString(),
        vehicleName(trip.vehicle_id),
        trip.purpose ?? "",
        jobTitle(trip.job_id),
        Number(trip.claim_amount).toFixed(2),
      ]),
    );
  };

  const selectedVehicle = vehicles.find((v) => v.id === form.vehicle_id);
  const milesNum = parseFloat(form.miles) || 0;

  const cumulativeForSelectedVehicle = selectedVehicle
    ? getCumulativeMiles(
        selectedVehicle.id,
        getTaxYearFromDateString(form.trip_date),
        editingTrip?.id,
      )
    : 0;

  const livePreview =
    selectedVehicle && milesNum > 0
      ? calculateClaimAmount(selectedVehicle.vehicle_type, milesNum, cumulativeForSelectedVehicle)
      : null;

  const rateBandText = useMemo(() => {
    if (!selectedVehicle) return null;
    if (selectedVehicle.vehicle_type !== "car" && selectedVehicle.vehicle_type !== "van") {
      const flatRate = getFlatRate(selectedVehicle.vehicle_type);
      return flatRate !== null ? `Flat rate: ${(flatRate * 100).toFixed(0)}p/mile` : null;
    }
    if (cumulativeForSelectedVehicle >= 10000) {
      return `You've claimed ${cumulativeForSelectedVehicle.toLocaleString("en-GB")} miles this tax year (25p/mile rate).`;
    }
    const remaining = 10000 - cumulativeForSelectedVehicle;
    return `You've claimed ${cumulativeForSelectedVehicle.toLocaleString("en-GB")} miles this tax year. Next ${remaining.toLocaleString("en-GB")} miles at 45p/mile, then 25p/mile after 10,000 total.`;
  }, [selectedVehicle, cumulativeForSelectedVehicle, getFlatRate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.vehicle_id || !form.from_location || !form.to_location || milesNum <= 0) return;
    setSaving(true);
    try {
      const payload = {
        vehicle_id: form.vehicle_id,
        trip_date: form.trip_date,
        from_location: form.from_location,
        to_location: form.to_location,
        miles: milesNum,
        purpose: form.purpose || null,
        job_id: form.job_id || null,
        project_id: form.project_id || null,
      };
      if (editingTrip) {
        await updateTrip(editingTrip.id, payload);
      } else {
        await addTrip(payload);
      }
      setDialogOpen(false);
      setEditingTrip(null);
    } catch {
      // error handled in hook
    }
    setSaving(false);
  };

  const handleJobChange = (value: string) => {
    const job = jobs.find((j) => j.id === value);
    setForm((f) => ({ ...f, job_id: value, project_id: job?.project_id ?? f.project_id }));
  };

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading mileage…</div>;
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="font-heading text-2xl font-bold">Mileage</h2>
          <p className="text-sm text-muted-foreground">Tax year {currentTaxYear}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleExport}>
            <i className="ti ti-download mr-1" /> Export CSV
          </Button>
          <Button
            onClick={() => {
              setEditingTrip(null);
              setDialogOpen(true);
            }}
            disabled={vehicles.length === 0}
          >
            <i className="ti ti-plus mr-1" /> Add Trip
          </Button>
        </div>
      </div>

      {vehicles.length === 0 && (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            No vehicles yet — add a vehicle in Finance Settings before logging mileage.
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total miles this tax year</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalMilesThisTaxYear.toLocaleString("en-GB")}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total claim this tax year</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">£{totalClaimThisTaxYear.toLocaleString("en-GB", { minimumFractionDigits: 2 })}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Trips this month</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{tripsThisMonth.length}</div>
          </CardContent>
        </Card>
      </div>

      {vehicles.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {vehicles.map((v) => {
            const cumulative = cumulativeMilesByVehicle.get(v.id) ?? 0;
            const isCarVan = v.vehicle_type === "car" || v.vehicle_type === "van";
            return (
              <Card key={v.id}>
                <CardContent className="p-4 space-y-1">
                  <div className="font-medium">{v.name}</div>
                  <div className="text-xs text-muted-foreground">{VEHICLE_TYPE_LABELS[v.vehicle_type]}</div>
                  <div className="text-sm">
                    {isCarVan
                      ? cumulative >= 10000
                        ? `${cumulative.toLocaleString("en-GB")} miles — 25p rate`
                        : `${cumulative.toLocaleString("en-GB")} / 10,000 miles at 45p`
                      : `${cumulative.toLocaleString("en-GB")} miles logged`}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Trip log</CardTitle>
          <CardDescription>All logged trips, newest first</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <Select value={vehicleFilter} onValueChange={setVehicleFilter}>
              <SelectTrigger className="w-[200px]"><SelectValue placeholder="All vehicles" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All vehicles</SelectItem>
                {vehicles.map((v) => (
                  <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-[160px]" placeholder="From" />
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-[160px]" placeholder="To" />
          </div>

          {filteredTrips.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No trips logged yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead className="text-right">Miles</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Purpose</TableHead>
                  <TableHead>Job</TableHead>
                  <TableHead className="text-right">Claim (£)</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTrips.map((trip) => (
                  <TableRow key={trip.id}>
                    <TableCell className="whitespace-nowrap">{format(new Date(trip.trip_date), "dd MMM yyyy")}</TableCell>
                    <TableCell>{trip.from_location}</TableCell>
                    <TableCell>{trip.to_location}</TableCell>
                    <TableCell className="text-right">{Number(trip.miles).toLocaleString("en-GB")}</TableCell>
                    <TableCell><Badge variant="outline">{vehicleName(trip.vehicle_id)}</Badge></TableCell>
                    <TableCell className="text-muted-foreground">{trip.purpose || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{jobTitle(trip.job_id)}</TableCell>
                    <TableCell className="text-right font-medium">£{Number(trip.claim_amount).toFixed(2)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingTrip(trip);
                            setDialogOpen(true);
                          }}
                        >
                          <i className="ti ti-edit" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(trip)}>
                          <i className="ti ti-trash text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditingTrip(null); }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTrip ? "Edit Trip" : "Add Trip"}</DialogTitle>
          </DialogHeader>

          {vehicles.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Add a vehicle in Finance Settings first.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Vehicle *</Label>
                <Select value={form.vehicle_id} onValueChange={(v) => setForm((f) => ({ ...f, vehicle_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select a vehicle" /></SelectTrigger>
                  <SelectContent>
                    {vehicles.map((v) => (
                      <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {rateBandText && <p className="text-xs text-muted-foreground">{rateBandText}</p>}
              </div>

              <div className="space-y-2">
                <Label>Trip date *</Label>
                <Input
                  type="date"
                  value={form.trip_date}
                  onChange={(e) => setForm((f) => ({ ...f, trip_date: e.target.value }))}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>From *</Label>
                  <Input value={form.from_location} onChange={(e) => setForm((f) => ({ ...f, from_location: e.target.value }))} required />
                </div>
                <div className="space-y-2">
                  <Label>To *</Label>
                  <Input value={form.to_location} onChange={(e) => setForm((f) => ({ ...f, to_location: e.target.value }))} required />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Miles *</Label>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  value={form.miles}
                  onChange={(e) => setForm((f) => ({ ...f, miles: e.target.value }))}
                  required
                />
                {livePreview && (
                  <p className="text-xs text-muted-foreground">
                    Claim: £{livePreview.amount.toFixed(2)} ({livePreview.description})
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Purpose</Label>
                <Input
                  value={form.purpose}
                  onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))}
                  placeholder="e.g. Client site visit, Materials pickup"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Job (optional)</Label>
                  <Select value={form.job_id || "none"} onValueChange={(v) => handleJobChange(v === "none" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="No job" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No job</SelectItem>
                      {jobs.map((j) => (
                        <SelectItem key={j.id} value={j.id}>{j.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Project (optional)</Label>
                  <Select value={form.project_id || "none"} onValueChange={(v) => setForm((f) => ({ ...f, project_id: v === "none" ? "" : v }))}>
                    <SelectTrigger><SelectValue placeholder="No project" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No project</SelectItem>
                      {projects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={saving}>
                  {editingTrip ? "Update" : "Add Trip"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete trip?</AlertDialogTitle>
            <AlertDialogDescription>
              This trip and its claim of £{deleteTarget ? Number(deleteTarget.claim_amount).toFixed(2) : "0.00"} will be removed. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (deleteTarget) {
                  await deleteTrip(deleteTarget.id);
                  setDeleteTarget(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
