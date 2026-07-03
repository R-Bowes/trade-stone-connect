import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, FileText, RefreshCw, Edit2, Send, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatQuoteRef } from "@/lib/documentRefs";

interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
}

interface IssuedQuote {
  id: string;
  quote_number: number;
  version: number;
  title: string;
  client_name: string;
  client_email: string;
  recipient_id: string | null;
  total: number;
  subtotal: number;
  tax_amount: number;
  tax_rate: number;
  status: string;
  sent_at: string | null;
  viewed_at: string | null;
  responded_at: string | null;
  accepted_at: string | null;
  rejected_at: string | null;
  created_at: string;
  items: LineItem[];
  valid_until: string;
  deposit_required: boolean | null;
  deposit_amount: number | null;
  parent_quote_id: string | null;
  recipient_response: string | null;
  notes: string | null;
  terms: string | null;
}

interface EditState {
  title: string;
  valid_until: string;
  items: LineItem[];
  tax_rate: number;
  deposit_required: boolean;
  deposit_amount: string;
}

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  sent: "bg-blue-100 text-blue-800",
  accepted: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  expired: "bg-amber-100 text-amber-800",
  superseded: "bg-gray-100 text-gray-400",
};

function statusLabel(s: string): string {
  const map: Record<string, string> = {
    draft: "Draft", sent: "Sent", accepted: "Accepted",
    rejected: "Rejected", expired: "Expired", superseded: "Superseded",
  };
  return map[s] ?? s;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return format(new Date(iso), "d MMM yyyy");
}

function fmtMoney(n: number): string {
  return `£${Number(n).toFixed(2)}`;
}

