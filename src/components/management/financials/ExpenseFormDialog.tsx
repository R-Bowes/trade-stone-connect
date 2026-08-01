import { useState, useEffect, useMemo, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";
import { type Expense, type RecurrenceInterval } from "@/hooks/useExpenses";
import { useExpenseCategories } from "@/hooks/useExpenseCategories";
import { supabase } from "@/integrations/supabase/client";

const RECURRENCE_INTERVALS: { value: RecurrenceInterval; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "fortnightly", label: "Fortnightly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annually", label: "Annually" },
];

// Mirrors supabase/functions/process-recurring-expenses/index.ts's addInterval —
// duplicated rather than shared because the edge function runs on Deno and
// can't import from src/lib (same pattern as documentRefs.ts, see CLAUDE.md).
function addInterval(dateStr: string, interval: RecurrenceInterval): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  switch (interval) {
    case "weekly": d.setUTCDate(d.getUTCDate() + 7); break;
    case "fortnightly": d.setUTCDate(d.getUTCDate() + 14); break;
    case "monthly": d.setUTCMonth(d.getUTCMonth() + 1); break;
    case "quarterly": d.setUTCMonth(d.getUTCMonth() + 3); break;
    case "annually": d.setUTCFullYear(d.getUTCFullYear() + 1); break;
  }
  return d.toISOString().slice(0, 10);
}

const VAT_RATES = [
  { value: "20", label: "20% (Standard)" },
  { value: "5", label: "5% (Reduced)" },
  { value: "0", label: "0% (Zero-rated / exempt)" },
  { value: "no_vat", label: "No VAT" },
] as const;

const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "other", label: "Other" },
] as const;

type JobOption = { id: string; title: string; project_id: string | null };
type ProjectOption = { id: string; title: string };

export type ExpenseFormData = {
  category_id: string | null;
  description: string;
  amount: number;
  vat_rate: number;
  vat_amount: number;
  vat_reclaimable: boolean;
  payment_method: string;
  job_id: string | null;
  project_id: string | null;
  expense_date: string;
  vendor: string | null;
  notes: string | null;
  is_recurring: boolean;
  recurrence_interval: RecurrenceInterval | null;
  recurrence_next_due: string | null;
  recurrence_end_date: string | null;
  recurrence_parent_id: null;
  recurrence_auto_confirm: boolean;
  expense_status: "confirmed";
  receipt_url: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onSave: (data: ExpenseFormData) => Promise<void>;
  onUploadReceipt: (file: File) => Promise<string>;
  expense?: Expense | null;
};

