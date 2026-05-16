import { useState, Fragment } from "react";
import type { CSSProperties } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Check, ChevronLeft, ChevronRight, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { CONTRACTOR_TRADES } from "@/constants/trades";

const STEPS = ["Details", "Trades", "Budget", "Scoring", "Visibility", "Review"] as const;

type ScoringCriterion = { label: string; weight: number };

interface FormState {
  title: string;
  description: string;
  address_line_1: string;
  address_line_2: string;
  city: string;
  postcode: string;
  trade_categories: string[];
  useLeadContractor: boolean;
  leadContractorCode: string;
  budget: string;
  budget_visible_to_contractors: boolean;
  deposit_required: boolean;
  deposit_percentage: string;
  retention_percentage: string;
  scoring_criteria: ScoringCriterion[];
  visibility: "open" | "restricted";
  proposal_deadline: string;
}

const DEFAULT_CRITERIA: ScoringCriterion[] = [
  { label: "Price", weight: 40 },
  { label: "Timeline", weight: 30 },
  { label: "Experience", weight: 30 },
];

interface Props {
  onSuccess?: () => void;
}

// ── Design tokens ──────────────────────────────────────────────────────────────
const T = {
  bg: "#0f1b2d",
  card: "#1a2942",
  cardInner: "rgba(255,255,255,0.03)",
  border: "rgba(255,255,255,0.08)",
  borderHover: "rgba(255,255,255,0.16)",
  muted: "rgba(255,255,255,0.50)",
  label: "rgba(255,255,255,0.80)",
  white: "#ffffff",
  accent: "#f07820",
  danger: "#f87171",
  success: "#4ade80",
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

// ── Component ──────────────────────────────────────────────────────────────────
export function PostTenderForm({ onSuccess }: Props) {
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [tradeSearch, setTradeSearch] = useState("");

  // Lead contractor lookup state
  const [leadContractorId, setLeadContractorId] = useState<string | null>(null);
  const [leadContractorName, setLeadContractorName] = useState("");
  const [leadContractorError, setLeadContractorError] = useState("");
  const [lookingUp, setLookingUp] = useState(false);

  const [form, setForm] = useState<FormState>({
    title: "",
    description: "",
    address_line_1: "",
    address_line_2: "",
    city: "",
    postcode: "",
    trade_categories: [],
    useLeadContractor: false,
    leadContractorCode: "",
    budget: "",
    budget_visible_to_contractors: true,
    deposit_required: false,
    deposit_percentage: "",
    retention_percentage: "",
    scoring_criteria: [...DEFAULT_CRITERIA],
    visibility: "open",
    proposal_deadline: "",
  });

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(f => ({ ...f, [key]: value }));
  }

  // ── Step validation ───────────────────────────────────────────────────────────
  function stepValid(): boolean {
    switch (step) {
      case 0:
        return (
          form.title.trim().length > 0 &&
          form.description.trim().length > 0 &&
          form.address_line_1.trim().length > 0 &&
          form.city.trim().length > 0 &&
          form.postcode.trim().length > 0
        );
      case 1:
        return form.useLeadContractor
          ? !!leadContractorId
          : form.trade_categories.length > 0;
      case 2: {
        const b = parseFloat(form.budget);
        if (!form.budget || isNaN(b) || b <= 0) return false;
        if (form.deposit_required) {
          const dp = parseFloat(form.deposit_percentage);
          if (!form.deposit_percentage || isNaN(dp) || dp <= 0 || dp > 100) return false;
        }
        return true;
      }
      case 3: {
        const total = form.scoring_criteria.reduce((s, c) => s + c.weight, 0);
        return (
          form.scoring_criteria.length > 0 &&
          form.scoring_criteria.every(c => c.label.trim().length > 0 && c.weight > 0) &&
          total === 100
        );
      }
      case 4:
        return !!form.visibility && !!form.proposal_deadline;
      default:
        return true;
    }
  }

  // ── Lead contractor lookup ────────────────────────────────────────────────────
  async function lookupLeadContractor() {
    const code = form.leadContractorCode.trim().toUpperCase();
    if (!code) return;
    setLookingUp(true);
    setLeadContractorError("");
    setLeadContractorId(null);
    setLeadContractorName("");

    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, company_name, user_type")
      .eq("ts_profile_code", code)
      .maybeSingle();

    setLookingUp(false);

    if (!data) {
      setLeadContractorError("No contractor found with that TS code.");
      return;
    }
    if (data.user_type !== "contractor") {
      setLeadContractorError("That profile is not a contractor account.");
      return;
    }
    setLeadContractorId(data.id);
    setLeadContractorName((data as { company_name?: string | null; full_name?: string | null }).company_name || data.full_name || code);
  }

  // ── Trade toggle ──────────────────────────────────────────────────────────────
  function toggleTrade(trade: string) {
    setField(
      "trade_categories",
      form.trade_categories.includes(trade)
        ? form.trade_categories.filter(t => t !== trade)
        : [...form.trade_categories, trade],
    );
  }

  // ── Scoring helpers ───────────────────────────────────────────────────────────
  function updateCriterion(index: number, field: "label" | "weight", raw: string) {
    const updated = form.scoring_criteria.map((c, i) =>
      i === index
        ? {
            ...c,
            [field]: field === "weight" ? (raw === "" ? 0 : Math.max(0, parseInt(raw, 10) || 0)) : raw,
          }
        : c,
    );
    setField("scoring_criteria", updated);
  }

  function addCriterion() {
    if (form.scoring_criteria.length >= 5) return;
    setField("scoring_criteria", [...form.scoring_criteria, { label: "", weight: 0 }]);
  }

  function removeCriterion(index: number) {
    if (form.scoring_criteria.length <= 1) return;
    setField("scoring_criteria", form.scoring_criteria.filter((_, i) => i !== index));
  }

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
        .select("id, user_type")
        .eq("user_id", user.id)
        .single();

      if (profileError || !profile) throw new Error("Could not load your profile");

      const budgetVal = parseFloat(form.budget);
      const depositPct =
        form.deposit_required && form.deposit_percentage
          ? parseFloat(form.deposit_percentage)
          : null;
      const depositAmt = depositPct != null ? (depositPct / 100) * budgetVal : null;
      const retentionPct = form.retention_percentage ? parseFloat(form.retention_percentage) : null;

      const { error } = await supabase.from("projects").insert({
        posted_by: profile.id,
        account_type: profile.user_type,
        tender_status: "open",
        title: form.title.trim(),
        description: form.description.trim(),
        address_line_1: form.address_line_1.trim(),
        address_line_2: form.address_line_2.trim() || null,
        city: form.city.trim(),
        postcode: form.postcode.trim().toUpperCase(),
        trade_categories: form.useLeadContractor ? [] : form.trade_categories,
        lead_contractor_id: form.useLeadContractor ? leadContractorId : null,
        budget: budgetVal,
        budget_visible_to_contractors: form.budget_visible_to_contractors,
        deposit_required: form.deposit_required,
        deposit_percentage: depositPct,
        deposit_amount: depositAmt,
        retention_percentage: retentionPct,
        scoring_criteria: form.scoring_criteria,
        visibility: form.visibility,
        proposal_deadline: form.proposal_deadline || null,
      });

      if (error) throw error;

      toast({ title: "Tender posted", description: "Your project tender is now live." });
      onSuccess?.();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "An unexpected error occurred";
      toast({ title: "Failed to post tender", description: message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────
  const weightTotal = form.scoring_criteria.reduce((s, c) => s + c.weight, 0);
  const filteredTrades = CONTRACTOR_TRADES.filter(t =>
    t.toLowerCase().includes(tradeSearch.toLowerCase()),
  );
  const today = new Date().toISOString().split("T")[0];

  function formatDate(iso: string) {
    if (!iso) return "—";
    return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  function formatGBP(v: string | number) {
    const n = typeof v === "string" ? parseFloat(v) : v;
    if (!v || isNaN(n)) return "—";
    return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(n);
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div style={{ background: T.bg, minHeight: "100vh", padding: "32px 16px" }}>
      {/* Page header */}
      <div style={{ maxWidth: 720, margin: "0 auto 32px" }}>
        <h1 style={{ color: T.white, fontSize: 22, fontWeight: 700, margin: 0 }}>
          Post a Project Tender
        </h1>
        <p style={{ color: T.muted, fontSize: 14, marginTop: 6, marginBottom: 0 }}>
          Complete all steps to publish your tender and receive proposals from contractors.
        </p>
      </div>

      {/* ── Progress indicator ──────────────────────────────────────────────────── */}
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
                  width: 64,
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

      {/* ── Card ───────────────────────────────────────────────────────────────── */}
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
        {/* ── Step 0: Project Details ── */}
        {step === 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <StepHeader
              title="Project Details"
              sub="Describe your project so contractors understand the full scope."
            />

            <Field label="Project title" required>
              <Input
                value={form.title}
                onChange={e => setField("title", e.target.value)}
                placeholder="e.g. Full bathroom renovation — 3-bed semi-detached"
                style={inputBase}
                maxLength={150}
              />
            </Field>

            <Field label="Description" required>
              <Textarea
                value={form.description}
                onChange={e => setField("description", e.target.value)}
                placeholder="Describe the work required in detail — materials, access, current condition, any constraints."
                rows={5}
                style={{ ...inputBase, resize: "vertical" }}
              />
            </Field>

            <Field label="Address line 1" required>
              <Input
                value={form.address_line_1}
                onChange={e => setField("address_line_1", e.target.value)}
                placeholder="House number and street name"
                style={inputBase}
              />
            </Field>

            <Field label="Address line 2">
              <Input
                value={form.address_line_2}
                onChange={e => setField("address_line_2", e.target.value)}
                placeholder="Flat, suite, building (optional)"
                style={inputBase}
              />
            </Field>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 160px", gap: 16 }}>
              <Field label="City" required>
                <Input
                  value={form.city}
                  onChange={e => setField("city", e.target.value)}
                  placeholder="e.g. Manchester"
                  style={inputBase}
                />
              </Field>
              <Field label="Postcode" required>
                <Input
                  value={form.postcode}
                  onChange={e => setField("postcode", e.target.value.toUpperCase())}
                  placeholder="M1 1AE"
                  style={inputBase}
                />
              </Field>
            </div>
          </div>
        )}

        {/* ── Step 1: Trade Selection ── */}
        {step === 1 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <StepHeader
              title="Trade Selection"
              sub="Select the trades needed, or assign a specific lead contractor by their TS code."
            />

            <ToggleRow
              label="Assign a specific lead contractor"
              sub="Enter their TS contractor code to direct this tender to them"
              checked={form.useLeadContractor}
              onChange={v => {
                setField("useLeadContractor", v);
                if (!v) {
                  setLeadContractorId(null);
                  setLeadContractorName("");
                  setLeadContractorError("");
                }
              }}
            />

            {form.useLeadContractor ? (
              <div>
                <label style={labelCss}>
                  Contractor TS code <Required />
                </label>
                <div style={{ display: "flex", gap: 10 }}>
                  <Input
                    value={form.leadContractorCode}
                    onChange={e => {
                      setField("leadContractorCode", e.target.value.toUpperCase());
                      setLeadContractorId(null);
                      setLeadContractorName("");
                      setLeadContractorError("");
                    }}
                    placeholder="e.g. TS-C-4AE203"
                    style={inputBase}
                    onKeyDown={e => e.key === "Enter" && lookupLeadContractor()}
                  />
                  <Button
                    onClick={lookupLeadContractor}
                    disabled={!form.leadContractorCode.trim() || lookingUp}
                    style={{ background: T.accent, color: T.white, border: "none", flexShrink: 0 }}
                  >
                    {lookingUp ? <Loader2 size={16} className="animate-spin" /> : "Look up"}
                  </Button>
                </div>
                {leadContractorError && (
                  <p style={{ color: T.danger, fontSize: 12, marginTop: 6 }}>{leadContractorError}</p>
                )}
                {leadContractorName && (
                  <div
                    style={{
                      marginTop: 10,
                      background: "rgba(240,120,32,0.08)",
                      border: `1px solid ${T.accent}`,
                      borderRadius: 8,
                      padding: "10px 14px",
                    }}
                  >
                    <p style={{ color: T.accent, fontSize: 12, fontWeight: 700, margin: 0, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Contractor confirmed
                    </p>
                    <p style={{ color: T.white, fontSize: 14, margin: "4px 0 0" }}>{leadContractorName}</p>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <label style={labelCss}>
                  Trade categories <Required />
                  {form.trade_categories.length > 0 && (
                    <span style={{ color: T.muted, fontWeight: 400, marginLeft: 8 }}>
                      {form.trade_categories.length} selected
                    </span>
                  )}
                </label>

                {/* Search */}
                <div style={{ position: "relative", marginBottom: 12 }}>
                  <Search
                    size={13}
                    style={{
                      position: "absolute",
                      left: 10,
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: T.muted,
                    }}
                  />
                  <input
                    value={tradeSearch}
                    onChange={e => setTradeSearch(e.target.value)}
                    placeholder="Search trades..."
                    style={{
                      ...inputBase,
                      width: "100%",
                      padding: "8px 10px 8px 30px",
                      fontSize: 13,
                    }}
                  />
                </div>

                {/* Trade chips */}
                <div
                  style={{
                    maxHeight: 280,
                    overflowY: "auto",
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 8,
                    paddingRight: 4,
                  }}
                >
                  {filteredTrades.map(trade => {
                    const selected = form.trade_categories.includes(trade);
                    return (
                      <button
                        key={trade}
                        type="button"
                        onClick={() => toggleTrade(trade)}
                        style={{
                          background: selected ? T.accent : "rgba(255,255,255,0.06)",
                          border: `1px solid ${selected ? T.accent : T.border}`,
                          color: selected ? T.white : "rgba(255,255,255,0.75)",
                          borderRadius: 20,
                          padding: "5px 14px",
                          fontSize: 13,
                          cursor: "pointer",
                          fontWeight: selected ? 600 : 400,
                          transition: "all 0.15s",
                        }}
                      >
                        {trade}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Step 2: Budget & Terms ── */}
        {step === 2 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <StepHeader
              title="Budget & Terms"
              sub="Set your total budget and financial terms for this project."
            />

            <Field label="Total budget (GBP)" required>
              <div style={{ position: "relative" }}>
                <span
                  style={{
                    position: "absolute",
                    left: 12,
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
                  value={form.budget}
                  onChange={e => setField("budget", e.target.value)}
                  placeholder="25000"
                  style={{ ...inputBase, paddingLeft: 28 }}
                />
              </div>
            </Field>

            <ToggleRow
              label="Budget visible to contractors"
              sub="Contractors will see your total budget when viewing this tender"
              checked={form.budget_visible_to_contractors}
              onChange={v => setField("budget_visible_to_contractors", v)}
            />

            <ToggleRow
              label="Deposit required"
              sub="Require a deposit payment before work begins"
              checked={form.deposit_required}
              onChange={v => {
                setField("deposit_required", v);
                if (!v) setField("deposit_percentage", "");
              }}
            />

            {form.deposit_required && (
              <Field label="Deposit percentage" required>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ position: "relative", width: 160 }}>
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      step={1}
                      value={form.deposit_percentage}
                      onChange={e => setField("deposit_percentage", e.target.value)}
                      placeholder="20"
                      style={{ ...inputBase, paddingRight: 32 }}
                    />
                    <span
                      style={{
                        position: "absolute",
                        right: 12,
                        top: "50%",
                        transform: "translateY(-50%)",
                        color: T.muted,
                        fontSize: 14,
                        pointerEvents: "none",
                      }}
                    >
                      %
                    </span>
                  </div>
                  {form.budget && form.deposit_percentage && (
                    <span style={{ color: T.muted, fontSize: 13 }}>
                      ={" "}
                      <span style={{ color: T.accent, fontWeight: 600 }}>
                        {formatGBP(
                          (parseFloat(form.budget) * parseFloat(form.deposit_percentage)) / 100,
                        )}
                      </span>
                    </span>
                  )}
                </div>
              </Field>
            )}

            <Field label="Retention percentage" hint="Amount withheld until practical completion — standard 5%">
              <div style={{ position: "relative", width: 160 }}>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={form.retention_percentage}
                  onChange={e => setField("retention_percentage", e.target.value)}
                  placeholder="5"
                  style={{ ...inputBase, paddingRight: 32 }}
                />
                <span
                  style={{
                    position: "absolute",
                    right: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: T.muted,
                    fontSize: 14,
                    pointerEvents: "none",
                  }}
                >
                  %
                </span>
              </div>
            </Field>
          </div>
        )}

        {/* ── Step 3: Scoring Criteria ── */}
        {step === 3 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <StepHeader
              title="Scoring Criteria"
              sub="Define up to 5 criteria and assign weightings. All weights must sum to 100%."
            />

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {/* Column headers */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 130px 40px", gap: 10 }}>
                <span style={{ color: T.muted, fontSize: 12, fontWeight: 600, letterSpacing: "0.04em" }}>CRITERION</span>
                <span style={{ color: T.muted, fontSize: 12, fontWeight: 600, letterSpacing: "0.04em" }}>WEIGHT</span>
                <span />
              </div>

              {form.scoring_criteria.map((c, i) => (
                <div
                  key={i}
                  style={{ display: "grid", gridTemplateColumns: "1fr 130px 40px", gap: 10, alignItems: "center" }}
                >
                  <Input
                    value={c.label}
                    onChange={e => updateCriterion(i, "label", e.target.value)}
                    placeholder={`Criterion ${i + 1}`}
                    style={inputBase}
                    maxLength={60}
                  />
                  <div style={{ position: "relative" }}>
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      value={c.weight === 0 ? "" : c.weight}
                      onChange={e => updateCriterion(i, "weight", e.target.value)}
                      placeholder="0"
                      style={{ ...inputBase, paddingRight: 32 }}
                    />
                    <span
                      style={{
                        position: "absolute",
                        right: 10,
                        top: "50%",
                        transform: "translateY(-50%)",
                        color: T.muted,
                        fontSize: 13,
                        pointerEvents: "none",
                      }}
                    >
                      %
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeCriterion(i)}
                    disabled={form.scoring_criteria.length <= 1}
                    style={{
                      background: "transparent",
                      border: "none",
                      cursor: form.scoring_criteria.length <= 1 ? "not-allowed" : "pointer",
                      color:
                        form.scoring_criteria.length <= 1 ? "rgba(255,255,255,0.15)" : T.danger,
                      padding: 6,
                      borderRadius: 4,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <button
                type="button"
                onClick={addCriterion}
                disabled={form.scoring_criteria.length >= 5}
                style={{
                  background: "transparent",
                  border: `1px solid ${form.scoring_criteria.length >= 5 ? T.border : "rgba(255,255,255,0.2)"}`,
                  color: form.scoring_criteria.length >= 5 ? T.muted : T.white,
                  borderRadius: 6,
                  padding: "7px 14px",
                  fontSize: 13,
                  cursor: form.scoring_criteria.length >= 5 ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  transition: "all 0.15s",
                }}
              >
                <Plus size={14} />
                Add criterion
                {form.scoring_criteria.length >= 5 && (
                  <span style={{ color: T.muted, fontSize: 11 }}>(max 5)</span>
                )}
              </button>

              <div
                style={{
                  background:
                    weightTotal === 100
                      ? "rgba(74,222,128,0.08)"
                      : "rgba(248,113,113,0.08)",
                  border: `1px solid ${weightTotal === 100 ? "rgba(74,222,128,0.35)" : "rgba(248,113,113,0.35)"}`,
                  borderRadius: 8,
                  padding: "7px 14px",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span
                  style={{
                    color: weightTotal === 100 ? T.success : T.danger,
                    fontSize: 14,
                    fontWeight: 700,
                  }}
                >
                  {weightTotal}% total
                </span>
                {weightTotal !== 100 && (
                  <span style={{ color: T.danger, fontSize: 12 }}>
                    {weightTotal < 100
                      ? `${100 - weightTotal}% remaining`
                      : `${weightTotal - 100}% over`}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Step 4: Visibility & Deadline ── */}
        {step === 4 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <StepHeader
              title="Visibility & Deadline"
              sub="Control who can see and respond to your tender."
            />

            <div>
              <label style={labelCss}>
                Tender visibility <Required />
              </label>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
                {(["open", "restricted"] as const).map(v => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setField("visibility", v)}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 12,
                      background:
                        form.visibility === v
                          ? "rgba(240,120,32,0.08)"
                          : "rgba(255,255,255,0.03)",
                      border: `1px solid ${form.visibility === v ? T.accent : T.border}`,
                      borderRadius: 8,
                      padding: "14px 16px",
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "all 0.15s",
                    }}
                  >
                    {/* Radio dot */}
                    <div
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: "50%",
                        marginTop: 2,
                        flexShrink: 0,
                        border: `2px solid ${form.visibility === v ? T.accent : "rgba(255,255,255,0.3)"}`,
                        background: form.visibility === v ? T.accent : "transparent",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        transition: "all 0.15s",
                      }}
                    >
                      {form.visibility === v && (
                        <div
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            background: T.white,
                          }}
                        />
                      )}
                    </div>
                    <div>
                      <p
                        style={{
                          color: T.white,
                          fontSize: 14,
                          fontWeight: 600,
                          margin: 0,
                          textTransform: "capitalize",
                        }}
                      >
                        {v}
                      </p>
                      <p style={{ color: T.muted, fontSize: 13, margin: "3px 0 0" }}>
                        {v === "open"
                          ? "Any registered contractor on TradeStone can view and submit a proposal"
                          : "Only contractors you invite can view and respond to this tender"}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <Field label="Proposal deadline" required>
              <input
                type="date"
                value={form.proposal_deadline}
                min={today}
                onChange={e => setField("proposal_deadline", e.target.value)}
                style={{
                  ...inputBase,
                  padding: "8px 12px",
                  fontSize: 14,
                  width: "100%",
                  colorScheme: "dark",
                }}
              />
              {form.proposal_deadline && (
                <p style={{ color: T.muted, fontSize: 12, marginTop: 6 }}>
                  Deadline:{" "}
                  <span style={{ color: T.white }}>{formatDate(form.proposal_deadline)}</span>
                </p>
              )}
            </Field>
          </div>
        )}

        {/* ── Step 5: Review & Submit ── */}
        {step === 5 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <StepHeader
              title="Review & Submit"
              sub="Check all details before posting. Your tender will be visible immediately once submitted."
            />

            {(
              [
                {
                  title: "Project Details",
                  rows: [
                    ["Title", form.title],
                    ["Description", form.description],
                    [
                      "Address",
                      [
                        form.address_line_1,
                        form.address_line_2,
                        form.city,
                        form.postcode.toUpperCase(),
                      ]
                        .filter(Boolean)
                        .join(", "),
                    ],
                  ] as [string, string][],
                },
                {
                  title: "Trade Selection",
                  rows: (
                    form.useLeadContractor
                      ? [["Lead contractor", leadContractorName || form.leadContractorCode]]
                      : [["Trades", form.trade_categories.join(", ") || "—"]]
                  ) as [string, string][],
                },
                {
                  title: "Budget & Terms",
                  rows: [
                    ["Budget", formatGBP(form.budget)],
                    ["Budget visible to contractors", form.budget_visible_to_contractors ? "Yes" : "No"],
                    [
                      "Deposit",
                      form.deposit_required && form.deposit_percentage
                        ? `${form.deposit_percentage}% (${formatGBP((parseFloat(form.budget || "0") * parseFloat(form.deposit_percentage)) / 100)})`
                        : "None",
                    ],
                    ["Retention", form.retention_percentage ? `${form.retention_percentage}%` : "None"],
                  ] as [string, string][],
                },
                {
                  title: "Scoring Criteria",
                  rows: form.scoring_criteria.map(c => [c.label, `${c.weight}%`] as [string, string]),
                },
                {
                  title: "Visibility & Deadline",
                  rows: [
                    ["Visibility", form.visibility.charAt(0).toUpperCase() + form.visibility.slice(1)],
                    ["Proposal deadline", formatDate(form.proposal_deadline)],
                  ] as [string, string][],
                },
              ] as { title: string; rows: [string, string][] }[]
            ).map(section => (
              <div key={section.title}>
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
                  {section.title}
                </p>
                <div
                  style={{
                    background: T.cardInner,
                    borderRadius: 8,
                    border: `1px solid ${T.border}`,
                    overflow: "hidden",
                  }}
                >
                  {section.rows.map(([label, value], i) => (
                    <div
                      key={i}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "180px 1fr",
                        padding: "10px 16px",
                        borderBottom:
                          i < section.rows.length - 1 ? `1px solid ${T.border}` : "none",
                        alignItems: "baseline",
                      }}
                    >
                      <span style={{ color: T.muted, fontSize: 13 }}>{label}</span>
                      <span
                        style={{ color: T.white, fontSize: 13, wordBreak: "break-word" }}
                      >
                        {value || "—"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Navigation ─────────────────────────────────────────────────────────── */}
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
          onClick={() => setStep(s => s - 1)}
          disabled={step === 0}
          style={{
            borderColor: "rgba(255,255,255,0.2)",
            color: T.white,
            background: "transparent",
          }}
        >
          <ChevronLeft size={16} style={{ marginRight: 4 }} />
          Back
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
            style={{
              background: T.accent,
              color: T.white,
              border: "none",
              minWidth: 140,
            }}
          >
            {submitting ? (
              <>
                <Loader2 size={16} className="animate-spin" style={{ marginRight: 8 }} />
                Posting...
              </>
            ) : (
              "Post Tender"
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Small sub-components ───────────────────────────────────────────────────────

function StepHeader({ title, sub }: { title: string; sub: string }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <h2 style={{ color: T.white, fontSize: 18, fontWeight: 600, margin: "0 0 4px" }}>{title}</h2>
      <p style={{ color: T.muted, fontSize: 13, margin: 0 }}>{sub}</p>
    </div>
  );
}

function Required() {
  return <span style={{ color: T.accent, marginLeft: 2 }}>*</span>;
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label style={labelCss}>
        {label}
        {required && <Required />}
        {!required && (
          <span style={{ color: T.muted, fontWeight: 400, marginLeft: 6 }}>(optional)</span>
        )}
      </label>
      {children}
      {hint && <p style={{ color: T.muted, fontSize: 12, marginTop: 4 }}>{hint}</p>}
    </div>
  );
}

function ToggleRow({
  label,
  sub,
  checked,
  onChange,
}: {
  label: string;
  sub: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        background: "rgba(255,255,255,0.04)",
        borderRadius: 8,
        padding: "12px 16px",
        border: `1px solid ${T.border}`,
      }}
    >
      <div>
        <p style={{ color: T.white, fontSize: 14, fontWeight: 500, margin: 0 }}>{label}</p>
        <p style={{ color: T.muted, fontSize: 12, margin: "2px 0 0" }}>{sub}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