function latestVersions(quotes: IssuedQuote[]): IssuedQuote[] {
  const map = new Map<number, IssuedQuote>();
  for (const q of quotes) {
    const cur = map.get(q.quote_number);
    if (!cur || q.version > cur.version) map.set(q.quote_number, q);
  }
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

function normaliseRow(q: Record<string, unknown>): IssuedQuote {
  return {
    id: q.id as string,
    quote_number: q.quote_number as number,
    version: (q.version as number | null) ?? 1,
    title: q.title as string,
    client_name: q.client_name as string,
    client_email: q.client_email as string,
    recipient_id: q.recipient_id as string | null,
    total: q.total as number,
    subtotal: q.subtotal as number,
    tax_amount: q.tax_amount as number,
    tax_rate: q.tax_rate as number,
    status: q.status as string,
    sent_at: q.sent_at as string | null,
    viewed_at: q.viewed_at as string | null,
    responded_at: q.responded_at as string | null,
    accepted_at: q.accepted_at as string | null,
    rejected_at: q.rejected_at as string | null,
    created_at: q.created_at as string,
    items: Array.isArray(q.items) ? (q.items as unknown as LineItem[]) : [],
    valid_until: q.valid_until as string,
    deposit_required: q.deposit_required as boolean | null,
    deposit_amount: q.deposit_amount as number | null,
    parent_quote_id: q.parent_quote_id as string | null,
    recipient_response: q.recipient_response as string | null,
    notes: q.notes as string | null,
    terms: q.terms as string | null,
  };
}

// ─── Detail view ───────────────────────────────────────────────────────────────

function QuoteDetailPanel({
  quote,
  versionChain,
  saving,
  onEdit,
  onSend,
  onRevise,
  onSelectVersion,
}: {
  quote: IssuedQuote;
  versionChain: IssuedQuote[];
  saving: boolean;
  onEdit: () => void;
  onSend: () => void;
  onRevise: () => void;
  onSelectVersion: (q: IssuedQuote) => void;
}) {
  const eyebrow = quote.version > 1
    ? `${formatQuoteRef(quote.quote_number)} · v${quote.version}`
    : formatQuoteRef(quote.quote_number);

  const isDraft = quote.status === "draft";
  const isSent = quote.status === "sent";
  const isRejected = quote.status === "rejected";
  const isAccepted = quote.status === "accepted";
  const isSuperseded = quote.status === "superseded";

  return (
    <>
      <DialogHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs text-muted-foreground mb-1">{eyebrow}</p>
            <DialogTitle className="text-xl leading-tight">{quote.title}</DialogTitle>
          </div>
          <Badge className={`shrink-0 mt-1 ${STATUS_BADGE[quote.status] ?? "bg-gray-100 text-gray-700"}`}>
            {statusLabel(quote.status)}
          </Badge>
        </div>
      </DialogHeader>

      <div className="space-y-5 mt-2">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground w-20 shrink-0">Client</span>
          <span className="font-medium">{quote.client_name}</span>
        </div>

        {/* Line items */}
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left pb-1.5 font-medium text-muted-foreground">Description</th>
              <th className="text-right pb-1.5 font-medium text-muted-foreground w-10">Qty</th>
              <th className="text-right pb-1.5 font-medium text-muted-foreground w-24">Unit</th>
              <th className="text-right pb-1.5 font-medium text-muted-foreground w-24">Total</th>
            </tr>
          </thead>
          <tbody>
            {quote.items.length === 0 ? (
              <tr>
                <td colSpan={4} className="pt-2 text-sm text-muted-foreground">No line items</td>
              </tr>
            ) : (
              quote.items.map((item, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="py-1.5">{item.description}</td>
                  <td className="py-1.5 text-right font-mono">{item.quantity}</td>
                  <td className="py-1.5 text-right font-mono">{fmtMoney(item.unit_price)}</td>
                  <td className="py-1.5 text-right font-mono">{fmtMoney(item.total)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Totals */}
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="font-mono">{fmtMoney(quote.subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">VAT ({quote.tax_rate}%)</span>
            <span className="font-mono">{fmtMoney(quote.tax_amount)}</span>
          </div>
          <Separator />
          <div className="flex justify-between font-semibold">
            <span>Total</span>
            <span className="font-mono">{fmtMoney(quote.total)}</span>
          </div>
        </div>

        {/* Deposit */}
        {quote.deposit_required && quote.deposit_amount != null && (
          <div className="text-sm bg-muted/40 rounded p-3">
            <span className="text-muted-foreground">Deposit required: </span>
            <span className="font-mono font-semibold">{fmtMoney(quote.deposit_amount)}</span>
          </div>
        )}

        {/* Meta */}
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground w-20 shrink-0">Valid until</span>
          <span>{fmtDate(quote.valid_until)}</span>
        </div>

        {quote.notes && (
          <div className="text-sm">
            <span className="text-muted-foreground">Notes: </span>
            <span>{quote.notes}</span>
          </div>
        )}

        {quote.terms && (
          <div className="text-sm">
            <span className="text-muted-foreground block mb-0.5">Terms</span>
            <p className="text-muted-foreground whitespace-pre-line">{quote.terms}</p>
          </div>
        )}

        {/* Lifecycle */}
        <div className="space-y-0.5 text-xs text-muted-foreground">
          {quote.sent_at && <div>Sent: {fmtDate(quote.sent_at)}</div>}
          {quote.viewed_at && <div>Viewed: {fmtDate(quote.viewed_at)}</div>}
          {quote.responded_at && <div>Responded: {fmtDate(quote.responded_at)}</div>}
          {quote.accepted_at && <div>Accepted: {fmtDate(quote.accepted_at)}</div>}
          {quote.rejected_at && <div>Rejected: {fmtDate(quote.rejected_at)}</div>}
        </div>

        {/* Version history */}
        {versionChain.length > 1 && (
          <div className="border-t pt-4">
            <p className="text-xs font-medium text-muted-foreground mb-2">Version history</p>
            <div className="space-y-0.5">
              {versionChain.map((v) => (
                <button
                  key={v.id}
                  onClick={() => onSelectVersion(v)}
                  className={`w-full text-left text-xs px-2 py-1.5 rounded flex items-center justify-between transition-colors hover:bg-muted/50 ${v.id === quote.id ? "bg-muted font-medium" : ""}`}
                >
                  <span className="font-mono">{formatQuoteRef(v.quote_number, { version: v.version })}</span>
                  <Badge className={`text-[10px] py-0 px-1.5 ${STATUS_BADGE[v.status] ?? "bg-gray-100"}`}>
                    {statusLabel(v.status)}
                  </Badge>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2 border-t">
          {isDraft && (
            <>
              <Button variant="outline" size="sm" onClick={onEdit}>
                <Edit2 className="h-3.5 w-3.5 mr-1.5" />Edit
              </Button>
              <Button size="sm" onClick={onSend} disabled={saving}>
                {saving
                  ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  : <Send className="h-3.5 w-3.5 mr-1.5" />}
                Send
              </Button>
            </>
          )}
          {(isSent || isRejected) && (
            <Button variant="outline" size="sm" onClick={onRevise} disabled={saving}>
              {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              {isRejected ? "Revise and resend" : "Revise"}
            </Button>
          )}
          {isAccepted && (
            <p className="text-xs text-muted-foreground self-center">Accepted — manage changes at the job level.</p>
          )}
          {isSuperseded && (
            <p className="text-xs text-muted-foreground self-center">This version has been superseded.</p>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Edit form ─────────────────────────────────────────────────────────────────

function QuoteEditPanel({
  quote,
  data,
  onChange,
  saving,
  onSave,
  onSend,
  onCancel,
}: {
  quote: IssuedQuote;
  data: EditState;
  onChange: (d: EditState) => void;
  saving: boolean;
  onSave: () => void;
  onSend: () => void;
  onCancel: () => void;
}) {
  function updateItem(idx: number, field: keyof LineItem, raw: string) {
    const items = [...data.items];
    const item = { ...items[idx] };
    if (field === "description") {
      item.description = raw;
    } else {
      (item as Record<string, number>)[field] = Number(raw);
    }
    item.total = item.quantity * item.unit_price;
    items[idx] = item;
    onChange({ ...data, items });
  }

  function addItem() {
    onChange({ ...data, items: [...data.items, { description: "", quantity: 1, unit_price: 0, total: 0 }] });
  }

  function removeItem(idx: number) {
    onChange({ ...data, items: data.items.filter((_, i) => i !== idx) });
  }

  const subtotal = data.items.reduce((s, i) => s + i.total, 0);
  const tax_amount = subtotal * (data.tax_rate / 100);
  const total = subtotal + tax_amount;

  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-3">
          <p className="font-mono text-xs text-muted-foreground">{formatQuoteRef(quote.quote_number, { version: quote.version })}</p>
          <DialogTitle>Edit Quote</DialogTitle>
        </div>
      </DialogHeader>

      <div className="space-y-5 mt-2">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-1.5">
            <Label>Title</Label>
            <Input value={data.title} onChange={e => onChange({ ...data, title: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Valid until</Label>
            <Input type="date" value={data.valid_until} onChange={e => onChange({ ...data, valid_until: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>VAT rate (%)</Label>
            <Input
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={data.tax_rate}
              onChange={e => onChange({ ...data, tax_rate: Number(e.target.value) })}
            />
          </div>
        </div>

        {/* Line items */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Line items</Label>
            <Button type="button" variant="outline" size="sm" onClick={addItem}>
              <Plus className="h-3.5 w-3.5 mr-1" />Add row
            </Button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left pb-1.5 font-medium text-muted-foreground">Description</th>
                <th className="text-right pb-1.5 font-medium text-muted-foreground w-16">Qty</th>
                <th className="text-right pb-1.5 font-medium text-muted-foreground w-24">Unit £</th>
                <th className="text-right pb-1.5 font-medium text-muted-foreground w-24">Total</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {data.items.map((item, idx) => (
                <tr key={idx} className="border-b last:border-0">
                  <td className="py-1">
                    <Input
                      className="h-7 text-sm"
                      value={item.description}
                      onChange={e => updateItem(idx, "description", e.target.value)}
                    />
                  </td>
                  <td className="py-1 pl-1.5">
                    <Input
                      className="h-7 text-sm text-right font-mono"
                      type="number"
                      min="0"
                      step="0.5"
                      value={item.quantity}
                      onChange={e => updateItem(idx, "quantity", e.target.value)}
                    />
                  </td>
                  <td className="py-1 pl-1.5">
                    <Input
                      className="h-7 text-sm text-right font-mono"
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.unit_price}
                      onChange={e => updateItem(idx, "unit_price", e.target.value)}
                    />
                  </td>
                  <td className="py-1 pl-1.5 text-right font-mono text-muted-foreground pr-1">
                    {fmtMoney(item.total)}
                  </td>
                  <td className="py-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => removeItem(idx)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals preview */}
        <div className="space-y-1 text-sm bg-muted/30 rounded p-3">
          <div className="flex justify-between text-muted-foreground">
            <span>Subtotal</span>
            <span className="font-mono">{fmtMoney(subtotal)}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>VAT ({data.tax_rate}%)</span>
            <span className="font-mono">{fmtMoney(tax_amount)}</span>
          </div>
          <div className="flex justify-between font-semibold">
            <span>Total</span>
            <span className="font-mono">{fmtMoney(total)}</span>
          </div>
        </div>

        {/* Deposit */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="deposit-required"
              checked={data.deposit_required}
              onChange={e => onChange({ ...data, deposit_required: e.target.checked, deposit_amount: e.target.checked ? data.deposit_amount : "" })}
              className="h-4 w-4"
            />
            <Label htmlFor="deposit-required">Deposit required</Label>
          </div>
          {data.deposit_required && (
            <div className="space-y-1.5">
              <Label>Deposit amount (£)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={data.deposit_amount}
                onChange={e => onChange({ ...data, deposit_amount: e.target.value })}
                placeholder="0.00"
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between gap-2 pt-2 border-t">
          <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onSave} disabled={saving}>
              {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Save draft
            </Button>
            <Button size="sm" onClick={onSend} disabled={saving}>
              {saving
                ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                : <Send className="h-3.5 w-3.5 mr-1.5" />}
              Send
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────────

export function IssuedQuotes({ profileId }: { profileId: string | null }) {
  const [allQuotes, setAllQuotes] = useState<IssuedQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedQuote, setSelectedQuote] = useState<IssuedQuote | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const displayQuotes = useMemo(() => latestVersions(allQuotes), [allQuotes]);

  const versionChain = useMemo(() => {
    if (!selectedQuote) return [];
    return allQuotes
      .filter(q => q.quote_number === selectedQuote.quote_number)
      .sort((a, b) => a.version - b.version);
  }, [allQuotes, selectedQuote]);

  const fetchQuotes = useCallback(async (): Promise<IssuedQuote[]> => {
    if (!profileId) return [];
    setLoading(true);
    const { data, error } = await supabase
      .from("issued_quotes")
      .select("id, quote_number, version, title, client_name, client_email, recipient_id, total, subtotal, tax_amount, tax_rate, status, sent_at, viewed_at, responded_at, accepted_at, rejected_at, created_at, items, valid_until, deposit_required, deposit_amount, parent_quote_id, recipient_response, notes, terms")
      .eq("contractor_id", profileId)
      .order("created_at", { ascending: false });
    const quotes = !error ? (data || []).map(q => normaliseRow(q as Record<string, unknown>)) : [];
    if (!error) setAllQuotes(quotes);
    setLoading(false);
    return quotes;
  }, [profileId]);

  useEffect(() => { fetchQuotes(); }, [fetchQuotes]);

  function openQuote(q: IssuedQuote) {
    setSelectedQuote(q);
    setEditMode(false);
    setEditData(null);
  }

  function closeDialog() {
    setSelectedQuote(null);
    setEditMode(false);
    setEditData(null);
  }

  function startEdit(q: IssuedQuote) {
    setEditMode(true);
    setEditData({
      title: q.title,
      valid_until: q.valid_until ? q.valid_until.slice(0, 10) : "",
      items: q.items.length > 0 ? q.items.map(i => ({ ...i })) : [{ description: "", quantity: 1, unit_price: 0, total: 0 }],
      tax_rate: q.tax_rate,
      deposit_required: q.deposit_required ?? false,
      deposit_amount: q.deposit_amount != null ? String(q.deposit_amount) : "",
    });
  }

  async function handleSendDraft() {
    if (!selectedQuote) return;
    setSaving(true);
    const { error } = await supabase
      .from("issued_quotes")
      .update({ sent_at: new Date().toISOString(), status: "sent" })
      .eq("id", selectedQuote.id);
    if (error) {
      toast({ title: "Send failed", description: error.message, variant: "destructive" });
      setSaving(false);
      return;
    }
    supabase.functions.invoke("notify-invoice-quote-action", {
      body: { action_type: "issue", context_type: "quote", context_id: selectedQuote.id },
    }).catch(console.error);
    await fetchQuotes();
    setSaving(false);
    closeDialog();
    toast({ title: "Quote sent" });
  }

  async function handleSave(send: boolean) {
    if (!selectedQuote || !editData) return;
    setSaving(true);
    const subtotal = editData.items.reduce((s, i) => s + i.total, 0);
    const tax_amount = subtotal * (editData.tax_rate / 100);
    const total = subtotal + tax_amount;
    const updates: Record<string, unknown> = {
      title: editData.title,
      valid_until: editData.valid_until,
      items: editData.items,
      tax_rate: editData.tax_rate,
      subtotal,
      tax_amount,
      total,
      deposit_required: editData.deposit_required,
      deposit_amount: editData.deposit_required && editData.deposit_amount ? Number(editData.deposit_amount) : null,
    };
    if (send) {
      updates.sent_at = new Date().toISOString();
      updates.status = "sent";
    }
    const { error } = await supabase.from("issued_quotes").update(updates).eq("id", selectedQuote.id);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      setSaving(false);
      return;
    }
    if (send) {
      supabase.functions.invoke("notify-invoice-quote-action", {
        body: { action_type: "issue", context_type: "quote", context_id: selectedQuote.id },
      }).catch(console.error);
    }
    const fresh = await fetchQuotes();
    setSaving(false);
    if (send) {
      closeDialog();
    } else {
      setEditMode(false);
      setEditData(null);
      const refreshed = fresh.find(q => q.id === selectedQuote.id);
      if (refreshed) setSelectedQuote(refreshed);
    }
    toast({ title: send ? "Quote sent" : "Quote saved" });
  }

  async function handleRevise() {
    if (!selectedQuote || !profileId) return;
    setSaving(true);
    const newVersion = selectedQuote.version + 1;
    const { data: newRow, error: insertError } = await supabase
      .from("issued_quotes")
      .insert({
        contractor_id: profileId,
        quote_number: selectedQuote.quote_number,
        version: newVersion,
        parent_quote_id: selectedQuote.id,
        title: selectedQuote.title,
        client_name: selectedQuote.client_name,
        client_email: selectedQuote.client_email,
        recipient_id: selectedQuote.recipient_id,
        items: selectedQuote.items as unknown as Record<string, unknown>[],
        subtotal: selectedQuote.subtotal,
        tax_rate: selectedQuote.tax_rate,
        tax_amount: selectedQuote.tax_amount,
        total: selectedQuote.total,
        valid_until: selectedQuote.valid_until,
        deposit_required: selectedQuote.deposit_required,
        deposit_amount: selectedQuote.deposit_amount,
        status: "draft",
      })
      .select()
      .single();
    if (insertError || !newRow) {
      toast({ title: "Revise failed", description: insertError?.message, variant: "destructive" });
      setSaving(false);
      return;
    }
    await supabase.from("issued_quotes").update({ status: "superseded" }).eq("id", selectedQuote.id);
    const fresh = await fetchQuotes();
    setSaving(false);
    const draftQuote = fresh.find(q => q.id === newRow.id) ?? normaliseRow({ ...newRow, version: newVersion } as Record<string, unknown>);
    setSelectedQuote(draftQuote);
    startEdit(draftQuote);
    toast({ title: "Revision created", description: "Edit and send the revised quote." });
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-32">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="font-heading text-2xl font-bold">Issued Quotes</h2>
        <Button variant="outline" size="sm" onClick={fetchQuotes}>
          <RefreshCw className="h-4 w-4 mr-2" />Refresh
        </Button>
      </div>

      {displayQuotes.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Issued Quotes Yet</h3>
            <p className="text-muted-foreground">Quotes you send to clients will appear here.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium">Ref</th>
                    <th className="text-left p-3 font-medium">Title</th>
                    <th className="text-left p-3 font-medium">Client</th>
                    <th className="text-right p-3 font-medium">Total</th>
                    <th className="text-left p-3 font-medium">Status</th>
                    <th className="text-left p-3 font-medium">Sent</th>
                  </tr>
                </thead>
                <tbody>
                  {displayQuotes.map((q) => (
                    <tr
                      key={q.id}
                      className="border-b hover:bg-muted/30 cursor-pointer"
                      onClick={() => openQuote(q)}
                    >
                      <td className="p-3 font-mono text-xs whitespace-nowrap">
                        {formatQuoteRef(q.quote_number, { version: q.version })}
                      </td>
                      <td className="p-3 max-w-[180px] truncate">{q.title}</td>
                      <td className="p-3">{q.client_name}</td>
                      <td className="p-3 text-right font-mono">{fmtMoney(q.total)}</td>
                      <td className="p-3">
                        <Badge className={STATUS_BADGE[q.status] ?? "bg-gray-100 text-gray-700"}>
                          {statusLabel(q.status)}
                        </Badge>
                      </td>
                      <td className="p-3 text-muted-foreground text-xs">
                        {fmtDate(q.sent_at ?? q.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!selectedQuote} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedQuote && !editMode && (
            <QuoteDetailPanel
              quote={selectedQuote}
              versionChain={versionChain}
              saving={saving}
              onEdit={() => startEdit(selectedQuote)}
              onSend={handleSendDraft}
              onRevise={handleRevise}
              onSelectVersion={(q) => { setSelectedQuote(q); setEditMode(false); setEditData(null); }}
            />
          )}
          {selectedQuote && editMode && editData && (
            <QuoteEditPanel
              quote={selectedQuote}
              data={editData}
              onChange={setEditData}
              saving={saving}
              onSave={() => handleSave(false)}
              onSend={() => handleSave(true)}
              onCancel={() => { setEditMode(false); setEditData(null); }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