export function ExpenseFormDialog({ open, onClose, onSave, onUploadReceipt, expense }: Props) {
  const { categories, flatCategories, loading: categoriesLoading } = useExpenseCategories();

  const [parentId, setParentId] = useState<string>("");
  const [subId, setSubId] = useState<string>("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split("T")[0]);
  const [vendor, setVendor] = useState("");
  const [notes, setNotes] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceInterval, setRecurrenceInterval] = useState<RecurrenceInterval>("monthly");
  const [recurrenceEndDate, setRecurrenceEndDate] = useState("");
  const [recurrenceAutoConfirm, setRecurrenceAutoConfirm] = useState(true);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [vatRateChoice, setVatRateChoice] = useState<string>("no_vat");
  const [vatAmount, setVatAmount] = useState("0");
  const [vatAmountTouched, setVatAmountTouched] = useState(false);
  const [vatReclaimable, setVatReclaimable] = useState(false);
  // Ref, not state: the async loadContext closure below only runs once per
  // dialog-open and reads this synchronously when its fetch resolves. A
  // state value would be captured stale at effect-creation time and would
  // never see a click that happened after the effect started — silently
  // overwriting the user's toggle once the network request landed.
  const vatReclaimableTouchedRef = useRef(false);

  const [paymentMethod, setPaymentMethod] = useState("card");
  const [jobId, setJobId] = useState<string>("");
  const [projectId, setProjectId] = useState<string>("");

  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);

  // Load contractor's active jobs/projects and default VAT reclaimable from finance_settings
  useEffect(() => {
    if (!open) return;

    const loadContext = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profileRow } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!profileRow) return;

      const [{ data: jobRows }, { data: projectRows }, { data: settingsRow }] = await Promise.all([
        supabase
          .from("jobs")
          .select("id, title, project_id")
          .eq("contractor_id", profileRow.id)
          .not("status", "in", "(complete,cancelled)"),
        supabase
          .from("projects")
          .select("id, title")
          .eq("lead_contractor_id", profileRow.id),
        supabase
          .from("finance_settings")
          .select("vat_status")
          .eq("contractor_id", profileRow.id)
          .maybeSingle(),
      ]);

      setJobs(jobRows ?? []);
      setProjects(projectRows ?? []);

      // Only apply the finance_settings default if this is a new expense and
      // the contractor hasn't already toggled the switch by hand — the fetch
      // above is async, so without this ref guard a slow response can land
      // after the click and silently stomp the user's choice back to the
      // default (a plain state guard would be read stale here, see the ref
      // declaration above).
      if (!expense && !vatReclaimableTouchedRef.current) {
        setVatReclaimable(settingsRow?.vat_status === "standard");
      }
    };

    loadContext();
  }, [open, expense]);

  // Reset/populate the whole form when the dialog opens or switches between
  // add and edit. Deliberately does NOT depend on flatCategories — that data
  // loads asynchronously (useExpenseCategories fetches it), and including it
  // here caused this effect to re-fire mid-edit whenever the category fetch
  // resolved, wiping every field the user had already filled in (including
  // silently reverting vatReclaimable and collapsing the VAT section by
  // resetting vatRateChoice back to "no_vat"). Category selection is
  // resolved separately below, once flatCategories is actually available.
  useEffect(() => {
    if (expense) {
      setDescription(expense.description);
      setAmount(String(expense.amount));
      setExpenseDate(expense.expense_date);
      setVendor(expense.vendor || "");
      setNotes(expense.notes || "");
      setIsRecurring(expense.is_recurring);
      setRecurrenceInterval(expense.recurrence_interval ?? "monthly");
      setRecurrenceEndDate(expense.recurrence_end_date ?? "");
      setRecurrenceAutoConfirm(expense.recurrence_auto_confirm ?? true);
      setReceiptUrl(expense.receipt_url);
      setVatRateChoice(
        expense.vat_rate === null || expense.vat_rate === undefined
          ? "no_vat"
          : String(expense.vat_rate),
      );
      setVatAmount(String(expense.vat_amount ?? 0));
      setVatAmountTouched(true);
      setVatReclaimable(!!expense.vat_reclaimable);
      vatReclaimableTouchedRef.current = true;
      setPaymentMethod(expense.payment_method || "card");
      setJobId(expense.job_id || "");
      setProjectId(expense.project_id || "");
    } else {
      setParentId("");
      setSubId("");
      setDescription("");
      setAmount("");
      setExpenseDate(new Date().toISOString().split("T")[0]);
      setVendor("");
      setNotes("");
      setIsRecurring(false);
      setRecurrenceInterval("monthly");
      setRecurrenceEndDate("");
      setRecurrenceAutoConfirm(true);
      setReceiptUrl(null);
      setVatRateChoice("no_vat");
      setVatAmount("0");
      setVatAmountTouched(false);
      setVatReclaimable(false);
      vatReclaimableTouchedRef.current = false;
      setPaymentMethod("card");
      setJobId("");
      setProjectId("");
    }
  }, [expense, open]);

  // Resolve the edited expense's category parent/sub selection once category
  // data is available. Isolated from the effect above so a late-arriving
  // category fetch only ever touches parentId/subId, never the rest of the
  // form.
  useEffect(() => {
    if (!expense) return;
    const cat = flatCategories.find((c) => c.id === expense.category_id);
    if (cat?.parent_id) {
      setParentId(cat.parent_id);
      setSubId(cat.id);
    } else if (cat) {
      setParentId(cat.id);
      setSubId("");
    } else {
      setParentId("");
      setSubId("");
    }
  }, [expense, flatCategories]);

  // Auto-calculate VAT amount from amount x rate, unless the user has overridden it
  useEffect(() => {
    if (vatAmountTouched) return;
    if (vatRateChoice === "no_vat") {
      setVatAmount("0");
      return;
    }
    const rate = Number(vatRateChoice) / 100;
    const gross = parseFloat(amount) || 0;
    setVatAmount((gross * rate).toFixed(2));
  }, [amount, vatRateChoice, vatAmountTouched]);

  const subcategories = useMemo(
    () => categories.find((c) => c.id === parentId)?.children ?? [],
    [categories, parentId],
  );

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await onUploadReceipt(file);
      setReceiptUrl(url);
    } catch {
      console.error("Upload failed");
    }
    setUploading(false);
  };

  const handleJobChange = (value: string) => {
    setJobId(value);
    const job = jobs.find((j) => j.id === value);
    if (job?.project_id) {
      setProjectId(job.project_id);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        category_id: subId || parentId || null,
        description,
        amount: parseFloat(amount),
        vat_rate: vatRateChoice === "no_vat" ? 0 : Number(vatRateChoice),
        vat_amount: vatRateChoice === "no_vat" ? 0 : parseFloat(vatAmount) || 0,
        vat_reclaimable: vatRateChoice === "no_vat" ? false : vatReclaimable,
        payment_method: paymentMethod,
        job_id: jobId || null,
        project_id: projectId || null,
        expense_date: expenseDate,
        vendor: vendor || null,
        notes: notes || null,
        is_recurring: isRecurring,
        recurrence_interval: isRecurring ? recurrenceInterval : null,
        recurrence_next_due: isRecurring ? addInterval(expenseDate, recurrenceInterval) : null,
        recurrence_end_date: isRecurring && recurrenceEndDate ? recurrenceEndDate : null,
        recurrence_parent_id: null,
        recurrence_auto_confirm: isRecurring ? recurrenceAutoConfirm : true,
        expense_status: "confirmed",
        receipt_url: receiptUrl,
      });
      onClose();
    } catch {
      // error handled in hook
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{expense ? "Edit Expense" : "Add Expense"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Category</Label>
            <Select
              value={parentId}
              onValueChange={(value) => {
                setParentId(value);
                setSubId("");
              }}
              disabled={categoriesLoading}
            >
              <SelectTrigger><SelectValue placeholder="Select a category" /></SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {subcategories.length > 0 && (
            <div className="space-y-2">
              <Label>Subcategory</Label>
              <Select value={subId || "none"} onValueChange={(v) => setSubId(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No subcategory</SelectItem>
                  {subcategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>Description *</Label>
            <Input value={description} onChange={e => setDescription(e.target.value)} required />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Amount (£) *</Label>
              <Input type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Date *</Label>
              <Input type="date" value={expenseDate} onChange={e => setExpenseDate(e.target.value)} required />
            </div>
          </div>

          <div className="space-y-3 rounded-md border p-3">
            <div className="space-y-2">
              <Label>VAT rate</Label>
              <Select value={vatRateChoice} onValueChange={(v) => { setVatRateChoice(v); setVatAmountTouched(false); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {VAT_RATES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {vatRateChoice !== "no_vat" && (
              <>
                <div className="space-y-2">
                  <Label>VAT amount (£)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={vatAmount}
                    onChange={(e) => { setVatAmount(e.target.value); setVatAmountTouched(true); }}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>VAT reclaimable</Label>
                  <Switch
                    checked={vatReclaimable}
                    onCheckedChange={(checked) => {
                      vatReclaimableTouchedRef.current = true;
                      setVatReclaimable(checked);
                    }}
                  />
                </div>
              </>
            )}
          </div>

          <div className="space-y-2">
            <Label>Vendor</Label>
            <Input value={vendor} onChange={e => setVendor(e.target.value)} placeholder="e.g. Screwfix, Travis Perkins" />
          </div>

          <div className="space-y-2">
            <Label>Payment method</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Job (optional)</Label>
              <Select value={jobId || "none"} onValueChange={(v) => handleJobChange(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="No job" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No job</SelectItem>
                  {jobs.map((j) => (
                    <SelectItem key={j.id} value={j.id}>{j.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Project (optional)</Label>
              <Select value={projectId || "none"} onValueChange={(v) => setProjectId(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="No project" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No project</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Receipt</Label>
            <div className="flex items-center gap-2">
              <Input type="file" accept="image/*,.pdf" onChange={handleFileUpload} className="flex-1" />
              {uploading && <Loader2 className="h-4 w-4 animate-spin" />}
            </div>
            {receiptUrl && <p className="text-xs text-green-600">✓ Receipt attached</p>}
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
          </div>

          <div className="space-y-3 rounded-md border p-3">
            <div className="flex items-center justify-between">
              <Label>Recurring expense</Label>
              <Switch checked={isRecurring} onCheckedChange={setIsRecurring} />
            </div>

            {isRecurring && (
              <div className="space-y-3 pt-1">
                <div className="space-y-2">
                  <Label>Frequency</Label>
                  <Select value={recurrenceInterval} onValueChange={(v) => setRecurrenceInterval(v as RecurrenceInterval)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {RECURRENCE_INTERVALS.map((r) => (
                        <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Repeat until (optional)</Label>
                  <Input
                    type="date"
                    value={recurrenceEndDate}
                    onChange={(e) => setRecurrenceEndDate(e.target.value)}
                    placeholder="Leave empty for indefinite"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Auto-confirm</Label>
                    <p className="text-xs text-muted-foreground">
                      {recurrenceAutoConfirm
                        ? "Automatically add each occurrence"
                        : "Notify me to confirm each time"}
                    </p>
                  </div>
                  <Switch checked={recurrenceAutoConfirm} onCheckedChange={setRecurrenceAutoConfirm} />
                </div>

                {expenseDate && (
                  <p className="text-xs text-muted-foreground">
                    The next expense will be created automatically on{" "}
                    {format(new Date(`${addInterval(expenseDate, recurrenceInterval)}T00:00:00`), "d MMM yyyy")}.
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {expense ? "Update" : "Add Expense"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
