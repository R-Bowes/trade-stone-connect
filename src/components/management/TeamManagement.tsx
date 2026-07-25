import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";

type TeamMember = Database["public"]["Tables"]["team_members"]["Row"];
type Certification = Database["public"]["Tables"]["team_member_certifications"]["Row"];
type Absence = Database["public"]["Tables"]["team_member_absences"]["Row"];

type StatusFilter = "all" | "active" | "inactive" | "suspended";
type CertSummary = "valid" | "expiring_soon" | "expired" | "none";

const ROLES = ["Tradesperson", "Apprentice", "Supervisor", "Labourer", "Site Manager", "Foreman", "Admin"] as const;

const ROLE_BADGE_CLASS: Record<string, string> = {
  Tradesperson: "bg-blue-100 text-blue-800 hover:bg-blue-100",
  Apprentice: "bg-amber-100 text-amber-800 hover:bg-amber-100",
  Supervisor: "bg-purple-100 text-purple-800 hover:bg-purple-100",
  Labourer: "bg-gray-100 text-gray-800 hover:bg-gray-100",
  "Site Manager": "bg-teal-100 text-teal-800 hover:bg-teal-100",
  Foreman: "bg-orange-100 text-orange-800 hover:bg-orange-100",
  Admin: "bg-red-100 text-red-800 hover:bg-red-100",
};

const EMPLOYMENT_TYPES = [
  { value: "employee", label: "Employee" },
  { value: "subcontractor", label: "Subcontractor" },
  { value: "cis_subcontractor", label: "CIS Subcontractor" },
  { value: "agency", label: "Agency" },
];

const CERT_TYPES = [
  { value: "cscs", label: "CSCS" },
  { value: "gas_safe", label: "Gas Safe" },
  { value: "niceic", label: "NICEIC" },
  { value: "napit", label: "NAPIT" },
  { value: "first_aid", label: "First Aid" },
  { value: "asbestos_awareness", label: "Asbestos Awareness" },
  { value: "ipaf", label: "IPAF" },
  { value: "pasma", label: "PASMA" },
  { value: "smsts", label: "SMSTS" },
  { value: "sssts", label: "SSSTS" },
  { value: "ecs", label: "ECS" },
  { value: "oftec", label: "OFTEC" },
  { value: "other", label: "Other" },
];

const ABSENCE_TYPES = [
  { value: "holiday", label: "Holiday" },
  { value: "sickness", label: "Sickness" },
  { value: "training", label: "Training" },
  { value: "personal", label: "Personal" },
  { value: "other", label: "Other" },
];

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

function formatDate(value: string | null) {
  if (!value) return "—";
  return dateFmt.format(new Date(value));
}

function formatGBP(value: number | null) {
  if (value === null || value === undefined) return null;
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(value);
}

function computeCertStatus(expiryDate: string | null): Certification["status"] {
  if (!expiryDate) return "not_verified";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDate);
  if (expiry < today) return "expired";
  const soon = new Date(today);
  soon.setDate(soon.getDate() + 30);
  if (expiry < soon) return "expiring_soon";
  return "valid";
}

interface EmptyFormState {
  full_name: string;
  role: string;
  trade: string;
  employment_type: string;
  email: string;
  phone: string;
  start_date: string;
  notes: string;
  hourly_rate: string;
  day_rate: string;
  overtime_rate: string;
  utr_number: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  next_of_kin: string;
}

const emptyForm: EmptyFormState = {
  full_name: "",
  role: "",
  trade: "",
  employment_type: "subcontractor",
  email: "",
  phone: "",
  start_date: "",
  notes: "",
  hourly_rate: "",
  day_rate: "",
  overtime_rate: "",
  utr_number: "",
  emergency_contact_name: "",
  emergency_contact_phone: "",
  next_of_kin: "",
};

