import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Edit, Trash2, ArrowLeft, Copy } from "lucide-react";
import { useRams, type RamsTemplate } from "@/hooks/useRams";
import { RamsTemplateEditor } from "@/components/management/rams/RamsEditor";
import { useToast } from "@/hooks/use-toast";

// "Name (copy)", then "Name (copy 2)", "Name (copy 3)"... until a name that
// doesn't collide with the contractor's existing template names is found.
// Never silently merges into an existing template of the same name.
function resolveCollisionName(desiredName: string, existingNames: Set<string>): string {
  if (!existingNames.has(desiredName)) return desiredName;
  let candidate = `${desiredName} (copy)`;
  let n = 2;
  while (existingNames.has(candidate)) {
    candidate = `${desiredName} (copy ${n})`;
    n++;
  }
  return candidate;
}

export function RamsTemplateManagement() {
  const { templates, loading, deleteTemplate, createTemplate } = useRams();
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<string | null | undefined>(undefined); // undefined = list view, null = new, string = edit
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [copyingId, setCopyingId] = useState<string | null>(null);

  const myTemplates = templates.filter((t) => t.owner_contractor_id !== null);
  const platformTemplates = templates.filter((t) => t.owner_contractor_id === null);

  const handleDelete = async (id: string) => {
    await deleteTemplate(id);
    setDeletingId(null);
  };

  // Copies a platform (TradeStone) template into the contractor's own
  // library, then opens it in the editor so they can tailor it immediately.
  // Reads only from the platform template — never writes to it. Deep-copies
  // the JSONB arrays by value (structuredClone) so the clone shares no
  // references with the source.
  const handleCopyPlatformTemplate = async (template: RamsTemplate) => {
    setCopyingId(template.id);
    try {
      const existingNames = new Set(myTemplates.map((t) => t.name));
      const newName = resolveCollisionName(template.name, existingNames);
      const created = await createTemplate({
        name: newName,
        description: template.description,
        trade_category: template.trade_category,
        hazards: structuredClone(template.hazards),
        method_steps: structuredClone(template.method_steps),
        ppe_requirements: structuredClone(template.ppe_requirements),
        emergency_procedures: template.emergency_procedures,
      });
      if (created) {
        toast({ title: "Template copied", description: `Added to My Templates as "${newName}".` });
        setEditingId(created.id);
      }
    } finally {
      setCopyingId(null);
    }
  };

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  if (editingId !== undefined) {
    return (
      <div className="space-y-4 p-6">
        <Button variant="ghost" size="sm" onClick={() => setEditingId(undefined)}>
          <ArrowLeft className="h-4 w-4 mr-1" />Back to templates
        </Button>
        <RamsTemplateEditor templateId={editingId} onSaved={() => setEditingId(undefined)} />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="font-heading text-2xl font-bold">RAMS Templates</h2>
          <p className="text-sm text-muted-foreground">Risk assessment & method statement templates you can start a job's RAMS from.</p>
        </div>
        <Button onClick={() => setEditingId(null)}>
          <Plus className="h-4 w-4 mr-2" />Create Template
        </Button>
      </div>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">My Templates</h3>
        {myTemplates.length === 0 ? (
          <p className="text-sm text-muted-foreground">You haven't created any templates yet.</p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {myTemplates.map((t) => (
              <Card key={t.id}>
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium text-sm">{t.name}</div>
                      {t.description && <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>}
                    </div>
                    <Badge variant="outline" className="text-[10px] shrink-0">{t.hazards.length} hazards</Badge>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" onClick={() => setEditingId(t.id)}>
                      <Edit className="h-3.5 w-3.5 mr-1" />Edit
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeletingId(t.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">TradeStone Templates</h3>
        <div className="grid sm:grid-cols-2 gap-3">
          {platformTemplates.map((t) => (
            <Card key={t.id}>
              <CardContent className="p-3 space-y-2">
                <div className="font-medium text-sm">{t.name}</div>
                {t.description && <p className="text-xs text-muted-foreground">{t.description}</p>}
                <Badge variant="outline" className="text-[10px]">{t.hazards.length} hazards</Badge>
                <div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={copyingId === t.id}
                    onClick={() => handleCopyPlatformTemplate(t)}
                  >
                    {copyingId === t.id ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                    ) : (
                      <Copy className="h-3.5 w-3.5 mr-1" />
                    )}
                    Copy to my templates
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {deletingId && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={() => setDeletingId(null)}>
          <div className="bg-background rounded-lg p-6 max-w-sm w-full space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-heading text-lg font-bold">Delete template?</h3>
            <p className="text-sm text-muted-foreground">This cannot be undone. Jobs already created from this template are unaffected.</p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setDeletingId(null)}>Cancel</Button>
              <Button variant="destructive" onClick={() => handleDelete(deletingId)}>Delete</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
