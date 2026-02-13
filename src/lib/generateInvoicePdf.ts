import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { Invoice, InvoiceItem } from "@/hooks/useInvoices";
import { format } from "date-fns";

export function generateInvoicePdf(invoice: Invoice) {
  const doc = new jsPDF();
  const items: InvoiceItem[] = Array.isArray(invoice.items)
    ? (invoice.items as unknown as InvoiceItem[])
    : [];

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;

  // Header
  doc.setFontSize(24);
  doc.setFont("helvetica", "bold");
  doc.text("INVOICE", margin, 30);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text(invoice.invoice_number || "—", margin, 38);

  // Status badge
  const statusText = invoice.status.toUpperCase();
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  if (invoice.status === "paid") {
    doc.setTextColor(22, 163, 74);
  } else if (invoice.status === "sent") {
    doc.setTextColor(37, 99, 235);
  } else {
    doc.setTextColor(100, 100, 100);
  }
  doc.text(statusText, pageWidth - margin, 30, { align: "right" });

  // Reset text colour
  doc.setTextColor(0, 0, 0);

  // Dates – right side
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text(`Issued: ${format(new Date(invoice.issued_date), "dd MMM yyyy")}`, pageWidth - margin, 40, { align: "right" });
  doc.text(`Due: ${format(new Date(invoice.due_date), "dd MMM yyyy")}`, pageWidth - margin, 46, { align: "right" });

  if (invoice.paid_date) {
    doc.setTextColor(22, 163, 74);
    doc.text(`Paid: ${format(new Date(invoice.paid_date), "dd MMM yyyy")}`, pageWidth - margin, 52, { align: "right" });
  }

  // Bill To
  doc.setTextColor(100, 100, 100);
  doc.setFontSize(9);
  doc.text("Bill To", margin, 52);
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(invoice.client_name, margin, 59);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);

  let yPos = 65;
  if (invoice.client_email) { doc.text(invoice.client_email, margin, yPos); yPos += 5; }
  if (invoice.client_phone) { doc.text(invoice.client_phone, margin, yPos); yPos += 5; }
  if (invoice.client_address) { doc.text(invoice.client_address, margin, yPos); yPos += 5; }

  // Items table
  const startY = Math.max(yPos + 8, 78);
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
    headStyles: { fillColor: [35, 35, 35], fontSize: 9, fontStyle: "bold" },
    bodyStyles: { fontSize: 9 },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { halign: "right", cellWidth: 20 },
      2: { halign: "right", cellWidth: 30 },
      3: { halign: "right", cellWidth: 30 },
    },
    margin: { left: margin, right: margin },
  });

  // Totals
  const finalY = (doc as any).lastAutoTable?.finalY ?? startY + 40;
  const totalsX = pageWidth - margin;
  let tY = finalY + 12;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 80, 80);
  doc.text("Subtotal", totalsX - 50, tY);
  doc.text(`£${Number(invoice.subtotal).toFixed(2)}`, totalsX, tY, { align: "right" });

  tY += 7;
  doc.text(`Tax (${Number(invoice.tax_rate)}%)`, totalsX - 50, tY);
  doc.text(`£${Number(invoice.tax_amount).toFixed(2)}`, totalsX, tY, { align: "right" });

  tY += 3;
  doc.setDrawColor(200, 200, 200);
  doc.line(totalsX - 55, tY, totalsX, tY);

  tY += 7;
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("Total", totalsX - 50, tY);
  doc.text(`£${Number(invoice.total).toFixed(2)}`, totalsX, tY, { align: "right" });

  // Notes
  if (invoice.notes) {
    tY += 16;
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(100, 100, 100);
    doc.text("Notes", margin, tY);
    doc.setFont("helvetica", "normal");
    tY += 6;
    const noteLines = doc.splitTextToSize(invoice.notes, pageWidth - margin * 2);
    doc.text(noteLines, margin, tY);
  }

  // Save
  const filename = `${invoice.invoice_number || "invoice"}.pdf`;
  doc.save(filename);
}
