import { useState, useRef, Fragment } from "react";
import type { CSSProperties, ChangeEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Loader2,
  Paperclip,
  Plus,
  Trash2,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

type ScoringCriterion = { label: string; weight: number };

type Phase = {
  id: string;
  title: string;
  description: string;
  cost: string;
  duration: string;
  start_date: string;
};

type MaterialsResp = "contractor" | "client" | "mixed";

interface FormState {
  phases: Phase[];
  timeline_start: string;
  timeline_end: string;
  materials_responsibility: MaterialsResp;
  payment_terms: string;
}

interface Props {
  projectId: string;
  scoringCriteria: ScoringCriterion[];
  onSuccess: () => void;
  onCancel: () => void;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const STEPS = ["Phases", "Timeline", "Attachments", "Review"] as const;

const MATERIALS_OPTIONS: { value: MaterialsResp; label: string; desc: string }[] = [
  {
    value: "contractor",
    label: "Contractor supplied",
    desc: "Your business will supply all materials for this project",
  },
  {
    value: "client",
    label: "Client supplied",
    desc: "The client will provide all materials",
  },
  {
    value: "mixed",
    label: "Mixed",
    desc: "Materials responsibility is shared or varies by phase",
  },
];

// ── Design tokens — identical to PostTenderForm ────────────────────────────────

const T = {
  bg: "#0f1b2d",
  card: "#1a2942",
  cardInner: "rgba(255,255,255,0.03)",
  border: "rgba(255,255,255,0.08)",
  muted: "rgba(255,255,255,0.50)",
  label: "rgba(255,255,255,0.80)",
  white: "#ffffff",
  accent: "#f07820",
  danger: "#f87171",
} as const;

const inputBase: CSSProperties = {
  background: "rgba(255,255,255,0.05)",
  border: `1px solid ${T.border}`,
  color: T.white,
  borderRadius: 6,
};

const labelCss: CSSProperties = {
  color: T.label,
  fontSize: 13,
  fontWeight: 500,
  display: "block",
  marginBottom: 6,
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatGBP(n: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDate(iso: string) {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function newPhase(): Phase {
  return {
    id: crypto.randomUUID(),
    title: "",
    description: "",
    cost: "",
    duration: "",
    start_date: "",
  };
}

// ── Component ──────────────────────────────────────────────────────────────────

export function SubmitProposalForm({
  projectId,
  onSuccess,
  onCancel,
}: Props) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);

  const [form, setForm] = useState<FormState>({
    phases: [newPhase()],
    timeline_start: "",
    timeline_end: "",
    materials_responsibility: "contractor",
    payment_terms: "",
  });

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(f => ({ ...f, [key]: value }));
  }

  // ── Phase helpers ─────────────────────────────────────────────────────────────

  function updatePhase(index: number, field: keyof Phase, value: string) {
    setField(
      "phases",
      form.phases.map((p, i) => (i === index ? { ...p, [field]: value } : p)),
    );
  }

  function addPhase() {
    if (form.phases.length >= 10) return;
    setField("phases", [...form.phases, newPhase()]);
  }

  function removePhase(index: number) {
    if (form.phases.length <= 1) return;
    setField("phases", form.phases.filter((_, i) => i !== index));
  }

  function movePhase(index: number, dir: "up" | "down") {
    const arr = [...form.phases];
    if (dir === "up" && index > 0) {
      [arr[index - 1], arr[index]] = [arr[index], arr[index - 1]];
    } else if (dir === "down" && index < arr.length - 1) {
      [arr[index], arr[index + 1]] = [arr[index + 1], arr[index]];
    }
    setField("phases", arr);
  }

  // ── Attachment helpers ────────────────────────────────────────────────────────

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    const slots = 3 - attachments.length;
    if (slots <= 0) return;
    const pdfs = files.filter(f => f.type === "application/pdf").slice(0, slots);
    setAttachments(prev => [...prev, ...pdfs]);
    e.target.value = "";
  }

  function removeAttachment(index: number) {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  }

  // ── Step validation ───────────────────────────────────────────────────────────

  function stepValid(): boolean {
    switch (step) {
      case 0:
        if (form.phases.length === 0) return false;
        return form.phases.every(p => {
          const cost = parseFloat(p.cost);
          const dur = parseInt(p.duration, 10);
          return (
            p.title.trim().length > 0 &&
            !isNaN(cost) &&
            cost > 0 &&
            !isNaN(dur) &&
            dur > 0 &&
            p.start_date.length > 0
          );
        });
      case 1:
        if (!form.timeline_start || !form.timeline_end) return false;
        return form.timeline_end > form.timeline_start;
      default:
        return true;
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────────

  const totalCost = form.phases.reduce((s, p) => {
    const v = parseFloat(p.cost);
    return s + (isNaN(v) ? 0 : v);
  }, 0);

  const today = new Date().toISOString().split("T")[0];

  // ── Submit ────────────────────────────────────────────────────────────────────

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Two-step profile lookup — never use auth.uid() as profiles.id directly
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .single();
      if (profileError || !profile) throw new Error("Could not load your profile");

      const phasesPayload = form.phases.map(p => ({
        title: p.title.trim(),
        description: p.description.trim() || null,
        cost: parseFloat(p.cost),
        duration_days: parseInt(p.duration, 10),
        start_date: p.start_date,
      }));

      const { data: proposal, error: proposalError } = await supabase
        .from("project_proposals")
        .insert({
          project_id: projectId,
          contractor_id: profile.id,
          status: "submitted",
          submitted_at: new Date().toISOString(),
          phases: phasesPayload,
          total_cost: totalCost,
          timeline_start: form.timeline_start,
          timeline_end: form.timeline_end,
          materials_responsibility: form.materials_responsibility,
          payment_terms: form.payment_terms.trim() || null,
          weighted_score: null,
        })
        .select("id")
        .single();

      if (proposalError || !proposal) throw proposalError ?? new Error("Failed to create proposal");

      // Upload attachments — best effort after proposal is created
      for (const file of attachments) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${proposal.id}/${Date.now()}-${safeName}`;

        const { error: uploadError } = await supabase.storage
          .from("proposal-attachments")
          .upload(path, file, { contentType: "application/pdf" });

        if (uploadError) continue;

        const { data: urlData } = supabase.storage
          .from("proposal-attachments")
          .getPublicUrl(path);

        await supabase.from("proposal_attachments").insert({
          proposal_id: proposal.id,
          file_name: file.name,
          file_url: urlData.publicUrl,
        });
      }

      onSuccess();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "An unexpected error occurred";
      toast({
        title: "Failed to submit proposal",
        description: message,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div style={{ background: T.bg, minHeight: "100vh", padding: "32px 16px" }}>
      {/* Page header */}
      <div style={{ maxWidth: 720, margin: "0 auto 32px" }}>
        <h1 className="font-heading" style={{ color: T.white, fontSize: 22, fontWeight: 700, margin: 0 }}>
          Submit a Proposal
        </h1>
        <p style={{ color: T.muted, fontSize: 14, marginTop: 6, marginBottom: 0 }}>
          Complete all steps to submit your proposal for this project.
        </p>
      </div>

      {/* Progress indicator */}
      <div style={{ maxWidth: 720, margin: "0 auto 32px" }}>
        <div style={{ display: "flex", alignItems: "flex-start" }}>
          {STEPS.map((label, i) => (
            <Fragment key={i}>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 6,
                  width: 80,
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: i <= step ? T.accent : "rgba(255,255,255,0.08)",
                    border: `2px solid ${i <= step ? T.accent : T.border}`,
                    color: i <= step ? T.white : T.muted,
                    fontWeight: 700,
                    fontSize: 13,
                    transition: "all 0.2s",
                    flexShrink: 0,
                  }}
                >
                  {i < step ? <Check size={14} /> : i + 1}
                </div>
                <span
                  style={{
                    fontSize: 10,
                    color: i === step ? T.accent : T.muted,
                    whiteSpace: "nowrap",
                    fontWeight: i === step ? 600 : 400,
                  }}
                >
                  {label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  style={{
                    flex: 1,
                    height: 2,
                    marginTop: 15,
                    background: i < step ? T.accent : T.border,
                    transition: "background 0.2s",
                  }}
                />
              )}
            </Fragment>
          ))}
        </div>
      </div>

      {/* Card */}
      <div
        style={{
          maxWidth: 720,
          margin: "0 auto",
          background: T.card,
          borderRadius: 12,
          padding: 32,
          border: `1px solid ${T.border}`,
        }}
      >
        {/* ── Step 0: Phases ── */}
        {step === 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <StepHeader
              title="Project Phases"
              sub="Break your proposal into phases. Each phase needs a title, cost, duration, and start date."
            />

            {form.phases.map((phase, i) => (
              <div
                key={phase.id}
                style={{
                  background: T.cardInner,
                  border: `1px solid ${T.border}`,
                  borderRadius: 10,
                  padding: 20,
                }}
              >
                {/* Phase header row */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 16,
                  }}
                >
                  <span
                    style={{
                      color: T.accent,
                      fontSize: 12,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    Phase {i + 1}
                  </span>
                  <div style={{ display: "flex", gap: 4 }}>
                    <IconBtn
                      onClick={() => movePhase(i, "up")}
                      disabled={i === 0}
                      title="Move up"
                    >
                      <ChevronUp size={14} />
                    </IconBtn>
                    <IconBtn
                      onClick={() => movePhase(i, "down")}
                      disabled={i === form.phases.length - 1}
                      title="Move down"
                    >
                      <ChevronDown size={14} />
                    </IconBtn>
                    <IconBtn
                      onClick={() => removePhase(i)}
                      disabled={form.phases.length <= 1}
                      danger
                      title="Remove phase"
                    >
                      <Trash2 size={14} />
                    </IconBtn>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {/* Title */}
                  <div>
                    <label style={labelCss}>
                      Title <Required />
                    </label>
                    <Input
                      value={phase.title}
                      onChange={e => updatePhase(i, "title", e.target.value)}
                      placeholder="e.g. Groundworks and foundations"
                      style={inputBase}
                      maxLength={120}
                    />
                  </div>

                  {/* Description */}
                  <div>
                    <label style={labelCss}>
                      Description <Optional />
                    </label>
                    <Textarea
                      value={phase.description}
                      onChange={e => updatePhase(i, "description", e.target.value)}
                      placeholder="Describe the scope of work in this phase"
                      rows={2}
                      style={{ ...inputBase, resize: "vertical" }}
                    />
                  </div>

                  {/* Cost / Duration / Start date */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr 1fr",
                      gap: 12,
                    }}
                  >
                    <div>
                      <label style={labelCss}>
                        Cost (GBP) <Required />
                      </label>
                      <div style={{ position: "relative" }}>
                        <span
                          style={{
                            position: "absolute",
                            left: 10,
                            top: "50%",
                            transform: "translateY(-50%)",
                            color: T.muted,
                            fontSize: 14,
                            pointerEvents: "none",
                          }}
                        >
                          £
                        </span>
                        <Input
                          type="number"
                          min={0}
                          step={100}
                          value={phase.cost}
                          onChange={e => updatePhase(i, "cost", e.target.value)}
                          placeholder="0"
                          style={{ ...inputBase, paddingLeft: 24 }}
                        />
                      </div>
                    </div>

                    <div>
                      <label style={labelCss}>
                        Duration (days) <Required />
                      </label>
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        value={phase.duration}
                        onChange={e => updatePhase(i, "duration", e.target.value)}
                        placeholder="14"
                        style={inputBase}
                      />
                    </div>

                    <div>
                      <label style={labelCss}>
                        Start date <Required />
                      </label>
                      <input
                        type="date"
                        value={phase.start_date}
                        min={today}
                        onChange={e => updatePhase(i, "start_date", e.target.value)}
                        style={{
                          ...inputBase,
                          padding: "8px 10px",
                          fontSize: 14,
                          width: "100%",
                          colorScheme: "dark",
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {/* Add phase + total cost */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 12,
              }}
            >
              <button
                type="button"
                onClick={addPhase}
                disabled={form.phases.length >= 10}
                style={{
                  background: "transparent",
                  border: `1px solid ${form.phases.length >= 10 ? T.border : "rgba(255,255,255,0.2)"}`,
                  color: form.phases.length >= 10 ? T.muted : T.white,
                  borderRadius: 6,
                  padding: "7px 14px",
                  fontSize: 13,
                  cursor: form.phases.length >= 10 ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Plus size={14} />
                Add phase
                {form.phases.length >= 10 && (
                  <span style={{ color: T.muted, fontSize: 11 }}>(max 10)</span>
                )}
              </button>

              <div
                style={{
                  background: "rgba(240,120,32,0.08)",
                  border: "1px solid rgba(240,120,32,0.35)",
                  borderRadius: 8,
                  padding: "10px 16px",
                }}
              >
                <span style={{ color: T.muted, fontSize: 12 }}>Total cost </span>
                <span style={{ color: T.accent, fontSize: 18, fontWeight: 700 }}>
                  {formatGBP(totalCost)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ── Step 1: Timeline & Materials ── */}
        {step === 1 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <StepHeader
              title="Timeline & Materials"
              sub="Set your overall project timeline and clarify materials responsibility."
            />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <label style={labelCss}>
                  Overall start date <Required />
                </label>
                <input
                  type="date"
                  value={form.timeline_start}
                  min={today}
                  onChange={e => setField("timeline_start", e.target.value)}
                  style={{
                    ...inputBase,
                    padding: "8px 10px",
                    fontSize: 14,
                    width: "100%",
                    colorScheme: "dark",
                  }}
                />
              </div>
              <div>
                <label style={labelCss}>
                  Overall end date <Required />
                </label>
                <input
                  type="date"
                  value={form.timeline_end}
                  min={form.timeline_start || today}
                  onChange={e => setField("timeline_end", e.target.value)}
                  style={{
                    ...inputBase,
                    padding: "8px 10px",
                    fontSize: 14,
                    width: "100%",
                    colorScheme: "dark",
                  }}
                />
                {form.timeline_start &&
                  form.timeline_end &&
                  form.timeline_end <= form.timeline_start && (
                    <p style={{ color: T.danger, fontSize: 12, marginTop: 4 }}>
                      End date must be after start date
                    </p>
                  )}
              </div>
            </div>

            <div>
              <label style={labelCss}>
                Materials responsibility <Required />
              </label>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
                {MATERIALS_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setField("materials_responsibility", opt.value)}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 12,
                      background:
                        form.materials_responsibility === opt.value
                          ? "rgba(240,120,32,0.08)"
                          : "rgba(255,255,255,0.03)",
                      border: `1px solid ${
                        form.materials_responsibility === opt.value ? T.accent : T.border
                      }`,
                      borderRadius: 8,
                      padding: "12px 16px",
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "all 0.15s",
                    }}
                  >
                    <div
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: "50%",
                        marginTop: 2,
                        flexShrink: 0,
                        border: `2px solid ${
                          form.materials_responsibility === opt.value
                            ? T.accent
                            : "rgba(255,255,255,0.3)"
                        }`,
                        background:
                          form.materials_responsibility === opt.value ? T.accent : "transparent",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        transition: "all 0.15s",
                      }}
                    >
                      {form.materials_responsibility === opt.value && (
                        <div
                          style={{ width: 6, height: 6, borderRadius: "50%", background: T.white }}
                        />
                      )}
                    </div>
                    <div>
                      <p style={{ color: T.white, fontSize: 14, fontWeight: 600, margin: 0 }}>
                        {opt.label}
                      </p>
                      <p style={{ color: T.muted, fontSize: 13, margin: "3px 0 0" }}>
                        {opt.desc}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label style={labelCss}>
                Payment terms <Optional />
              </label>
              <Textarea
                value={form.payment_terms}
                onChange={e => setField("payment_terms", e.target.value)}
                placeholder="e.g. 30% on commencement, 40% at practical completion, 30% on final sign-off"
                rows={3}
                style={{ ...inputBase, resize: "vertical" }}
              />
            </div>
          </div>
        )}

        {/* ── Step 2: Attachments ── */}
        {step === 2 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <StepHeader
              title="Attachments"
              sub="Upload up to 3 PDF documents to support your proposal — method statements, programme of works, references, etc."
            />

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              multiple
              style={{ display: "none" }}
              onChange={handleFileChange}
            />

            {attachments.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {attachments.map((file, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      background: T.cardInner,
                      border: `1px solid ${T.border}`,
                      borderRadius: 8,
                      padding: "10px 14px",
                    }}
                  >
                    <Paperclip size={14} style={{ color: T.muted, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p
                        style={{
                          color: T.white,
                          fontSize: 13,
                          margin: 0,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {file.name}
                      </p>
                      <p style={{ color: T.muted, fontSize: 11, margin: "2px 0 0" }}>
                        {formatFileSize(file.size)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeAttachment(i)}
                      style={{
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        color: T.danger,
                        padding: 4,
                        display: "flex",
                        borderRadius: 4,
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {attachments.length < 3 && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: `2px dashed ${T.border}`,
                  borderRadius: 10,
                  padding: "28px 20px",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  transition: "border-color 0.15s",
                }}
                onMouseEnter={e =>
                  (e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)")
                }
                onMouseLeave={e => (e.currentTarget.style.borderColor = T.border)}
              >
                <Paperclip size={20} style={{ color: T.muted }} />
                <p style={{ color: T.label, fontSize: 14, margin: 0, fontWeight: 500 }}>
                  {attachments.length === 0 ? "Select PDF files" : "Add another PDF"}
                </p>
                <p style={{ color: T.muted, fontSize: 12, margin: 0 }}>
                  PDF only · {3 - attachments.length} slot
                  {3 - attachments.length !== 1 ? "s" : ""} remaining
                </p>
              </button>
            )}

            {attachments.length === 0 && (
              <p style={{ color: T.muted, fontSize: 12, margin: 0 }}>
                Attachments are optional. You can proceed to review without uploading any files.
              </p>
            )}
          </div>
        )}

        {/* ── Step 3: Review & Submit ── */}
        {step === 3 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <StepHeader
              title="Review & Submit"
              sub="Check all details before submitting. Your proposal will be sent to the client immediately."
            />

            {/* Phases */}
            <div>
              <p
                style={{
                  color: T.accent,
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.07em",
                  margin: "0 0 8px",
                }}
              >
                Project Phases
              </p>
              <div
                style={{
                  background: T.cardInner,
                  borderRadius: 8,
                  border: `1px solid ${T.border}`,
                  overflow: "hidden",
                }}
              >
                {form.phases.map((p, i) => (
                  <div
                    key={p.id}
                    style={{
                      padding: "12px 16px",
                      borderBottom:
                        i < form.phases.length - 1 ? `1px solid ${T.border}` : "none",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "baseline",
                        justifyContent: "space-between",
                        gap: 8,
                        marginBottom: p.description ? 4 : 2,
                      }}
                    >
                      <span style={{ color: T.white, fontSize: 13, fontWeight: 600 }}>
                        {i + 1}. {p.title}
                      </span>
                      <span
                        style={{ color: T.accent, fontSize: 13, fontWeight: 700, flexShrink: 0 }}
                      >
                        {formatGBP(parseFloat(p.cost) || 0)}
                      </span>
                    </div>
                    {p.description && (
                      <p style={{ color: T.muted, fontSize: 12, margin: "0 0 4px" }}>
                        {p.description}
                      </p>
                    )}
                    <p style={{ color: T.muted, fontSize: 12, margin: 0 }}>
                      {p.duration} day{parseInt(p.duration, 10) !== 1 ? "s" : ""} · Starts{" "}
                      {formatDate(p.start_date)}
                    </p>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
                <div
                  style={{
                    background: "rgba(240,120,32,0.08)",
                    border: "1px solid rgba(240,120,32,0.35)",
                    borderRadius: 8,
                    padding: "8px 16px",
                  }}
                >
                  <span style={{ color: T.muted, fontSize: 12 }}>Total cost </span>
                  <span style={{ color: T.accent, fontSize: 16, fontWeight: 700 }}>
                    {formatGBP(totalCost)}
                  </span>
                </div>
              </div>
            </div>

            {/* Timeline & Materials */}
            <div>
              <p
                style={{
                  color: T.accent,
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.07em",
                  margin: "0 0 8px",
                }}
              >
                Timeline &amp; Materials
              </p>
              <div
                style={{
                  background: T.cardInner,
                  borderRadius: 8,
                  border: `1px solid ${T.border}`,
                  overflow: "hidden",
                }}
              >
                {(
                  [
                    ["Start date", formatDate(form.timeline_start)],
                    ["End date", formatDate(form.timeline_end)],
                    [
                      "Materials",
                      MATERIALS_OPTIONS.find(o => o.value === form.materials_responsibility)
                        ?.label ?? "—",
                    ],
                    ["Payment terms", form.payment_terms.trim() || "—"],
                  ] as [string, string][]
                ).map(([label, value], i, arr) => (
                  <div
                    key={i}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "160px 1fr",
                      padding: "10px 16px",
                      borderBottom: i < arr.length - 1 ? `1px solid ${T.border}` : "none",
                      alignItems: "baseline",
                    }}
                  >
                    <span style={{ color: T.muted, fontSize: 13 }}>{label}</span>
                    <span style={{ color: T.white, fontSize: 13, wordBreak: "break-word" }}>
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Attachments */}
            <div>
              <p
                style={{
                  color: T.accent,
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.07em",
                  margin: "0 0 8px",
                }}
              >
                Attachments
              </p>
              {attachments.length === 0 ? (
                <p style={{ color: T.muted, fontSize: 13 }}>None</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {attachments.map((file, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        background: T.cardInner,
                        border: `1px solid ${T.border}`,
                        borderRadius: 8,
                        padding: "8px 14px",
                      }}
                    >
                      <Paperclip size={13} style={{ color: T.muted, flexShrink: 0 }} />
                      <span style={{ color: T.white, fontSize: 13, flex: 1, minWidth: 0 }}>
                        {file.name}
                      </span>
                      <span style={{ color: T.muted, fontSize: 11, flexShrink: 0 }}>
                        {formatFileSize(file.size)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div
        style={{
          maxWidth: 720,
          margin: "24px auto 0",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Button
          variant="outline"
          onClick={step === 0 ? onCancel : () => setStep(s => s - 1)}
          style={{
            borderColor: "rgba(255,255,255,0.2)",
            color: T.white,
            background: "transparent",
          }}
        >
          <ChevronLeft size={16} style={{ marginRight: 4 }} />
          {step === 0 ? "Cancel" : "Back"}
        </Button>

        <span style={{ color: T.muted, fontSize: 13 }}>
          Step {step + 1} of {STEPS.length}
        </span>

        {step < STEPS.length - 1 ? (
          <Button
            onClick={() => setStep(s => s + 1)}
            disabled={!stepValid()}
            style={{
              background: stepValid() ? T.accent : "rgba(255,255,255,0.08)",
              color: stepValid() ? T.white : T.muted,
              border: "none",
              transition: "all 0.2s",
            }}
          >
            Next
            <ChevronRight size={16} style={{ marginLeft: 4 }} />
          </Button>
        ) : (
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            style={{ background: T.accent, color: T.white, border: "none", minWidth: 160 }}
          >
            {submitting ? (
              <>
                <Loader2 size={16} className="animate-spin" style={{ marginRight: 8 }} />
                Submitting...
              </>
            ) : (
              "Submit Proposal"
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StepHeader({ title, sub }: { title: string; sub: string }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <h2 className="font-heading" style={{ color: T.white, fontSize: 18, fontWeight: 600, margin: "0 0 4px" }}>
        {title}
      </h2>
      <p style={{ color: T.muted, fontSize: 13, margin: 0 }}>{sub}</p>
    </div>
  );
}

function Required() {
  return <span style={{ color: T.accent, marginLeft: 2 }}>*</span>;
}

function Optional() {
  return (
    <span style={{ color: T.muted, fontWeight: 400, marginLeft: 6, fontSize: 12 }}>
      (optional)
    </span>
  );
}

function IconBtn({
  onClick,
  disabled,
  danger,
  title,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        background: "transparent",
        border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        color: disabled
          ? "rgba(255,255,255,0.15)"
          : danger
          ? T.danger
          : "rgba(255,255,255,0.6)",
        padding: "4px 6px",
        borderRadius: 4,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "color 0.15s",
      }}
    >
      {children}
    </button>
  );
}