export function TeamManagement() {
  const [contractorId, setContractorId] = useState<string | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [activeJobCounts, setActiveJobCounts] = useState<Record<string, number>>({});
  const [certSummaries, setCertSummaries] = useState<Record<string, CertSummary>>({});
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const [formOpen, setFormOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [form, setForm] = useState<EmptyFormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  const [certMember, setCertMember] = useState<TeamMember | null>(null);
  const [absenceMember, setAbsenceMember] = useState<TeamMember | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<TeamMember | null>(null);

  const getContractorId = useCallback(async (): Promise<string | null> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    return data?.id ?? null;
  }, []);

  const loadTeam = useCallback(async () => {
    setLoading(true);
    try {
      const cId = contractorId ?? (await getContractorId());
      if (!cId) {
        setLoading(false);
        return;
      }
      if (!contractorId) setContractorId(cId);

      const { data: memberRows, error: membersError } = await supabase
        .from("team_members")
        .select("*")
        .eq("contractor_id", cId)
        .order("full_name", { ascending: true });

      if (membersError) throw membersError;
      const list = memberRows ?? [];
      setMembers(list);

      const memberIds = list.map((m) => m.id);
      if (memberIds.length === 0) {
        setActiveJobCounts({});
        setCertSummaries({});
        setLoading(false);
        return;
      }

      const [assignmentsRes, certsRes] = await Promise.all([
        supabase
          .from("job_assignments")
          .select("team_member_id, job:jobs(status)")
          .in("team_member_id", memberIds),
        supabase
          .from("team_member_certifications")
          .select("team_member_id, status")
          .in("team_member_id", memberIds),
      ]);

      if (assignmentsRes.error) throw assignmentsRes.error;
      if (certsRes.error) throw certsRes.error;

      const jobCounts: Record<string, number> = {};
      for (const row of assignmentsRes.data ?? []) {
        const status = (row.job as { status: string } | null)?.status;
        if (status === "scheduled" || status === "in_progress") {
          const key = row.team_member_id as string;
          jobCounts[key] = (jobCounts[key] ?? 0) + 1;
        }
      }
      setActiveJobCounts(jobCounts);

      const byMember: Record<string, string[]> = {};
      for (const row of certsRes.data ?? []) {
        const key = row.team_member_id;
        if (!byMember[key]) byMember[key] = [];
        byMember[key].push(row.status);
      }
      const summaries: Record<string, CertSummary> = {};
      for (const id of memberIds) {
        const statuses = byMember[id];
        if (!statuses || statuses.length === 0) {
          summaries[id] = "none";
        } else if (statuses.some((s) => s === "expired")) {
          summaries[id] = "expired";
        } else if (statuses.some((s) => s === "expiring_soon")) {
          summaries[id] = "expiring_soon";
        } else {
          summaries[id] = "valid";
        }
      }
      setCertSummaries(summaries);
    } catch (error) {
      console.error("Error loading team:", error);
      toast.error("Failed to load team members");
    } finally {
      setLoading(false);
    }
  }, [contractorId, getContractorId]);

  useEffect(() => {
    loadTeam();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetForm = () => {
    setEditingMember(null);
    setForm(emptyForm);
  };

  const openAddDialog = () => {
    resetForm();
    setFormOpen(true);
  };

  const openEditDialog = (member: TeamMember) => {
    setEditingMember(member);
    setForm({
      full_name: member.full_name ?? "",
      role: member.role ?? "",
      trade: member.trade ?? "",
      employment_type: member.employment_type ?? "subcontractor",
      email: member.email ?? "",
      phone: member.phone ?? "",
      start_date: member.start_date ?? "",
      notes: member.notes ?? "",
      hourly_rate: member.hourly_rate !== null ? String(member.hourly_rate) : "",
      day_rate: member.day_rate !== null ? String(member.day_rate) : "",
      overtime_rate: member.overtime_rate !== null ? String(member.overtime_rate) : "",
      utr_number: member.utr_number ?? "",
      emergency_contact_name: member.emergency_contact_name ?? "",
      emergency_contact_phone: member.emergency_contact_phone ?? "",
      next_of_kin: member.next_of_kin ?? "",
    });
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!form.full_name.trim()) {
      toast.error("Full name is required");
      return;
    }
    if (!form.role) {
      toast.error("Role is required");
      return;
    }
    if (!contractorId) return;

    setSaving(true);
    try {
      const payload = {
        full_name: form.full_name.trim(),
        role: form.role,
        trade: form.trade.trim() || null,
        employment_type: form.employment_type || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        start_date: form.start_date || null,
        notes: form.notes.trim() || null,
        hourly_rate: form.hourly_rate ? parseFloat(form.hourly_rate) : null,
        day_rate: form.day_rate ? parseFloat(form.day_rate) : null,
        overtime_rate: form.overtime_rate ? parseFloat(form.overtime_rate) : null,
        utr_number: form.employment_type === "cis_subcontractor" ? (form.utr_number.trim() || null) : null,
        emergency_contact_name: form.emergency_contact_name.trim() || null,
        emergency_contact_phone: form.emergency_contact_phone.trim() || null,
        next_of_kin: form.next_of_kin.trim() || null,
      };

      if (editingMember) {
        const { error } = await supabase
          .from("team_members")
          .update(payload)
          .eq("id", editingMember.id);
        if (error) throw error;
        toast.success("Team member updated");
      } else {
        const { error } = await supabase
          .from("team_members")
          .insert({ ...payload, contractor_id: contractorId, status: "active" });
        if (error) throw error;
        toast.success("Team member added");
      }

      setFormOpen(false);
      resetForm();
      loadTeam();
    } catch (error) {
      console.error("Error saving team member:", error);
      toast.error("Failed to save team member");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (member: TeamMember) => {
    const nextStatus = member.status === "active" ? "inactive" : "active";
    try {
      const { error } = await supabase
        .from("team_members")
        .update({ status: nextStatus })
        .eq("id", member.id);
      if (error) throw error;
      toast.success(nextStatus === "active" ? "Team member reactivated" : "Team member deactivated");
      setDeactivateTarget(null);
      loadTeam();
    } catch (error) {
      console.error("Error updating status:", error);
      toast.error("Failed to update status");
    }
  };

  const filteredMembers = members.filter((m) => statusFilter === "all" || m.status === statusFilter);

  const stats = {
    total: members.length,
    active: members.filter((m) => m.status === "active").length,
    expiringCerts: Object.values(certSummaries).filter((s) => s === "expiring_soon").length,
  };

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <i className="ti ti-loader-2 animate-spin text-3xl text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-heading text-2xl font-bold">Team Management</h2>
          <p className="text-muted-foreground">Manage your workers, certifications and availability</p>
        </div>
        <Button onClick={openAddDialog}>
          <i className="ti ti-plus mr-2" />
          Add team member
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm text-muted-foreground">Total team members</p>
              <p className="text-2xl font-bold">{stats.total}</p>
            </div>
            <i className="ti ti-users text-2xl text-muted-foreground" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm text-muted-foreground">Active</p>
              <p className="text-2xl font-bold text-green-600">{stats.active}</p>
            </div>
            <i className="ti ti-user-check text-2xl text-muted-foreground" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm text-muted-foreground">Certs expiring soon</p>
              <p className="text-2xl font-bold text-amber-600">{stats.expiringCerts}</p>
            </div>
            <i className="ti ti-certificate text-2xl text-muted-foreground" />
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-2">
        {(["all", "active", "inactive", "suspended"] as StatusFilter[]).map((status) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={cn(
              "rounded-full px-3 py-1 text-sm font-medium capitalize transition-colors",
              statusFilter === status
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80",
            )}
          >
            {status}
          </button>
        ))}
      </div>

      {filteredMembers.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            {members.length === 0
              ? "No team members yet. Add your first team member to start assigning them to jobs."
              : "No team members match this filter."}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredMembers.map((member) => (
            <MemberCard
              key={member.id}
              member={member}
              activeJobs={activeJobCounts[member.id] ?? 0}
              certSummary={certSummaries[member.id] ?? "none"}
              onEdit={() => openEditDialog(member)}
              onViewCerts={() => setCertMember(member)}
              onLogAbsence={() => setAbsenceMember(member)}
              onToggleStatus={() => setDeactivateTarget(member)}
            />
          ))}
        </div>
      )}

      <MemberFormDialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) resetForm();
        }}
        editing={!!editingMember}
        form={form}
        setForm={setForm}
        onSave={handleSave}
        saving={saving}
      />

      {certMember && (
        <CertificationsDialog
          member={certMember}
          onClose={() => setCertMember(null)}
          onChanged={loadTeam}
        />
      )}

      {absenceMember && (
        <AbsenceDialog
          member={absenceMember}
          onClose={() => setAbsenceMember(null)}
        />
      )}

      <AlertDialog open={!!deactivateTarget} onOpenChange={(open) => !open && setDeactivateTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deactivateTarget?.status === "active" ? "Deactivate team member?" : "Reactivate team member?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deactivateTarget?.status === "active"
                ? `${deactivateTarget?.full_name} will be marked inactive and won't be assignable to new jobs.`
                : `${deactivateTarget?.full_name} will be marked active again.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deactivateTarget && handleToggleStatus(deactivateTarget)}>
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CertSummaryIndicator({ summary }: { summary: CertSummary }) {
  switch (summary) {
    case "valid":
      return <i className="ti ti-circle-check text-green-600" title="All certifications valid" />;
    case "expiring_soon":
      return <i className="ti ti-alert-triangle text-amber-600" title="Certification expiring soon" />;
    case "expired":
      return <i className="ti ti-circle-x text-red-600" title="Certification expired" />;
    default:
      return <i className="ti ti-minus text-muted-foreground" title="No certifications on file" />;
  }
}

function StatusPill({ status }: { status: string | null }) {
  const map: Record<string, string> = {
    active: "bg-green-100 text-green-800 hover:bg-green-100",
    inactive: "bg-gray-100 text-gray-700 hover:bg-gray-100",
    suspended: "bg-red-100 text-red-800 hover:bg-red-100",
  };
  const value = status ?? "active";
  return <Badge className={cn("capitalize", map[value] ?? map.active)}>{value}</Badge>;
}

function MemberCard({
  member,
  activeJobs,
  certSummary,
  onEdit,
  onViewCerts,
  onLogAbsence,
  onToggleStatus,
}: {
  member: TeamMember;
  activeJobs: number;
  certSummary: CertSummary;
  onEdit: () => void;
  onViewCerts: () => void;
  onLogAbsence: () => void;
  onToggleStatus: () => void;
}) {
  const rate = member.hourly_rate !== null
    ? `${formatGBP(member.hourly_rate)}/hr`
    : member.day_rate !== null
      ? `${formatGBP(member.day_rate)}/day`
      : null;

  const employmentLabel = EMPLOYMENT_TYPES.find((e) => e.value === member.employment_type)?.label;

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold">{member.full_name}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Badge className={cn(ROLE_BADGE_CLASS[member.role] ?? "bg-gray-100 text-gray-800")}>
                {member.role}
              </Badge>
              {employmentLabel && (
                <span className="text-xs text-muted-foreground">{employmentLabel}</span>
              )}
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                <i className="ti ti-dots-vertical" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>
                <i className="ti ti-edit mr-2" /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onViewCerts}>
                <i className="ti ti-certificate mr-2" /> View certifications
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onLogAbsence}>
                <i className="ti ti-calendar-off mr-2" /> Log absence
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onToggleStatus}>
                <i className={cn("mr-2", member.status === "active" ? "ti ti-user-off" : "ti ti-user-check")} />
                {member.status === "active" ? "Deactivate" : "Reactivate"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {member.trade && <p className="text-sm text-muted-foreground">{member.trade}</p>}

        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">{rate ?? "No rate set"}</span>
          <StatusPill status={member.status} />
        </div>

        <div className="flex items-center justify-between border-t pt-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <i className="ti ti-briefcase" />
            {activeJobs} active job{activeJobs === 1 ? "" : "s"}
          </span>
          <span className="flex items-center gap-1.5">
            <CertSummaryIndicator summary={certSummary} />
            Certs
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function MemberFormDialog({
  open,
  onOpenChange,
  editing,
  form,
  setForm,
  onSave,
  saving,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: boolean;
  form: EmptyFormState;
  setForm: (updater: (prev: EmptyFormState) => EmptyFormState) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const set = <K extends keyof EmptyFormState>(key: K, value: EmptyFormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit team member" : "Add team member"}</DialogTitle>
          <DialogDescription>
            {editing ? "Update this team member's details" : "Add a new worker or subcontractor to your team"}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="details" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="rates">Rates</TabsTrigger>
            <TabsTrigger value="emergency">Emergency</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="full_name">Full name</Label>
              <Input
                id="full_name"
                value={form.full_name}
                onChange={(e) => set("full_name", e.target.value)}
                placeholder="e.g. James Carter"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <Select value={form.role} onValueChange={(v) => set("role", v)}>
                  <SelectTrigger id="role">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((role) => (
                      <SelectItem key={role} value={role}>{role}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="trade">Trade</Label>
                <Input
                  id="trade"
                  value={form.trade}
                  onChange={(e) => set("trade", e.target.value)}
                  placeholder="e.g. Electrician"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="employment_type">Employment type</Label>
              <Select value={form.employment_type} onValueChange={(v) => set("employment_type", v)}>
                <SelectTrigger id="employment_type">
                  <SelectValue placeholder="Select employment type" />
                </SelectTrigger>
                <SelectContent>
                  {EMPLOYMENT_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={form.phone}
                  onChange={(e) => set("phone", e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="start_date">Start date</Label>
              <Input
                id="start_date"
                type="date"
                value={form.start_date}
                onChange={(e) => set("start_date", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                rows={3}
              />
            </div>
          </TabsContent>

          <TabsContent value="rates" className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="hourly_rate">Hourly rate (£)</Label>
                <Input
                  id="hourly_rate"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.hourly_rate}
                  onChange={(e) => set("hourly_rate", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="day_rate">Day rate (£)</Label>
                <Input
                  id="day_rate"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.day_rate}
                  onChange={(e) => set("day_rate", e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="overtime_rate">Overtime rate (£)</Label>
              <Input
                id="overtime_rate"
                type="number"
                step="0.01"
                min="0"
                value={form.overtime_rate}
                onChange={(e) => set("overtime_rate", e.target.value)}
              />
            </div>
            {form.employment_type === "cis_subcontractor" && (
              <div className="space-y-2">
                <Label htmlFor="utr_number">UTR number</Label>
                <Input
                  id="utr_number"
                  value={form.utr_number}
                  onChange={(e) => set("utr_number", e.target.value)}
                />
              </div>
            )}
          </TabsContent>

          <TabsContent value="emergency" className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="emergency_contact_name">Emergency contact name</Label>
              <Input
                id="emergency_contact_name"
                value={form.emergency_contact_name}
                onChange={(e) => set("emergency_contact_name", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="emergency_contact_phone">Emergency contact phone</Label>
              <Input
                id="emergency_contact_phone"
                value={form.emergency_contact_phone}
                onChange={(e) => set("emergency_contact_phone", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="next_of_kin">Next of kin</Label>
              <Input
                id="next_of_kin"
                value={form.next_of_kin}
                onChange={(e) => set("next_of_kin", e.target.value)}
              />
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button onClick={onSave} disabled={saving} className="w-full">
            {saving ? "Saving…" : editing ? "Update team member" : "Add team member"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CertStatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    valid: "bg-green-100 text-green-800 hover:bg-green-100",
    expiring_soon: "bg-amber-100 text-amber-800 hover:bg-amber-100",
    expired: "bg-red-100 text-red-800 hover:bg-red-100",
    not_verified: "bg-gray-100 text-gray-700 hover:bg-gray-100",
  };
  const label: Record<string, string> = {
    valid: "Valid",
    expiring_soon: "Expiring soon",
    expired: "Expired",
    not_verified: "Not verified",
  };
  return <Badge className={map[status] ?? map.not_verified}>{label[status] ?? status}</Badge>;
}

function CertificationsDialog({
  member,
  onClose,
  onChanged,
}: {
  member: TeamMember;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [certs, setCerts] = useState<Certification[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Certification | null>(null);
  const [saving, setSaving] = useState(false);

  const [certType, setCertType] = useState("");
  const [certName, setCertName] = useState("");
  const [refNumber, setRefNumber] = useState("");
  const [issuedDate, setIssuedDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");

  const loadCerts = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("team_member_certifications")
      .select("*")
      .eq("team_member_id", member.id)
      .order("expiry_date", { ascending: true, nullsFirst: false });
    if (error) {
      console.error("Error loading certifications:", error);
      toast.error("Failed to load certifications");
    } else {
      setCerts(data ?? []);
    }
    setLoading(false);
  }, [member.id]);

  useEffect(() => {
    loadCerts();
  }, [loadCerts]);

  const resetAddForm = () => {
    setCertType("");
    setCertName("");
    setRefNumber("");
    setIssuedDate("");
    setExpiryDate("");
  };

  const handleAddCert = async () => {
    if (!certType) {
      toast.error("Certification type is required");
      return;
    }
    if (!certName.trim()) {
      toast.error("Certification name is required");
      return;
    }
    setSaving(true);
    try {
      const status = computeCertStatus(expiryDate || null);
      const { error } = await supabase.from("team_member_certifications").insert({
        team_member_id: member.id,
        cert_type: certType,
        cert_name: certName.trim(),
        reference_number: refNumber.trim() || null,
        issued_date: issuedDate || null,
        expiry_date: expiryDate || null,
        status,
      });
      if (error) throw error;
      toast.success("Certification added");
      setAddOpen(false);
      resetAddForm();
      loadCerts();
      onChanged();
    } catch (error) {
      console.error("Error adding certification:", error);
      toast.error("Failed to add certification");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCert = async () => {
    if (!deleteTarget) return;
    try {
      const { error } = await supabase
        .from("team_member_certifications")
        .delete()
        .eq("id", deleteTarget.id);
      if (error) throw error;
      toast.success("Certification removed");
      setDeleteTarget(null);
      loadCerts();
      onChanged();
    } catch (error) {
      console.error("Error deleting certification:", error);
      toast.error("Failed to remove certification");
    }
  };

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Certifications — {member.full_name}</DialogTitle>
            <DialogDescription>Track licences, tickets and compliance documents</DialogDescription>
          </DialogHeader>

          <div className="max-h-80 space-y-2 overflow-y-auto">
            {loading ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
            ) : certs.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No certifications on file yet.</p>
            ) : (
              certs.map((cert) => (
                <div key={cert.id} className="flex items-center justify-between gap-2 rounded-md border p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{cert.cert_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {cert.reference_number ? `${cert.reference_number} · ` : ""}Expires {formatDate(cert.expiry_date)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <CertStatusPill status={cert.status} />
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteTarget(cert)}>
                      <i className="ti ti-trash text-muted-foreground" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>

          <Button variant="outline" onClick={() => setAddOpen(true)}>
            <i className="ti ti-plus mr-2" /> Add certification
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={addOpen} onOpenChange={(open) => { setAddOpen(open); if (!open) resetAddForm(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add certification</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cert_type">Type</Label>
              <Select
                value={certType}
                onValueChange={(v) => {
                  setCertType(v);
                  const label = CERT_TYPES.find((c) => c.value === v)?.label;
                  if (label && !certName) setCertName(label);
                }}
              >
                <SelectTrigger id="cert_type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {CERT_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cert_name">Name</Label>
              <Input id="cert_name" value={certName} onChange={(e) => setCertName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ref_number">Reference number</Label>
              <Input id="ref_number" value={refNumber} onChange={(e) => setRefNumber(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="issued_date">Issued date</Label>
                <Input id="issued_date" type="date" value={issuedDate} onChange={(e) => setIssuedDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="expiry_date">Expiry date</Label>
                <Input id="expiry_date" type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
              </div>
            </div>
            <Button onClick={handleAddCert} disabled={saving} className="w-full">
              {saving ? "Saving…" : "Add certification"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove certification?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{deleteTarget?.cert_name}". This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteCert}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function AbsenceDialog({ member, onClose }: { member: TeamMember; onClose: () => void }) {
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [absenceType, setAbsenceType] = useState<string>("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");

  const loadAbsences = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("team_member_absences")
      .select("*")
      .eq("team_member_id", member.id)
      .order("created_at", { ascending: false })
      .limit(5);
    if (error) {
      console.error("Error loading absences:", error);
      toast.error("Failed to load absence history");
    } else {
      setAbsences(data ?? []);
    }
    setLoading(false);
  }, [member.id]);

  useEffect(() => {
    loadAbsences();
  }, [loadAbsences]);

  const handleLog = async () => {
    if (!absenceType) {
      toast.error("Absence type is required");
      return;
    }
    if (!startDate || !endDate) {
      toast.error("Start and end dates are required");
      return;
    }
    if (endDate < startDate) {
      toast.error("End date must be on or after the start date");
      return;
    }
    setSaving(true);
    try {
      const status = absenceType === "sickness" ? "approved" : "requested";
      const { error } = await supabase.from("team_member_absences").insert({
        team_member_id: member.id,
        absence_type: absenceType,
        start_date: startDate,
        end_date: endDate,
        notes: notes.trim() || null,
        status,
      });
      if (error) throw error;
      toast.success("Absence logged");
      setAbsenceType("");
      setStartDate("");
      setEndDate("");
      setNotes("");
      loadAbsences();
    } catch (error) {
      console.error("Error logging absence:", error);
      toast.error("Failed to log absence");
    } finally {
      setSaving(false);
    }
  };

  const absenceStatusClass: Record<string, string> = {
    requested: "bg-amber-100 text-amber-800 hover:bg-amber-100",
    approved: "bg-green-100 text-green-800 hover:bg-green-100",
    declined: "bg-red-100 text-red-800 hover:bg-red-100",
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log absence — {member.full_name}</DialogTitle>
          <DialogDescription>Record holiday, sickness or other time off</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="absence_type">Type</Label>
            <Select value={absenceType} onValueChange={setAbsenceType}>
              <SelectTrigger id="absence_type">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {ABSENCE_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="absence_start">Start date</Label>
              <Input id="absence_start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="absence_end">End date</Label>
              <Input id="absence_end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="absence_notes">Notes</Label>
            <Textarea id="absence_notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          <Button onClick={handleLog} disabled={saving} className="w-full">
            {saving ? "Logging…" : "Log absence"}
          </Button>
        </div>

        <div className="space-y-2 border-t pt-4">
          <p className="text-sm font-medium">Recent absences</p>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : absences.length === 0 ? (
            <p className="text-sm text-muted-foreground">No absences logged yet.</p>
          ) : (
            <div className="space-y-2">
              {absences.map((absence) => (
                <div key={absence.id} className="flex items-center justify-between text-sm">
                  <span className="capitalize">
                    {absence.absence_type} · {formatDate(absence.start_date)} – {formatDate(absence.end_date)}
                  </span>
                  <Badge className={absenceStatusClass[absence.status] ?? "bg-gray-100 text-gray-700"}>
                    {absence.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
