import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Upload, FileText, Trash2, Plus, ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";

interface Document {
  id: string;
  title: string;
  description: string | null;
  document_url: string;
  file_name: string;
  file_size: number | null;
  display_order: number;
  created_at: string;
}

export function DocumentManagement() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadDocuments();
  }, []);

  const loadDocuments = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      const { data, error } = await supabase
        .from("contractor_documents")
        .select("*")
        .eq("contractor_id", user.id)
        .order("display_order", { ascending: true });

      if (error) throw error;
      setDocuments(data || []);
    } catch (error) {
      console.error("Error loading documents:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      toast({ title: "Invalid file type", description: "Only PDF files are allowed.", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "Documents must be under 10MB.", variant: "destructive" });
      return;
    }

    setSelectedFile(file);
    if (!title) setTitle(file.name.replace(/\.pdf$/i, ""));
  };

  const handleUpload = async () => {
    if (!selectedFile || !userId || !title.trim()) return;

    setUploading(true);
    try {
      const fileId = crypto.randomUUID();
      const filePath = `${userId}/${fileId}.pdf`;

      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(filePath, selectedFile, { contentType: "application/pdf" });
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from("documents").getPublicUrl(filePath);

      const { error: insertError } = await supabase
        .from("contractor_documents")
        .insert({
          contractor_id: userId,
          title: title.trim(),
          description: description.trim() || null,
          document_url: publicUrl,
          file_name: selectedFile.name,
          file_size: selectedFile.size,
          display_order: documents.length,
        });
      if (insertError) throw insertError;

      toast({ title: "Document uploaded", description: "Your document is now visible on your profile." });
      setDialogOpen(false);
      resetForm();
      loadDocuments();
    } catch (error) {
      console.error("Error uploading document:", error);
      toast({ title: "Upload failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (doc: Document) => {
    try {
      // Extract path from URL
      const urlParts = doc.document_url.split("/documents/");
      const storagePath = urlParts[urlParts.length - 1]?.split("?")[0];

      if (storagePath) {
        await supabase.storage.from("documents").remove([storagePath]);
      }

      const { error } = await supabase
        .from("contractor_documents")
        .delete()
        .eq("id", doc.id);
      if (error) throw error;

      setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
      toast({ title: "Document deleted" });
    } catch (error) {
      console.error("Error deleting document:", error);
      toast({ title: "Delete failed", variant: "destructive" });
    }
  };

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Documents</CardTitle>
              <CardDescription>Upload PDF documents visible on your public profile (e.g. certifications, insurance, accreditations)</CardDescription>
            </div>
            <Button onClick={() => { resetForm(); setDialogOpen(true); }}>
              <Plus className="h-4 w-4 mr-2" />
              Add Document
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="font-medium">No documents uploaded yet</p>
              <p className="text-sm">Upload PDFs like certificates, insurance documents, or accreditations.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {documents.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText className="h-8 w-8 text-primary flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="font-medium truncate">{doc.title}</p>
                      {doc.description && (
                        <p className="text-sm text-muted-foreground truncate">{doc.description}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {doc.file_name} {doc.file_size ? `• ${formatFileSize(doc.file_size)}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button variant="outline" size="sm" asChild>
                      <a href={doc.document_url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleDelete(doc)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Document</DialogTitle>
            <DialogDescription>Upload a PDF document to display on your public profile.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>PDF File *</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                onChange={handleFileSelect}
                className="hidden"
              />
              <Button variant="outline" className="w-full" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-4 w-4 mr-2" />
                {selectedFile ? selectedFile.name : "Choose PDF file"}
              </Button>
              <p className="text-xs text-muted-foreground">Max 10MB</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="doc-title">Title *</Label>
              <Input id="doc-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Gas Safe Certificate" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="doc-desc">Description</Label>
              <Textarea id="doc-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description of this document" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={uploading}>Cancel</Button>
            <Button onClick={handleUpload} disabled={uploading || !selectedFile || !title.trim()}>
              {uploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
