import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Edit, Trash2, ArrowLeft } from "lucide-react";
import { useRams } from "@/hooks/useRams";
import { RamsTemplateEditor } from "@/components/management/rams/RamsEditor";

export function RamsTemplateManagement() {
  const { templates, loading, deleteTemplate } = useRams();
  const [editingId, setEditingId] = useState<string | null | undefined>(undefined); // undefined = list view, null = new, string = edit
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const myTemplates = templates.filter((t) => t.owner_contractor_id !== null);
  const platformTemplates = templates.filter((t) => t.owner_contractor_id === null);

  const handleDelete = async (id: string) => {
    await deleteTemplate(id);
    setDeletingId(null);
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
              <CardContent className="p-3 space-y-1">
                <div className="font-medium text-sm">{t.name}</div>
                {t.description && <p className="text-xs text-muted-foreground">{t.description}</p>}
                <Badge variant="outline" className="text-[10px]">{t.hazards.length} hazards</Badge>
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
