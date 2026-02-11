import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Loader2, Upload } from "lucide-react";
import { EXPENSE_CATEGORIES, type Expense } from "@/hooks/useExpenses";

type Props = {
  open: boolean;
  onClose: () => void;
  onSave: (data: {
    category: string;
    description: string;
    amount: number;
    expense_date: string;
    vendor: string | null;
    notes: string | null;
    is_recurring: boolean;
    receipt_url: string | null;
  }) => Promise<void>;
  onUploadReceipt: (file: File) => Promise<string>;
  expense?: Expense | null;
};

export function ExpenseFormDialog({ open, onClose, onSave, onUploadReceipt, expense }: Props) {
  const [category, setCategory] = useState("General");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split("T")[0]);
  const [vendor, setVendor] = useState("");
  const [notes, setNotes] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (expense) {
      setCategory(expense.category);
      setDescription(expense.description);
      setAmount(String(expense.amount));
      setExpenseDate(expense.expense_date);
      setVendor(expense.vendor || "");
      setNotes(expense.notes || "");
      setIsRecurring(expense.is_recurring);
      setReceiptUrl(expense.receipt_url);
    } else {
      setCategory("General");
      setDescription("");
      setAmount("");
      setExpenseDate(new Date().toISOString().split("T")[0]);
      setVendor("");
      setNotes("");
      setIsRecurring(false);
      setReceiptUrl(null);
    }
  }, [expense, open]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        category,
        description,
        amount: parseFloat(amount),
        expense_date: expenseDate,
        vendor: vendor || null,
        notes: notes || null,
        is_recurring: isRecurring,
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
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {EXPENSE_CATEGORIES.map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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

          <div className="space-y-2">
            <Label>Vendor</Label>
            <Input value={vendor} onChange={e => setVendor(e.target.value)} placeholder="e.g. Screwfix, Travis Perkins" />
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

          <div className="flex items-center justify-between">
            <Label>Recurring expense</Label>
            <Switch checked={isRecurring} onCheckedChange={setIsRecurring} />
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
