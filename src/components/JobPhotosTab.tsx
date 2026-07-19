import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CheckCircle,
  Clock,
  Eye,
  EyeOff,
  FileText,
  ImageIcon,
  Loader2,
  Plus,
  Star,
  Trash2,
  Upload,
  X,
  XCircle,
} from "lucide-react";

interface JobPhotosTabProps {
  jobId: string;
  contractorProfileId: string;
  isContractor: boolean;
}

type ApprovalStatus = "not_requested" | "pending" | "approved" | "declined";
type Visibility = "internal" | "customer";
type FileType = "image" | "pdf";

interface JobPhoto {
  id: string;
  job_id: string;
  enquiry_id: string | null;
  stage_id: string | null;
  uploaded_by: string;
  uploaded_by_role: "contractor" | "customer";
  storage_path: string;
  caption: string | null;
  tags: string[];
  visibility: Visibility;
  file_type: FileType;
  portfolio: boolean;
  photo_approval_status: ApprovalStatus;
  photo_approval_requested_at: string | null;
  photo_approval_responded_at: string | null;
  created_at: string;
  publicUrl?: string;
}

const ACCEPTED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];
const MAX_SIZE_BYTES = 10 * 1024 * 1024;

function ApprovalBadge({ status }: { status: ApprovalStatus }) {
  if (status === "not_requested") return null;
  if (status === "pending") {
    return (
      <Badge
        variant="outline"
        className="text-[10px] px-1 py-0 gap-1 border-amber-400 text-amber-700"
      >
        <Clock className="h-2.5 w-2.5" />
        Pending approval
      </Badge>
    );
  }
  if (status === "approved") {
    return (
      <Badge
        variant="outline"
        className="text-[10px] px-1 py-0 gap-1 border-green-500 text-green-700"
      >
        <CheckCircle className="h-2.5 w-2.5" />
        Approved
      </Badge>
    );
  }
  if (status === "declined") {
    return (
      <Badge
        variant="outline"
        className="text-[10px] px-1 py-0 gap-1 border-red-400 text-red-700"
      >
        <XCircle className="h-2.5 w-2.5" />
        Declined
      </Badge>
    );
  }
  return null;
}

