import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { cn } from "@/lib/utils";
import { useToolDocuments } from "@/hooks/useToolDocuments";
import type { Database } from "@/integrations/supabase/types";

type Tool = Database["public"]["Tables"]["contractor_tools"]["Row"];
type Material = Database["public"]["Tables"]["contractor_materials"]["Row"];
type ToolAssignment = Database["public"]["Tables"]["job_tool_assignments"]["Row"];
type MaterialUsage = Database["public"]["Tables"]["job_material_usage"]["Row"];

const TOOL_CATEGORIES = [
  "Power Tools",
  "Hand Tools",
  "Testing & Measurement",
  "Access Equipment",
  "Safety / PPE",
  "Fixings & Fastening",
  "Specialist",
  "Other",
] as const;

const CONDITIONS = ["excellent", "good", "fair", "poor", "decommissioned"] as const;

const MATERIAL_UNITS = ["metres", "kg", "litres", "each", "box", "roll", "pack", "length"] as const;

const DOCUMENT_TYPES = ["Receipt", "PAT Certificate", "Calibration Certificate", "Warranty", "Inspection Report", "Other"] as const;

const DOCUMENT_ACCEPT = ".pdf,.jpg,.jpeg,.png";
const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024; // 10MB

const dateTimeFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

function formatDateTime(value: string) {
  return dateTimeFmt.format(new Date(value));
}

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

function formatDate(value: string | null) {
  if (!value) return "—";
  return dateFmt.format(new Date(value));
}

function formatGBP(value: number | null) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(value);
}

// Red if unset or overdue, amber if due within 30 days, green otherwise.
function ragForDate(value: string | null): "red" | "amber" | "green" {
  if (!value) return "red";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(value);
  if (target < today) return "red";
  const soon = new Date(today);
  soon.setDate(soon.getDate() + 30);
  if (target < soon) return "amber";
  return "green";
}

const RAG_CLASS: Record<"red" | "amber" | "green", string> = {
  red: "bg-red-100 text-red-800 hover:bg-red-100",
  amber: "bg-amber-100 text-amber-800 hover:bg-amber-100",
  green: "bg-green-100 text-green-800 hover:bg-green-100",
};

function RagPill({ label, date }: { label: string; date: string | null }) {
  const rag = ragForDate(date);
  const text = date
    ? `${label} ${rag === "red" && new Date(date) < new Date() ? "overdue" : ""} ${formatDate(date)}`.replace(/\s+/g, " ").trim()
    : `${label} not set`;
  return <Badge className={cn("text-xs font-normal", RAG_CLASS[rag])}>{text}</Badge>;
}

function StockRagDot({ material }: { material: Material }) {
  let color: "red" | "amber" | "green" | "grey";
  if (material.quantity_on_hand <= 0) color = "red";
  else if (material.reorder_level == null) color = "grey";
  else if (material.quantity_on_hand <= material.reorder_level) color = "amber";
  else color = "green";

  const dotClass: Record<typeof color, string> = {
    red: "bg-red-500",
    amber: "bg-amber-500",
    green: "bg-green-500",
    grey: "bg-gray-300",
  };

  const title: Record<typeof color, string> = {
    red: "Out of stock",
    amber: "At or below reorder level",
    green: "In stock",
    grey: "No reorder level set",
  };

  return <span className={cn("inline-block h-2.5 w-2.5 rounded-full shrink-0", dotClass[color])} title={title[color]} />;
}

