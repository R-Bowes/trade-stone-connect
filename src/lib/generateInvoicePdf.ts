import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { Invoice, InvoiceItem } from "@/hooks/useInvoices";
import { format } from "date-fns";
import { formatInvoiceRef, contractorCodeSuffix } from "@/lib/documentRefs";
import { depositSettled } from "@/lib/invoiceMoney";
import { formatCurrency } from "@/lib/formatGBP";
import { isVatRegistered } from "@/lib/vatDefaultTaxRate";
import { supabase } from "@/integrations/supabase/client";

export interface ContractorProfile {
  full_name: string | null;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  ts_profile_code: string | null;
  logo_url: string | null;
  /** Base64 data URL, set by fetchContractorProfileForPdf() when logo_url resolves. */
  _logoBase64?: string;
}

type SupplierSnapshot = {
  legal_name: string | null;
  trading_name: string | null;
  address: { line1: string | null; line2: string | null; city: string | null; region: string | null; postcode: string | null; country: string | null; legacy_address: string | null } | null;
  ts_profile_code: string | null;
  vat_status: string | null;
  vat_number: string | null;
};

type CustomerSnapshot = {
  client_name: string | null;
  address: { line1: string | null; line2: string | null; city: string | null; region: string | null; postcode: string | null; country: string | null; legacy_address: string | null } | null;
  ts_profile_code: string | null;
};

function snapshotAddressLines(addr: SupplierSnapshot["address"]): string[] {
  if (!addr) return [];
  const structured = [addr.line1, addr.line2, addr.city, addr.region, addr.postcode, addr.country].filter(Boolean) as string[];
  if (structured.length > 0) return structured;
  return addr.legacy_address ? [addr.legacy_address] : [];
}

/**
 * Fetches the current user's contractor profile and, if a logo is set,
 * base64-encodes it for embedding in the PDF — the single source of this
 * logic so every Download PDF button produces an identically branded
 * document. Returns undefined (not a throw) whenever the PDF should render
 * without a contractor header: no signed-in user, or no profile row.
 * A logo fetch failure is swallowed deliberately — the PDF still renders,
 * just without the logo.
 */
export async function fetchContractorProfileForPdf(): Promise<ContractorProfile | undefined> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return undefined;

  const { data: profile } = await supabase
    .from("my_profile")
    .select("full_name, company_name, email, phone, address, ts_profile_code, logo_url")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile) return undefined;

  let enrichedProfile: ContractorProfile = profile;
  if (profile.logo_url) {
    try {
      const res = await fetch(profile.logo_url);
      const blob = await res.blob();
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
      enrichedProfile = { ...profile, _logoBase64: base64 };
    } catch {
      // logo fetch failed — proceed without it
    }
  }

  return enrichedProfile;
}

