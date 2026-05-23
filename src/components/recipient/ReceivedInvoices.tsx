Read c:\Users\richa\trade-stone-connect\src\hooks\useReceivedInvoices.ts
File is unchanged since the earlier read. Here it is verbatim:


import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface ReceivedInvoice {
  id: string;
  invoice_number: string | null;
  client_name: string;
  client_email: string;
  contractor_id: string;
  recipient_id: string | null;
  recipient_response: string | null;
  responded_at: string | null;
  items: any;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  status: string;
  issued_date: string;
  due_date: string;
  paid_date: string | null;
  notes: string | null;
  created_at: string;
}

export function useReceivedInvoices() {
  const [invoices, setInvoices] = useState<ReceivedInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchInvoices = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("invoices")
      .select("*")
      .eq("recipient_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching received invoices:", error);
    } else {
      setInvoices((data || []) as unknown as ReceivedInvoice[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const respondToInvoice = async (invoiceId: string, response: "paid" | "stalled" | "queried") => {
    const { error } = await supabase
      .from("invoices")
      .update({
        recipient_response: response,
        responded_at: new Date().toISOString(),
      })
      .eq("id", invoiceId);

    if (error) {
      toast({ title: "Error", description: "Failed to respond to invoice", variant: "destructive" });
      throw error;
    }

    toast({ title: "Response Sent", description: `Invoice marked as ${response}.` });
    fetchInvoices();
    return invoiceId;
  };

  return { invoices, loading, respondToInvoice, refetch: fetchInvoices };
}
74 lines total. Exports invoices, loading, respondToInvoice, and refetch.

Read src/lib/generateInvoicePdf.ts in full and return every line, 
including the function signature and all parameters it accepts.
File is unchanged since the earlier read. Here it is verbatim — all 208 lines:


import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { Invoice, InvoiceItem } from "@/hooks/useInvoices";
import { format } from "date-fns";

export interface ContractorProfile {
  full_name: string | null;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  ts_profile_code: string | null;
  logo_url: string | null;
}

export function generateInvoicePdf(invoice: Invoice, contractor?: ContractorProfile) {
  const doc = new jsPDF();
  const items: InvoiceItem[] = Array.isArray(invoice.items)
    ? (invoice.items as unknown as InvoiceItem[])
    : [];

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;

  // ── Contractor header (left) ──────────────────────────────────────────────
  // ── Contractor header (left) ──────────────────────────────────────────────
  let yLeft = 20;
  if (contractor) {
    if ((contractor as any)._logoBase64) {
      try {
        doc.addImage((contractor as any)._logoBase64, "PNG", margin, yLeft, 24, 24);
        yLeft += 28;
      } catch {
        // logo failed to render — skip silently
      }
    }
    const contractorName = contractor.company_name || contractor.full_name || "Contractor";
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text(contractorName, margin, yLeft);
    yLeft += 6;

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80, 80, 80);

    if (contractor.ts_profile_code) {
      doc.text(contractor.ts_profile_code, margin, yLeft);
      yLeft += 5;
    }
    if (contractor.address) {
      const addressLines = doc.splitTextToSize(contractor.address, 80);
      doc.text(addressLines, margin, yLeft);
      yLeft += addressLines.length * 4.5;
    }
    if (contractor.email) {
      doc.text(contractor.email, margin, yLeft);
      yLeft += 5;
    }
    if (contractor.phone) {
      doc.text(contractor.phone, margin, yLeft);
      yLeft += 5;
    }
  }

  // ── INVOICE title + number (right) ───────────────────────────────────────
  doc.setFontSize(24);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("INVOICE", pageWidth - margin, 20, { align: "right" });

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text(invoice.invoice_number || "—", pageWidth - margin, 28, { align: "right" });

  // Status
  const statusText = invoice.status.toUpperCase();
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  if (invoice.status === "paid") doc.setTextColor(22, 163, 74);
  else if (invoice.status === "sent") doc.setTextColor(37, 99, 235);
  else doc.setTextColor(100, 100, 100);
  doc.text(statusText, pageWidth - margin, 36, { align: "right" });

  // Dates
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text(
    `Issued: ${format(new Date(invoice.issued_date), "dd MMM yyyy")}`,
    pageWidth - margin, 44, { align: "right" }
  );
  doc.text(
    `Due: ${format(new Date(invoice.due_date), "dd MMM yyyy")}`,
    pageWidth - margin, 50, { align: "right" }
  );
  if (invoice.paid_date) {
    doc.setTextColor(22, 163, 74);
    doc.text(
      `Paid: ${format(new Date(invoice.paid_date), "dd MMM yyyy")}`,
      pageWidth - margin, 56, { align: "right" }
    );
  }

  // ── Divider ───────────────────────────────────────────────────────────────
  const dividerY = Math.max(yLeft, 62) + 4;
  doc.setDrawColor(220, 220, 220);
  doc.line(margin, dividerY, pageWidth - margin, dividerY);

  // ── Bill To ───────────────────────────────────────────────────────────────
  let yPos = dividerY + 8;
  doc.setTextColor(100, 100, 100);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("BILL TO", margin, yPos);
  yPos += 5;

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(invoice.client_name, margin, yPos);
  yPos += 5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  if (invoice.client_email) { doc.text(invoice.client_email, margin, yPos); yPos += 5; }
  if (invoice.client_phone) { doc.text(invoice.client_phone, margin, yPos); yPos += 5; }
  if (invoice.client_address) { doc.text(invoice.client_address, margin, yPos); yPos += 5; }

  // ── Items table ───────────────────────────────────────────────────────────
  const startY = yPos + 6;
  autoTable(doc, {
    startY,
    head: [["Description", "Qty", "Unit Price", "Total"]],
    body: items.map(item => [
      item.description,
      String(item.quantity),
      `£${Number(item.unit_price).toFixed(2)}`,
      `£${(item.quantity * item.unit_price).toFixed(2)}`,
    ]),
    theme: "striped",
    headStyles: { fillColor: [30, 58, 95], fontSize: 9, fontStyle: "bold" },
    bodyStyles: { fontSize: 9 },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { halign: "right", cellWidth: 20 },
      2: { halign: "right", cellWidth: 30 },
      3: { halign: "right", cellWidth: 30 },
    },
    margin: { left: margin, right: margin },
  });

  // ── Totals ────────────────────────────────────────────────────────────────
  const finalY = (doc as any).lastAutoTable?.finalY ?? startY + 40;
  const totalsX = pageWidth - margin;
  let tY = finalY + 12;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 80, 80);
  doc.text("Subtotal", totalsX - 50, tY);
  doc.text(`£${Number(invoice.subtotal).toFixed(2)}`, totalsX, tY, { align: "right" });

  tY += 6;
  doc.text(`Tax (${Number(invoice.tax_rate)}%)`, totalsX - 50, tY);
  doc.text(`£${Number(invoice.tax_amount).toFixed(2)}`, totalsX, tY, { align: "right" });

  tY += 3;
  doc.setDrawColor(200, 200, 200);
  doc.line(totalsX - 55, tY, totalsX, tY);

  tY += 7;
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("Total", totalsX - 50, tY);
  doc.text(`£${Number(invoice.total).toFixed(2)}`, totalsX, tY, { align: "right" });

  // ── Notes ─────────────────────────────────────────────────────────────────
  if (invoice.notes) {
    tY += 16;
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(100, 100, 100);
    doc.text("Notes", margin, tY);
    doc.setFont("helvetica", "normal");
    tY += 5;
    const noteLines = doc.splitTextToSize(invoice.notes, pageWidth - margin * 2);
    doc.text(noteLines, margin, tY);
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(160, 160, 160);
  doc.text(
    "Powered by TradeStone · tradesltd.co.uk",
    pageWidth / 2,
    pageHeight - 10,
    { align: "center" }
  );

  doc.save(`${invoice.invoice_number || "invoice"}.pdf`);
}
Function signature:


export function generateInvoicePdf(invoice: Invoice, contractor?: ContractorProfile)
invoice: Invoice — required; the full invoice record from useInvoices (includes items, subtotal, tax_rate, tax_amount, total, client_name, client_email, client_phone, client_address, issued_date, due_date, paid_date, notes, status, invoice_number)
contractor?: ContractorProfile — optional; if provided, renders contractor logo, name, address, email, phone, and profile code in the top-left header. The logo is read from _logoBase64 (a runtime-injected property, not part of the interface)