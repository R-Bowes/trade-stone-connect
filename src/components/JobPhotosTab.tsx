import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useSignedPhotoUrls } from "@/hooks/useSignedPhotoUrls";
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
}

const ACCEPTED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];
const MAX_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_BATCH = 10;

// iOS reports HEIC inconsistently — sometimes "image/heic"/"image/heif",
// sometimes a blank type when the file arrives via the Files app rather
// than the native Photos picker (accept=".jpg,.jpeg,..." doesn't reliably
// trigger the picker's own JPEG handoff the way accept="image/*" does).
// Checking the extension too catches the case a browser mis-reports.
function isHeic(file: File): boolean {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  return type === "image/heic" || type === "image/heif" || name.endsWith(".heic") || name.endsWith(".heif");
}

async function convertHeicToJpeg(file: File): Promise<File> {
  const heic2any = (await import("heic2any")).default;
  const result = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.85 });
  const blob = Array.isArray(result) ? result[0] : result;
  const stem = file.name.replace(/\.[^./]+$/, "");
  return new File([blob], `${stem}.jpg`, { type: "image/jpeg" });
}

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
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [caption, setCaption] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [visibility, setVisibility] = useState<Visibility>("internal");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
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

    const withTags: JobPhoto[] = (data || []).map((row: any) => ({
      ...row,
      tags: Array.isArray(row.tags) ? row.tags : [],
    } as JobPhoto));

    setPhotos(withTags);
    setLoading(false);
  };

  useEffect(() => {
    loadPhotos();
  }, [jobId]);

  // job-photos is a private bucket — getPublicUrl() constructs a URL that
  // 400s against it (same reason EnquiryPhotoThumbnails signs). Batch-sign
  // every visible image's storage_path.
  const imagePaths = useMemo(
    () => photos.filter((p) => p.file_type === "image").map((p) => p.storage_path),
    [photos],
  );
  const { urls: signedUrls } = useSignedPhotoUrls("job-photos", imagePaths);

  const allTags = Array.from(new Set(photos.flatMap((p) => p.tags)));

  const filtered = activeTag
    ? photos.filter((p) => p.tags.includes(activeTag))
    : photos;

  const handleFilesSelect = (fileList: FileList) => {
    let files = Array.from(fileList);

    if (files.length > MAX_BATCH) {
      toast({
        title: "Too many files",
        description: `You can upload up to ${MAX_BATCH} at once — only the first ${MAX_BATCH} were kept.`,
        variant: "destructive",
      });
      files = files.slice(0, MAX_BATCH);
    }

    const valid: File[] = [];
    const rejected: string[] = [];
    for (const file of files) {
      if (!isHeic(file) && !ACCEPTED_TYPES.includes(file.type)) {
        rejected.push(`${file.name} (unsupported type)`);
        continue;
      }
      if (file.size > MAX_SIZE_BYTES) {
        rejected.push(`${file.name} (over 10 MB)`);
        continue;
      }
      valid.push(file);
    }

    if (rejected.length > 0) {
      toast({
        title: rejected.length === files.length ? "No files added" : "Some files were skipped",
        description: rejected.join(", "),
        variant: "destructive",
      });
    }

    setSelectedFiles(valid);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length > 0) handleFilesSelect(e.dataTransfer.files);
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) setTags((prev) => [...prev, t]);
    setTagInput("");
  };

  const removeTag = (t: string) =>
    setTags((prev) => prev.filter((x) => x !== t));

  const resetUploadForm = () => {
    setSelectedFiles([]);
    setCaption("");
    setTags([]);
    setTagInput("");
    setVisibility("internal");
    setUploadProgress(null);
  };

  const uploadOne = async (fileIn: File, index: number) => {
    let file = fileIn;
    if (isHeic(file)) {
      file = await convertHeicToJpeg(file);
    }

    const ext = file.name.split(".").pop() ?? "bin";
    // storage.objects' upload/delete RLS requires the path's first folder
    // segment to be the uploader's own auth.uid() — contractorProfileId is
    // that value (profiles.id == profiles.user_id == auth.uid() by
    // construction). A path of just `${jobId}/...` was silently rejected
    // by RLS before ever reaching the DB insert this file's photo_url bug
    // masked as the whole story. `-${index}` keeps paths unique within a
    // batch even if two uploads land in the same millisecond.
    const path = `${contractorProfileId}/${jobId}/${Date.now()}-${index}.${ext}`;
    const fileType: FileType = file.type === "application/pdf" ? "pdf" : "image";

    const { error: storageError } = await supabase.storage.from("job-photos").upload(path, file);
    if (storageError) throw new Error(storageError.message);

    const { error: dbError } = await (supabase as any).from("job_photos").insert({
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
      throw new Error(dbError.message);
    }
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;
    setUploading(true);

    let succeeded = 0;
    const failures: string[] = [];

    for (let i = 0; i < selectedFiles.length; i++) {
      setUploadProgress({ current: i + 1, total: selectedFiles.length });
      try {
        await uploadOne(selectedFiles[i], i);
        succeeded++;
      } catch (err) {
        failures.push(`${selectedFiles[i].name}: ${err instanceof Error ? err.message : "unknown error"}`);
      }
    }

    setUploadProgress(null);

    if (succeeded > 0) {
      toast({
        title: `${succeeded} photo${succeeded !== 1 ? "s" : ""} uploaded`,
        description: failures.length > 0 ? `${failures.length} failed — ${failures.join("; ")}` : undefined,
        variant: failures.length > 0 ? "destructive" : undefined,
      });
      setUploadOpen(false);
      resetUploadForm();
      await loadPhotos();
    } else {
      toast({ title: "Upload failed", description: failures.join("; "), variant: "destructive" });
    }

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
                  {photo.file_type === "image" && signedUrls[photo.storage_path] ? (
                    <img
                      src={signedUrls[photo.storage_path]}
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
              {selectedFiles.length > 0 ? (
                <div className="space-y-1.5 w-full px-4">
                  <p className="text-sm font-medium text-foreground">
                    {selectedFiles.length} file{selectedFiles.length !== 1 ? "s" : ""} selected
                  </p>
                  <ul className="max-h-24 overflow-y-auto text-left space-y-0.5">
                    {selectedFiles.map((f, i) => (
                      <li key={`${f.name}-${i}`} className="text-xs text-muted-foreground truncate">
                        {f.name} · {(f.size / 1024 / 1024).toFixed(2)} MB
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    className="text-xs text-muted-foreground underline hover:text-foreground"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedFiles([]);
                    }}
                  >
                    Clear selection
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    Drag and drop or click to select
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Photos (HEIC converted automatically) or PDF — up to {MAX_BATCH} files, max 10 MB each
                  </p>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) handleFilesSelect(e.target.files);
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
              disabled={selectedFiles.length === 0 || uploading}
              onClick={handleUpload}
              style={{ backgroundColor: "#f07820", color: "#fff" }}
            >
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  {uploadProgress ? `Uploading ${uploadProgress.current} of ${uploadProgress.total}…` : "Uploading..."}
                </>
              ) : (
                `Upload${selectedFiles.length > 1 ? ` ${selectedFiles.length} photos` : ""}`
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