export function InventoryManagement() {
  const [contractorId, setContractorId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [tools, setTools] = useState<Tool[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [onSiteByTool, setOnSiteByTool] = useState<Record<string, { job_id: string; title: string; job_number: number | null }>>({});

  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [conditionFilter, setConditionFilter] = useState<string>("all");
  const [serviceFilter, setServiceFilter] = useState<string>("all");

  const [toolFormOpen, setToolFormOpen] = useState(false);
  const [editingTool, setEditingTool] = useState<Tool | null>(null);
  const [detailTool, setDetailTool] = useState<Tool | null>(null);
  const [deleteTool, setDeleteTool] = useState<Tool | null>(null);

  const [materialFormOpen, setMaterialFormOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [deleteMaterial, setDeleteMaterial] = useState<Material | null>(null);
  const [usageMaterial, setUsageMaterial] = useState<Material | null>(null);

  const getContractorId = useCallback(async (): Promise<string | null> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase.from("profiles").select("id").eq("user_id", user.id).maybeSingle();
    return data?.id ?? null;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const cId = contractorId ?? (await getContractorId());
      if (!cId) {
        setLoading(false);
        return;
      }
      if (!contractorId) setContractorId(cId);

      const [toolsRes, materialsRes] = await Promise.all([
        supabase.from("contractor_tools").select("*").eq("contractor_id", cId).order("name"),
        supabase.from("contractor_materials").select("*").eq("contractor_id", cId).order("name"),
      ]);
      if (toolsRes.error) throw toolsRes.error;
      if (materialsRes.error) throw materialsRes.error;

      const toolList = toolsRes.data ?? [];
      setTools(toolList);
      setMaterials(materialsRes.data ?? []);

      if (toolList.length > 0) {
        const { data: assignments, error: assignErr } = await supabase
          .from("job_tool_assignments")
          .select("tool_id, job_id, job:jobs(title, job_number)")
          .in("tool_id", toolList.map((t) => t.id))
          .is("returned_at", null);
        if (assignErr) throw assignErr;
        const map: Record<string, { job_id: string; title: string; job_number: number | null }> = {};
        for (const row of assignments ?? []) {
          const job = row.job as { title: string; job_number: number | null } | null;
          map[row.tool_id as string] = {
            job_id: row.job_id as string,
            title: job?.title ?? "Job",
            job_number: job?.job_number ?? null,
          };
        }
        setOnSiteByTool(map);
      } else {
        setOnSiteByTool({});
      }
    } catch (error) {
      console.error("Error loading inventory:", error);
      toast.error("Failed to load inventory");
    } finally {
      setLoading(false);
    }
  }, [contractorId, getContractorId]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredTools = tools.filter((t) => {
    if (categoryFilter !== "all" && t.category !== categoryFilter) return false;
    if (conditionFilter !== "all" && t.condition !== conditionFilter) return false;
    if (serviceFilter === "due_soon" && ragForDate(t.next_service_due) === "green") return false;
    if (serviceFilter === "overdue" && ragForDate(t.next_service_due) !== "red") return false;
    return true;
  });

  const handleDeleteTool = async () => {
    if (!deleteTool) return;
    try {
      const { error } = await supabase.from("contractor_tools").delete().eq("id", deleteTool.id);
      if (error) throw error;
      toast.success("Tool removed");
      setDeleteTool(null);
      load();
    } catch (error) {
      console.error("Error deleting tool:", error);
      toast.error("Failed to remove tool");
    }
  };

  const handleDeleteMaterial = async () => {
    if (!deleteMaterial) return;
    try {
      const { error } = await supabase.from("contractor_materials").delete().eq("id", deleteMaterial.id);
      if (error) throw error;
      toast.success("Material removed");
      setDeleteMaterial(null);
      load();
    } catch (error) {
      console.error("Error deleting material:", error);
      toast.error("Failed to remove material");
    }
  };

  const adjustQuantity = async (material: Material, delta: number) => {
    const next = material.quantity_on_hand + delta;
    if (next < 0) return;
    try {
      const { error } = await supabase
        .from("contractor_materials")
        .update({ quantity_on_hand: next })
        .eq("id", material.id);
      if (error) throw error;
      setMaterials((prev) => prev.map((m) => (m.id === material.id ? { ...m, quantity_on_hand: next } : m)));
    } catch (error) {
      console.error("Error adjusting stock:", error);
      toast.error("Failed to update stock");
    }
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
      <Tabs defaultValue="tools">
        <TabsList>
          <TabsTrigger value="tools">Tools</TabsTrigger>
          <TabsTrigger value="materials">Materials</TabsTrigger>
        </TabsList>

        <TabsContent value="tools" className="space-y-4 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="Category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {TOOL_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={conditionFilter} onValueChange={setConditionFilter}>
                <SelectTrigger className="w-[150px]"><SelectValue placeholder="Condition" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All conditions</SelectItem>
                  {CONDITIONS.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={serviceFilter} onValueChange={setServiceFilter}>
                <SelectTrigger className="w-[160px]"><SelectValue placeholder="Service status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any service status</SelectItem>
                  <SelectItem value="due_soon">Due soon / overdue</SelectItem>
                  <SelectItem value="overdue">Overdue only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => { setEditingTool(null); setToolFormOpen(true); }}>
              <i className="ti ti-plus mr-2" /> Add tool
            </Button>
          </div>

          {filteredTools.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                {tools.length === 0 ? "No tools yet. Add your first tool to start tracking it." : "No tools match these filters."}
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredTools.map((tool) => (
                <ToolCard
                  key={tool.id}
                  tool={tool}
                  onSite={onSiteByTool[tool.id] ?? null}
                  onView={() => setDetailTool(tool)}
                  onEdit={() => { setEditingTool(tool); setToolFormOpen(true); }}
                  onDelete={() => setDeleteTool(tool)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="materials" className="space-y-4 pt-4">
          <div className="flex justify-end">
            <Button onClick={() => { setEditingMaterial(null); setMaterialFormOpen(true); }}>
              <i className="ti ti-plus mr-2" /> Add material
            </Button>
          </div>

          {materials.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                No materials yet. Add stock to start tracking usage against jobs.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground text-xs">
                        <th className="text-left py-3 px-4 font-medium">Material</th>
                        <th className="text-left py-3 px-4 font-medium">Category</th>
                        <th className="text-left py-3 px-4 font-medium">Stock</th>
                        <th className="text-left py-3 px-4 font-medium">Unit cost</th>
                        <th className="text-left py-3 px-4 font-medium">Supplier</th>
                        <th className="text-right py-3 px-4 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {materials.map((material) => (
                        <tr key={material.id} className="border-b last:border-0">
                          <td className="py-2 px-4 font-medium">{material.name}</td>
                          <td className="py-2 px-4 text-muted-foreground">{material.category}</td>
                          <td className="py-2 px-4">
                            <div className="flex items-center gap-2">
                              <StockRagDot material={material} />
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => adjustQuantity(material, -1)}>
                                <i className="ti ti-minus text-xs" />
                              </Button>
                              <span className="font-mono w-16 text-center">{material.quantity_on_hand} {material.unit}</span>
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => adjustQuantity(material, 1)}>
                                <i className="ti ti-plus text-xs" />
                              </Button>
                            </div>
                          </td>
                          <td className="py-2 px-4">{formatGBP(material.unit_cost)}</td>
                          <td className="py-2 px-4 text-muted-foreground">{material.supplier ?? "—"}</td>
                          <td className="py-2 px-4 text-right">
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="sm" onClick={() => setUsageMaterial(material)}>
                                Log usage
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditingMaterial(material); setMaterialFormOpen(true); }}>
                                <i className="ti ti-edit text-muted-foreground" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteMaterial(material)}>
                                <i className="ti ti-trash text-muted-foreground" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <AddEditToolDialog
        open={toolFormOpen}
        onOpenChange={(open) => { setToolFormOpen(open); if (!open) setEditingTool(null); }}
        contractorId={contractorId}
        editing={editingTool}
        onSaved={load}
      />

      {detailTool && contractorId && (
        <ToolDetailDialog
          tool={detailTool}
          contractorId={contractorId}
          onSite={onSiteByTool[detailTool.id] ?? null}
          onClose={() => setDetailTool(null)}
        />
      )}

      <AlertDialog open={!!deleteTool} onOpenChange={(open) => !open && setDeleteTool(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove tool?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{deleteTool?.name}" and its assignment history. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteTool}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AddEditMaterialDialog
        open={materialFormOpen}
        onOpenChange={(open) => { setMaterialFormOpen(open); if (!open) setEditingMaterial(null); }}
        contractorId={contractorId}
        editing={editingMaterial}
        onSaved={load}
      />

      {usageMaterial && contractorId && (
        <LogMaterialUsageDialog
          material={usageMaterial}
          contractorId={contractorId}
          onClose={() => setUsageMaterial(null)}
          onLogged={load}
        />
      )}

      <AlertDialog open={!!deleteMaterial} onOpenChange={(open) => !open && setDeleteMaterial(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove material?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{deleteMaterial?.name}" and its usage history. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteMaterial}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ToolCard({
  tool,
  onSite,
  onView,
  onEdit,
  onDelete,
}: {
  tool: Tool;
  onSite: { job_id: string; title: string; job_number: number | null } | null;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <button className="min-w-0 text-left" onClick={onView}>
            <p className="truncate text-lg font-semibold">{tool.name}</p>
            <p className="text-sm text-muted-foreground">{tool.category}</p>
          </button>
          {onSite && (
            <Badge className="shrink-0 bg-orange-100 text-orange-800 hover:bg-orange-100">
              On site
            </Badge>
          )}
        </div>

        {(tool.brand || tool.model) && (
          <p className="text-sm text-muted-foreground truncate">
            {[tool.brand, tool.model].filter(Boolean).join(" ")}
          </p>
        )}

        <div className="flex flex-wrap gap-1.5">
          <RagPill label="Service due" date={tool.next_service_due} />
          <RagPill label="Warranty" date={tool.warranty_expiry} />
        </div>

        <div className="flex items-center justify-between border-t pt-3 text-sm">
          <Badge className="capitalize bg-gray-100 text-gray-800 hover:bg-gray-100">{tool.condition}</Badge>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit}>
              <i className="ti ti-edit text-muted-foreground" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onDelete}>
              <i className="ti ti-trash text-muted-foreground" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ToolDetailDialog({
  tool,
  contractorId,
  onSite,
  onClose,
}: {
  tool: Tool;
  contractorId: string;
  onSite: { job_id: string; title: string; job_number: number | null } | null;
  onClose: () => void;
}) {
  const [history, setHistory] = useState<(ToolAssignment & { job: { title: string; job_number: number | null } | null })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("job_tool_assignments")
        .select("*, job:jobs(title, job_number)")
        .eq("tool_id", tool.id)
        .order("assigned_at", { ascending: false });
      if (error) {
        console.error("Error loading tool history:", error);
        toast.error("Failed to load job history");
      } else {
        setHistory((data ?? []) as unknown as (ToolAssignment & { job: { title: string; job_number: number | null } | null })[]);
      }
      setLoading(false);
    };
    load();
  }, [tool.id]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{tool.name}</DialogTitle>
          <DialogDescription>{tool.category}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {onSite && (
            <div className="rounded-md bg-orange-50 border border-orange-200 p-3 text-sm text-orange-800">
              Currently on site — {onSite.job_number != null ? `Job ${onSite.job_number} · ` : ""}{onSite.title}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><p className="text-xs text-muted-foreground">Brand / model</p><p>{[tool.brand, tool.model].filter(Boolean).join(" ") || "—"}</p></div>
            <div><p className="text-xs text-muted-foreground">Serial number</p><p>{tool.serial_number ?? "—"}</p></div>
            <div><p className="text-xs text-muted-foreground">Condition</p><p className="capitalize">{tool.condition}</p></div>
            <div><p className="text-xs text-muted-foreground">Purchase date</p><p>{formatDate(tool.purchase_date)}</p></div>
            <div><p className="text-xs text-muted-foreground">Purchase cost</p><p>{formatGBP(tool.purchase_cost)}</p></div>
            <div><p className="text-xs text-muted-foreground">Service type</p><p>{tool.service_type ?? "—"}</p></div>
            <div><p className="text-xs text-muted-foreground">Next service due</p><p>{formatDate(tool.next_service_due)}</p></div>
            <div><p className="text-xs text-muted-foreground">Warranty expiry</p><p>{formatDate(tool.warranty_expiry)}</p></div>
          </div>

          {tool.notes && (
            <div>
              <p className="text-xs text-muted-foreground">Notes</p>
              <p className="text-sm">{tool.notes}</p>
            </div>
          )}

          <div className="border-t pt-3 space-y-2">
            <p className="text-sm font-medium">Job history</p>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : history.length === 0 ? (
              <p className="text-sm text-muted-foreground">Never assigned to a job.</p>
            ) : (
              <div className="max-h-48 space-y-1.5 overflow-y-auto">
                {history.map((row) => (
                  <div key={row.id} className="flex items-center justify-between text-sm">
                    <span>
                      {row.job?.job_number != null ? `Job ${row.job.job_number}` : "Job"}
                      {row.job?.title ? ` · ${row.job.title}` : ""}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(row.assigned_at)} {row.returned_at ? `– ${formatDate(row.returned_at)}` : "(active)"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <ToolDocumentsSection toolId={tool.id} contractorId={contractorId} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ToolDocumentsSection({ toolId, contractorId }: { toolId: string; contractorId: string }) {
  const { documents, loading, uploadDocument, deleteDocument, getSignedUrl } = useToolDocuments(toolId);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState<string>(DOCUMENT_TYPES[0]);
  const [uploading, setUploading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Database["public"]["Tables"]["tool_documents"]["Row"] | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);

  const handleFileChange = (file: File | null) => {
    if (file && file.size > MAX_DOCUMENT_SIZE) {
      toast.error("File is too large — maximum size is 10MB");
      return;
    }
    setSelectedFile(file);
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      toast.error("Select a file to upload");
      return;
    }
    setUploading(true);
    try {
      await uploadDocument(toolId, contractorId, selectedFile, documentType);
      toast.success("Document uploaded");
      setSelectedFile(null);
      setDocumentType(DOCUMENT_TYPES[0]);
      setFileInputKey((k) => k + 1);
    } catch (error) {
      console.error("Error uploading document:", error);
      toast.error(error instanceof Error ? error.message : "Failed to upload document");
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (docId: string, filePath: string) => {
    setDownloadingId(docId);
    try {
      const url = await getSignedUrl(filePath);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      console.error("Error opening document:", error);
      toast.error("Failed to open document");
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteDocument(deleteTarget.id, deleteTarget.file_path);
      toast.success("Document removed");
      setDeleteTarget(null);
    } catch (error) {
      console.error("Error deleting document:", error);
      toast.error("Failed to remove document");
    }
  };

  return (
    <div className="border-t pt-3 space-y-3">
      <p className="text-sm font-medium">Documents</p>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : documents.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No documents attached. Upload receipts, certificates or inspection reports.
        </p>
      ) : (
        <div className="space-y-1.5">
          {documents.map((doc) => (
            <div key={doc.id} className="flex items-center justify-between gap-2 rounded-md border p-2.5 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{doc.file_name}</p>
                <div className="mt-1 flex items-center gap-2">
                  <Badge className="text-xs font-normal bg-gray-100 text-gray-800 hover:bg-gray-100">{doc.document_type}</Badge>
                  <span className="text-xs text-muted-foreground">{formatDateTime(doc.uploaded_at)}</span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  disabled={downloadingId === doc.id}
                  onClick={() => handleDownload(doc.id, doc.file_path)}
                >
                  <i className={cn("ti", downloadingId === doc.id ? "ti-loader-2 animate-spin" : "ti-download", "text-muted-foreground")} />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteTarget(doc)}>
                  <i className="ti ti-trash text-muted-foreground" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2 rounded-md border border-dashed p-3">
        <div className="min-w-[160px] flex-1 space-y-1.5">
          <Label htmlFor="doc_file" className="text-xs">File</Label>
          <Input
            key={fileInputKey}
            id="doc_file"
            type="file"
            accept={DOCUMENT_ACCEPT}
            onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
          />
        </div>
        <div className="min-w-[160px] space-y-1.5">
          <Label htmlFor="doc_type" className="text-xs">Type</Label>
          <Select value={documentType} onValueChange={setDocumentType}>
            <SelectTrigger id="doc_type"><SelectValue /></SelectTrigger>
            <SelectContent>
              {DOCUMENT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={handleUpload} disabled={uploading || !selectedFile}>
          {uploading ? "Uploading…" : "Upload"}
        </Button>
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove document?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{deleteTarget?.file_name}". This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface ToolFormState {
  name: string;
  category: string;
  brand: string;
  model: string;
  serial_number: string;
  purchase_date: string;
  purchase_cost: string;
  warranty_expiry: string;
  next_service_due: string;
  service_type: string;
  condition: string;
  notes: string;
}

const emptyToolForm: ToolFormState = {
  name: "",
  category: "",
  brand: "",
  model: "",
  serial_number: "",
  purchase_date: "",
  purchase_cost: "",
  warranty_expiry: "",
  next_service_due: "",
  service_type: "",
  condition: "good",
  notes: "",
};

function AddEditToolDialog({
  open,
  onOpenChange,
  contractorId,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contractorId: string | null;
  editing: Tool | null;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<ToolFormState>(emptyToolForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        name: editing.name,
        category: editing.category,
        brand: editing.brand ?? "",
        model: editing.model ?? "",
        serial_number: editing.serial_number ?? "",
        purchase_date: editing.purchase_date ?? "",
        purchase_cost: editing.purchase_cost !== null ? String(editing.purchase_cost) : "",
        warranty_expiry: editing.warranty_expiry ?? "",
        next_service_due: editing.next_service_due ?? "",
        service_type: editing.service_type ?? "",
        condition: editing.condition,
        notes: editing.notes ?? "",
      });
    } else {
      setForm(emptyToolForm);
    }
  }, [open, editing]);

  const set = <K extends keyof ToolFormState>(key: K, value: ToolFormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!form.category) {
      toast.error("Category is required");
      return;
    }
    if (!contractorId) return;

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        category: form.category,
        brand: form.brand.trim() || null,
        model: form.model.trim() || null,
        serial_number: form.serial_number.trim() || null,
        purchase_date: form.purchase_date || null,
        purchase_cost: form.purchase_cost ? parseFloat(form.purchase_cost) : null,
        warranty_expiry: form.warranty_expiry || null,
        next_service_due: form.next_service_due || null,
        service_type: form.service_type.trim() || null,
        condition: form.condition,
        notes: form.notes.trim() || null,
      };

      if (editing) {
        const { error } = await supabase.from("contractor_tools").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Tool updated");
      } else {
        const { error } = await supabase.from("contractor_tools").insert({ ...payload, contractor_id: contractorId });
        if (error) throw error;
        toast.success("Tool added");
      }
      onOpenChange(false);
      onSaved();
    } catch (error) {
      console.error("Error saving tool:", error);
      toast.error("Failed to save tool");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit tool" : "Add tool"}</DialogTitle>
          <DialogDescription>{editing ? "Update this tool's details" : "Add a tool to your kit"}</DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
          <div className="space-y-2">
            <Label htmlFor="tool_name">Name</Label>
            <Input id="tool_name" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. SDS Drill" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="tool_category">Category</Label>
              <Select value={form.category} onValueChange={(v) => set("category", v)}>
                <SelectTrigger id="tool_category"><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {TOOL_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tool_condition">Condition</Label>
              <Select value={form.condition} onValueChange={(v) => set("condition", v)}>
                <SelectTrigger id="tool_condition"><SelectValue placeholder="Select condition" /></SelectTrigger>
                <SelectContent>
                  {CONDITIONS.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="tool_brand">Brand</Label>
              <Input id="tool_brand" value={form.brand} onChange={(e) => set("brand", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tool_model">Model</Label>
              <Input id="tool_model" value={form.model} onChange={(e) => set("model", e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="tool_serial">Serial number</Label>
            <Input id="tool_serial" value={form.serial_number} onChange={(e) => set("serial_number", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="tool_purchase_date">Purchase date</Label>
              <Input id="tool_purchase_date" type="date" value={form.purchase_date} onChange={(e) => set("purchase_date", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tool_purchase_cost">Purchase cost (£)</Label>
              <Input id="tool_purchase_cost" type="number" step="0.01" min="0" value={form.purchase_cost} onChange={(e) => set("purchase_cost", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="tool_warranty">Warranty expiry</Label>
              <Input id="tool_warranty" type="date" value={form.warranty_expiry} onChange={(e) => set("warranty_expiry", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tool_service_due">Next service due</Label>
              <Input id="tool_service_due" type="date" value={form.next_service_due} onChange={(e) => set("next_service_due", e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="tool_service_type">Service type</Label>
            <Input id="tool_service_type" value={form.service_type} onChange={(e) => set("service_type", e.target.value)} placeholder="e.g. PAT test, calibration" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tool_notes">Notes</Label>
            <Textarea id="tool_notes" value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={3} />
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? "Saving…" : editing ? "Update tool" : "Add tool"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface MaterialFormState {
  name: string;
  category: string;
  unit: string;
  quantity_on_hand: string;
  unit_cost: string;
  reorder_level: string;
  supplier: string;
  notes: string;
}

const emptyMaterialForm: MaterialFormState = {
  name: "",
  category: "",
  unit: "each",
  quantity_on_hand: "0",
  unit_cost: "",
  reorder_level: "",
  supplier: "",
  notes: "",
};

function AddEditMaterialDialog({
  open,
  onOpenChange,
  contractorId,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contractorId: string | null;
  editing: Material | null;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<MaterialFormState>(emptyMaterialForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        name: editing.name,
        category: editing.category,
        unit: editing.unit,
        quantity_on_hand: String(editing.quantity_on_hand),
        unit_cost: editing.unit_cost !== null ? String(editing.unit_cost) : "",
        reorder_level: editing.reorder_level !== null ? String(editing.reorder_level) : "",
        supplier: editing.supplier ?? "",
        notes: editing.notes ?? "",
      });
    } else {
      setForm(emptyMaterialForm);
    }
  }, [open, editing]);

  const set = <K extends keyof MaterialFormState>(key: K, value: MaterialFormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!form.category.trim()) {
      toast.error("Category is required");
      return;
    }
    if (!contractorId) return;

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        category: form.category.trim(),
        unit: form.unit,
        quantity_on_hand: form.quantity_on_hand ? parseFloat(form.quantity_on_hand) : 0,
        unit_cost: form.unit_cost ? parseFloat(form.unit_cost) : null,
        reorder_level: form.reorder_level ? parseFloat(form.reorder_level) : null,
        supplier: form.supplier.trim() || null,
        notes: form.notes.trim() || null,
      };

      if (editing) {
        const { error } = await supabase.from("contractor_materials").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Material updated");
      } else {
        const { error } = await supabase.from("contractor_materials").insert({ ...payload, contractor_id: contractorId });
        if (error) throw error;
        toast.success("Material added");
      }
      onOpenChange(false);
      onSaved();
    } catch (error) {
      console.error("Error saving material:", error);
      toast.error("Failed to save material");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit material" : "Add material"}</DialogTitle>
          <DialogDescription>{editing ? "Update this material's details" : "Add a material to your stock"}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="material_name">Name</Label>
            <Input id="material_name" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. 15mm copper pipe" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="material_category">Category</Label>
              <Input id="material_category" value={form.category} onChange={(e) => set("category", e.target.value)} placeholder="e.g. Plumbing" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="material_unit">Unit</Label>
              <Select value={form.unit} onValueChange={(v) => set("unit", v)}>
                <SelectTrigger id="material_unit"><SelectValue placeholder="Select unit" /></SelectTrigger>
                <SelectContent>
                  {MATERIAL_UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="material_quantity">Quantity on hand</Label>
              <Input id="material_quantity" type="number" step="0.01" min="0" value={form.quantity_on_hand} onChange={(e) => set("quantity_on_hand", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="material_reorder">Reorder level</Label>
              <Input id="material_reorder" type="number" step="0.01" min="0" value={form.reorder_level} onChange={(e) => set("reorder_level", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="material_unit_cost">Unit cost (£)</Label>
              <Input id="material_unit_cost" type="number" step="0.01" min="0" value={form.unit_cost} onChange={(e) => set("unit_cost", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="material_supplier">Supplier</Label>
              <Input id="material_supplier" value={form.supplier} onChange={(e) => set("supplier", e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="material_notes">Notes</Label>
            <Textarea id="material_notes" value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={3} />
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? "Saving…" : editing ? "Update material" : "Add material"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LogMaterialUsageDialog({
  material,
  contractorId,
  onClose,
  onLogged,
}: {
  material: Material;
  contractorId: string;
  onClose: () => void;
  onLogged: () => void;
}) {
  const [jobs, setJobs] = useState<{ id: string; title: string; job_number: number | null }[]>([]);
  const [jobId, setJobId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("jobs")
        .select("id, title, job_number")
        .eq("contractor_id", contractorId)
        .in("status", ["scheduled", "in_progress"])
        .order("start_date", { ascending: true });
      if (error) {
        console.error("Error loading active jobs:", error);
        toast.error("Failed to load active jobs");
      } else {
        setJobs(data ?? []);
      }
      setLoading(false);
    };
    load();
  }, [contractorId]);

  const handleLog = async () => {
    if (!jobId) {
      toast.error("Select a job");
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
        p_material_id: material.id,
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
          <DialogTitle>Log usage — {material.name}</DialogTitle>
          <DialogDescription>{material.quantity_on_hand} {material.unit} currently in stock</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="usage_job">Job</Label>
            <Select value={jobId} onValueChange={setJobId} disabled={loading}>
              <SelectTrigger id="usage_job"><SelectValue placeholder={loading ? "Loading…" : "Select a job"} /></SelectTrigger>
              <SelectContent>
                {jobs.map((j) => (
                  <SelectItem key={j.id} value={j.id}>
                    {j.job_number != null ? `Job ${j.job_number} · ` : ""}{j.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!loading && jobs.length === 0 && (
              <p className="text-xs text-muted-foreground">No active jobs to log usage against.</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="usage_quantity">Quantity used ({material.unit})</Label>
            <Input id="usage_quantity" type="number" step="0.01" min="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
          <Button onClick={handleLog} disabled={saving} className="w-full">
            {saving ? "Logging…" : "Log usage"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
