import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Database } from "@/integrations/supabase/types";

type Tool = Database["public"]["Tables"]["contractor_tools"]["Row"];
type Material = Database["public"]["Tables"]["contractor_materials"]["Row"];

interface ActiveAssignment {
  id: string;
  tool: Tool;
}

interface UsageRow {
  id: string;
  quantity_used: number;
  unit_cost_at_use: number | null;
  used_at: string;
  material: Material;
}

interface Props {
  jobId: string;
  contractorId: string;
}

function formatGBP(value: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(value);
}

export function JobEquipmentMaterials({ jobId, contractorId }: Props) {
  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState<ActiveAssignment[]>([]);
  const [usage, setUsage] = useState<UsageRow[]>([]);
  const [availableTools, setAvailableTools] = useState<Tool[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [assignOpen, setAssignOpen] = useState(false);
  const [usageOpen, setUsageOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [assignedRes, usageRes] = await Promise.all([
        supabase
          .from("job_tool_assignments")
          .select("id, tool:contractor_tools(*)")
          .eq("job_id", jobId)
          .is("returned_at", null),
        supabase
          .from("job_material_usage")
          .select("id, quantity_used, unit_cost_at_use, used_at, material:contractor_materials(*)")
          .eq("job_id", jobId)
          .order("used_at", { ascending: false }),
      ]);
      if (assignedRes.error) throw assignedRes.error;
      if (usageRes.error) throw usageRes.error;

      setAssignments((assignedRes.data ?? []) as unknown as ActiveAssignment[]);
      setUsage((usageRes.data ?? []) as unknown as UsageRow[]);

      const [toolsRes, materialsRes, activeElsewhereRes] = await Promise.all([
        supabase.from("contractor_tools").select("*").eq("contractor_id", contractorId).order("name"),
        supabase.from("contractor_materials").select("*").eq("contractor_id", contractorId).order("name"),
        supabase.from("job_tool_assignments").select("tool_id").is("returned_at", null),
      ]);
      if (toolsRes.error) throw toolsRes.error;
      if (materialsRes.error) throw materialsRes.error;
      if (activeElsewhereRes.error) throw activeElsewhereRes.error;

      // A tool can only have one active (unreturned) assignment at a time — exclude
      // anything currently out on any job, not just this one.
      const onSiteToolIds = new Set((activeElsewhereRes.data ?? []).map((r) => r.tool_id));
      setAvailableTools((toolsRes.data ?? []).filter((t) => !onSiteToolIds.has(t.id)));
      setMaterials(materialsRes.data ?? []);
    } catch (error) {
      console.error("Error loading job equipment/materials:", error);
      toast.error("Failed to load tools and materials");
    } finally {
      setLoading(false);
    }
  }, [jobId, contractorId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleReturn = async (assignmentId: string) => {
    try {
      const { error } = await supabase
        .from("job_tool_assignments")
        .update({ returned_at: new Date().toISOString() })
        .eq("id", assignmentId);
      if (error) throw error;
      toast.success("Tool returned");
      load();
    } catch (error) {
      console.error("Error returning tool:", error);
      toast.error("Failed to return tool");
    }
  };

  const runningTotal = usage.reduce((sum, row) => sum + row.quantity_used * (row.unit_cost_at_use ?? 0), 0);

  if (loading) {
    return <p className="text-sm text-muted-foreground py-4">Loading…</p>;
  }

  return (
    <div className="space-y-5">
      {/* Assigned tools */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Tools on site</p>
          <Button variant="outline" size="sm" onClick={() => setAssignOpen(true)}>
            <i className="ti ti-plus mr-1" /> Assign tool
          </Button>
        </div>
        {assignments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tools assigned to this job.</p>
        ) : (
          <div className="space-y-1.5">
            {assignments.map((a) => (
              <div key={a.id} className="flex items-center justify-between rounded-md border p-2.5 text-sm">
                <div>
                  <p className="font-medium">{a.tool.name}</p>
                  <p className="text-xs text-muted-foreground">{a.tool.category}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => handleReturn(a.id)}>
                  Return
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Material usage */}
      <div className="space-y-2 border-t pt-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Materials used</p>
          <Button variant="outline" size="sm" onClick={() => setUsageOpen(true)}>
            <i className="ti ti-plus mr-1" /> Log usage
          </Button>
        </div>
        {usage.length === 0 ? (
          <p className="text-sm text-muted-foreground">No materials logged against this job.</p>
        ) : (
          <>
            <div className="space-y-1.5">
              {usage.map((row) => (
                <div key={row.id} className="flex items-center justify-between text-sm">
                  <span>{row.material.name}</span>
                  <span className="text-muted-foreground">
                    {row.quantity_used} {row.material.unit}
                    {row.unit_cost_at_use != null && ` · ${formatGBP(row.quantity_used * row.unit_cost_at_use)}`}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between border-t pt-2 text-sm font-medium">
              <span>Total material cost</span>
              <span className="font-mono">{formatGBP(runningTotal)}</span>
            </div>
          </>
        )}
      </div>

      {assignOpen && (
        <AssignToolDialog
          jobId={jobId}
          availableTools={availableTools}
          onClose={() => setAssignOpen(false)}
          onAssigned={load}
        />
      )}

      {usageOpen && (
        <LogUsageDialog
          jobId={jobId}
          materials={materials}
          onClose={() => setUsageOpen(false)}
          onLogged={load}
        />
      )}
    </div>
  );
}

function AssignToolDialog({
  jobId,
  availableTools,
  onClose,
  onAssigned,
}: {
  jobId: string;
  availableTools: Tool[];
  onClose: () => void;
  onAssigned: () => void;
}) {
  const [toolId, setToolId] = useState("");
  const [saving, setSaving] = useState(false);

  const handleAssign = async () => {
    if (!toolId) {
      toast.error("Select a tool");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("job_tool_assignments").insert({ job_id: jobId, tool_id: toolId });
      if (error) throw error;
      toast.success("Tool assigned");
      onAssigned();
      onClose();
    } catch (error) {
      console.error("Error assigning tool:", error);
      toast.error(error instanceof Error ? error.message : "Failed to assign tool");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign tool</DialogTitle>
          <DialogDescription>Mark a tool as taken to this job</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="assign_tool">Tool</Label>
            <Select value={toolId} onValueChange={setToolId}>
              <SelectTrigger id="assign_tool"><SelectValue placeholder="Select a tool" /></SelectTrigger>
              <SelectContent>
                {availableTools.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {availableTools.length === 0 && (
              <p className="text-xs text-muted-foreground">No tools available — everything is already on site elsewhere.</p>
            )}
          </div>
          <Button onClick={handleAssign} disabled={saving} className="w-full">
            {saving ? "Assigning…" : "Assign tool"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LogUsageDialog({
  jobId,
  materials,
  onClose,
  onLogged,
}: {
  jobId: string;
  materials: Material[];
  onClose: () => void;
  onLogged: () => void;
}) {
  const [materialId, setMaterialId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [saving, setSaving] = useState(false);

  const selected = materials.find((m) => m.id === materialId) ?? null;

  const handleLog = async () => {
    if (!materialId) {
      toast.error("Select a material");
      return;
    }
    const qty = parseFloat(quantity);
    if (!qty || qty <= 0) {
      toast.error("Enter a valid quantity");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.rpc("log_material_usage", {
        p_material_id: materialId,
        p_job_id: jobId,
        p_quantity: qty,
      });
      if (error) throw error;
      toast.success("Usage logged");
      onLogged();
      onClose();
    } catch (error) {
      console.error("Error logging material usage:", error);
      toast.error(error instanceof Error ? error.message : "Failed to log usage");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log material usage</DialogTitle>
          <DialogDescription>Records usage and deducts stock automatically</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="usage_material">Material</Label>
            <Select value={materialId} onValueChange={setMaterialId}>
              <SelectTrigger id="usage_material"><SelectValue placeholder="Select a material" /></SelectTrigger>
              <SelectContent>
                {materials.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.name} ({m.quantity_on_hand} {m.unit} in stock)</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="usage_qty">Quantity used{selected ? ` (${selected.unit})` : ""}</Label>
            <Input id="usage_qty" type="number" step="0.01" min="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
          <Button onClick={handleLog} disabled={saving} className="w-full">
            {saving ? "Logging…" : "Log usage"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