export function generateInvoicePdf(invoice: Invoice, contractor?: ContractorProfile, clientTsCode?: string | null) {
  const doc = new jsPDF();
  const items: InvoiceItem[] = Array.isArray(invoice.items)
    ? (invoice.items as unknown as InvoiceItem[])
    : [];

  // A row issued before the invoice-lock migration has neither snapshot --
  // fall back to the live contractor profile / the invoice's own client_*
  // columns, same as before, but still never printing a phone or email
  // either way (CLAUDE.md: no phone numbers or email addresses on the
  // invoice or its PDF, for either party).
  const supplierSnapshot = invoice.supplier_snapshot as unknown as SupplierSnapshot | null;
  const customerSnapshot = invoice.customer_snapshot as unknown as CustomerSnapshot | null;
  const currency = invoice.currency ?? "GBP";
  const money = (value: number | string | null | undefined) => formatCurrency(value, currency);

  const supplierName = supplierSnapshot
    ? (supplierSnapshot.trading_name || supplierSnapshot.legal_name || "Contractor")
    : (contractor?.company_name || contractor?.full_name || "Contractor");
  const supplierTsCode = supplierSnapshot?.ts_profile_code ?? contractor?.ts_profile_code ?? null;
  const supplierAddressLines = supplierSnapshot
    ? snapshotAddressLines(supplierSnapshot.address)
    : (contractor?.address ? [contractor.address] : []);
  const supplierVatRegistered = supplierSnapshot
    ? isVatRegistered(supplierSnapshot.vat_status)
    : Number(invoice.tax_rate) > 0;
  const supplierVatNumber = supplierSnapshot?.vat_number ?? null;

  const customerName = customerSnapshot?.client_name ?? invoice.client_name;
  const customerTsCode = customerSnapshot?.ts_profile_code ?? clientTsCode ?? null;
  const customerAddressLines = customerSnapshot
    ? snapshotAddressLines(customerSnapshot.address)
    : (invoice.client_address ? [invoice.client_address] : []);

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;

  // ── Contractor header (left) ──────────────────────────────────────────────
  let yLeft = 20;
  if (contractor?._logoBase64) {
    try {
      doc.addImage(contractor._logoBase64, "PNG", margin, yLeft, 24, 24);
      yLeft += 28;
    } catch {
      // logo failed to render — skip silently
    }
  }
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text(supplierName, margin, yLeft);
  yLeft += 6;

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 80, 80);

  if (supplierTsCode) {
    doc.text(supplierTsCode, margin, yLeft);
    yLeft += 5;
  }
  if (supplierAddressLines.length > 0) {
    const addressLines = doc.splitTextToSize(supplierAddressLines.join(", "), 80);
    doc.text(addressLines, margin, yLeft);
    yLeft += addressLines.length * 4.5;
  }
  if (supplierVatRegistered && supplierVatNumber) {
    doc.text(`VAT No. ${supplierVatNumber}`, margin, yLeft);
    yLeft += 5;
  }

  // ── INVOICE title + number (right) ───────────────────────────────────────
  doc.setFontSize(24);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("INVOICE", pageWidth - margin, 20, { align: "right" });

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text(
    formatInvoiceRef(invoice.invoice_number, {
      contractorCode: supplierTsCode ?? undefined,
    }),
    pageWidth - margin, 28, { align: "right" }
  );

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
  doc.text(customerName, margin, yPos);
  yPos += 5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  if (customerTsCode) { doc.text(customerTsCode, margin, yPos); yPos += 5; }
  for (const line of customerAddressLines) { doc.text(line, margin, yPos); yPos += 5; }

  // ── Items table ───────────────────────────────────────────────────────────
  const startY = yPos + 6;
  autoTable(doc, {
    startY,
    head: [["Description", "Qty", "Unit Price", "Total"]],
    body: items.map(item => [
      item.description,
      String(item.quantity),
      money(item.unit_price),
      money(item.quantity * item.unit_price),
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

  // No VAT lines at all for a non-VAT-registered supplier -- not even
  // "Tax (0%)" (CLAUDE.md copy rule: no implied VAT handling that isn't real).
  if (supplierVatRegistered) {
    doc.text("Subtotal", totalsX - 50, tY);
    doc.text(money(invoice.subtotal), totalsX, tY, { align: "right" });

    tY += 6;
    doc.text(`Tax (${Number(invoice.tax_rate)}%)`, totalsX - 50, tY);
    doc.text(money(invoice.tax_amount), totalsX, tY, { align: "right" });

    tY += 3;
    doc.setDrawColor(200, 200, 200);
    doc.line(totalsX - 55, tY, totalsX, tY);
  }

  tY += 7;
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);

  const deposit = depositSettled(invoice);
  if (deposit > 0) {
    doc.text("Total for works", totalsX - 50, tY);
    doc.text(money(invoice.total), totalsX, tY, { align: "right" });

    tY += 6;
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80, 80, 80);
    doc.text("Deposit paid", totalsX - 50, tY);
    doc.text(`-${money(deposit)}`, totalsX, tY, { align: "right" });

    tY += 3;
    doc.setDrawColor(200, 200, 200);
    doc.line(totalsX - 55, tY, totalsX, tY);

    tY += 7;
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    const amountDue = Number(invoice.total) - deposit;
    doc.text("Amount due", totalsX - 50, tY);
    doc.text(money(amountDue), totalsX, tY, { align: "right" });
  } else {
    doc.text("Total", totalsX - 50, tY);
    doc.text(money(invoice.total), totalsX, tY, { align: "right" });
  }

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

  doc.save(
    `${formatInvoiceRef(invoice.invoice_number, { contractorCode: supplierTsCode ?? undefined })}.pdf`
  );
}