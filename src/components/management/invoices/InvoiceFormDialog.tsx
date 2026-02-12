import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2 } from "lucide-react";
import type { Invoice, InvoiceItem } from "@/hooks/useInvoices";

type InvoiceFormDialogProps = {
  open: boolean;
  onClose: () => void;
  onSave: (data: {
    client_name: string;
    client_email: string;
    client_phone?: string;
    client_address?: string;
    due_date: string;
    items: InvoiceItem[];
    subtotal: number;
    tax_rate: number;
    tax_amount: number;
    total: number;
    notes?: string;
    status: string;
  }) => Promise<void>;
  invoice?: Invoice | null;
};

export function InvoiceFormDialog({ open, onClose, onSave, invoice }: InvoiceFormDialogProps) {
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [taxRate, setTaxRate] = useState(0);
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<InvoiceItem[]>([
    { description: "", quantity: 1, unit_price: 0, total: 0 },
  ]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (invoice) {
      setClientName(invoice.client_name);
      setClientEmail(invoice.client_email);
      setClientPhone(invoice.client_phone || "");
      setClientAddress(invoice.client_address || "");
      setDueDate(invoice.due_date);
      setTaxRate(Number(invoice.tax_rate));
      setNotes(invoice.notes || "");
      const invoiceItems = Array.isArray(invoice.items) ? (invoice.items as unknown as InvoiceItem[]) : [];
      setItems(invoiceItems.length > 0 ? invoiceItems : [{ description: "", quantity: 1, unit_price: 0, total: 0 }]);
    } else {
      setClientName("");
      setClientEmail("");
      setClientPhone("");
      setClientAddress("");
      const due = new Date();
      due.setDate(due.getDate() + 30);
      setDueDate(due.toISOString().split("T")[0]);
      setTaxRate(20);
      setNotes("");
      setItems([{ description: "", quantity: 1, unit_price: 0, total: 0 }]);
    }
  }, [invoice, open]);

  const updateItem = (index: number, field: keyof InvoiceItem, value: string | number) => {
    setItems(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      updated[index].total = updated[index].quantity * updated[index].unit_price;
      return updated;
    });
  };

  const addItem = () => {
    setItems(prev => [...prev, { description: "", quantity: 1, unit_price: 0, total: 0 }]);
  };

  const removeItem = (index: number) => {
    if (items.length <= 1) return;
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;

  const handleSubmit = async (asDraft: boolean) => {
    if (!clientName || !clientEmail || !dueDate) return;
    if (items.every(i => !i.description)) return;

    setSaving(true);
    try {
      await onSave({
        client_name: clientName,
        client_email: clientEmail,
        client_phone: clientPhone || undefined,
        client_address: clientAddress || undefined,
        due_date: dueDate,
        items: items.map(i => ({ ...i, total: i.quantity * i.unit_price })),
        subtotal,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        total,
        notes: notes || undefined,
        status: asDraft ? "draft" : "sent",
      });
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{invoice ? "Edit Invoice" : "Create Invoice"}</DialogTitle>
          <DialogDescription>
            {invoice ? "Update the invoice details below." : "Fill in the details to create a new invoice."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Client Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Client Name *</Label>
              <Input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Client name" />
            </div>
            <div className="space-y-2">
              <Label>Client Email *</Label>
              <Input type="email" value={clientEmail} onChange={e => setClientEmail(e.target.value)} placeholder="client@example.com" />
            </div>
            <div className="space-y-2">
              <Label>Client Phone</Label>
              <Input value={clientPhone} onChange={e => setClientPhone(e.target.value)} placeholder="Phone number" />
            </div>
            <div className="space-y-2">
              <Label>Client Address</Label>
              <Input value={clientAddress} onChange={e => setClientAddress(e.target.value)} placeholder="Address" />
            </div>
          </div>

          {/* Due Date & Tax */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Due Date *</Label>
              <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Tax Rate (%)</Label>
              <Input type="number" min="0" max="100" value={taxRate} onChange={e => setTaxRate(Number(e.target.value))} />
            </div>
          </div>

          {/* Line Items */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <Label className="text-base font-semibold">Line Items</Label>
              <Button type="button" variant="outline" size="sm" onClick={addItem}>
                <Plus className="h-4 w-4 mr-1" />Add Item
              </Button>
            </div>

            <div className="space-y-3">
              {items.map((item, index) => (
                <div key={index} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-5 space-y-1">
                    {index === 0 && <Label className="text-xs text-muted-foreground">Description</Label>}
                    <Input
                      value={item.description}
                      onChange={e => updateItem(index, "description", e.target.value)}
                      placeholder="Item description"
                    />
                  </div>
                  <div className="col-span-2 space-y-1">
                    {index === 0 && <Label className="text-xs text-muted-foreground">Qty</Label>}
                    <Input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={e => updateItem(index, "quantity", Number(e.target.value))}
                    />
                  </div>
                  <div className="col-span-2 space-y-1">
                    {index === 0 && <Label className="text-xs text-muted-foreground">Unit Price</Label>}
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.unit_price}
                      onChange={e => updateItem(index, "unit_price", Number(e.target.value))}
                    />
                  </div>
                  <div className="col-span-2 space-y-1">
                    {index === 0 && <Label className="text-xs text-muted-foreground">Total</Label>}
                    <Input
                      value={`£${(item.quantity * item.unit_price).toFixed(2)}`}
                      readOnly
                      className="bg-muted"
                    />
                  </div>
                  <div className="col-span-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeItem(index)}
                      disabled={items.length <= 1}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {/* Totals */}
            <div className="border-t pt-4 space-y-2 max-w-xs ml-auto">
              <div className="flex justify-between text-sm">
                <span>Subtotal</span>
                <span>£{subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Tax ({taxRate}%)</span>
                <span>£{taxAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold text-lg border-t pt-2">
                <span>Total</span>
                <span>£{total.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Additional notes or payment instructions..." rows={3} />
          </div>
        </div>

        <DialogFooter className="flex gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="secondary" onClick={() => handleSubmit(true)} disabled={saving}>
            Save as Draft
          </Button>
          <Button onClick={() => handleSubmit(false)} disabled={saving}>
            {invoice ? "Update & Send" : "Create & Send"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
