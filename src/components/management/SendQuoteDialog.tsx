import { useEffect, useState, useCallback } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, MapPin, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type Enquiry = {
  id: string;
  contractor_id: string | null;
  customer_id: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  job_description: string;
  location: string;
  preferred_timeline: string | null;
  budget_range: string | null;
  status: string | null;
};

type LineItem = {
  key: string;
  description: string;
  quantity: number;
  unit_price: number;
};

interface SendQuoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  enquiry: Enquiry;
  onSuccess?: () => void;
}

function blankItem(): LineItem {
  return { key: crypto.randomUUID(), description: "", quantity: 1, unit_price: 0 };
}

export function SendQuoteDialog({ open, onOpenChange, enquiry, onSuccess }: SendQuoteDialogProps) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [items, setItems] = useState<LineItem[]>([blankItem()]);
  const [completionTime, setCompletionTime] = useState("");
  const [taxRate, setTaxRate] = useState(20);
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("");
  const [depositRequired, setDepositRequired] = useState(false);
  const [depositPercentage, setDepositPercentage] = useState(25);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(`Quote for ${enquiry.customer_name ?? "customer"}`);
    setDescription(enquiry.job_description ?? "");
    setItems([blankItem()]);
    setCompletionTime("");
    setTaxRate(20);
    setValidUntil("");
    setNotes("");
    setTerms("");
    setDepositRequired(false);
    setDepositPercentage(25);
  }, [open, enquiry]);

  const updateItem = useCallback(
    (key: string, field: keyof Omit<LineItem, "key">, value: string | number) => {
      setItems((prev) => prev.map((item) => (item.key === key ? { ...item, [field]: value } : item)));
    },
    []
  );

  const removeItem = useCallback((key: string) => {
    setItems((prev) => prev.filter((item) => item.key !== key));
  }, []);

  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;
  const depositAmount = depositRequired ? total * (depositPercentage / 100) : 0;

  const fmt = (n: number) =>
    n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const handleSubmit = async () => {
    const filledItems = items.filter((i) => i.description.trim());

    if (!title.trim()) {
      toast({ title: "Title required", variant: "destructive" });
      return;
    }
    if (filledItems.length === 0) {
      toast({ title: "At least one line item required", variant: "destructive" });
      return;
    }
    if (!validUntil) {
      toast({ title: "Valid until date required", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error("Not authenticated");

      let recipientId: string | null = null;
      if (enquiry.customer_id) {
        const { data: customerProfile } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', enquiry.customer_id)
          .maybeSingle();
        recipientId = customerProfile?.id ?? null;
      }

      const lineItems = filledItems.map(({ description, quantity, unit_price }) => ({
        description: description.trim(),
        quantity,
        unit_price,
        total: quantity * unit_price,
      }));

      const { error: quoteError } = await supabase.from("issued_quotes").insert({
        contractor_id: user.id,
        recipient_id: recipientId,
        client_name: enquiry.customer_name ?? "",
        client_email: enquiry.customer_email ?? "",
        client_phone: enquiry.customer_phone ?? null,
        client_type: "customer",
        title: title.trim(),
        description: description.trim() || null,
        items: lineItems,
        subtotal,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        total,
        valid_until: validUntil,
        notes: notes.trim() || null,
        completion_time: completionTime || null,
        deposit_required: depositRequired,
        deposit_percentage: depositRequired ? depositPercentage : 0,
        terms: terms.trim() || null,
        status: "sent",
        sent_at: new Date().toISOString(),
      });

      if (quoteError) throw quoteError;

      const { error: enquiryError } = await supabase
        .from("enquiries")
        .update({ status: "converted" })
        .eq("id", enquiry.id);

      if (enquiryError) throw enquiryError;

      toast({
        title: "Quote sent",
        description: `Quote sent to ${enquiry.customer_name ?? "customer"}.`,
      });
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to send quote:", error);
      toast({
        title: "Could not send quote",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Send Quote</DialogTitle>
          <DialogDescription>
            Create a quote for {enquiry.customer_name ?? "customer"} ({enquiry.customer_email ?? "no email"}).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Read-only enquiry context */}
          <div className="rounded-md bg-muted p-4 space-y-2 text-sm">
            <p className="font-medium text-foreground">Enquiry details</p>
            <p className="text-muted-foreground line-clamp-3">{enquiry.job_description}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />{enquiry.location}
              </span>
              {enquiry.budget_range && <span>Budget: {enquiry.budget_range}</span>}
              {enquiry.preferred_timeline && <span>Timeline: {enquiry.preferred_timeline}</span>}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="quote-title">Title</Label>
            <Input
              id="quote-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={submitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="quote-description">Description</Label>
            <Textarea
              id="quote-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-20"
              disabled={submitting}
            />
          </div>

          <div className="space-y-2">
            <Label>Line items</Label>
            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_72px_104px_32px] gap-2 px-1 text-xs font-medium text-muted-foreground">
                <span>Description <span className="text-destructive">*</span></span>
                <span className="text-right">Qty</span>
                <span className="text-right">Unit price (£)</span>
                <span />
              </div>
              {items.map((item) => (
                <div key={item.key} className="grid grid-cols-[1fr_72px_104px_32px] gap-2 items-center">
                  <Input
                    value={item.description}
                    onChange={(e) => updateItem(item.key, "description", e.target.value)}
                    placeholder="Labour, materials, etc."
                    disabled={submitting}
                  />
                  <Input
                    type="number"
                    min={1}
                    value={item.quantity}
                    onChange={(e) => updateItem(item.key, "quantity", Number(e.target.value))}
                    className="text-right"
                    disabled={submitting}
                  />
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    value={item.unit_price}
                    onChange={(e) => updateItem(item.key, "unit_price", Number(e.target.value))}
                    className="text-right"
                    disabled={submitting}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => removeItem(item.key)}
                    disabled={submitting || items.length === 1}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setItems((prev) => [...prev, blankItem()])}
                disabled={submitting}
              >
                <Plus className="h-4 w-4 mr-2" />Add item
              </Button>
            </div>
          </div>

          <div className="rounded-md border p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>£{fmt(subtotal)}</span>
            </div>
            <div className="flex justify-between items-center gap-2">
              <div className="flex items-center gap-2 text-muted-foreground">
                <span>Tax</span>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={taxRate}
                  onChange={(e) => setTaxRate(Number(e.target.value))}
                  className="h-7 w-16 text-right text-sm"
                  disabled={submitting}
                />
                <span>%</span>
              </div>
              <span>£{fmt(taxAmount)}</span>
            </div>
            <div className="flex justify-between font-semibold border-t pt-2">
              <span>Total</span>
              <span>£{fmt(total)}</span>
            </div>
            {depositRequired && (
              <div className="flex justify-between text-primary font-medium border-t pt-2">
                <span>Deposit due ({depositPercentage}%)</span>
                <span>£{fmt(depositAmount)}</span>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="quote-valid-until">
              Valid until <span className="text-destructive">*</span>
            </Label>
            <Input
              id="quote-valid-until"
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              min={new Date().toISOString().slice(0, 10)}
              disabled={submitting}
              className="w-48"
            />
          </div>

          <div className="space-y-2">
            <Label>Estimated Completion Time</Label>
            <Select value={completionTime} onValueChange={setCompletionTime}>
              <SelectTrigger disabled={submitting}>
                <SelectValue placeholder="Select duration..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="half_day">Half Day (4 hours)</SelectItem>
                <SelectItem value="full_day">Full Day (8 hours)</SelectItem>
                <SelectItem value="2_days">2 Days</SelectItem>
                <SelectItem value="3_days">3 Days</SelectItem>
                <SelectItem value="1_week">1 Week</SelectItem>
                <SelectItem value="2_weeks">2 Weeks</SelectItem>
                <SelectItem value="1_month">1 Month+</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3 rounded-md border p-4">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="deposit-required"
                checked={depositRequired}
                onChange={(e) => setDepositRequired(e.target.checked)}
                disabled={submitting}
                className="h-4 w-4"
              />
              <Label htmlFor="deposit-required" className="cursor-pointer">Deposit required</Label>
            </div>
            {depositRequired && (
              <div className="space-y-2 pl-6">
                <Label>Deposit percentage</Label>
                <Select value={String(depositPercentage)} onValueChange={(v) => setDepositPercentage(Number(v))}>
                  <SelectTrigger disabled={submitting} className="w-56">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10%</SelectItem>
                    <SelectItem value="25">25%</SelectItem>
                    <SelectItem value="50">50%</SelectItem>
                    <SelectItem value="75">75%</SelectItem>
                    <SelectItem value="100">100% (full payment upfront)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  Customer will be asked to pay <span className="font-medium text-foreground">£{fmt(depositAmount)}</span> before contact details are revealed.
                </p>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="quote-notes">Notes (optional)</Label>
            <Textarea
              id="quote-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional notes for the customer..."
              className="min-h-16"
              disabled={submitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="quote-terms">Terms & conditions (optional)</Label>
            <Textarea
              id="quote-terms"
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              placeholder="e.g. 50% deposit required, payment terms, etc."
              className="min-h-16"
              disabled={submitting}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={() => void handleSubmit()} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Send Quote
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}