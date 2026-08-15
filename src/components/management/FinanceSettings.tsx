import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { UK_VAT_REGISTRATION_THRESHOLD } from "@/constants/tax";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import type { Database } from "@/integrations/supabase/types";

type FinanceSettingsRow = Database["public"]["Tables"]["finance_settings"]["Row"];
type FinanceSettingsUpdate = Database["public"]["Tables"]["finance_settings"]["Update"];
type Vehicle = Database["public"]["Tables"]["contractor_vehicles"]["Row"];
type ExpenseCategory = Database["public"]["Tables"]["expense_categories"]["Row"];

const VEHICLE_TYPES = [
  { value: "car", label: "Car" },
  { value: "van", label: "Van" },
  { value: "motorcycle", label: "Motorcycle" },
  { value: "bicycle", label: "Bicycle" },
] as const;

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function vatNumberValid(value: string): boolean {
  if (!value) return true;
  return /^(GB)?\d{9}$/i.test(value.replace(/\s/g, ""));
}

export function FinanceSettings() {
  const [contractorId, setContractorId] = useState<string | null>(null);
  const [settings, setSettings] = useState<FinanceSettingsRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [vatNumberDraft, setVatNumberDraft] = useState("");
  const [flatRateDraft, setFlatRateDraft] = useState("");
  const [paymentTermsDraft, setPaymentTermsDraft] = useState("30");

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleDialogOpen, setVehicleDialogOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Vehicle | null>(null);

  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());
  const [newSubcategoryParent, setNewSubcategoryParent] = useState<string | null>(null);
  const [newSubcategoryName, setNewSubcategoryName] = useState("");
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");

  const loadAll = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profileRow } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!profileRow) {
      setLoading(false);
      return;
    }
    setContractorId(profileRow.id);

    let { data: settingsRow } = await supabase
      .from("finance_settings")
      .select("*")
      .eq("contractor_id", profileRow.id)
      .maybeSingle();

    if (!settingsRow) {
      const { data: created, error } = await supabase
        .from("finance_settings")
        .insert({ contractor_id: profileRow.id })
        .select("*")
        .single();
      if (error) {
        toast.error("Failed to initialise finance settings");
      } else {
        settingsRow = created;
      }
    }

    if (settingsRow) {
      setSettings(settingsRow);
      setVatNumberDraft(settingsRow.vat_number ?? "");
      setFlatRateDraft(settingsRow.flat_rate_percentage?.toString() ?? "");
      setPaymentTermsDraft(settingsRow.default_payment_terms_days?.toString() ?? "30");
    }

    const [{ data: vehicleRows }, { data: categoryRows }] = await Promise.all([
      supabase
        .from("contractor_vehicles")
        .select("*")
        .eq("contractor_id", profileRow.id)
        .order("created_at", { ascending: true }),
      supabase
        .from("expense_categories")
        .select("*")
        .or(`owner_contractor_id.is.null,owner_contractor_id.eq.${profileRow.id}`)
        .order("sort_order", { ascending: true }),
    ]);

    setVehicles(vehicleRows ?? []);
    setCategories(categoryRows ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const updateSettings = async (patch: FinanceSettingsUpdate, successMessage: string) => {
    if (!settings) return;
    const { data, error } = await supabase
      .from("finance_settings")
      .update(patch)
      .eq("id", settings.id)
      .select("*")
      .single();

    if (error) {
      toast.error("Failed to save — please try again");
      return;
    }
    setSettings(data);
    toast.success(successMessage);
  };

  const parentCategories = useMemo(
    () => categories.filter((c) => c.parent_id === null && c.owner_contractor_id === null),
    [categories],
  );
  const childrenByParent = useMemo(() => {
    const map = new Map<string, ExpenseCategory[]>();
    for (const c of categories) {
      if (c.parent_id) {
        const list = map.get(c.parent_id) ?? [];
        list.push(c);
        map.set(c.parent_id, list);
      }
    }
    return map;
  }, [categories]);

  const toggleParent = (id: string) => {
    setExpandedParents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const addSubcategory = async (parentId: string) => {
    if (!contractorId || !newSubcategoryName.trim()) return;
    const { data, error } = await supabase
      .from("expense_categories")
      .insert({
        owner_contractor_id: contractorId,
        parent_id: parentId,
        name: newSubcategoryName.trim(),
      })
      .select("*")
      .single();

    if (error) {
      toast.error("Failed to add subcategory");
      return;
    }
    setCategories((prev) => [...prev, data]);
    setNewSubcategoryName("");
    setNewSubcategoryParent(null);
    toast.success("Subcategory added");
  };

  const renameSubcategory = async (id: string) => {
    if (!editingCategoryName.trim()) return;
    const { data, error } = await supabase
      .from("expense_categories")
      .update({ name: editingCategoryName.trim() })
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      toast.error("Failed to rename subcategory");
      return;
    }
    setCategories((prev) => prev.map((c) => (c.id === id ? data : c)));
    setEditingCategoryId(null);
    setEditingCategoryName("");
    toast.success("Subcategory renamed");
  };

  const archiveSubcategory = async (id: string) => {
    const { data, error } = await supabase
      .from("expense_categories")
      .update({ is_active: false })
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      toast.error("Failed to archive subcategory");
      return;
    }
    setCategories((prev) => prev.map((c) => (c.id === id ? data : c)));
    toast.success("Subcategory archived");
  };

  const saveVehicle = async (vehicle: {
    id?: string;
    name: string;
    registration: string;
    vehicle_type: string;
    mileage_method: string;
    business_use_percentage: number;
  }) => {
    if (!contractorId) return;

    if (vehicle.id) {
      const { data, error } = await supabase
        .from("contractor_vehicles")
        .update({
          name: vehicle.name,
          registration: vehicle.registration || null,
          vehicle_type: vehicle.vehicle_type,
          mileage_method: vehicle.mileage_method,
          business_use_percentage: vehicle.business_use_percentage,
        })
        .eq("id", vehicle.id)
        .select("*")
        .single();

      if (error) {
        toast.error("Failed to update vehicle");
        return;
      }
      setVehicles((prev) => prev.map((v) => (v.id === vehicle.id ? data : v)));
      toast.success("Vehicle updated");
    } else {
      const { data, error } = await supabase
        .from("contractor_vehicles")
        .insert({
          contractor_id: contractorId,
          name: vehicle.name,
          registration: vehicle.registration || null,
          vehicle_type: vehicle.vehicle_type,
          mileage_method: vehicle.mileage_method,
          business_use_percentage: vehicle.business_use_percentage,
        })
        .select("*")
        .single();

      if (error) {
        toast.error("Failed to add vehicle");
        return;
      }
      setVehicles((prev) => [...prev, data]);
      toast.success("Vehicle added");
    }
    setVehicleDialogOpen(false);
    setEditingVehicle(null);
  };

  const archiveVehicle = async (vehicle: Vehicle) => {
    const { data, error } = await supabase
      .from("contractor_vehicles")
      .update({ is_active: false })
      .eq("id", vehicle.id)
      .select("*")
      .single();

    if (error) {
      toast.error("Failed to archive vehicle");
      return;
    }
    setVehicles((prev) => prev.map((v) => (v.id === vehicle.id ? data : v)));
    setArchiveTarget(null);
    toast.success("Vehicle archived");
  };

  if (loading || !settings) {
    return (
      <div className="p-6 text-sm text-muted-foreground">Loading finance settings…</div>
    );
  }

  const activeVehicles = vehicles.filter((v) => v.is_active);

  return (
    <div className="space-y-6 p-6 max-w-3xl">
      {/* Section 1: Business Type */}
      <Card>
        <CardHeader>
          <CardTitle>Business Type</CardTitle>
          <CardDescription>This affects your reporting period and tax terminology.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <RadioGroup
            value={settings.business_type}
            onValueChange={(value) => updateSettings({ business_type: value }, "Business type updated")}
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="sole_trader" id="business-sole-trader" />
              <Label htmlFor="business-sole-trader">Sole Trader</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="limited_company" id="business-limited-company" />
              <Label htmlFor="business-limited-company">Limited Company</Label>
            </div>
          </RadioGroup>

          {settings.business_type === "limited_company" && (
            <div className="grid grid-cols-2 gap-4 pt-2">
              <div className="space-y-1.5">
                <Label>Financial year end — month</Label>
                <Select
                  value={settings.financial_year_end_month?.toString() ?? ""}
                  onValueChange={(value) =>
                    updateSettings({ financial_year_end_month: Number(value) }, "Financial year end updated")
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select month" />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m, i) => (
                      <SelectItem key={m} value={(i + 1).toString()}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Financial year end — day</Label>
                <Input
                  type="number"
                  min={1}
                  max={31}
                  defaultValue={settings.financial_year_end_day ?? undefined}
                  onBlur={(e) => {
                    const day = Number(e.target.value);
                    if (day >= 1 && day <= 31) {
                      updateSettings({ financial_year_end_day: day }, "Financial year end updated");
                    }
                  }}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 2: VAT Status */}
      <Card>
        <CardHeader>
          <CardTitle>VAT Status</CardTitle>
          <CardDescription>Determines how VAT is handled on your quotes and invoices.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <RadioGroup
            value={settings.vat_status}
            onValueChange={(value) => updateSettings({ vat_status: value }, "VAT status updated")}
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="not_registered" id="vat-not-registered" />
              <Label htmlFor="vat-not-registered">Not VAT Registered</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="standard" id="vat-standard" />
              <Label htmlFor="vat-standard">Standard VAT Scheme</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="flat_rate" id="vat-flat-rate" />
              <Label htmlFor="vat-flat-rate">Flat Rate Scheme</Label>
            </div>
          </RadioGroup>

          {settings.vat_status === "not_registered" && (
            <p className="text-sm text-muted-foreground bg-muted rounded-md p-3">
              You must register for VAT once your taxable turnover exceeds £{UK_VAT_REGISTRATION_THRESHOLD.toLocaleString("en-GB")} in any
              rolling 12-month period. TradeStone tracks your position automatically as you
              invoice.
            </p>
          )}

          {(settings.vat_status === "standard" || settings.vat_status === "flat_rate") && (
            <div className="space-y-1.5">
              <Label>VAT number</Label>
              <Input
                placeholder="GB123456789"
                value={vatNumberDraft}
                onChange={(e) => setVatNumberDraft(e.target.value)}
                onBlur={() => {
                  if (!vatNumberValid(vatNumberDraft)) {
                    toast.error("VAT number must be GB followed by 9 digits, or just 9 digits");
                    return;
                  }
                  updateSettings({ vat_number: vatNumberDraft || null }, "VAT number updated");
                }}
              />
            </div>
          )}

          {settings.vat_status === "flat_rate" && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Flat rate percentage</Label>
                <Input
                  type="number"
                  step="0.1"
                  placeholder="9.5"
                  value={flatRateDraft}
                  onChange={(e) => setFlatRateDraft(e.target.value)}
                  onBlur={() => {
                    const pct = Number(flatRateDraft);
                    if (!flatRateDraft || Number.isNaN(pct)) return;
                    updateSettings({ flat_rate_percentage: pct }, "Flat rate updated");
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Common trade rates: General building 9.5%, Electrical 14.5%, Plumbing 9.5%
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Flat rate start date</Label>
                <Input
                  type="date"
                  defaultValue={settings.flat_rate_start_date ?? ""}
                  onBlur={(e) =>
                    updateSettings({ flat_rate_start_date: e.target.value || null }, "Start date updated")
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Used to apply the 1% first-year discount automatically.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 3: Vehicles */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Vehicles</CardTitle>
            <CardDescription>Register vehicles to track mileage.</CardDescription>
          </div>
          <Button
            size="sm"
            onClick={() => {
              setEditingVehicle(null);
              setVehicleDialogOpen(true);
            }}
          >
            <i className="ti ti-plus mr-1" /> Add Vehicle
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {activeVehicles.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No vehicles added yet — add a vehicle to start tracking mileage.
            </p>
          )}
          {activeVehicles.map((vehicle) => (
            <div
              key={vehicle.id}
              className="flex items-center justify-between rounded-md border p-3"
            >
              <div>
                <div className="font-medium">{vehicle.name}</div>
                <div className="text-sm text-muted-foreground">
                  {vehicle.registration ? `${vehicle.registration} · ` : ""}
                  {VEHICLE_TYPES.find((t) => t.value === vehicle.vehicle_type)?.label} ·{" "}
                  {vehicle.mileage_method === "simplified" ? "Simplified mileage allowance" : "Actual costs"}
                  {vehicle.mileage_method === "actual_costs" &&
                    ` · ${vehicle.business_use_percentage}% business use`}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setEditingVehicle(vehicle);
                    setVehicleDialogOpen(true);
                  }}
                >
                  <i className="ti ti-edit" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => setArchiveTarget(vehicle)}>
                  <i className="ti ti-archive" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Section 4: Expense Categories */}
      <Card>
        <CardHeader>
          <CardTitle>Expense Categories</CardTitle>
          <CardDescription>
            Add your own subcategories under HMRC's fixed parent categories.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {parentCategories.map((parent) => {
            const children = (childrenByParent.get(parent.id) ?? []).filter((c) => c.is_active);
            const isOpen = expandedParents.has(parent.id);
            return (
              <Collapsible key={parent.id} open={isOpen} onOpenChange={() => toggleParent(parent.id)}>
                <CollapsibleTrigger asChild>
                  <button className="flex w-full items-center justify-between rounded-md border p-3 text-left hover:bg-muted/50">
                    <span className="flex items-center gap-2 font-medium">
                      <i className="ti ti-lock text-muted-foreground" />
                      {parent.name}
                      {children.length > 0 && (
                        <Badge variant="secondary">{children.length}</Badge>
                      )}
                    </span>
                    <i className={`ti ti-chevron-${isOpen ? "up" : "down"} text-muted-foreground`} />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-2 pl-6 pt-2">
                  {children.map((child) =>
                    editingCategoryId === child.id ? (
                      <div key={child.id} className="flex items-center gap-2">
                        <Input
                          value={editingCategoryName}
                          onChange={(e) => setEditingCategoryName(e.target.value)}
                          className="h-8"
                        />
                        <Button size="sm" onClick={() => renameSubcategory(child.id)}>Save</Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingCategoryId(null)}>
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <div key={child.id} className="flex items-center justify-between text-sm">
                        <span>{child.name}</span>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => {
                              setEditingCategoryId(child.id);
                              setEditingCategoryName(child.name);
                            }}
                          >
                            <i className="ti ti-edit text-xs" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => archiveSubcategory(child.id)}
                          >
                            <i className="ti ti-archive text-xs" />
                          </Button>
                        </div>
                      </div>
                    ),
                  )}

                  {newSubcategoryParent === parent.id ? (
                    <div className="flex items-center gap-2">
                      <Input
                        placeholder="Subcategory name"
                        value={newSubcategoryName}
                        onChange={(e) => setNewSubcategoryName(e.target.value)}
                        className="h-8"
                        autoFocus
                      />
                      <Button size="sm" onClick={() => addSubcategory(parent.id)}>Add</Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setNewSubcategoryParent(null);
                          setNewSubcategoryName("");
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setNewSubcategoryParent(parent.id)}
                    >
                      <i className="ti ti-plus mr-1" /> Add Subcategory
                    </Button>
                  )}
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </CardContent>
      </Card>

      {/* Section 5: Default Payment Terms */}
      <Card>
        <CardHeader>
          <CardTitle>Default Payment Terms</CardTitle>
          <CardDescription>Applied as the default when raising invoices — overridable per invoice.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-1.5 max-w-xs">
            <Label>Payment terms (days)</Label>
            <Input
              type="number"
              min={0}
              value={paymentTermsDraft}
              onChange={(e) => setPaymentTermsDraft(e.target.value)}
              onBlur={() => {
                const days = Number(paymentTermsDraft);
                if (Number.isNaN(days) || days < 0) return;
                updateSettings({ default_payment_terms_days: days }, "Payment terms updated");
              }}
            />
          </div>
        </CardContent>
      </Card>

      <VehicleDialog
        open={vehicleDialogOpen}
        vehicle={editingVehicle}
        onOpenChange={setVehicleDialogOpen}
        onSave={saveVehicle}
      />

      <AlertDialog open={!!archiveTarget} onOpenChange={(open) => !open && setArchiveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive vehicle?</AlertDialogTitle>
            <AlertDialogDescription>
              {archiveTarget?.name} will be hidden from mileage tracking. This can't be undone from here.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => archiveTarget && archiveVehicle(archiveTarget)}>
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function VehicleDialog({
  open,
  vehicle,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  vehicle: Vehicle | null;
  onOpenChange: (open: boolean) => void;
  onSave: (vehicle: {
    id?: string;
    name: string;
    registration: string;
    vehicle_type: string;
    mileage_method: string;
    business_use_percentage: number;
  }) => void;
}) {
  const [name, setName] = useState("");
  const [registration, setRegistration] = useState("");
  const [vehicleType, setVehicleType] = useState("car");
  const [mileageMethod, setMileageMethod] = useState("simplified");
  const [businessUsePct, setBusinessUsePct] = useState(100);

  useEffect(() => {
    if (open) {
      setName(vehicle?.name ?? "");
      setRegistration(vehicle?.registration ?? "");
      setVehicleType(vehicle?.vehicle_type ?? "car");
      setMileageMethod(vehicle?.mileage_method ?? "simplified");
      setBusinessUsePct(vehicle?.business_use_percentage ?? 100);
    }
  }, [open, vehicle]);

  const methodLocked = !!vehicle?.method_locked_tax_year;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{vehicle ? "Edit Vehicle" : "Add Vehicle"}</DialogTitle>
          <DialogDescription>
            Vehicles are used to track mileage claims against jobs and general business travel.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input
              placeholder="e.g. Work Van"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Registration</Label>
            <Input
              placeholder="Optional"
              value={registration}
              onChange={(e) => setRegistration(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Vehicle type</Label>
            <Select value={vehicleType} onValueChange={setVehicleType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VEHICLE_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Mileage method</Label>
            <RadioGroup value={mileageMethod} onValueChange={setMileageMethod} className={methodLocked ? "opacity-50 pointer-events-none" : ""}>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="simplified" id="method-simplified" />
                <Label htmlFor="method-simplified">Simplified mileage allowance</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="actual_costs" id="method-actual" />
                <Label htmlFor="method-actual">Actual costs</Label>
              </div>
            </RadioGroup>
            <p className="text-xs text-muted-foreground">
              You cannot switch method for a vehicle during a tax year. Once you log your first
              mileage claim, the method is locked until the next tax year.
              {methodLocked && ` Locked for ${vehicle?.method_locked_tax_year}.`}
            </p>
          </div>

          {mileageMethod === "actual_costs" && (
            <div className="space-y-1.5">
              <Label>Business use percentage — {businessUsePct}%</Label>
              <Slider
                value={[businessUsePct]}
                onValueChange={([v]) => setBusinessUsePct(v)}
                min={0}
                max={100}
                step={5}
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!name.trim()}
            onClick={() =>
              onSave({
                id: vehicle?.id,
                name: name.trim(),
                registration: registration.trim(),
                vehicle_type: vehicleType,
                mileage_method: mileageMethod,
                business_use_percentage: businessUsePct,
              })
            }
          >
            {vehicle ? "Save" : "Add Vehicle"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
