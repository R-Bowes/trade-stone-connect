import { useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"; // still used by the preview dialog's line-item table
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from "@/components/ui/dialog";
import {
  DollarSign, Clock, AlertTriangle, FileText, Plus, Trash2, Edit, Eye,
  Search, Send, CheckCircle, Loader2, Download, Banknote, Undo2
} from "lucide-react";
import { InvoiceCard } from "@/components/shared/InvoiceCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { generateInvoicePdf, fetchContractorProfileForPdf } from "@/lib/generateInvoicePdf";
import { formatInvoiceRef } from "@/lib/documentRefs";
import { useInvoices, type Invoice, type InvoiceItem } from "@/hooks/useInvoices";
import { isOverdue as invoiceIsOverdue, depositSettled } from "@/lib/invoiceMoney";
import { InvoiceFormDialog } from "@/components/management/invoices/InvoiceFormDialog";
import { RecordPaymentDialog } from "@/components/management/invoices/RecordPaymentDialog";
import { RequestRefundDialog } from "@/components/management/RequestRefundDialog";
import { TransactionFeeNotice } from "@/components/TransactionFeeNotice";
import { format } from "date-fns";

export function InvoiceManagement() {
  const {
    invoices, loading, createInvoice, updateInvoice, deleteInvoice,
    markAsPaid, markAsSent, recordManualPayment, paid, outstanding, outstandingCount, overdue,
  } = useInvoices();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);
  const [recordPaymentInvoice, setRecordPaymentInvoice] = useState<Invoice | null>(null);
  const [refundRequestInvoice, setRefundRequestInvoice] = useState<Invoice | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [clientTsCodeMap, setClientTsCodeMap] = useState<Record<string, string>>({});

  useEffect(() => {
    if (invoices.length === 0) return;
    const emails = [...new Set(invoices.map(inv => inv.client_email).filter(Boolean))];
    supabase
      .from("profiles")
      .select("email, ts_profile_code")
      .in("email", emails)
      .then(({ data }) => {
        if (!data) return;
        const map: Record<string, string> = {};
        for (const row of data) {
          if (row.email && row.ts_profile_code) map[row.email] = row.ts_profile_code;
        }
        setClientTsCodeMap(map);
      });
  }, [invoices]);

  const filteredInvoices = useMemo(() => {
    return invoices.filter(inv => {
      const clientDisplay = clientTsCodeMap[inv.client_email] ?? inv.client_email;
      const matchesSearch = !search ||
        inv.client_name.toLowerCase().includes(search.toLowerCase()) ||
        String(inv.invoice_number ?? "").includes(search.toLowerCase()) ||
        inv.client_email.toLowerCase().includes(search.toLowerCase()) ||
        clientDisplay.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === "all"
        || (statusFilter === "overdue" ? invoiceIsOverdue(inv) : inv.status === statusFilter);
      return matchesSearch && matchesStatus;
    });
  }, [invoices, search, statusFilter]);

  const getStatusBadge = (invoice: Invoice) => {
    if (invoiceIsOverdue(invoice)) return <Badge variant="destructive">Overdue</Badge>;
    switch (invoice.status) {
      case "paid": return <Badge className="bg-green-100 text-green-800">Paid</Badge>;
      case "sent": return <Badge className="bg-amber-100 text-amber-800">Sent</Badge>;
      case "viewed": return <Badge className="bg-blue-100 text-blue-800">Viewed</Badge>;
      case "draft": return <Badge className="bg-slate-200 text-slate-700">Draft</Badge>;
      default: return <Badge variant="outline">{invoice.status}</Badge>;
    }
  };

  const handleSave = async (data: Parameters<typeof createInvoice>[0]) => {
    if (editingInvoice) {
      await updateInvoice(editingInvoice.id, data);
    } else {
      await createInvoice(data);
    }
  };

  const handleEdit = (invoice: Invoice) => {
    setEditingInvoice(invoice);
    setDialogOpen(true);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const invoiceItems = (inv: Invoice): InvoiceItem[] => {
    if (Array.isArray(inv.items)) return inv.items as unknown as InvoiceItem[];
    return [];
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="font-heading text-2xl font-bold">Invoice Management</h2>
        <Button onClick={() => { setEditingInvoice(null); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />Create Invoice
        </Button>
      </div>

      <TransactionFeeNotice />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">£{paid.toLocaleString("en-GB", { minimumFractionDigits: 2 })}</div>
            <p className="text-xs text-muted-foreground">From paid invoices</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">£{outstanding.toLocaleString("en-GB", { minimumFractionDigits: 2 })}</div>
            <p className="text-xs text-muted-foreground">{outstandingCount} invoices</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Overdue</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">£{overdue.toLocaleString("en-GB", { minimumFractionDigits: 2 })}</div>
            <p className="text-xs text-muted-foreground">Requires attention</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Invoices</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{invoices.length}</div>
            <p className="text-xs text-muted-foreground">All time</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search invoices..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Invoice List */}
      {filteredInvoices.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-10 w-10" />}
          message="Create your first invoice to start tracking payments."
          action={
            <Button onClick={() => { setEditingInvoice(null); setDialogOpen(true); }}>
              <Plus className="h-4 w-4 mr-2" />Create First Invoice
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3">
          {filteredInvoices.map(inv => {
            const isPaid = inv.status === "paid" || inv.recipient_response === "paid";
            return (
              <InvoiceCard
                key={inv.id}
                invoice={inv}
                viewer="contractor"
                counterparty={inv.client_name}
                counterpartyCode={clientTsCodeMap[inv.client_email] ?? null}
                actions={
                  <>
                    <Button variant="ghost" size="sm" onClick={() => setPreviewInvoice(inv)} title="Preview">
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={async () => {
                      const contractor = await fetchContractorProfileForPdf();
                      generateInvoicePdf(inv, contractor, clientTsCodeMap[inv.client_email] ?? null);
                    }} title="Download PDF">
                      <Download className="h-4 w-4" />
                    </Button>
                    {isPaid && (
                      <Button variant="ghost" size="sm" onClick={() => setRefundRequestInvoice(inv)} title="Request refund">
                        <Undo2 className="h-4 w-4" />
                      </Button>
                    )}
                    {!isPaid && inv.status === "draft" && (
                      <Button variant="ghost" size="sm" onClick={() => markAsSent(inv.id)} title="Mark as Sent">
                        <Send className="h-4 w-4" />
                      </Button>
                    )}
                    {!isPaid && (
                      <Button variant="ghost" size="sm" onClick={() => markAsPaid(inv.id)} title="Mark as Paid">
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      </Button>
                    )}
                    {!isPaid && inv.status !== "draft" && (
                      <Button variant="ghost" size="sm" onClick={() => setRecordPaymentInvoice(inv)} title="Record Payment">
                        <Banknote className="h-4 w-4 text-blue-600" />
                      </Button>
                    )}
                    {!isPaid && (
                      <Button variant="ghost" size="sm" onClick={() => handleEdit(inv)} title="Edit">
                        <Edit className="h-4 w-4" />
                      </Button>
                    )}
                    {!isPaid && (
                      <Button variant="ghost" size="sm" onClick={() => deleteInvoice(inv.id)} title="Delete">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </>
                }
              />
            );
          })}
        </div>
      )}

      {/* Invoice Form Dialog */}
      <InvoiceFormDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditingInvoice(null); }}
        onSave={handleSave}
        invoice={editingInvoice}
      />

      {/* Record Payment Dialog */}
      <RecordPaymentDialog
        open={!!recordPaymentInvoice}
        invoice={recordPaymentInvoice}
        onClose={() => setRecordPaymentInvoice(null)}
        onConfirm={(payment) => recordManualPayment(recordPaymentInvoice!, payment)}
      />

      {/* Request Refund Dialog */}
      <RequestRefundDialog
        open={!!refundRequestInvoice}
        invoice={refundRequestInvoice}
        onClose={() => setRefundRequestInvoice(null)}
      />

      {/* Invoice Preview Dialog */}
      <Dialog open={!!previewInvoice} onOpenChange={v => !v && setPreviewInvoice(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{previewInvoice ? formatInvoiceRef(previewInvoice.invoice_number) : "Invoice"}</DialogTitle>
            <DialogDescription>Invoice details and line items</DialogDescription>
          </DialogHeader>
          {previewInvoice && (
            <div className="space-y-6">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm text-muted-foreground">Bill To</p>
                  <p className="font-semibold text-lg">{previewInvoice.client_name}</p>
                  <p className="text-sm text-muted-foreground font-mono">
                    {clientTsCodeMap[previewInvoice.client_email] ?? previewInvoice.client_email}
                  </p>
                  {previewInvoice.client_phone && <p className="text-sm text-muted-foreground">{previewInvoice.client_phone}</p>}
                  {previewInvoice.client_address && <p className="text-sm text-muted-foreground">{previewInvoice.client_address}</p>}
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Invoice #</p>
                  <p className="font-semibold font-mono">{formatInvoiceRef(previewInvoice.invoice_number)}</p>
                  <p className="text-sm text-muted-foreground mt-2">Issued: {format(new Date(previewInvoice.issued_date), "dd MMM yyyy")}</p>
                  <p className="text-sm text-muted-foreground">Due: {format(new Date(previewInvoice.due_date), "dd MMM yyyy")}</p>
                  <div className="mt-2">{getStatusBadge(previewInvoice)}</div>
                </div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Unit Price</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoiceItems(previewInvoice).map((item, i) => (
                    <TableRow key={i}>
                      <TableCell>{item.description}</TableCell>
                      <TableCell className="text-right">{item.quantity}</TableCell>
                      <TableCell className="text-right">£{Number(item.unit_price).toFixed(2)}</TableCell>
                      <TableCell className="text-right">£{(item.quantity * item.unit_price).toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="border-t pt-4 space-y-2 max-w-xs ml-auto">
                <div className="flex justify-between text-sm">
                  <span>Subtotal</span>
                  <span>£{Number(previewInvoice.subtotal).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Tax ({Number(previewInvoice.tax_rate)}%)</span>
                  <span>£{Number(previewInvoice.tax_amount).toFixed(2)}</span>
                </div>
                {(() => {
                  const deposit = depositSettled(previewInvoice);
                  if (deposit <= 0) {
                    return (
                      <div className="flex justify-between font-bold text-lg border-t pt-2">
                        <span>Total</span>
                        <span>£{Number(previewInvoice.total).toFixed(2)}</span>
                      </div>
                    );
                  }
                  const amountDue = Number(previewInvoice.total) - deposit;
                  return (
                    <>
                      <div className="flex justify-between font-bold text-lg border-t pt-2">
                        <span>Total for works</span>
                        <span>£{Number(previewInvoice.total).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>Deposit paid</span>
                        <span>-£{deposit.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between font-bold text-lg">
                        <span>Amount due</span>
                        <span>£{amountDue.toFixed(2)}</span>
                      </div>
                    </>
                  );
                })()}
              </div>

              {previewInvoice.notes && (
                <div className="border-t pt-4">
                  <p className="text-sm text-muted-foreground mb-1">Notes</p>
                  <p className="text-sm">{previewInvoice.notes}</p>
                </div>
              )}

              {previewInvoice.paid_date && (
                <div className="border-t pt-4">
                  <p className="text-sm text-green-600 font-medium">
                    ✓ Paid on {format(new Date(previewInvoice.paid_date), "dd MMM yyyy")}
                  </p>
                </div>
              )}

              <div className="border-t pt-4">
                <Button onClick={async () => {
                  const contractor = await fetchContractorProfileForPdf();
                  generateInvoicePdf(previewInvoice, contractor, clientTsCodeMap[previewInvoice.client_email] ?? null);
                }} className="w-full">
                  <Download className="h-4 w-4 mr-2" />Download PDF
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