export default function JobPhotosTab({
  jobId,
  contractorProfileId,
  isContractor,
}: JobPhotosTabProps) {
  const [photos, setPhotos] = useState<JobPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [visibility, setVisibility] = useState<Visibility>("internal");
  const [uploading, setUploading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const loadPhotos = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("job_photos")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false });

    if (error) {
      toast({
        title: "Error",
        description: "Failed to load photos",
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    const withUrls: JobPhoto[] = (data || []).map((row: any) => {
      let publicUrl: string | undefined;
      if (row.file_type === "image" && row.storage_path) {
        const { data: urlData } = supabase.storage
          .from("job-photos")
          .getPublicUrl(row.storage_path);
        publicUrl = urlData.publicUrl;
      }
      return {
        ...row,
        tags: Array.isArray(row.tags) ? row.tags : [],
        publicUrl,
      } as JobPhoto;
    });

    setPhotos(withUrls);
    setLoading(false);
  };

  useEffect(() => {
    loadPhotos();
  }, [jobId]);

  const allTags = Array.from(new Set(photos.flatMap((p) => p.tags)));

  const filtered = activeTag
    ? photos.filter((p) => p.tags.includes(activeTag))
    : photos;

  const handleFileSelect = (file: File) => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast({
        title: "Invalid file type",
        description: "Only JPG, PNG, WEBP, and PDF files are allowed.",
        variant: "destructive",
      });
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      toast({
        title: "File too large",
        description: "Maximum file size is 10 MB.",
        variant: "destructive",
      });
      return;
    }
    setSelectedFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) setTags((prev) => [...prev, t]);
    setTagInput("");
  };

  const removeTag = (t: string) =>
    setTags((prev) => prev.filter((x) => x !== t));

  const resetUploadForm = () => {
    setSelectedFile(null);
    setCaption("");
    setTags([]);
    setTagInput("");
    setVisibility("internal");
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);

    const ext = selectedFile.name.split(".").pop() ?? "bin";
    // storage.objects' upload/delete RLS requires the path's first folder
    // segment to be the uploader's own auth.uid() — contractorProfileId is
    // that value (profiles.id == profiles.user_id == auth.uid() by
    // construction). A path of just `${jobId}/...` was silently rejected
    // by RLS before ever reaching the DB insert this file's photo_url bug
    // masked as the whole story.
    const path = `${contractorProfileId}/${jobId}/${Date.now()}.${ext}`;
    const fileType: FileType =
      selectedFile.type === "application/pdf" ? "pdf" : "image";

    const { error: storageError } = await supabase.storage
      .from("job-photos")
      .upload(path, selectedFile);

    if (storageError) {
      toast({
        title: "Upload failed",
        description: storageError.message,
        variant: "destructive",
      });
      setUploading(false);
      return;
    }

    const { error: dbError } = await (supabase as any)
      .from("job_photos")
      .insert({
        job_id: jobId,
        uploaded_by: contractorProfileId,
        uploaded_by_role: "contractor",
        storage_path: path,
        caption: caption.trim() || null,
        tags,
        visibility,
        file_type: fileType,
        portfolio: false,
        photo_approval_status: "not_requested",
      });

    if (dbError) {
      await supabase.storage.from("job-photos").remove([path]);
      toast({
        title: "Save failed",
        description: dbError.message,
        variant: "destructive",
      });
      setUploading(false);
      return;
    }

    toast({ title: "Photo uploaded" });
    setUploadOpen(false);
    resetUploadForm();
    await loadPhotos();
    setUploading(false);
  };

  const toggleVisibility = async (photo: JobPhoto) => {
    const next: Visibility =
      photo.visibility === "internal" ? "customer" : "internal";
    setSavingId(photo.id);
    const { error } = await (supabase as any)
      .from("job_photos")
      .update({ visibility: next })
      .eq("id", photo.id);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to update visibility",
        variant: "destructive",
      });
    } else {
      setPhotos((cur) =>
        cur.map((p) => (p.id === photo.id ? { ...p, visibility: next } : p)),
      );
    }
    setSavingId(null);
  };

  const togglePortfolio = async (photo: JobPhoto) => {
    setSavingId(photo.id);
    const { error } = await (supabase as any)
      .from("job_photos")
      .update({ portfolio: !photo.portfolio })
      .eq("id", photo.id);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to update portfolio status",
        variant: "destructive",
      });
    } else {
      setPhotos((cur) =>
        cur.map((p) =>
          p.id === photo.id ? { ...p, portfolio: !p.portfolio } : p,
        ),
      );
    }
    setSavingId(null);
  };

  const deletePhoto = async (photo: JobPhoto) => {
    setSavingId(photo.id);

    const { error: storageError } = await supabase.storage
      .from("job-photos")
      .remove([photo.storage_path]);

    if (storageError) {
      toast({
        title: "Error",
        description: "Failed to remove file from storage",
        variant: "destructive",
      });
      setSavingId(null);
      return;
    }

    const { error: dbError } = await (supabase as any)
      .from("job_photos")
      .delete()
      .eq("id", photo.id);

    if (dbError) {
      toast({
        title: "Error",
        description: "Failed to delete photo record",
        variant: "destructive",
      });
    } else {
      setPhotos((cur) => cur.filter((p) => p.id !== photo.id));
    }
    setSavingId(null);
  };

  const requestApproval = async (photo: JobPhoto) => {
    setSavingId(photo.id);
    const now = new Date().toISOString();
    const { error } = await (supabase as any)
      .from("job_photos")
      .update({
        photo_approval_status: "pending",
        photo_approval_requested_at: now,
      })
      .eq("id", photo.id);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to request approval",
        variant: "destructive",
      });
    } else {
      setPhotos((cur) =>
        cur.map((p) =>
          p.id === photo.id
            ? {
                ...p,
                photo_approval_status: "pending" as ApprovalStatus,
                photo_approval_requested_at: now,
              }
            : p,
        ),
      );
      toast({ title: "Approval requested" });
    }
    setSavingId(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4
          className="text-sm font-semibold"
          style={{ fontFamily: "Lexend, sans-serif", color: "#1e2d4a" }}
        >
          Job Photos
        </h4>
        {isContractor && (
          <Button
            size="sm"
            onClick={() => setUploadOpen(true)}
            className="hover:opacity-90 transition-opacity"
            style={{ backgroundColor: "#f07820", color: "#fff" }}
          >
            <Upload className="h-4 w-4 mr-1.5" />
            Upload
          </Button>
        )}
      </div>

      {/* Tag filter bar */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTag(null)}
            className={`px-2.5 py-0.5 rounded-full text-xs border transition-colors ${
              !activeTag
                ? "bg-[#1e2d4a] border-[#1e2d4a] text-white"
                : "border-muted-foreground/30 text-muted-foreground hover:border-[#1e2d4a] hover:text-[#1e2d4a]"
            }`}
          >
            All
          </button>
          {allTags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => setActiveTag(tag === activeTag ? null : tag)}
              className={`px-2.5 py-0.5 rounded-full text-xs border transition-colors ${
                activeTag === tag
                  ? "bg-[#f07820] border-[#f07820] text-white"
                  : "border-muted-foreground/30 text-muted-foreground hover:border-[#f07820] hover:text-[#f07820]"
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="py-8 text-center text-sm text-muted-foreground">
          <ImageIcon className="h-8 w-8 mx-auto mb-2 opacity-40" />
          {activeTag
            ? `No photos tagged "${activeTag}"`
            : "No photos yet."}
        </div>
      )}

      {/* Photo grid */}
      {filtered.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.map((photo) => {
            const isSaving = savingId === photo.id;
            return (
              <div
                key={photo.id}
                className="rounded-lg border bg-card overflow-hidden shadow-sm flex flex-col"
              >
                {/* Thumbnail */}
                <div className="relative aspect-square bg-muted flex items-center justify-center overflow-hidden">
                  {photo.file_type === "image" && photo.publicUrl ? (
                    <img
                      src={photo.publicUrl}
                      alt={photo.caption ?? "Job photo"}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <FileText className="h-10 w-10 text-muted-foreground/50" />
                  )}
                  {photo.portfolio && (
                    <span
                      className="absolute top-1.5 left-1.5 px-1.5 py-0.5 text-[10px] font-semibold rounded"
                      style={{ backgroundColor: "#f07820", color: "#fff" }}
                    >
                      Portfolio
                    </span>
                  )}
                </div>

                {/* Card body */}
                <div className="p-2 space-y-1.5 flex-1 flex flex-col justify-between">
                  <div className="space-y-1">
                    {photo.caption && (
                      <p className="text-xs text-foreground leading-tight line-clamp-2">
                        {photo.caption}
                      </p>
                    )}
                    {photo.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {photo.tags.map((t) => (
                          <span
                            key={t}
                            className="px-1.5 py-0.5 rounded text-[10px] bg-muted text-muted-foreground"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-1">
                      {photo.visibility === "customer" && (
                        <Badge
                          variant="secondary"
                          className="text-[10px] px-1 py-0"
                        >
                          Customer visible
                        </Badge>
                      )}
                      <ApprovalBadge status={photo.photo_approval_status} />
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {format(new Date(photo.created_at), "d MMM yyyy")}
                    </p>
                  </div>

                  {/* Contractor actions */}
                  {isContractor && (
                    <div className="flex flex-wrap items-center gap-1 pt-1">
                      <button
                        type="button"
                        title={
                          photo.visibility === "internal"
                            ? "Make customer-visible"
                            : "Make internal"
                        }
                        disabled={isSaving}
                        onClick={() => toggleVisibility(photo)}
                        className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground disabled:opacity-50"
                      >
                        {photo.visibility === "customer" ? (
                          <Eye className="h-3.5 w-3.5" />
                        ) : (
                          <EyeOff className="h-3.5 w-3.5" />
                        )}
                      </button>

                      <button
                        type="button"
                        title={
                          photo.portfolio
                            ? "Remove from portfolio"
                            : "Add to portfolio"
                        }
                        disabled={isSaving}
                        onClick={() => togglePortfolio(photo)}
                        className="p-1 rounded hover:bg-muted transition-colors disabled:opacity-50"
                      >
                        <Star
                          className="h-3.5 w-3.5"
                          style={{
                            color: photo.portfolio ? "#f07820" : undefined,
                          }}
                          fill={photo.portfolio ? "#f07820" : "none"}
                        />
                      </button>

                      {photo.portfolio &&
                        photo.photo_approval_status === "not_requested" && (
                          <button
                            type="button"
                            title="Request customer approval"
                            disabled={isSaving}
                            onClick={() => requestApproval(photo)}
                            className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground disabled:opacity-50"
                          >
                            <CheckCircle className="h-3.5 w-3.5" />
                          </button>
                        )}

                      <button
                        type="button"
                        title="Delete photo"
                        disabled={isSaving}
                        onClick={() => deletePhoto(photo)}
                        className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-red-600 disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>

                      {isSaving && (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Upload modal */}
      <Dialog
        open={uploadOpen}
        onOpenChange={(open) => {
          if (!uploading) {
            setUploadOpen(open);
            if (!open) resetUploadForm();
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle
              style={{ fontFamily: "Lexend, sans-serif", color: "#1e2d4a" }}
            >
              Upload Photo
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Drop zone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`rounded-lg border-2 border-dashed cursor-pointer transition-colors flex flex-col items-center justify-center py-8 text-center select-none ${
                dragging
                  ? "border-[#f07820] bg-orange-50"
                  : "border-muted-foreground/30 hover:border-[#f07820]"
              }`}
            >
              <Upload className="h-7 w-7 mb-2 text-muted-foreground" />
              {selectedFile ? (
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">
                    {selectedFile.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                  <button
                    type="button"
                    className="text-xs text-muted-foreground underline hover:text-foreground"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedFile(null);
                    }}
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    Drag and drop or click to select
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    JPG, PNG, WEBP, PDF — max 10 MB
                  </p>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".jpg,.jpeg,.png,.webp,.pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileSelect(f);
                  e.target.value = "";
                }}
              />
            </div>

            {/* Caption */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Caption</label>
              <Textarea
                placeholder="Optional caption..."
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={2}
              />
            </div>

            {/* Tags */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Tags</label>
              <div className="flex gap-2">
                <Input
                  placeholder="Add a tag..."
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addTag}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add
                </Button>
              </div>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {tags.map((t) => (
                    <span
                      key={t}
                      className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-muted text-foreground"
                    >
                      {t}
                      <button
                        type="button"
                        onClick={() => removeTag(t)}
                        className="hover:text-destructive transition-colors"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Visibility toggle */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Visibility</label>
              <div className="flex rounded-md border overflow-hidden">
                <button
                  type="button"
                  onClick={() => setVisibility("internal")}
                  className={`flex-1 py-1.5 text-sm transition-colors ${
                    visibility === "internal"
                      ? "font-medium text-white"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                  style={
                    visibility === "internal"
                      ? { backgroundColor: "#1e2d4a" }
                      : undefined
                  }
                >
                  Internal only
                </button>
                <button
                  type="button"
                  onClick={() => setVisibility("customer")}
                  className={`flex-1 py-1.5 text-sm transition-colors ${
                    visibility === "customer"
                      ? "font-medium text-white"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                  style={
                    visibility === "customer"
                      ? { backgroundColor: "#1e2d4a" }
                      : undefined
                  }
                >
                  Customer visible
                </button>
              </div>
            </div>

            <Button
              className="w-full hover:opacity-90 transition-opacity"
              disabled={!selectedFile || uploading}
              onClick={handleUpload}
              style={{ backgroundColor: "#f07820", color: "#fff" }}
            >
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Uploading...
                </>
              ) : (
                "Upload"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
