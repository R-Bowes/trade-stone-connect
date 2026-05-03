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
  let yLeft = 20;
  if (contractor) {
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